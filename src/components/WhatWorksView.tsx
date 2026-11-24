import { useEffect, useState } from 'react';
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

export function WhatWorksView({
  settings,
  onUpdateSettings,
  onLogCalmingReset,
}: WhatWorksViewProps) {
  const [practicingId, setPracticingId] = useState<string | null>(null);
  const [practiceRemaining, setPracticeRemaining] = useState(PRACTICE_SECONDS);
  const [expandedTechniqueId, setExpandedTechniqueId] = useState<string | null>('cyclic-sigh');

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

  return (
    <div className="view-stack">
      <header className="page-intro">
        <h1 className="page-title">Calm tools</h1>
        <p className="page-lead">
          Research-backed ways to settle restlessness in a minute or two, plus gentle hand resets
          for eyebrow urges — all adapted to stay easy on your neck.
        </p>
      </header>

      {/* Interactive Guided Double-Inhale Sigh Pacer */}
      <section className="editorial-section" aria-label="Guided calming breath">
        <div className="section-head-row">
          <h2 className="section-heading">60-second calming breath</h2>
          <span className="section-meta">Fastest proven desk reset</span>
        </div>
        <div className="settings-card">
          <CyclicSighPacer
            totalCycles={5}
            onComplete={() => onLogCalmingReset('cyclic-sigh')}
          />
        </div>
      </section>

      {/* Proven Calming Techniques for Restlessness */}
      <section className="editorial-section" aria-label="Calming techniques for restlessness">
        <div className="section-head-row">
          <h2 className="section-heading">When restlessness builds</h2>
          <span className="section-meta">Suggested automatically above your comfort level</span>
        </div>

        <div className="response-list">
          {CALMING_TECHNIQUES.map((tech) => {
            const isOpen = expandedTechniqueId === tech.id;
            return (
              <article key={tech.id} className="response-card">
                <div className="response-head">
                  <div>
                    <h3 className="response-title">{tech.title}</h3>
                    <span className="technique-meta">
                      {tech.durationHint} · Best for: {tech.bestFor}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="pin-btn"
                    onClick={() => setExpandedTechniqueId(isOpen ? null : tech.id)}
                  >
                    {isOpen ? 'Hide steps' : 'How to do it'}
                  </button>
                </div>

                <p className="response-instruction">{tech.summary}</p>

                {isOpen && (
                  <div className="technique-expanded">
                    <ol className="technique-steps">
                      {tech.steps.map((step, idx) => (
                        <li key={idx}>{step}</li>
                      ))}
                    </ol>
                    <p className="response-why">{tech.whyItHelps}</p>
                    <p className="calming-safety-line">{tech.neckSafetyNote}</p>
                    <div className="welcome-actions">
                      <button
                        type="button"
                        className="btn btn-subtle btn-sm"
                        onClick={() => onLogCalmingReset(tech.id)}
                      >
                        Log this reset
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      {/* Classic Still Visual Competing Responses Library */}
      <section className="editorial-section" aria-label="Visual hand resets">
        <div className="section-head-row">
          <h2 className="section-heading">Hand resets for brow urges</h2>
          <span className="section-meta">Starred appear first during 60s pauses</span>
        </div>

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
                <CompetingResponseVisual id={item.id} />

                <div className="response-content">
                  <div className="response-head">
                    <h3 className="response-title">{item.title}</h3>
                    <div className="response-head-actions">
                      <button
                        type="button"
                        className={`pin-btn ${isPracticing ? 'pin-btn--practice' : ''}`}
                        onClick={() => togglePractice(item.id)}
                      >
                        {isPracticing ? `Practicing · ${practiceRemaining}s` : 'Try 15s'}
                      </button>
                      <button
                        type="button"
                        className={`pin-btn ${pinned ? 'pin-btn--active' : ''}`}
                        aria-pressed={pinned}
                        onClick={() => togglePinResponse(item.id)}
                      >
                        {pinned ? '★ First' : '☆ Star'}
                      </button>
                    </div>
                  </div>
                  <p className="response-instruction">{item.instruction}</p>
                  <p className="response-why">{item.why}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Sensory & Environment Anchors */}
      <section className="editorial-section" aria-label="Quiet environment anchors">
        <div className="section-head-row">
          <h2 className="section-heading">Quiet environment anchors</h2>
          <span className="section-meta">Check what helps today</span>
        </div>

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
      </section>
    </div>
  );
}
