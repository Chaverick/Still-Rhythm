import type { MicState, VoiceComfortStatus } from '../types';

export interface VoiceSample {
  micState: MicState;
  rawDb: number; // calibrated SPL-like estimate (30..92 dB)
  smoothedDb: number;
  voiceBandActive: boolean; // human speech frequencies (120Hz..3.4kHz) above adaptive room floor
  status: VoiceComfortStatus;
}

/**
 * 100% local, zero-recording Web Audio microphone loudness & speech-band monitor.
 *
 * Key accuracy improvements for MacBook & USB desk microphones:
 * - Disables browser autoGainControl so louder speech genuinely registers higher dB.
 * - Samples internally at 20 Hz (every 50ms) with a 450ms rolling speech-envelope peak
 *   so we never miss syllables between the main 4-FPS vision ticks.
 * - Filters out low-frequency room/AC/fan rumble (<115 Hz) and tracks an adaptive quiet
 *   noise floor so silence rests naturally near ~35 dB while voice rises cleanly.
 * - 3-second calibration captures ~60 frames and anchors your natural speaking syllables
 *   squarely in the center of the comfortable green range (56 dB).
 */
export class LocalVoiceMonitor {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private timeBuf: Float32Array<ArrayBuffer> | null = null;
  private freqBuf: Uint8Array<ArrayBuffer> | null = null;
  private state: MicState = 'off';
  private pollTimer: number | null = null;

  // High-rate (20Hz) rolling speech-envelope & adaptive room noise floor
  private recentSpeechDb: Array<{ t: number; db: number; isSpeech: boolean }> = [];
  private roomFloorDb = 36;
  private smoothedDb = 35;
  private loudSinceMs: number | null = null;
  private lastVoiceBandActive = false;

  // Calibration buffer (3.2-second comfortable-voice sampling at 20 Hz)
  private calibratingUntilMs = 0;
  private calibrationDbSamples: number[] = [];
  private onCalibrationDone: ((offsetDb: number | null) => void) | null = null;

  get micState(): MicState {
    return this.state;
  }

  async start(): Promise<MicState> {
    if (this.state === 'active' && this.stream) return 'active';

    if (!navigator.mediaDevices?.getUserMedia) {
      this.state = 'unavailable';
      return this.state;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: false,
          noiseSuppression: false,
          echoCancellation: false,
        },
        video: false,
      });

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) {
        for (const t of stream.getTracks()) t.stop();
        this.state = 'unavailable';
        return this.state;
      }

      const ctx = new AudioCtx();
      if (ctx.state === 'suspended') {
        await ctx.resume().catch(() => {});
      }

      // High-pass filter at 115 Hz removes desk vibration, fan hum, and AC rumble before metering
      const source = ctx.createMediaStreamSource(stream);
      const hpFilter = ctx.createBiquadFilter();
      hpFilter.type = 'highpass';
      hpFilter.frequency.value = 115;
      hpFilter.Q.value = 0.7;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048; // ~42ms window at 48kHz
      analyser.smoothingTimeConstant = 0.45;
      source.connect(hpFilter);
      hpFilter.connect(analyser);

      this.stream = stream;
      this.ctx = ctx;
      this.analyser = analyser;
      this.timeBuf = new Float32Array(analyser.fftSize);
      this.freqBuf = new Uint8Array(analyser.frequencyBinCount);
      this.state = 'active';
      this.recentSpeechDb = [];
      this.roomFloorDb = 36;
      this.smoothedDb = 35;
      this.loudSinceMs = null;
      this.lastVoiceBandActive = false;

      const track = stream.getAudioTracks()[0];
      if (track) {
        track.onended = () => {
          this.state = 'off';
          this.stopPolling();
        };
      }

      this.startPolling();
      return 'active';
    } catch (err) {
      if (
        err instanceof DOMException &&
        (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')
      ) {
        this.state = 'denied';
      } else {
        this.state = 'unavailable';
      }
      return this.state;
    }
  }

  private startPolling(): void {
    this.stopPolling();
    this.pollTimer = window.setInterval(() => {
      this.captureAudioSlice(performance.now());
    }, 50);
  }

  private stopPolling(): void {
    if (this.pollTimer !== null) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Captures a single 50ms high-passed speech slice so syllable peaks are never missed.
   */
  private captureAudioSlice(nowMs: number): void {
    if (this.state !== 'active' || !this.analyser || !this.timeBuf || !this.freqBuf || !this.ctx) {
      return;
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
      return;
    }

    this.analyser.getFloatTimeDomainData(this.timeBuf);
    this.analyser.getByteFrequencyData(this.freqBuf);

    // 1. Speech-band RMS (already high-passed above 115 Hz)
    let sumSq = 0;
    for (let i = 0; i < this.timeBuf.length; i++) {
      const v = this.timeBuf[i];
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / this.timeBuf.length);
    const dbfs = 20 * Math.log10(Math.max(rms, 1e-5));
    // Map typical desk mic range (-62 dBFS quiet room .. -12 dBFS loud speech) -> ~30..92 dB
    const uncalibratedDb = Math.max(28, Math.min(94, dbfs + 98));

    // 2. Human speech frequency band presence (140Hz .. 3400Hz vs sub-100Hz & high hiss)
    const binHz = this.ctx.sampleRate / this.analyser.fftSize;
    const speechStart = Math.max(1, Math.floor(140 / binHz));
    const speechEnd = Math.min(this.freqBuf.length - 1, Math.ceil(3400 / binHz));
    let speechSum = 0;
    let speechPeak = 0;
    for (let i = speechStart; i <= speechEnd; i++) {
      const val = this.freqBuf[i];
      speechSum += val;
      if (val > speechPeak) speechPeak = val;
    }
    const speechAvg = speechSum / Math.max(1, speechEnd - speechStart + 1);

    // Slowly adapt room noise floor downward quickly, upward very slowly only during quiet moments
    const likelyQuiet = speechAvg < 11 && speechPeak < 42;
    if (likelyQuiet) {
      const floorAlpha = uncalibratedDb < this.roomFloorDb ? 0.12 : 0.015;
      this.roomFloorDb = this.roomFloorDb * (1 - floorAlpha) + uncalibratedDb * floorAlpha;
      this.roomFloorDb = Math.max(28, Math.min(54, this.roomFloorDb));
    }

    const aboveFloor = uncalibratedDb - this.roomFloorDb;
    const isSpeech = aboveFloor >= 5.5 && speechAvg >= 11 && speechPeak >= 38;

    this.recentSpeechDb.push({ t: nowMs, db: uncalibratedDb, isSpeech });
    const cutoff = nowMs - 480;
    while (this.recentSpeechDb.length > 0 && this.recentSpeechDb[0].t < cutoff) {
      this.recentSpeechDb.shift();
    }

    // Collect high-rate speech syllable samples during 3-second comfortable-voice calibration
    if (this.calibratingUntilMs > 0) {
      if (isSpeech && uncalibratedDb >= this.roomFloorDb + 5) {
        this.calibrationDbSamples.push(uncalibratedDb);
      }
      if (nowMs >= this.calibratingUntilMs) {
        const cb = this.onCalibrationDone;
        this.calibratingUntilMs = 0;
        this.onCalibrationDone = null;
        if (this.calibrationDbSamples.length >= 6) {
          const sorted = [...this.calibrationDbSamples].sort((a, b) => a - b);
          // 75th percentile captures true spoken vowels rather than gaps between words
          const p75 = sorted[Math.floor(sorted.length * 0.75)];
          // Anchor their comfortable voice cleanly at 56 dB (center of 46..66 green zone)
          const offset = Math.round(Math.max(-28, Math.min(28, 56 - p75)));
          cb?.(offset);
        } else {
          cb?.(null);
        }
      }
    }
  }

  /**
   * Collects speaking dB samples at 20Hz for 3.2 seconds to center the green comfort zone
   * right around the user's natural speaking voice (56 dB target).
   */
  beginCalibration(onDone: (offsetDb: number | null) => void): void {
    this.calibrationDbSamples = [];
    this.calibratingUntilMs = performance.now() + 3200;
    this.onCalibrationDone = onDone;
  }

  sample(
    nowMs: number,
    comfortMinDb: number,
    comfortMaxDb: number,
    calOffsetDb: number
  ): VoiceSample {
    if (this.state !== 'active' || !this.analyser || !this.ctx) {
      return {
        micState: this.state,
        rawDb: 0,
        smoothedDb: 0,
        voiceBandActive: false,
        status: 'off',
      };
    }

    // Ensure fresh slice even if interval was throttled in a background tab
    const latest = this.recentSpeechDb[this.recentSpeechDb.length - 1];
    if (!latest || nowMs - latest.t > 120) {
      this.captureAudioSlice(nowMs);
    }

    const windowSamples = this.recentSpeechDb;
    const speechFrames = windowSamples.filter((s) => s.isSpeech);
    const voiceBandActive = speechFrames.length >= 2;
    this.lastVoiceBandActive = voiceBandActive;

    // Compute robust short-term level:
    // - While speaking: 80th percentile of speech frames (accurate syllable loudness, no dip between words)
    // - While quiet: median anchored cleanly down toward ~35 dB so room hum never reads artificially high
    let rawUncal = this.roomFloorDb;
    if (speechFrames.length > 0) {
      const sorted = speechFrames.map((s) => s.db).sort((a, b) => a - b);
      rawUncal = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.8))];
    } else if (windowSamples.length > 0) {
      const sorted = windowSamples.map((s) => s.db).sort((a, b) => a - b);
      rawUncal = sorted[Math.floor(sorted.length * 0.5)];
    }

    // Apply user calibration offset; when quiet, anchor noise floor gently near 35 dB
    const calibratedDb = voiceBandActive
      ? Math.max(32, Math.min(92, rawUncal + calOffsetDb))
      : Math.max(32, Math.min(44, 35 + Math.max(0, rawUncal - this.roomFloorDb)));

    // Responsive rise when speaking, smooth natural decay when pausing
    const alpha = calibratedDb > this.smoothedDb ? 0.45 : 0.22;
    this.smoothedDb = this.smoothedDb * (1 - alpha) + calibratedDb * alpha;
    const displayDb = Math.round(this.smoothedDb);

    // Comfort zone classification (require ~1.1s sustained loud voice so single clinks/coughs don't flash)
    let status: VoiceComfortStatus = 'quiet';
    if (this.smoothedDb >= comfortMaxDb && this.lastVoiceBandActive) {
      if (this.loudSinceMs === null) {
        this.loudSinceMs = nowMs;
      }
      status = nowMs - this.loudSinceMs >= 1100 ? 'loud' : 'comfortable';
    } else {
      this.loudSinceMs = null;
      status = this.lastVoiceBandActive && displayDb >= comfortMinDb ? 'comfortable' : 'quiet';
    }

    return {
      micState: 'active',
      rawDb: Math.round(calibratedDb),
      smoothedDb: displayDb,
      voiceBandActive: this.lastVoiceBandActive,
      status,
    };
  }

  stop(): void {
    this.stopPolling();
    this.calibratingUntilMs = 0;
    this.onCalibrationDone = null;
    if (this.stream) {
      for (const t of this.stream.getTracks()) {
        try {
          t.stop();
        } catch {
          // ignore
        }
      }
      this.stream = null;
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.analyser = null;
    this.timeBuf = null;
    this.freqBuf = null;
    this.recentSpeechDb = [];
    this.loudSinceMs = null;
    this.lastVoiceBandActive = false;
    if (this.state === 'active') {
      this.state = 'off';
    }
  }
}
