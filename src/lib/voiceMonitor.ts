import type { MicState, VoiceComfortStatus } from '../types';

export interface VoiceSample {
  micState: MicState;
  rawDb: number; // calibrated SPL-like estimate (32..92 dB)
  smoothedDb: number;
  voiceBandActive: boolean; // sustained harmonic human speech (keyboard clacks filtered out)
  status: VoiceComfortStatus;
}

export interface VoiceCalibrationProgress {
  active: boolean;
  remainingSec: number;
  hearingVoice: boolean;
  samplesCount: number;
}

/**
 * 100% local, zero-recording Web Audio microphone loudness & speech-band monitor.
 *
 * Acoustic keyboard-clack rejection & calibration:
 * - Splits mic into a band-passed Voice channel (130 Hz .. 2400 Hz) and a raw Spectrum tap.
 * - Rejects mechanical / laptop keyboard clacks using 3 acoustic signatures:
 *     1. High-frequency percussive energy (3.2–9 kHz) relative to human vowel band (150–1250 Hz)
 *     2. High crest factor (needle-like percussive impulse spikes vs smooth harmonic voice)
 *     3. Continuity check: requires >= 3 consecutive 50ms vocal slices (~150ms) so brief
 *        20–40ms keystrokes never spike the voice dB meter or trigger Speaking.
 * - Tracks an adaptive quiet room floor so silence rests naturally near ~35 dB.
 * - 3-second "Set my voice" calibration captures ~60 frames and anchors your natural voice
 *   right in the middle of the green comfort zone (56 dB).
 */
export class LocalVoiceMonitor {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private voiceAnalyser: AnalyserNode | null = null;
  private rawAnalyser: AnalyserNode | null = null;
  private voiceTimeBuf: Float32Array<ArrayBuffer> | null = null;
  private rawTimeBuf: Float32Array<ArrayBuffer> | null = null;
  private rawFreqBuf: Uint8Array<ArrayBuffer> | null = null;
  private state: MicState = 'off';
  private pollTimer: number | null = null;

  // High-rate (20Hz) rolling speech-envelope & adaptive room noise floor
  private recentSlices: Array<{ t: number; db: number; isVoice: boolean; isClack: boolean }> = [];
  private consecutiveVocalSlices = 0;
  private roomFloorDb = 36;
  private smoothedDb = 35;
  private loudSinceMs: number | null = null;
  private lastVoiceBandActive = false;

  // Calibration state (3.2-second comfortable-voice sampling at 20 Hz)
  private calibratingUntilMs = 0;
  private calibrationDbSamples: number[] = [];
  private onCalibrationDone: ((offsetDb: number | null) => void) | null = null;

  get micState(): MicState {
    return this.state;
  }

  getCalibrationProgress(nowMs: number = performance.now()): VoiceCalibrationProgress {
    if (this.calibratingUntilMs <= 0) {
      return { active: false, remainingSec: 0, hearingVoice: false, samplesCount: 0 };
    }
    const remMs = Math.max(0, this.calibratingUntilMs - nowMs);
    return {
      active: true,
      remainingSec: Math.max(1, Math.ceil(remMs / 1000)),
      hearingVoice: this.lastVoiceBandActive || this.consecutiveVocalSlices >= 2,
      samplesCount: this.calibrationDbSamples.length,
    };
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

      const source = ctx.createMediaStreamSource(stream);

      // Branch 1: Band-passed Human Voice channel (130 Hz .. 2400 Hz) strips desk rumble & key clicks
      const hpFilter = ctx.createBiquadFilter();
      hpFilter.type = 'highpass';
      hpFilter.frequency.value = 130;
      hpFilter.Q.value = 0.7;

      const lpFilter = ctx.createBiquadFilter();
      lpFilter.type = 'lowpass';
      lpFilter.frequency.value = 2400;
      lpFilter.Q.value = 0.7;

      const voiceAnalyser = ctx.createAnalyser();
      voiceAnalyser.fftSize = 2048;
      voiceAnalyser.smoothingTimeConstant = 0.45;

      source.connect(hpFilter);
      hpFilter.connect(lpFilter);
      lpFilter.connect(voiceAnalyser);

      // Branch 2: Unfiltered spectrum tap to spot high-frequency percussive keyboard clacks (3.2–9 kHz)
      const rawAnalyser = ctx.createAnalyser();
      rawAnalyser.fftSize = 2048;
      rawAnalyser.smoothingTimeConstant = 0.35;
      source.connect(rawAnalyser);

      this.stream = stream;
      this.ctx = ctx;
      this.voiceAnalyser = voiceAnalyser;
      this.rawAnalyser = rawAnalyser;
      this.voiceTimeBuf = new Float32Array(voiceAnalyser.fftSize);
      this.rawTimeBuf = new Float32Array(rawAnalyser.fftSize);
      this.rawFreqBuf = new Uint8Array(rawAnalyser.frequencyBinCount);
      this.state = 'active';
      this.recentSlices = [];
      this.consecutiveVocalSlices = 0;
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
   * Captures a 50ms slice, separates harmonic human speech from percussive keyboard clacks,
   * and updates the rolling envelope & optional 3-second calibration buffer.
   */
  private captureAudioSlice(nowMs: number): void {
    if (
      this.state !== 'active' ||
      !this.voiceAnalyser ||
      !this.rawAnalyser ||
      !this.voiceTimeBuf ||
      !this.rawTimeBuf ||
      !this.rawFreqBuf ||
      !this.ctx
    ) {
      return;
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
      return;
    }

    this.voiceAnalyser.getFloatTimeDomainData(this.voiceTimeBuf);
    this.rawAnalyser.getFloatTimeDomainData(this.rawTimeBuf);
    this.rawAnalyser.getByteFrequencyData(this.rawFreqBuf);

    // 1. Voice-band RMS (130..2400 Hz)
    let voiceSumSq = 0;
    for (let i = 0; i < this.voiceTimeBuf.length; i++) {
      const v = this.voiceTimeBuf[i];
      voiceSumSq += v * v;
    }
    const voiceRms = Math.sqrt(voiceSumSq / this.voiceTimeBuf.length);
    const voiceDbfs = 20 * Math.log10(Math.max(voiceRms, 1e-5));
    const uncalibratedDb = Math.max(28, Math.min(94, voiceDbfs + 98));

    // 2. Raw peak-to-RMS crest factor (sharp keystrokes spike > 5.8; smooth vowels stay ~2.2..4.5)
    let rawSumSq = 0;
    let rawPeak = 0;
    for (let i = 0; i < this.rawTimeBuf.length; i++) {
      const a = Math.abs(this.rawTimeBuf[i]);
      rawSumSq += a * a;
      if (a > rawPeak) rawPeak = a;
    }
    const rawRms = Math.sqrt(rawSumSq / this.rawTimeBuf.length);
    const crestFactor = rawPeak / Math.max(rawRms, 1e-5);

    // 3. Spectral comparison: human vowel body (150..1250 Hz) vs keyboard clack band (3200..9000 Hz)
    const binHz = this.ctx.sampleRate / this.rawAnalyser.fftSize;
    const avgBand = (loHz: number, hiHz: number) => {
      const s = Math.max(1, Math.floor(loHz / binHz));
      const e = Math.min(this.rawFreqBuf!.length - 1, Math.ceil(hiHz / binHz));
      let sum = 0;
      let peak = 0;
      for (let i = s; i <= e; i++) {
        const val = this.rawFreqBuf![i];
        sum += val;
        if (val > peak) peak = val;
      }
      return { avg: sum / Math.max(1, e - s + 1), peak };
    };

    const vocal = avgBand(150, 1250);
    const clack = avgBand(3200, 9000);

    // Keyboard clack signature: strong high-frequency click relative to vowels OR needle-sharp impulse spike
    const highFreqClickDominant = clack.avg >= 10 && clack.avg >= vocal.avg * 0.52;
    const sharpTransientSpike = crestFactor >= 5.6 && vocal.avg < 42;
    const isClack = highFreqClickDominant || sharpTransientSpike;

    // Quiet room floor adapts slowly during genuinely quiet, non-clack frames
    const likelyQuiet = !isClack && vocal.avg < 11 && vocal.peak < 40;
    if (likelyQuiet) {
      const floorAlpha = uncalibratedDb < this.roomFloorDb ? 0.12 : 0.015;
      this.roomFloorDb = this.roomFloorDb * (1 - floorAlpha) + uncalibratedDb * floorAlpha;
      this.roomFloorDb = Math.max(28, Math.min(54, this.roomFloorDb));
    }

    const aboveFloor = uncalibratedDb - this.roomFloorDb;
    const instantVocal =
      !isClack &&
      aboveFloor >= 6.0 &&
      vocal.avg >= 13 &&
      vocal.peak >= 42 &&
      vocal.avg >= clack.avg * 1.45;

    if (instantVocal) {
      this.consecutiveVocalSlices = Math.min(20, this.consecutiveVocalSlices + 1);
    } else {
      this.consecutiveVocalSlices = 0;
    }

    // Require >= 3 consecutive vocal slices (~150ms sustained vowel) to confirm real voice vs keystrokes!
    const isConfirmedVoiceSlice = this.consecutiveVocalSlices >= 3;

    this.recentSlices.push({
      t: nowMs,
      db: uncalibratedDb,
      isVoice: isConfirmedVoiceSlice,
      isClack,
    });
    const cutoff = nowMs - 520;
    while (this.recentSlices.length > 0 && this.recentSlices[0].t < cutoff) {
      this.recentSlices.shift();
    }

    // Collect clean vocal syllable samples during 3-second comfortable-voice calibration
    if (this.calibratingUntilMs > 0) {
      if (isConfirmedVoiceSlice && uncalibratedDb >= this.roomFloorDb + 5) {
        this.calibrationDbSamples.push(uncalibratedDb);
      }
      if (nowMs >= this.calibratingUntilMs) {
        const cb = this.onCalibrationDone;
        this.calibratingUntilMs = 0;
        this.onCalibrationDone = null;
        if (this.calibrationDbSamples.length >= 6) {
          const sorted = [...this.calibrationDbSamples].sort((a, b) => a - b);
          const p75 = sorted[Math.floor(sorted.length * 0.75)];
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
    if (this.state !== 'active' || !this.voiceAnalyser || !this.ctx) {
      return {
        micState: this.state,
        rawDb: 0,
        smoothedDb: 0,
        voiceBandActive: false,
        status: 'off',
      };
    }

    const latest = this.recentSlices[this.recentSlices.length - 1];
    if (!latest || nowMs - latest.t > 120) {
      this.captureAudioSlice(nowMs);
    }

    // Only use confirmed non-clack vocal slices for speaking volume; ignore keyboard impulses!
    const vocalFrames = this.recentSlices.filter((s) => s.isVoice && !s.isClack);
    const voiceBandActive = vocalFrames.length >= 2;
    this.lastVoiceBandActive = voiceBandActive;

    let calibratedDb: number;
    if (voiceBandActive) {
      const sorted = vocalFrames.map((s) => s.db).sort((a, b) => a - b);
      const p75 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.75))];
      calibratedDb = Math.max(34, Math.min(92, p75 + calOffsetDb));
    } else {
      // Quiet or only keyboard clacks -> rest calmly near the quiet floor (~35 dB)
      const quietFrames = this.recentSlices.filter((s) => !s.isClack);
      const medQuiet =
        quietFrames.length > 0
          ? quietFrames[Math.floor(quietFrames.length / 2)].db
          : this.roomFloorDb;
      calibratedDb = Math.max(32, Math.min(42, 35 + Math.max(0, medQuiet - this.roomFloorDb) * 0.5));
    }

    const alpha = calibratedDb > this.smoothedDb ? 0.42 : 0.24;
    this.smoothedDb = this.smoothedDb * (1 - alpha) + calibratedDb * alpha;
    const displayDb = Math.round(this.smoothedDb);

    // Comfort zone classification (require ~1.1s sustained loud voice)
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
    this.voiceAnalyser = null;
    this.rawAnalyser = null;
    this.voiceTimeBuf = null;
    this.rawTimeBuf = null;
    this.rawFreqBuf = null;
    this.recentSlices = [];
    this.consecutiveVocalSlices = 0;
    this.loudSinceMs = null;
    this.lastVoiceBandActive = false;
    if (this.state === 'active') {
      this.state = 'off';
    }
  }
}
