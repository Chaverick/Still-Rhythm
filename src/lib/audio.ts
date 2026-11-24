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
