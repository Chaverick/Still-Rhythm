import { useEffect, useMemo, useState } from 'react';
import {
  CALMING_TECHNIQUES,
  COMPETING_RESPONSES,
  ENVIRONMENT_ANCHORS,
} from '../lib/storage';
import type { CalmingTechniqueId, StillSettings } from '../types';
import { CompetingResponseVisual } from './CompetingResponseVisual';
import { CyclicSighPacer } from './CyclicSighPacer';

interface WhatWorksViewProps {
  settings: StillSettings;
  onUpdateSettings: (patch: Partial<StillSettings>) => void;
  onLogCalmingReset: (techniqueId: CalmingTechniqueId) => void;
}

const PRACTICE_SECONDS = 15;

type RotatingTip =
  | {
      kind: 'calm';
      id: CalmingTechniqueId;
      category: string;
      title: string;
      meta: string;
      summary: string;
      steps: string[];
      safetyNote: string;
    }
  | {
      kind: 'hand';
      id: string;
      category: string;
      title: string;
      meta: string;
      summary: string;
      why: string;
    };

export function WhatWorksView({
  settings,
  onUpdateSettings,
  onLogCalmingReset,
}: WhatWorksViewProps) {
  const [practicingId, setPracticingId] = useState<string | null>(null);
  const [practiceRemaining, setPracticeRemaining] = useState(PRACTICE_SECONDS);
  const [tipIndex, setTipIndex] = useState<number>(() => new Date().getHours() % 6);
  const [tipStepsOpen, setTipStepsOpen] = useState(false);

  // Build one calm, rotating deck of non-breath advice (body resets + hand resets)
  const rotatingTips = useMemo<RotatingTip[]>(() => {
    const calmOthers: RotatingTip[] = CALMING_TECHNIQUES.filter(
      (t) => t.id !== 'cyclic-sigh'
    ).map((t) => ({
      kind: 'calm',
      id: t.id,
      category: 'Body & focus reset',
      title: t.title,
      meta: t.durationHint,
      summary: t.summary,
      steps: t.steps,
      safetyNote: t.neckSafetyNote,
    }));

    const handTips: RotatingTip[] = COMPETING_RESPONSES.map((r) => ({
      kind: 'hand',
      id: r.id,
      category: 'Hand reset for brow urges',
      title: r.title,
      meta: r.durationHint,
      summary: r.instruction,
      why: r.why,
    }));

    // Interleave calm resets and hand resets so clicking "Next tip" feels fresh
    const mixed: RotatingTip[] = [];
    const maxLen = Math.max(calmOthers.length, handTips.length);
    for (let i = 0; i < maxLen; i++) {
      if (calmOthers[i]) mixed.push(calmOthers[i]);
      if (handTips[i]) mixed.push(handTips[i]);
    }
    return mixed;
  }, []);

  const currentTip = rotatingTips[tipIndex % rotatingTips.length];

  useEffect(() => {
    if (!practicingId) return;
    const timer = window.setInterval(() => {
      setPracticeRemaining((prev) => {
        if (prev <= 1) {
          window.clearInterval(timer);
          setPracticingId(null);
          return PRACTICE_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [practicingId]);

  const togglePractice = (id: string) => {
    if (practicingId === id) {
      setPracticingId(null);
      setPracticeRemaining(PRACTICE_SECONDS);
    } else {
      setPracticingId(id);
      setPracticeRemaining(PRACTICE_SECONDS);
    }
  };

  const togglePinResponse = (id: string) => {
    const exists = settings.pinnedResponses.includes(id);
    const next = exists
      ? settings.pinnedResponses.filter((x) => x !== id)
      : [id, ...settings.pinnedResponses];
    onUpdateSettings({ pinnedResponses: next });
  };

  const toggleAnchor = (id: string) => {
    const exists = settings.checkedAnchors.includes(id);
    const next = exists
      ? settings.checkedAnchors.filter((x) => x !== id)
      : [...settings.checkedAnchors, id];
    onUpdateSettings({ checkedAnchors: next });
  };

  const handleNextTip = () => {
    setTipStepsOpen(false);
    setTipIndex((i) => (i + 1) % rotatingTips.length);
  };

  const checkedCount = settings.checkedAnchors.length;

  return (
    <div className="view-stack">
      <header className="page-intro">
        <h1 className="page-title">Calm</h1>
        <p className="page-lead">
          Follow the expanding warm light and gentle tone to settle your breath — visually or with
          earphones.
        </p>
      </header>

      {/* HERO: Headspace-style Guided Breath with Expanding Orange Light + Audio */}
      <section className="editorial-section" aria-label="Guided calming breath">
        <div className="settings-card settings-card--breath">
          <CyclicSighPacer
            totalCycles={5}
            defaultAudioOn={settings.soundEnabled}
            allowDurationPicker
            onComplete={() => onLogCalmingReset('cyclic-sigh')}
          />
        </div>
      </section>

      {/* ONE CLEAN ROTATING ADVICE CARD (cycles through other calm tools & hand resets) */}
      <section className="editorial-section" aria-label="Quick reset advice">
        <div className="section-head-row">
          <h2 className="section-heading">Another quick reset</h2>
          <div className="settings-inline-actions">
            <span className="section-meta tabular">
              {(tipIndex % rotatingTips.length) + 1} / {rotatingTips.length}
            </span>
            <button type="button" className="text-link-btn" onClick={handleNextTip}>
              Next idea →
            </button>
          </div>
        </div>

        <article className="response-card tip-spotlight-card">
          <div className="response-head">
            <div>
              <span className="insight-category">{currentTip.category}</span>
              <h3 className="response-title" style={{ marginTop: 2 }}>
                {currentTip.title}
              </h3>
            </div>
            <span className="section-meta">{currentTip.meta}</span>
          </div>

          {currentTip.kind === 'hand' ? (
            <div className="tip-hand-row">
              <CompetingResponseVisual id={currentTip.id} compact />
              <div className="response-content">
                <p className="response-instruction">{currentTip.summary}</p>
                <p className="response-why">{currentTip.why}</p>
              </div>
            </div>
          ) : (
            <>
              <p className="response-instruction">{currentTip.summary}</p>
              {tipStepsOpen && (
                <div className="technique-expanded">
                  <ol className="technique-steps">
                    {currentTip.steps.map((step, idx) => (
                      <li key={idx}>{step}</li>
                    ))}
                  </ol>
                  <p className="calming-safety-line">{currentTip.safetyNote}</p>
                </div>
              )}
            </>
          )}

          <div className="welcome-actions" style={{ marginTop: 4 }}>
            {currentTip.kind === 'calm' ? (
              <>
                <button
                  type="button"
                  className="btn btn-subtle btn-xs"
                  onClick={() => onLogCalmingReset(currentTip.id)}
                >
                  I did this reset
                </button>
                <button
                  type="button"
                  className="text-link-btn text-link-btn--muted"
                  onClick={() => setTipStepsOpen((o) => !o)}
                >
                  {tipStepsOpen ? 'Hide steps' : 'Show steps'}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={`pin-btn ${practicingId === currentTip.id ? 'pin-btn--practice' : ''}`}
                  onClick={() => togglePractice(currentTip.id)}
                >
                  {practicingId === currentTip.id
                    ? `Practicing · ${practiceRemaining}s`
                    : 'Try 15s'}
                </button>
                <button
                  type="button"
                  className={`pin-btn ${
                    settings.pinnedResponses.includes(currentTip.id) ? 'pin-btn--active' : ''
                  }`}
                  onClick={() => togglePinResponse(currentTip.id)}
                >
                  {settings.pinnedResponses.includes(currentTip.id) ? '★ Starred' : '☆ Star'}
                </button>
              </>
            )}
          </div>
        </article>
      </section>

      {/* PROGRESSIVE DISCLOSURE DRAWERS: Full libraries tucked away cleanly */}
      <div className="drawer-stack">
        <details className="streamline-drawer">
          <summary className="streamline-drawer-summary">
            <span>All hand resets for brow urges</span>
            <span className="streamline-drawer-meta">
              {settings.pinnedResponses.length} starred · {COMPETING_RESPONSES.length} total
            </span>
          </summary>
          <div className="streamline-drawer-body">
            <div className="response-list">
              {COMPETING_RESPONSES.map((item) => {
                const pinned = settings.pinnedResponses.includes(item.id);
                const isPracticing = practicingId === item.id;
                return (
                  <article
                    key={item.id}
                    className={`response-card response-card--visual ${
                      isPracticing ? 'response-card--practicing' : ''
                    }`}
                  >
                    <CompetingResponseVisual id={item.id} compact />

                    <div className="response-content">
                      <div className="response-head">
                        <h3 className="response-title">{item.title}</h3>
                        <div className="response-head-actions">
                          <button
                            type="button"
                            className={`pin-btn ${isPracticing ? 'pin-btn--practice' : ''}`}
                            onClick={() => togglePractice(item.id)}
                          >
                            {isPracticing ? `${practiceRemaining}s` : 'Try 15s'}
                          </button>
                          <button
                            type="button"
                            className={`pin-btn ${pinned ? 'pin-btn--active' : ''}`}
                            aria-pressed={pinned}
                            onClick={() => togglePinResponse(item.id)}
                          >
                            {pinned ? '★' : '☆'}
                          </button>
                        </div>
                      </div>
                      <p className="response-instruction">{item.instruction}</p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </details>

        <details className="streamline-drawer">
          <summary className="streamline-drawer-summary">
            <span>Quiet environment anchors</span>
            <span className="streamline-drawer-meta tabular">
              {checkedCount} of {ENVIRONMENT_ANCHORS.length} checked
            </span>
          </summary>
          <div className="streamline-drawer-body">
            <div className="anchor-list">
              {ENVIRONMENT_ANCHORS.map((anchor) => {
                const checked = settings.checkedAnchors.includes(anchor.id);
                return (
                  <label key={anchor.id} className="anchor-item">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAnchor(anchor.id)}
                    />
                    <div className="anchor-copy">
                      <span className={`anchor-title ${checked ? 'anchor-title--done' : ''}`}>
                        {anchor.title}
                      </span>
                      <span className="anchor-detail">{anchor.detail}</span>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}
