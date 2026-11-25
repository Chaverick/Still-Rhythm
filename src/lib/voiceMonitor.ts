import type { MicState, VoiceComfortStatus } from '../types';

export interface VoiceSample {
  micState: MicState;
  rawDb: number; // calibrated SPL-like estimate (30..95 dB)
  smoothedDb: number;
  voiceBandActive: boolean; // human speech frequencies (120Hz..3.4kHz) above quiet floor
  status: VoiceComfortStatus;
}

/**
 * 100% local, zero-recording Web Audio microphone loudness & speech-band monitor.
 * Disables browser autoGainControl so loud vs. soft speaking shows accurately,
 * and measures only live decibel energy + speech-band ratio in memory.
 */
export class LocalVoiceMonitor {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private timeBuf: Float32Array<ArrayBuffer> | null = null;
  private freqBuf: Uint8Array<ArrayBuffer> | null = null;
  private state: MicState = 'off';

  private smoothedDb = 36;
  private loudSinceMs: number | null = null;
  private speechStreak = 0;

  // Calibration buffer (3-second comfortable-voice sampling)
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
      // Disable autoGainControl so louder speech genuinely registers higher dB!
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

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);

      this.stream = stream;
      this.ctx = ctx;
      this.analyser = analyser;
      this.timeBuf = new Float32Array(analyser.fftSize);
      this.freqBuf = new Uint8Array(analyser.frequencyBinCount);
      this.state = 'active';
      this.smoothedDb = 38;
      this.loudSinceMs = null;
      this.speechStreak = 0;

      const track = stream.getAudioTracks()[0];
      if (track) {
        track.onended = () => {
          this.state = 'off';
        };
      }

      return 'active';
    } catch (err) {
      if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError')) {
        this.state = 'denied';
      } else {
        this.state = 'unavailable';
      }
      return this.state;
    }
  }

  /**
   * Collects speaking dB samples for 3 seconds to center the green comfort zone
   * right around the user's natural speaking voice (~58 dB target).
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
    if (this.state !== 'active' || !this.analyser || !this.timeBuf || !this.freqBuf || !this.ctx) {
      return {
        micState: this.state,
        rawDb: 0,
        smoothedDb: 0,
        voiceBandActive: false,
        status: 'off',
      };
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    this.analyser.getFloatTimeDomainData(this.timeBuf);
    this.analyser.getByteFrequencyData(this.freqBuf);

    // 1. Broadband RMS -> relative SPL-like dB scale (~32 dB quiet room, ~58 dB normal voice, ~72+ dB loud)
    let sumSq = 0;
    for (let i = 0; i < this.timeBuf.length; i++) {
      const v = this.timeBuf[i];
      sumSq += v * v;
    }
    const rms = Math.sqrt(sumSq / this.timeBuf.length);
    const dbfs = 20 * Math.log10(Math.max(rms, 1e-5));
    const uncalibratedDb = Math.max(30, Math.min(95, dbfs + 94));
    const rawDb = Math.max(30, Math.min(95, uncalibratedDb + calOffsetDb));

    // Smooth faster on rise so loud speech feels responsive, gentler on decay
    const alpha = rawDb > this.smoothedDb ? 0.36 : 0.18;
    this.smoothedDb = this.smoothedDb * (1 - alpha) + rawDb * alpha;
    const displayDb = Math.round(this.smoothedDb);

    // 2. Human speech frequency band check (120Hz .. 3400Hz vs low-freq rumble <100Hz)
    const binHz = this.ctx.sampleRate / this.analyser.fftSize;
    const speechStart = Math.max(1, Math.floor(120 / binHz));
    const speechEnd = Math.min(this.freqBuf.length - 1, Math.ceil(3400 / binHz));
    const rumbleEnd = Math.max(1, Math.floor(100 / binHz));

    let speechSum = 0;
    for (let i = speechStart; i <= speechEnd; i++) {
      speechSum += this.freqBuf[i];
    }
    const speechAvg = speechSum / Math.max(1, speechEnd - speechStart + 1);

    let rumbleSum = 0;
    for (let i = 0; i < rumbleEnd; i++) {
      rumbleSum += this.freqBuf[i];
    }
    const rumbleAvg = rumbleSum / Math.max(1, rumbleEnd);

    // Require speech-band energy meaningfully present & not pure low-end AC/fan rumble
    const instantVoice =
      rawDb >= Math.max(41, comfortMinDb - 4) &&
      speechAvg >= 12 &&
      speechAvg >= rumbleAvg * 0.45;

    if (instantVoice) {
      this.speechStreak = Math.min(6, this.speechStreak + 1);
    } else {
      this.speechStreak = Math.max(0, this.speechStreak - 1);
    }
    const voiceBandActive = this.speechStreak >= 1;

    // Handle active 3-second comfortable-voice calibration if running
    if (this.calibratingUntilMs > 0) {
      if (speechAvg >= 10 && uncalibratedDb >= 38) {
        this.calibrationDbSamples.push(uncalibratedDb);
      }
      if (nowMs >= this.calibratingUntilMs) {
        const cb = this.onCalibrationDone;
        this.calibratingUntilMs = 0;
        this.onCalibrationDone = null;
        if (this.calibrationDbSamples.length >= 3) {
          const sorted = [...this.calibrationDbSamples].sort((a, b) => a - b);
          const median = sorted[Math.floor(sorted.length * 0.55)];
          // Anchor their comfortable voice cleanly at 56 dB (middle of 46..66 green zone)
          const offset = Math.round(Math.max(-22, Math.min(22, 56 - median)));
          cb?.(offset);
        } else {
          cb?.(null);
        }
      }
    }

    // 3. Comfort zone classification (require ~1.3s sustained loud voice so single coughs/clinks don't flash)
    let status: VoiceComfortStatus = 'quiet';
    if (this.smoothedDb >= comfortMaxDb && voiceBandActive) {
      if (this.loudSinceMs === null) {
        this.loudSinceMs = nowMs;
      }
      status = nowMs - this.loudSinceMs >= 1300 ? 'loud' : 'comfortable';
    } else {
      this.loudSinceMs = null;
      status = voiceBandActive && displayDb >= comfortMinDb ? 'comfortable' : 'quiet';
    }

    return {
      micState: 'active',
      rawDb: Math.round(rawDb),
      smoothedDb: displayDb,
      voiceBandActive,
      status,
    };
  }

  stop(): void {
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
    this.loudSinceMs = null;
    this.speechStreak = 0;
    if (this.state === 'active') {
      this.state = 'off';
    }
  }
}
