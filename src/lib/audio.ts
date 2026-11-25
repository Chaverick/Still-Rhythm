/**
 * Local Singing-Bowl Audio Engine (Zero external audio files, 100% in-browser).
 *
 * Resilient across iPadOS Safari, macOS Safari, and Desktop Chrome/Edge — including
 * when backgrounded during Picture-in-Picture:
 *  1. Primary: Web Audio API cast singing-bowl synthesis (396 Hz / 330 Hz warm partials).
 *  2. Video PiP Routing: Connects Web Audio to a MediaStreamAudioDestinationNode attached
 *     directly to the unmuted Video PiP <video> stream so iPadOS/Safari keeps audio alive
 *     in the background via the OS Picture-in-Picture media session.
 *  3. Fallback: Pre-rendered local PCM WAV Blob <audio> element (exact same singing-bowl
 *     waveform) unlocked on first tap — fires immediately with zero lag if Safari puts
 *     AudioContext into 'suspended' or 'interrupted' state while backgrounded.
 */

type ChimeVariant = 'gentle' | 'repeat' | 'grounding';

let audioCtx: AudioContext | null = null;
let pipAudioDest: MediaStreamAudioDestinationNode | null = null;
let videoPiPAudioActive = false;

// Pre-rendered local WAV <audio> fallback elements per variant
const wavUrls: Partial<Record<ChimeVariant, string>> = {};
let fallbackAudioEl: HTMLAudioElement | null = null;
let fallbackUnlocked = false;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
  }
  return audioCtx;
}

/**
 * Generates an identical cast singing-bowl chime as an in-memory 16-bit PCM WAV Blob URL.
 * Runs locally in ~3ms, zero network requests.
 */
function getOrCreateWavUrl(variant: ChimeVariant): string | null {
  if (wavUrls[variant]) return wavUrls[variant]!;
  if (typeof URL === 'undefined' || typeof Blob === 'undefined') return null;

  const sampleRate = 22050;
  const durationSec = variant === 'grounding' ? 3.2 : 2.6;
  const numSamples = Math.floor(sampleRate * durationSec);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  // Standard RIFF/WAVE header (mono, 16-bit PCM)
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  const baseFreq = variant === 'grounding' ? 330 : 396;
  const masterPeak = variant === 'gentle' ? 0.34 : variant === 'repeat' ? 0.26 : 0.3;
  const partials = [
    { ratio: 1.0, amp: 0.65, decay: 2.5 },
    { ratio: 1.0035, amp: 0.35, decay: 2.3 },
    { ratio: 2.756, amp: 0.2, decay: 1.5 },
    { ratio: 5.404, amp: 0.05, decay: 0.8 },
  ];

  const twoPi = Math.PI * 2;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    // Smooth 45ms attack envelope
    const attack = t < 0.045 ? t / 0.045 : 1;
    let sum = 0;
    for (const p of partials) {
      const env = Math.exp((-4.5 * t) / p.decay);
      sum += p.amp * env * Math.sin(twoPi * baseFreq * p.ratio * t);
    }
    const sample = Math.max(-1, Math.min(1, sum * attack * masterPeak));
    view.setInt16(44 + i * 2, Math.round(sample * 32767), true);
  }

  const blob = new Blob([buffer], { type: 'audio/wav' });
  const url = URL.createObjectURL(blob);
  wavUrls[variant] = url;
  return url;
}

function getFallbackAudioEl(): HTMLAudioElement | null {
  if (typeof document === 'undefined') return null;
  if (!fallbackAudioEl) {
    const el = document.createElement('audio');
    el.preload = 'auto';
    el.setAttribute('playsinline', 'true');
    el.setAttribute('webkit-playsinline', 'true');
    fallbackAudioEl = el;
  }
  return fallbackAudioEl;
}

/**
 * Returns a MediaStreamTrack fed by our Web Audio engine so the Canvas Video PiP
 * <video> element can carry the singing-bowl chime natively on iPadOS / macOS Safari.
 */
export function getPipAudioTrack(): MediaStreamTrack | null {
  const ctx = getAudioContext();
  if (!ctx || typeof ctx.createMediaStreamDestination !== 'function') return null;
  if (!pipAudioDest) {
    try {
      pipAudioDest = ctx.createMediaStreamDestination();
    } catch {
      return null;
    }
  }
  return pipAudioDest.stream.getAudioTracks()[0] ?? null;
}

export function setVideoPiPAudioActive(active: boolean): void {
  videoPiPAudioActive = active;
}

/**
 * Call synchronously inside a click/tap handler on iPadOS Safari to unlock BOTH
 * Web Audio AND the fallback local WAV <audio> element.
 */
export function unlockAudio(): void {
  const ctx = getAudioContext();
  if (ctx) {
    if (ctx.state !== 'running') {
      ctx.resume().catch(() => {});
    }
    try {
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
    } catch {
      // ignore
    }
  }

  // Pre-build WAV blobs & unlock the HTMLAudioElement inside the user gesture
  const gentleUrl = getOrCreateWavUrl('gentle');
  getOrCreateWavUrl('repeat');
  getOrCreateWavUrl('grounding');

  if (!fallbackUnlocked && gentleUrl) {
    const el = getFallbackAudioEl();
    if (el) {
      try {
        el.src = gentleUrl;
        el.muted = true;
        el.volume = 0;
        const p = el.play();
        if (p && typeof p.then === 'function') {
          p.then(() => {
            el.pause();
            el.currentTime = 0;
            el.muted = false;
            el.volume = 1;
            fallbackUnlocked = true;
          }).catch(() => {
            el.muted = false;
            el.volume = 1;
          });
        }
      } catch {
        // ignore
      }
    }
  }
}

function playFallbackWav(variant: ChimeVariant): void {
  const url = getOrCreateWavUrl(variant);
  const el = getFallbackAudioEl();
  if (!url || !el) return;
  try {
    if (el.src !== url) {
      el.src = url;
    }
    el.muted = false;
    el.volume = variant === 'repeat' ? 0.85 : 1.0;
    el.currentTime = 0;
    el.play().catch(() => {});
  } catch {
    // ignore
  }
}

function playWebAudioBowl(
  ctx: AudioContext,
  target: AudioNode,
  variant: ChimeVariant
): void {
  const now = ctx.currentTime;
  const master = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(
    variant === 'grounding' ? 1800 : variant === 'repeat' ? 2050 : 2200,
    now
  );
  filter.Q.setValueAtTime(0.7, now);

  const peakGain = variant === 'gentle' ? 0.2 : variant === 'repeat' ? 0.14 : 0.16;
  const totalDecay = variant === 'grounding' ? 3.8 : variant === 'repeat' ? 2.9 : 3.1;

  master.gain.setValueAtTime(0.0001, now);
  master.gain.linearRampToValueAtTime(peakGain, now + 0.045);
  master.gain.exponentialRampToValueAtTime(0.0001, now + totalDecay);

  master.connect(filter);
  filter.connect(target);

  const baseFreq = variant === 'grounding' ? 330 : 396;
  const partials: Array<{ ratio: number; detune: number; gain: number; decay: number }> = [
    { ratio: 1.0, detune: 0, gain: 0.65, decay: 3.0 },
    { ratio: 1.0035, detune: 2, gain: 0.35, decay: 2.8 },
    { ratio: 2.756, detune: -3, gain: 0.22, decay: 1.85 },
    { ratio: 5.404, detune: 4, gain: 0.06, decay: 0.95 },
  ];

  for (const p of partials) {
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq * p.ratio, now);
    osc.detune.setValueAtTime(p.detune, now);

    oscGain.gain.setValueAtTime(0.0001, now);
    oscGain.gain.linearRampToValueAtTime(p.gain, now + 0.035);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + p.decay);

    osc.connect(oscGain);
    oscGain.connect(master);

    osc.start(now);
    osc.stop(now + p.decay + 0.1);
  }
}

/**
 * Plays a warm, organic singing-bowl chime with automatic iPadOS / PiP background resilience.
 */
export function playSingingBowl(variant: ChimeVariant = 'gentle'): void {
  const ctx = getAudioContext();

  // If Web Audio is unavailable, suspended, or Safari-interrupted (common when backgrounded in PiP),
  // immediately play the pre-unlocked local WAV <audio> element AND kick ctx.resume() for next time.
  if (!ctx || ctx.state !== 'running') {
    if (ctx) {
      ctx.resume().catch(() => {});
    }
    playFallbackWav(variant);
    return;
  }

  // When Video PiP is active & unmuted, route through the PiP video's own MediaStream audio track
  // (plus fallback WAV if tab is hidden on iOS where Web Audio nodes can pause mid-render).
  if (videoPiPAudioActive && pipAudioDest) {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      playFallbackWav(variant);
    } else {
      playWebAudioBowl(ctx, pipAudioDest, variant);
    }
    return;
  }

  playWebAudioBowl(ctx, ctx.destination, variant);
}

/**
 * Headspace-inspired gentle Web Audio breath guide for the Cyclic Sigh pacer.
 * - Inhale 1: warm pad + soft airy breeze smoothly rises in pitch & volume
 * - Top-up Sip (Inhale 2): soft crystalline lift so you feel the second breath eyes-closed
 * - Long Exhale: gently glides down and fades back to quiet stillness
 * 100% synthesized in-memory with smooth ramps (zero pops/clicks).
 */
export class BreathSoundGuide {
  private oscPrimary: OscillatorNode | null = null;
  private oscHarmonic: OscillatorNode | null = null;
  private noiseSource: AudioBufferSourceNode | null = null;
  private padGain: GainNode | null = null;
  private noiseGain: GainNode | null = null;
  private padFilter: BiquadFilterNode | null = null;
  private noiseFilter: BiquadFilterNode | null = null;
  private masterGain: GainNode | null = null;
  private active = false;

  start(): boolean {
    if (this.active) return true;
    const ctx = getAudioContext();
    if (!ctx) return false;
    if (ctx.state !== 'running') {
      ctx.resume().catch(() => {});
    }

    try {
      const now = ctx.currentTime;
      const target = videoPiPAudioActive && pipAudioDest ? pipAudioDest : ctx.destination;

      const master = ctx.createGain();
      master.gain.setValueAtTime(0.0001, now);
      master.gain.linearRampToValueAtTime(1.0, now + 0.15);
      master.connect(target);

      // Warm velvety harmonic pad (2 soft sine/triangle voices)
      const padFilter = ctx.createBiquadFilter();
      padFilter.type = 'lowpass';
      padFilter.frequency.setValueAtTime(360, now);
      padFilter.Q.setValueAtTime(0.7, now);

      const padGain = ctx.createGain();
      padGain.gain.setValueAtTime(0.0001, now);

      const osc1 = ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(220, now);

      const osc2 = ctx.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(330, now); // soft 5th harmonic
      const osc2Mix = ctx.createGain();
      osc2Mix.gain.setValueAtTime(0.22, now);

      osc1.connect(padGain);
      osc2.connect(osc2Mix);
      osc2Mix.connect(padGain);
      padGain.connect(padFilter);
      padFilter.connect(master);

      // Subtle filtered "ocean breath" air bed
      const noiseLen = ctx.sampleRate * 2;
      const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      for (let i = 0; i < noiseLen; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + white * 0.029;
        b1 = 0.985 * b1 + white * 0.032;
        b2 = 0.95 * b2 + white * 0.048;
        data[i] = (b0 + b1 + b2 + white * 0.015) * 0.6;
      }

      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = noiseBuf;
      noiseSrc.loop = true;

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(320, now);
      noiseFilter.Q.setValueAtTime(0.9, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.0001, now);

      noiseSrc.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(master);

      osc1.start(now);
      osc2.start(now);
      noiseSrc.start(now);

      this.oscPrimary = osc1;
      this.oscHarmonic = osc2;
      this.noiseSource = noiseSrc;
      this.padGain = padGain;
      this.noiseGain = noiseGain;
      this.padFilter = padFilter;
      this.noiseFilter = noiseFilter;
      this.masterGain = master;
      this.active = true;
      return true;
    } catch {
      return false;
    }
  }

  cuePhase(phase: 'inhale-1' | 'inhale-2' | 'exhale', durationSec: number): void {
    if (!this.active) {
      if (!this.start()) return;
    }
    const ctx = getAudioContext();
    if (!ctx || !this.oscPrimary || !this.oscHarmonic || !this.padGain || !this.padFilter || !this.noiseGain || !this.noiseFilter) {
      return;
    }
    if (ctx.state !== 'running') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const end = now + Math.max(0.4, durationSec);

    const cancelAndAnchor = (param: AudioParam) => {
      param.cancelScheduledValues(now);
      param.setValueAtTime(Math.max(0.0001, param.value), now);
    };

    cancelAndAnchor(this.oscPrimary.frequency);
    cancelAndAnchor(this.oscHarmonic.frequency);
    cancelAndAnchor(this.padGain.gain);
    cancelAndAnchor(this.padFilter.frequency);
    cancelAndAnchor(this.noiseGain.gain);
    cancelAndAnchor(this.noiseFilter.frequency);

    if (phase === 'inhale-1') {
      // Gentle rising swell (A3 -> D4)
      this.oscPrimary.frequency.setValueAtTime(220, now);
      this.oscPrimary.frequency.exponentialRampToValueAtTime(293.66, end);
      this.oscHarmonic.frequency.setValueAtTime(330, now);
      this.oscHarmonic.frequency.exponentialRampToValueAtTime(440, end);

      this.padFilter.frequency.exponentialRampToValueAtTime(760, end);
      this.padGain.gain.linearRampToValueAtTime(0.072, end);

      this.noiseFilter.frequency.exponentialRampToValueAtTime(640, end);
      this.noiseGain.gain.linearRampToValueAtTime(0.042, end);
    } else if (phase === 'inhale-2') {
      // Soft crystalline top-up sip (D4 -> E4)
      this.oscPrimary.frequency.exponentialRampToValueAtTime(329.63, end);
      this.oscHarmonic.frequency.exponentialRampToValueAtTime(493.88, end);

      this.padFilter.frequency.exponentialRampToValueAtTime(980, end);
      this.padGain.gain.linearRampToValueAtTime(0.095, end);

      this.noiseFilter.frequency.exponentialRampToValueAtTime(860, end);
      this.noiseGain.gain.linearRampToValueAtTime(0.055, end);
    } else {
      // Long, unhurried downward release (E4 -> G3) softening back to quiet
      this.oscPrimary.frequency.exponentialRampToValueAtTime(196, end);
      this.oscHarmonic.frequency.exponentialRampToValueAtTime(293.66, end);

      this.padFilter.frequency.exponentialRampToValueAtTime(260, end);
      this.padGain.gain.exponentialRampToValueAtTime(0.003, end);

      this.noiseFilter.frequency.exponentialRampToValueAtTime(220, end);
      this.noiseGain.gain.exponentialRampToValueAtTime(0.001, end);
    }
  }

  finish(): void {
    this.stop();
    playSingingBowl('grounding');
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    const ctx = getAudioContext();
    const osc1 = this.oscPrimary;
    const osc2 = this.oscHarmonic;
    const noise = this.noiseSource;
    const master = this.masterGain;

    this.oscPrimary = null;
    this.oscHarmonic = null;
    this.noiseSource = null;
    this.padGain = null;
    this.noiseGain = null;
    this.padFilter = null;
    this.noiseFilter = null;
    this.masterGain = null;

    if (ctx && master) {
      try {
        const now = ctx.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), now);
        master.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
        window.setTimeout(() => {
          try {
            osc1?.stop();
            osc2?.stop();
            noise?.stop();
            master.disconnect();
          } catch {
            // ignore
          }
        }, 220);
        return;
      } catch {
        // fallback below
      }
    }
    try {
      osc1?.stop();
      osc2?.stop();
      noise?.stop();
      master?.disconnect();
    } catch {
      // ignore
    }
  }
}
