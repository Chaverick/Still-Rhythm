import { useEffect, useRef, useState } from 'react';
import { BreathSoundGuide, unlockAudio } from '../lib/audio';

interface CyclicSighPacerProps {
  totalCycles?: number;
  compact?: boolean;
  defaultAudioOn?: boolean;
  allowDurationPicker?: boolean;
  onComplete?: () => void;
  onCancel?: () => void;
}

const PHASES = [
  {
    id: 'inhale-1' as const,
    shortLabel: 'Breathe in',
    title: 'Breathe in gently through your nose',
    hint: 'Let the warm light expand as your lungs fill comfortably.',
    durationSec: 4.0,
    startLevel: 0.0,
    endLevel: 0.78,
  },
  {
    id: 'inhale-2' as const,
    shortLabel: 'Top-up sip',
    title: 'One short second sip in',
    hint: 'A light top-up breath at the peak.',
    durationSec: 1.5,
    startLevel: 0.78,
    endLevel: 1.0,
  },
  {
    id: 'exhale' as const,
    shortLabel: 'Breathe out',
    title: 'Breathe out slowly through your mouth',
    hint: 'Follow the glow softly back down — let your jaw and shoulders drop.',
    durationSec: 7.5,
    startLevel: 1.0,
    endLevel: 0.0,
  },
] as const;

const DURATION_PRESETS = [
  { label: '60s', cycles: 5 },
  { label: '2 min', cycles: 9 },
  { label: '3 min', cycles: 14 },
] as const;

function easeInOutSine(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return 0.5 - 0.5 * Math.cos(Math.PI * c);
}

export function CyclicSighPacer({
  totalCycles = 5,
  compact = false,
  defaultAudioOn = true,
  allowDurationPicker = !compact,
  onComplete,
  onCancel,
}: CyclicSighPacerProps) {
  const [cyclesTarget, setCyclesTarget] = useState(totalCycles);
  const [running, setRunning] = useState(compact);
  const [audioOn, setAudioOn] = useState(defaultAudioOn);
  const [cycle, setCycle] = useState(1);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [remainingSec, setRemainingSec] = useState<number>(PHASES[0].durationSec);
  const [breathLevel, setBreathLevel] = useState(0); // 0 = rested small, 1 = full radiant peak
  const [finished, setFinished] = useState(false);

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const audioOnRef = useRef(audioOn);
  audioOnRef.current = audioOn;

  const soundRef = useRef<BreathSoundGuide | null>(null);
  if (!soundRef.current) {
    soundRef.current = new BreathSoundGuide();
  }

  // Stop audio cleanly on unmount
  useEffect(() => {
    return () => {
      soundRef.current?.stop();
    };
  }, []);

  // React to mid-session audio mute/unmute
  useEffect(() => {
    if (!running || finished) return;
    if (!audioOn) {
      soundRef.current?.stop();
    } else {
      unlockAudio();
      const phase = PHASES[phaseIdx];
      soundRef.current?.cuePhase(phase.id, Math.max(0.5, remainingSec));
    }
  }, [audioOn]); // eslint-disable-line react-hooks/exhaustive-deps

  // Smooth 60fps breathing loop driving both expanding warm-orange orb and Web Audio cues
  useEffect(() => {
    if (!running || finished) {
      soundRef.current?.stop();
      return;
    }

    let rafId = 0;
    let curCycle = cycle;
    let curPhaseIdx = phaseIdx;
    let phaseStartMs = performance.now();
    let lastTextUpdateMs = 0;

    const triggerAudioForPhase = (idx: number) => {
      if (!audioOnRef.current) return;
      const p = PHASES[idx];
      soundRef.current?.cuePhase(p.id, p.durationSec);
    };

    if (audioOnRef.current) {
      unlockAudio();
      triggerAudioForPhase(curPhaseIdx);
    }

    const tick = (nowMs: number) => {
      const phase = PHASES[curPhaseIdx];
      const elapsedSec = (nowMs - phaseStartMs) / 1000;
      const progress = Math.min(1, elapsedSec / phase.durationSec);
      const eased = easeInOutSine(progress);
      const level = phase.startLevel + (phase.endLevel - phase.startLevel) * eased;
      setBreathLevel(level);

      const rem = Math.max(0, phase.durationSec - elapsedSec);
      if (nowMs - lastTextUpdateMs >= 120) {
        setRemainingSec(rem);
        lastTextUpdateMs = nowMs;
      }

      if (elapsedSec >= phase.durationSec) {
        curPhaseIdx += 1;
        if (curPhaseIdx >= PHASES.length) {
          curPhaseIdx = 0;
          curCycle += 1;
          if (curCycle > cyclesTarget) {
            setBreathLevel(0);
            setFinished(true);
            setRunning(false);
            if (audioOnRef.current) {
              soundRef.current?.finish();
            } else {
              soundRef.current?.stop();
            }
            onCompleteRef.current?.();
            return;
          }
          setCycle(curCycle);
        }
        setPhaseIdx(curPhaseIdx);
        setRemainingSec(PHASES[curPhaseIdx].durationSec);
        phaseStartMs = nowMs;
        triggerAudioForPhase(curPhaseIdx);
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      soundRef.current?.stop();
    };
  }, [running, finished, cyclesTarget]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStartOrRestart = () => {
    if (audioOn) unlockAudio();
    setFinished(false);
    setCycle(1);
    setPhaseIdx(0);
    setRemainingSec(PHASES[0].durationSec);
    setBreathLevel(0);
    setRunning(true);
  };

  const handleSelectDuration = (cycles: number) => {
    setCyclesTarget(cycles);
    if (running) {
      setRunning(false);
      setFinished(false);
      setCycle(1);
      setPhaseIdx(0);
      setRemainingSec(PHASES[0].durationSec);
      setBreathLevel(0);
    }
  };

  const phase = PHASES[phaseIdx];
  const approxMinutes = Math.max(1, Math.round((cyclesTarget * 13) / 60));

  // Continuous scale & warm orange glow intensity driven smoothly by breathLevel (0..1)
  const coreScale = running ? 0.62 + breathLevel * 0.44 : 0.72;
  const haloScale = running ? 0.78 + breathLevel * 0.68 : 0.86;
  const haloOpacity = running ? 0.24 + breathLevel * 0.66 : 0.22;
  const glowSpread = running ? Math.round(14 + breathLevel * 34) : 12;

  return (
    <div className={`sigh-pacer sigh-pacer--luminous ${compact ? 'sigh-pacer--compact' : ''}`}>
      {/* Expanding / Contracting Warm Orange Light Orb */}
      <div className={`sigh-orb-stage ${compact ? 'sigh-orb-stage--compact' : ''}`} aria-hidden="true">
        <div
          className="sigh-orb-halo"
          style={{
            transform: `scale(${haloScale.toFixed(3)})`,
            opacity: haloOpacity.toFixed(3),
          }}
        />
        <div
          className="sigh-orb-ring"
          style={{
            transform: `scale(${(0.7 + breathLevel * 0.48).toFixed(3)})`,
            opacity: (running ? 0.28 + breathLevel * 0.5 : 0.2).toFixed(3),
          }}
        />
        <div
          className={`sigh-orb sigh-orb--amber ${running ? 'sigh-orb--breathing' : ''}`}
          style={{
            transform: `scale(${coreScale.toFixed(3)})`,
            boxShadow: `0 0 ${glowSpread}px ${Math.round(glowSpread * 0.35)}px rgba(232, 134, 68, ${(
              0.24 +
              breathLevel * 0.52
            ).toFixed(2)})`,
          }}
        >
          <span className="sigh-orb-phase-word">
            {finished ? 'Calm' : running ? phase.shortLabel : 'Ready'}
          </span>
          <span className="sigh-orb-count tabular">
            {finished ? 'Done' : running ? `${Math.ceil(remainingSec)}s` : `${approxMinutes}m`}
          </span>
        </div>
      </div>

      <div className="sigh-copy">
        <div className="sigh-top-meta-row">
          <span className="sigh-cycle-meta tabular">
            {finished
              ? `Completed ${cyclesTarget} slow sighs`
              : running
                ? `Breath ${cycle} of ${cyclesTarget}`
                : `${cyclesTarget} breaths · ~${approxMinutes} min`}
          </span>

          <button
            type="button"
            className={`breath-audio-pill ${audioOn ? 'breath-audio-pill--on' : ''}`}
            aria-pressed={audioOn}
            title="Soft rising/falling breath tones for headphones or speakers"
            onClick={() => setAudioOn((v) => !v)}
          >
            {audioOn ? 'Sound cue on' : 'Visual only'}
          </button>
        </div>

        <h3 className="sigh-phase-title">
          {finished
            ? 'Notice how your shoulders and breath feel now.'
            : running
              ? phase.title
              : 'Guided breathing'}
        </h3>
        <p className="sigh-phase-hint">
          {finished
            ? 'Even one minute of longer exhales quiets restlessness.'
            : running
              ? phase.hint
              : 'Warm light and a gentle rising tone expand as you breathe in, then soften as you exhale.'}
        </p>

        {allowDurationPicker && !running && (
          <div className="segmented segmented--mini" role="group" aria-label="Breathing duration">
            {DURATION_PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className={`segmented-btn ${cyclesTarget === preset.cycles ? 'segmented-btn--active' : ''}`}
                onClick={() => handleSelectDuration(preset.cycles)}
              >
                {preset.label}
              </button>
            ))}
          </div>
        )}

        <div className="sigh-actions">
          {!running ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={handleStartOrRestart}>
              {finished ? 'Breathe again' : 'Start breathing'}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-subtle btn-sm"
              onClick={() => setRunning(false)}
            >
              Pause
            </button>
          )}
          {onCancel && (
            <button
              type="button"
              className="text-link-btn text-link-btn--muted"
              onClick={() => {
                soundRef.current?.stop();
                onCancel();
              }}
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
