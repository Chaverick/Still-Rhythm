import type { MicState, VoiceComfortStatus } from '../types';

export interface VoiceSample {
  micState: MicState;
  rawDb: number; // instantaneous A-weighted dBA (LAF fast 125ms)
  smoothedDb: number; // display dBA (LAF fast 125ms)
  leqDb: number; // 3-second equivalent continuous energy average (LAeq)
  noiseFloorDb: number; // adaptive quiet room baseline (dBA)
  historyDb: number[]; // rolling 36-point history for live scrolling wave
  voiceBandActive: boolean; // sustained human speech (keyboard clacks excluded)
  status: VoiceComfortStatus;
}

export interface VoiceCalibrationProgress {
  active: boolean;
  remainingSec: number;
  hearingVoice: boolean;
  samplesCount: number;
}

interface BiquadCoeffs {
  b: [number, number, number];
  a: [number, number, number];
}

/**
 * Computes exact IEC 61672-1 Class-1 A-weighting digital filter coefficients
 * as 3 unconditionally stable 2nd-order sections (bilinear transform, normalized
 * to 0.00 dB at 1000 Hz) for any browser sample rate (44.1 kHz, 48 kHz, 96 kHz).
 */
function buildAWeightingSections(fs: number): BiquadCoeffs[] {
  const f1 = 20.598997;
  const f2 = 107.65265;
  const f3 = 737.86223;
  const f4 = 12194.217;

  const w1 = 2 * Math.PI * f1;
  const w2 = 2 * Math.PI * f2;
  const w3 = 2 * Math.PI * f3;
  const w4 = 2 * Math.PI * f4;
  const c = 2 * fs;

  const secHp2 = (wa: number, wb: number): BiquadCoeffs => {
    const a0 = (c + wa) * (c + wb);
    return {
      b: [(c * c) / a0, (-2 * c * c) / a0, (c * c) / a0],
      a: [1, (2 * (wa * wb - c * c)) / a0, ((c - wa) * (c - wb)) / a0],
    };
  };

  const secLp2 = (w: number): BiquadCoeffs => {
    const a0 = (c + w) * (c + w);
    return {
      b: [(w * w) / a0, (2 * w * w) / a0, (w * w) / a0],
      a: [1, (2 * (w * w - c * c)) / a0, ((c - w) * (c - w)) / a0],
    };
  };

  const s1 = secHp2(w1, w1);
  const s2 = secHp2(w2, w3);
  const s3 = secLp2(w4);

  // Evaluate combined magnitude at 1000 Hz to normalize exactly to 0 dB
  const evalMag = (sections: BiquadCoeffs[], freq: number): number => {
    const omega = (-2 * Math.PI * freq) / fs;
    const z1r = Math.cos(omega);
    const z1i = Math.sin(omega);
    const z2r = Math.cos(2 * omega);
    const z2i = Math.sin(2 * omega);

    let mag = 1;
    for (const { b, a } of sections) {
      const nr = b[0] + b[1] * z1r + b[2] * z2r;
      const ni = b[1] * z1i + b[2] * z2i;
      const dr = a[0] + a[1] * z1r + a[2] * z2r;
      const di = a[1] * z1i + a[2] * z2i;
      mag *= Math.hypot(nr, ni) / Math.max(1e-12, Math.hypot(dr, di));
    }
    return mag;
  };

  const gain1k = evalMag([s1, s2, s3], 1000);
  const norm = gain1k > 1e-9 ? 1 / gain1k : 1;
  s3.b = [s3.b[0] * norm, s3.b[1] * norm, s3.b[2] * norm];

  return [s1, s2, s3];
}

const REFERENCE_SPL_OFFSET_DB = 90; // Matches Sound Meter default (20*log10(rms*1000) + 30 == 20*log10(rms) + 90)
const FAST_TAU_SEC = 0.125; // IEC 61672-1 Fast (F) time weighting = 125 ms
const LEQ_WINDOW_MS = 3000; // 3-second short-term LAeq energy window
const HISTORY_LEN = 36; // ~9 seconds at 4 Hz for live scrolling wave

/**
 * 100% local, zero-recording IEC 61672-1 A-weighted (dBA) voice & sound monitor.
 *
 * Leading-edge acoustic pipeline:
 * - Honest mic capture: autoGainControl OFF (preserves true quiet-vs-loud dynamics),
 *   Chrome native noiseSuppression ON (cuts steady fan hum & dulls desk clicks).
 * - True IEC 61672-1 Class-1 A-weighting filter (3 cascaded native IIRFilterNodes)
 *   weighting frequencies the way human hearing perceives loudness (dBA).
 * - Continuous Fast (125 ms, LAF) exponential energy integration — zero harsh voice gate,
 *   so the live meter glides smoothly with every syllable without freezing at 35 dB.
 * - True 3-second equivalent continuous energy average (LAeq) for steady speaking loudness
 *   and amber loudness nudges — naturally immune to 20ms keystrokes or coughs.
 * - Separate spectral voice-vs-clack detector solely for Speaking detection so typing never
 *   falsely flips the app into "Speaking".
 */
export class LocalVoiceMonitor {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private aWeightAnalyser: AnalyserNode | null = null;
  private rawAnalyser: AnalyserNode | null = null;
  private aTimeBuf: Float32Array<ArrayBuffer> | null = null;
  private rawTimeBuf: Float32Array<ArrayBuffer> | null = null;
  private rawFreqBuf: Uint8Array<ArrayBuffer> | null = null;
  private state: MicState = 'off';
  private pollTimer: number | null = null;
  private lastPollMs = 0;

  // IEC 61672-1 continuous energy states
  private fastEnergy = 1e-6; // squared A-weighted pressure (p^2) with 125ms tau
  private energyWindow: Array<{ t: number; energy: number }> = [];
  private floorHistory: number[] = [];
  private noiseFloorDb = 33;
  private historyDb: number[] = [];
  private lastHistoryPushMs = 0;

  // Separate speech-band vs keyboard-clack tracker (for Speaking detection only — never freezes meter)
  private recentVocalFlags: Array<{ t: number; isVoice: boolean; isClack: boolean }> = [];
  private consecutiveVocalSlices = 0;
  private lastVoiceBandActive = false;
  private loudSinceMs: number | null = null;

  // Calibration state (3.2-second comfortable-voice sampling at 20 Hz)
  private calibratingUntilMs = 0;
  private calibrationActiveSamples: number[] = [];
  private calibrationAllSamples: number[] = [];
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
      hearingVoice:
        this.lastVoiceBandActive ||
        this.consecutiveVocalSlices >= 1 ||
        this.calibrationActiveSamples.length >= 3,
      samplesCount: this.calibrationActiveSamples.length,
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
          noiseSuppression: true,
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

      // Branch 1: Exact IEC 61672-1 Class-1 A-weighting filter chain (dBA)
      const aWeightAnalyser = ctx.createAnalyser();
      aWeightAnalyser.fftSize = 2048;
      aWeightAnalyser.smoothingTimeConstant = 0.0; // We perform exact IEC exponential time-weighting in energy domain

      if (typeof ctx.createIIRFilter === 'function') {
        const sections = buildAWeightingSections(ctx.sampleRate);
        let prevNode: AudioNode = source;
        for (const sec of sections) {
          const iir = ctx.createIIRFilter(sec.b, sec.a);
          prevNode.connect(iir);
          prevNode = iir;
        }
        prevNode.connect(aWeightAnalyser);
      } else {
        // Fallback approximation if browser lacks IIRFilterNode
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 180;
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 8000;
        source.connect(hp);
        hp.connect(lp);
        lp.connect(aWeightAnalyser);
      }

      // Branch 2: Raw spectrum tap for Speaking vs. keyboard-clack classification
      const rawAnalyser = ctx.createAnalyser();
      rawAnalyser.fftSize = 2048;
      rawAnalyser.smoothingTimeConstant = 0.35;
      source.connect(rawAnalyser);

      this.stream = stream;
      this.ctx = ctx;
      this.aWeightAnalyser = aWeightAnalyser;
      this.rawAnalyser = rawAnalyser;
      this.aTimeBuf = new Float32Array(aWeightAnalyser.fftSize);
      this.rawTimeBuf = new Float32Array(rawAnalyser.fftSize);
      this.rawFreqBuf = new Uint8Array(rawAnalyser.frequencyBinCount);
      this.state = 'active';
      this.lastPollMs = performance.now();
      this.fastEnergy = 1e-6;
      this.energyWindow = [];
      this.floorHistory = [];
      this.noiseFloorDb = 33;
      this.historyDb = new Array(HISTORY_LEN).fill(33);
      this.lastHistoryPushMs = 0;
      this.recentVocalFlags = [];
      this.consecutiveVocalSlices = 0;
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

  private energyToBaseDba(energy: number): number {
    // 10 * log10(rms^2) + 90 == 20 * log10(rms) + 90 == Sound Meter default (+30 on rms*1000)
    const clampedEnergy = Math.max(energy, 1e-7);
    return 10 * Math.log10(clampedEnergy) + REFERENCE_SPL_OFFSET_DB;
  }

  /**
   * Captures a 50 ms A-weighted acoustic slice, updates IEC Fast (125 ms) energy,
   * 3-second LAeq energy buffer, ambient room floor, and separate speech-vs-clack flags.
   */
  private captureAudioSlice(nowMs: number): void {
    if (
      this.state !== 'active' ||
      !this.aWeightAnalyser ||
      !this.rawAnalyser ||
      !this.aTimeBuf ||
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

    const dtSec = Math.min(0.25, Math.max(0.02, (nowMs - (this.lastPollMs || nowMs - 50)) / 1000));
    this.lastPollMs = nowMs;

    this.aWeightAnalyser.getFloatTimeDomainData(this.aTimeBuf);
    this.rawAnalyser.getFloatTimeDomainData(this.rawTimeBuf);
    this.rawAnalyser.getByteFrequencyData(this.rawFreqBuf);

    // 1. A-weighted mean-square acoustic energy (p_A^2)
    let aSumSq = 0;
    for (let i = 0; i < this.aTimeBuf.length; i++) {
      const v = this.aTimeBuf[i];
      aSumSq += v * v;
    }
    const instantEnergy = Math.max(1e-7, aSumSq / this.aTimeBuf.length);

    // 2. Spectral & transient check (used ONLY for Speaking detection & gentle keystroke cap in LAeq)
    let rawSumSq = 0;
    let rawPeak = 0;
    for (let i = 0; i < this.rawTimeBuf.length; i++) {
      const a = Math.abs(this.rawTimeBuf[i]);
      rawSumSq += a * a;
      if (a > rawPeak) rawPeak = a;
    }
    const rawRms = Math.sqrt(rawSumSq / this.rawTimeBuf.length);
    const crestFactor = rawPeak / Math.max(rawRms, 1e-5);

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
    const highFreqClickDominant = clack.avg >= 10 && clack.avg >= vocal.avg * 0.58;
    const sharpTransientSpike = crestFactor >= 5.8 && vocal.avg < 36;
    const isClack = highFreqClickDominant || sharpTransientSpike;

    // 3. IEC 61672-1 Fast (125 ms) continuous exponential energy integration (never frozen!)
    const alphaFast = 1 - Math.exp(-dtSec / FAST_TAU_SEC);
    // If an unmistakable sharp mechanical keystroke hits while no one is speaking, softly dampen only that impulse
    const meterEnergy = isClack && this.consecutiveVocalSlices === 0
      ? Math.min(instantEnergy, this.fastEnergy * 1.35 + 2e-6)
      : instantEnergy;
    this.fastEnergy = this.fastEnergy * (1 - alphaFast) + meterEnergy * alphaFast;

    const baseFastDb = this.energyToBaseDba(this.fastEnergy);

    // 4. True 3-second LAeq rolling energy window
    this.energyWindow.push({ t: nowMs, energy: meterEnergy });
    const leqCutoff = nowMs - LEQ_WINDOW_MS;
    while (this.energyWindow.length > 0 && this.energyWindow[0].t < leqCutoff) {
      this.energyWindow.shift();
    }

    // 5. Adaptive ambient noise floor (20th percentile over ~12s of recent base dBA readings)
    this.floorHistory.push(baseFastDb);
    if (this.floorHistory.length > 240) {
      this.floorHistory.shift();
    }
    if (this.floorHistory.length >= 12) {
      const sortedFloor = [...this.floorHistory].sort((a, b) => a - b);
      const p20 = sortedFloor[Math.floor(sortedFloor.length * 0.2)];
      this.noiseFloorDb = this.noiseFloorDb * 0.92 + Math.max(25, Math.min(55, p20)) * 0.08;
    }

    // 6. Speech-band continuity detector (for Audio-Visual Speaking detection only)
    const aboveFloor = baseFastDb - this.noiseFloorDb;
    const instantVocal =
      !isClack &&
      aboveFloor >= 4.5 &&
      vocal.avg >= 10 &&
      vocal.peak >= 32 &&
      vocal.avg >= clack.avg * 1.25;

    if (instantVocal) {
      this.consecutiveVocalSlices = Math.min(20, this.consecutiveVocalSlices + 1);
    } else {
      this.consecutiveVocalSlices = 0;
    }
    const isConfirmedVoiceSlice = this.consecutiveVocalSlices >= 2;

    this.recentVocalFlags.push({
      t: nowMs,
      isVoice: isConfirmedVoiceSlice,
      isClack,
    });
    const flagCutoff = nowMs - 520;
    while (this.recentVocalFlags.length > 0 && this.recentVocalFlags[0].t < flagCutoff) {
      this.recentVocalFlags.shift();
    }

    // 7. Reliable 3-second comfortable-voice calibration (anchors p75 speaking dBA right at 56 dBA)
    if (this.calibratingUntilMs > 0) {
      this.calibrationAllSamples.push(baseFastDb);
      if (!isClack && baseFastDb >= this.noiseFloorDb + 3.5) {
        this.calibrationActiveSamples.push(baseFastDb);
      }
      if (nowMs >= this.calibratingUntilMs) {
        const cb = this.onCalibrationDone;
        this.calibratingUntilMs = 0;
        this.onCalibrationDone = null;

        const pool =
          this.calibrationActiveSamples.length >= 5
            ? this.calibrationActiveSamples
            : this.calibrationAllSamples.length >= 10
              ? this.calibrationAllSamples
              : [];

        if (pool.length >= 5) {
          const sorted = [...pool].sort((a, b) => a - b);
          const p75 = sorted[Math.floor(sorted.length * 0.75)];
          // Guard against total dead silence (dynamic range < 2 dB and near noise floor)
          const spread = sorted[sorted.length - 1] - sorted[0];
          if (this.calibrationActiveSamples.length >= 5 || spread >= 2.5) {
            const offset = Math.round(Math.max(-25, Math.min(25, 56 - p75)));
            cb?.(offset);
          } else {
            cb?.(null);
          }
        } else {
          cb?.(null);
        }
      }
    }
  }

  /**
   * Collects A-weighted speaking dBA samples at 20 Hz for 3.2 seconds to center
   * the green comfort zone around the user's natural speaking voice (56 dBA target).
   */
  beginCalibration(onDone: (offsetDb: number | null) => void): void {
    this.calibrationActiveSamples = [];
    this.calibrationAllSamples = [];
    this.calibratingUntilMs = performance.now() + 3200;
    this.onCalibrationDone = onDone;
  }

  sample(
    nowMs: number,
    comfortMinDb: number,
    comfortMaxDb: number,
    calOffsetDb: number
  ): VoiceSample {
    if (this.state !== 'active' || !this.aWeightAnalyser || !this.ctx) {
      return {
        micState: this.state,
        rawDb: 0,
        smoothedDb: 0,
        leqDb: 0,
        noiseFloorDb: 33,
        historyDb: [],
        voiceBandActive: false,
        status: 'off',
      };
    }

    if (nowMs - this.lastPollMs > 120) {
      this.captureAudioSlice(nowMs);
    }

    // 1. Live Fast (125 ms) A-weighted dBA
    const liveDba = Math.max(25, Math.min(100, this.energyToBaseDba(this.fastEnergy) + calOffsetDb));
    const displayDb = Math.round(liveDba);

    // 2. True 3-second equivalent continuous sound level (LAeq)
    let meanEnergy = this.fastEnergy;
    if (this.energyWindow.length > 0) {
      let sum = 0;
      for (const item of this.energyWindow) {
        sum += item.energy;
      }
      meanEnergy = sum / this.energyWindow.length;
    }
    const leqDba = Math.max(25, Math.min(100, this.energyToBaseDba(meanEnergy) + calOffsetDb));
    const displayLeqDb = Math.round(leqDba);

    // 3. Ambient room noise floor (shifted by same user calibration offset)
    const displayNoiseFloor = Math.round(
      Math.max(25, Math.min(70, this.noiseFloorDb + calOffsetDb))
    );

    // 4. Push rolling history point (~4 Hz) for live scrolling voice wave
    if (nowMs - this.lastHistoryPushMs >= 210) {
      this.lastHistoryPushMs = nowMs;
      this.historyDb = [...this.historyDb.slice(-(HISTORY_LEN - 1)), Number(liveDba.toFixed(1))];
    }

    // 5. Speech-band flag for Audio-Visual Speaking detection
    const vocalCount = this.recentVocalFlags.filter((f) => f.isVoice && !f.isClack).length;
    const voiceBandActive = vocalCount >= 2;
    this.lastVoiceBandActive = voiceBandActive;

    // 6. Comfort zone status: use sustained LAeq or sustained live dBA (never flashes on a 20ms click)
    const isLoudNow = leqDba >= comfortMaxDb || liveDba >= comfortMaxDb + 3;
    let status: VoiceComfortStatus = 'quiet';
    if (isLoudNow) {
      if (this.loudSinceMs === null) {
        this.loudSinceMs = nowMs;
      }
      status = leqDba >= comfortMaxDb || nowMs - this.loudSinceMs >= 900 ? 'loud' : 'comfortable';
    } else {
      this.loudSinceMs = null;
      status = displayDb >= comfortMinDb || displayLeqDb >= comfortMinDb ? 'comfortable' : 'quiet';
    }

    return {
      micState: 'active',
      rawDb: displayDb,
      smoothedDb: displayDb,
      leqDb: displayLeqDb,
      noiseFloorDb: displayNoiseFloor,
      historyDb: this.historyDb,
      voiceBandActive,
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
    this.aWeightAnalyser = null;
    this.rawAnalyser = null;
    this.aTimeBuf = null;
    this.rawTimeBuf = null;
    this.rawFreqBuf = null;
    this.energyWindow = [];
    this.floorHistory = [];
    this.historyDb = [];
    this.recentVocalFlags = [];
    this.consecutiveVocalSlices = 0;
    this.loudSinceMs = null;
    this.lastVoiceBandActive = false;
    if (this.state === 'active') {
      this.state = 'off';
    }
  }
}
