import { useEffect, useRef, useState } from 'react';

interface CyclicSighPacerProps {
  totalCycles?: number;
  compact?: boolean;
  onComplete?: () => void;
  onCancel?: () => void;
}

const PHASES = [
  {
    id: 'inhale-1',
    title: 'Breathe in gently through your nose',
    hint: 'Fill your lungs comfortably without lifting your shoulders.',
    durationSec: 4,
    scale: 1.24,
  },
  {
    id: 'inhale-2',
    title: 'Add a short second breath in',
    hint: 'A light top-up sip of air through your nose.',
    durationSec: 1.5,
    scale: 1.4,
  },
  {
    id: 'exhale',
    title: 'Breathe out slowly through your mouth',
    hint: 'Let your jaw soften and your shoulders sink down.',
    durationSec: 7.5,
    scale: 0.84,
  },
] as const;

export function CyclicSighPacer({
  totalCycles = 4,
  compact = false,
  onComplete,
  onCancel,
}: CyclicSighPacerProps) {
  const [running, setRunning] = useState(compact);
  const [cycle, setCycle] = useState(1);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [remainingSec, setRemainingSec] = useState<number>(PHASES[0].durationSec);
  const [finished, setFinished] = useState(false);

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (!running || finished) return;
    const stepMs = 250;
    let curPhase = phaseIdx;
    let curCycle = cycle;
    let curRem = remainingSec;

    const timer = window.setInterval(() => {
      curRem -= stepMs / 1000;
      if (curRem <= 0.05) {
        curPhase += 1;
        if (curPhase >= PHASES.length) {
          curPhase = 0;
          curCycle += 1;
          if (curCycle > totalCycles) {
            window.clearInterval(timer);
            setFinished(true);
            setRunning(false);
            onCompleteRef.current?.();
            return;
          }
          setCycle(curCycle);
        }
        setPhaseIdx(curPhase);
        curRem = PHASES[curPhase].durationSec;
      }
      setRemainingSec(curRem);
    }, stepMs);

    return () => window.clearInterval(timer);
  }, [running, finished, totalCycles]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRestart = () => {
    setFinished(false);
    setCycle(1);
    setPhaseIdx(0);
    setRemainingSec(PHASES[0].durationSec);
    setRunning(true);
  };

  const phase = PHASES[phaseIdx];
  const orbScale = running ? phase.scale : 1;

  return (
    <div className={`sigh-pacer ${compact ? 'sigh-pacer--compact' : ''}`}>
      <div className="sigh-orb-wrap" aria-hidden="true">
        <div
          className={`sigh-orb ${running ? 'sigh-orb--active' : ''}`}
          style={{ transform: `scale(${orbScale})` }}
        >
          <span className="sigh-orb-count tabular">
            {finished ? 'Done' : running ? `${Math.ceil(remainingSec)}s` : 'Ready'}
          </span>
        </div>
      </div>

      <div className="sigh-copy">
        <div className="sigh-cycle-meta tabular">
          {finished
            ? `Completed ${totalCycles} slow sighs`
            : running
              ? `Breath ${cycle} of ${totalCycles}`
              : `${totalCycles} cycles · ~1 minute`}
        </div>
        <h3 className="sigh-phase-title">
          {finished
            ? 'Notice how your shoulders and breath feel now.'
            : running
              ? phase.title
              : 'Guided double-inhale sigh'}
        </h3>
        <p className="sigh-phase-hint">
          {finished
            ? 'Even a minute of longer exhales helps quiet a restless body.'
            : running
              ? phase.hint
              : 'Two gentle breaths in through your nose, followed by one long, unhurried breath out.'}
        </p>

        <div className="sigh-actions">
          {!running ? (
            <button type="button" className="btn btn-primary btn-sm" onClick={handleRestart}>
              {finished ? 'Do another minute' : 'Start guided breath'}
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
              onClick={onCancel}
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
