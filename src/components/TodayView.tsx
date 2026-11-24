import { useState } from 'react';
import type { DailyStoryReport } from '../lib/patterns';
import {
  CALMING_TECHNIQUES,
  formatDuration,
  formatShortDuration,
  totalFaceTouches,
  totalReliefMoves,
} from '../lib/storage';
import type {
  CalmingTechniqueId,
  CameraDeviceOption,
  DaySummary,
  EngineStatus,
  FrameGeometry,
  LiveRhythmState,
  PiPKind,
  PostureCalibration,
  PostureState,
  Stage1AutoCatch,
  StillSettings,
  VisionDiagnostics,
  WelcomeBackPrompt,
} from '../types';
import { CalibrationDrawer } from './CalibrationDrawer';
import { CyclicSighPacer } from './CyclicSighPacer';
import { MorningSummaryCard } from './MorningSummaryCard';
import { TypewriterHeadline } from './TypewriterHeadline';
import { WelcomeBackCard } from './WelcomeBackCard';

interface TodayViewProps {
  status: EngineStatus;
  errorMessage: string | null;
  today: DaySummary;
  totalCalmSeconds: number;
  settings: StillSettings;
  calibration: PostureCalibration;
  rhythm: LiveRhythmState;
  availableCameras: CameraDeviceOption[];
  morningStory: DailyStoryReport | null;
  onDismissMorningStory: () => void;
  onOpenPatterns: () => void;
  onOpenCalmTools: () => void;
  onUpdateSettings: (patch: Partial<StillSettings>) => void;
  onSelectCamera: (deviceId: string) => void;
  onSetPostureManual: (next: PostureState) => void;
  onCaptureNeutralPosture: () => void;
  onCapturePostureReference: (which: PostureState) => void;
  onSnoozeCalming: () => void;
  onCompleteCalmingReset: (techniqueId: CalmingTechniqueId) => void;
  onStart: () => void;
  onStop: () => void;
  onTestStage1: () => void;
  onTestStage2: () => void;
  onOpenSettings: () => void;
  pipSupported: boolean;
  autoPipSupported: boolean;
  pipKind: PiPKind;
  pipError: string | null;
  onTogglePiP: () => void;
  recentFalseAlarms: number;
  onTuneAddDwell: () => void;
  onTuneTightenZone: () => void;
  onTuneEnablePinch: () => void;
  onDismissFalseAlarmNudge: () => void;
  stage1AutoCatch: Stage1AutoCatch | null;
  onCancelStage1FalseAlarm: () => void;
  welcomeBack: WelcomeBackPrompt | null;
  onWelcomeCalm: (addAwayMinutes: boolean) => void;
  onWelcomeRedirect: () => void;
  onWelcomeGrace: () => void;
  onWelcomeDismiss: () => void;
  calibrationOpen: boolean;
  onToggleCalibration: () => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  frameGeometry: FrameGeometry | null;
  dwellSec: number;
  diagnostics: VisionDiagnostics;
}

export function TodayView({
  status,
  errorMessage,
  today,
  totalCalmSeconds,
  settings,
  calibration,
  rhythm,
  availableCameras,
  morningStory,
  onDismissMorningStory,
  onOpenPatterns,
  onOpenCalmTools,
  onUpdateSettings,
  onSelectCamera,
  onSetPostureManual,
  onCaptureNeutralPosture,
  onCapturePostureReference,
  onSnoozeCalming,
  onCompleteCalmingReset,
  onStart,
  onStop,
  onTestStage1,
  onTestStage2,
  onOpenSettings,
  pipSupported,
  autoPipSupported,
  pipKind,
  pipError,
  onTogglePiP,
  recentFalseAlarms,
  onTuneAddDwell,
  onTuneTightenZone,
  onTuneEnablePinch,
  onDismissFalseAlarmNudge,
  stage1AutoCatch,
  onCancelStage1FalseAlarm,
  welcomeBack,
  onWelcomeCalm,
  onWelcomeRedirect,
  onWelcomeGrace,
  onWelcomeDismiss,
  calibrationOpen,
  onToggleCalibration,
  videoRef,
  frameGeometry,
  dwellSec,
  diagnostics,
}: TodayViewProps) {
  const [altTechniqueOffset, setAltTechniqueOffset] = useState(0);
  const [inlinePacerOpen, setInlinePacerOpen] = useState(false);

  const isRunning = status === 'running';
  const isBusy = status === 'requesting-camera' || status === 'loading-models';
  const pipActive = pipKind !== 'none';
  const name = settings.userName.trim();

  const headline = (() => {
    if (status === 'requesting-camera') return 'Opening your camera locally.';
    if (status === 'loading-models') return 'Preparing on-device awareness.';
    if (status === 'running') {
      if (frameGeometry?.handInZone) {
        return name
          ? `${name}, noticing a hand near your brow.`
          : 'Noticing a hand in your watched zone.';
      }
      if (diagnostics.faceState === 'away') return 'Waiting quietly until you return.';
      if (rhythm.suggestCalming) {
        return name
          ? `${name}, you seem a little restless — a brief breath can help.`
          : 'Restlessness is building — a quiet reset can help.';
      }
      if (settings.workContext === 'desk' && rhythm.postureState === 'standing') {
        return 'Standing steady. Hands at ease.';
      }
      return 'You are here. Hands at ease.';
    }
    if (today.calmSeconds > 0) return 'Stillness builds quietly.';
    return 'A quiet companion for your workday.';
  })();

  const subline = (() => {
    if (status === 'requesting-camera') {
      return 'Nothing is recorded or sent anywhere — video stays strictly in this browser tab.';
    }
    if (status === 'loading-models') {
      return 'Loading bundled face, hand, and upper-body models from local storage.';
    }
    if (status === 'running') {
      if (pipActive) {
        return 'Floating in a mini-window. Switch to other tabs or apps freely while Still Rhythm watches locally.';
      }
      return diagnostics.faceState === 'cached'
        ? 'Holding your watched zone steady while your hand passes across.'
        : 'Watching gently on-device. Posture, neck comfort, and face touches log silently for tomorrow’s summary.';
    }
    return '100% on-device awareness — eyebrow cues, restlessness resets, sitting & standing rhythm, and next-day patterns.';
  })();

  const activeCueSummary = [
    settings.stage1Enabled ? `Stage 1 (${settings.stage1DwellSec.toFixed(1)}s)` : null,
    settings.stage2Enabled ? `Stage 2 (${settings.stage2DwellSec.toFixed(1)}s)` : null,
    settings.soundEnabled ? 'Chime on' : 'Visual only',
  ]
    .filter(Boolean)
    .join(' · ');

  // Pick context-matched calming technique (or alternate if user taps "Another idea")
  const baseIdx = Math.max(
    0,
    CALMING_TECHNIQUES.findIndex((t) => t.id === rhythm.recommendedTechniqueId)
  );
  const shownTechnique =
    CALMING_TECHNIQUES[(baseIdx + altTechniqueOffset) % CALMING_TECHNIQUES.length];

  // Sitting vs Standing ambient rhythm calculations (zero notifications)
  const boutMins = Math.floor(rhythm.boutSeconds / 60);
  const targetMins =
    rhythm.postureState === 'sitting' ? settings.sitWindowMinutes : settings.standWindowMinutes;
  const boutPct = Math.min(100, Math.round((boutMins / Math.max(5, targetMins)) * 100));
  const readyToSwitch = boutMins >= Math.max(5, targetMins - 3);

  const totalDeskSec = today.sittingSeconds + today.standingSeconds;
  const standPct =
    totalDeskSec >= 60 ? Math.round((today.standingSeconds / totalDeskSec) * 100) : 0;
  const sitPct = totalDeskSec >= 60 ? 100 - standPct : 0;

  const touchesToday = totalFaceTouches(today.faceTouches);
  const adjustmentsToday = totalReliefMoves(today);

  const restlessnessWord =
    rhythm.restlessnessLevel === 'restless'
      ? 'Restless'
      : rhythm.restlessnessLevel === 'stirring'
        ? 'Stirring'
        : 'Settled';

  return (
    <div className="view-stack">
      {/* Yesterday's Plain-English Summary (appears starting the next day) */}
      {morningStory && (
        <MorningSummaryCard
          story={morningStory}
          userName={name}
          onOpenPatterns={onOpenPatterns}
          onDismiss={onDismissMorningStory}
        />
      )}

      {/* Welcome Back check-in after 5-min walk or stepping away */}
      {welcomeBack && (
        <WelcomeBackCard
          prompt={welcomeBack}
          userName={name}
          onCalmReturn={onWelcomeCalm}
          onRedirectedWhileAway={onWelcomeRedirect}
          onGraceReturn={onWelcomeGrace}
          onDismiss={onWelcomeDismiss}
        />
      )}

      {/* Adaptive False-Alarm Learning Nudge */}
      {recentFalseAlarms >= 2 && (
        <section className="nudge-card" aria-label="Adaptive sensitivity tuning">
          <div className="welcome-header">
            <span className="section-label">Adaptive tuning</span>
            <button
              type="button"
              className="text-link-btn text-link-btn--muted"
              onClick={onDismissFalseAlarmNudge}
            >
              Keep as is
            </button>
          </div>
          <p className="nudge-copy">
            You dismissed {recentFalseAlarms} false alarms recently (like adjusting glasses or a
            quick scratch). Want to soften sensitivity by one small step?
          </p>
          <div className="welcome-actions">
            <button
              type="button"
              id="btn-tune-dwell"
              className="btn btn-subtle btn-sm"
              onClick={onTuneAddDwell}
            >
              Add +0.2s dwell ({(settings.stage1DwellSec + 0.2).toFixed(1)}s)
            </button>
            <button
              type="button"
              id="btn-tune-zone"
              className="btn btn-subtle btn-sm"
              onClick={onTuneTightenZone}
            >
              Tighten zone (−10%)
            </button>
            {!settings.pinchFilterEnabled && (
              <button
                type="button"
                id="btn-tune-pinch"
                className="btn btn-subtle btn-sm"
                onClick={onTuneEnablePinch}
              >
                Enable pinch filter
              </button>
            )}
          </div>
        </section>
      )}

      {/* Hero Stillness Section */}
      <section className="hero-section" aria-label="Session status">
        <TypewriterHeadline text={headline} />
        <p className="hero-subline">{subline}</p>

        <div className="hero-cta-row">
          {!isRunning ? (
            <button
              type="button"
              id="btn-session-toggle"
              className="btn btn-primary btn-lg"
              disabled={isBusy}
              onClick={onStart}
            >
              {status === 'requesting-camera'
                ? 'Requesting camera…'
                : status === 'loading-models'
                  ? 'Loading local models…'
                  : 'Begin session'}
            </button>
          ) : (
            <button
              type="button"
              id="btn-session-toggle"
              className="btn btn-subtle btn-lg"
              onClick={onStop}
            >
              Pause session
            </button>
          )}

          {pipSupported && (
            <button
              type="button"
              id="btn-toggle-pip"
              className={`btn btn-lg ${pipActive ? 'btn-subtle' : 'btn-ghost'}`}
              title="Picture-in-Picture: floats a tiny Still Rhythm card in the corner while you use other tabs or apps"
              onClick={onTogglePiP}
            >
              {pipActive ? 'Close mini-window' : 'Float mini-window'}
            </button>
          )}

          <button
            type="button"
            id="btn-test-cue"
            className="btn btn-ghost btn-lg"
            onClick={onTestStage1}
          >
            Test cue
          </button>
        </div>

        {/* Desk vs. On the go context pill row (handles Logitech desk vs laptop in meetings/bed cleanly) */}
        <div className="context-pill-row">
          <div className="segmented" role="group" aria-label="Where you are working">
            <button
              type="button"
              className={`segmented-btn ${settings.workContext === 'desk' ? 'segmented-btn--active' : ''}`}
              onClick={() => onUpdateSettings({ workContext: 'desk' })}
            >
              At my desk
            </button>
            <button
              type="button"
              className={`segmented-btn ${settings.workContext === 'portable' ? 'segmented-btn--active' : ''}`}
              onClick={() => onUpdateSettings({ workContext: 'portable' })}
            >
              Meeting / Bed
            </button>
          </div>
          <span className="context-hint">
            {settings.workContext === 'desk'
              ? diagnostics.cameraLabel
                ? `Using ${diagnostics.cameraLabel}`
                : 'Sitting & standing guidance active'
              : 'Sitting & standing paused while away from your desk'}
          </span>
        </div>

        {pipSupported && (
          <p className="pip-helper-line">
            <strong>Mini-window</strong> floats a calm card in the corner while you work in other
            tabs
            {autoPipSupported && settings.autoPipOnTabSwitch
              ? ' — and pops out automatically when you switch tabs.'
              : '.'}
          </p>
        )}

        {(errorMessage || pipError) && (
          <p className="inline-error" role="alert">
            {errorMessage || pipError}
          </p>
        )}

        {/* Stage 1 live 5-second auto-catch status bar */}
        {stage1AutoCatch && (
          <div className="autocatch-bar" role="status" aria-live="polite">
            <span className="autocatch-text">
              {stage1AutoCatch.handClearedAt
                ? `Hand lowered — auto-catching redirect in ${stage1AutoCatch.remainingSec}s`
                : name
                  ? `${name}, hand near zone — lower gently to redirect`
                  : 'Hand near zone — lower gently to redirect'}
            </span>
            <button
              type="button"
              className="text-link-btn"
              onClick={onCancelStage1FalseAlarm}
            >
              False alarm
            </button>
          </div>
        )}
      </section>

      {/* Threshold-Triggered Gentle Calming Suggestion (ONLY appears when restlessness crosses threshold) */}
      {isRunning && rhythm.suggestCalming && (
        <section className="calming-suggestion-card" aria-label="Calming suggestion">
          <div className="welcome-header">
            <span className="section-label">Gentle reset suggestion</span>
            <button
              type="button"
              className="text-link-btn text-link-btn--muted"
              onClick={() => {
                setInlinePacerOpen(false);
                onSnoozeCalming();
              }}
            >
              Not now
            </button>
          </div>

          <h2 className="calming-suggestion-title">{shownTechnique.title}</h2>
          <p className="calming-suggestion-copy">
            {altTechniqueOffset === 0 ? rhythm.recommendationReason : shownTechnique.summary}
          </p>
          <p className="calming-safety-line">{shownTechnique.neckSafetyNote}</p>

          {inlinePacerOpen ? (
            <CyclicSighPacer
              compact
              totalCycles={4}
              onComplete={() => {
                setInlinePacerOpen(false);
                onCompleteCalmingReset('cyclic-sigh');
              }}
              onCancel={() => setInlinePacerOpen(false)}
            />
          ) : (
            <div className="welcome-actions">
              {shownTechnique.id === 'cyclic-sigh' ? (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => setInlinePacerOpen(true)}
                >
                  Start 60s guided breath
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => onCompleteCalmingReset(shownTechnique.id)}
                >
                  I did this reset
                </button>
              )}
              <button
                type="button"
                className="btn btn-subtle btn-sm"
                onClick={() => setAltTechniqueOffset((n) => n + 1)}
              >
                Another idea
              </button>
              <button
                type="button"
                className="text-link-btn text-link-btn--muted"
                onClick={onOpenCalmTools}
              >
                All calm tools →
              </button>
            </div>
          )}
        </section>
      )}

      {/* Ambient Sitting & Standing Rhythm (Desk mode only · Zero notifications) */}
      {settings.workContext === 'desk' && settings.sitStandGuidanceEnabled && (
        <section className="rhythm-card" aria-label="Sitting and standing rhythm">
          <div className="rhythm-card-head">
            <div>
              <div className="rhythm-label-row">
                <span className="section-label">Sitting &amp; standing rhythm</span>
                <span className="rhythm-quiet-tag">Quiet guide · No alerts</span>
              </div>
              <p className="rhythm-guidance-line">
                {!isRunning ? (
                  'Begin a session to quietly track your sitting and standing balance.'
                ) : rhythm.postureState === 'sitting' ? (
                  readyToSwitch ? (
                    <>
                      Sitting for <strong className="tabular">{boutMins}m</strong> — good moment
                      to stand up whenever you hit a natural pause.
                    </>
                  ) : (
                    <>
                      Sitting for <strong className="tabular">{boutMins}m</strong> — settled
                      comfortably.
                    </>
                  )
                ) : readyToSwitch ? (
                  <>
                    Standing for <strong className="tabular">{boutMins}m</strong> — nice standing
                    stretch; sit back down whenever you&rsquo;re ready.
                  </>
                ) : (
                  <>
                    Standing for <strong className="tabular">{boutMins}m</strong> — taking steady
                    pressure off your back and neck.
                  </>
                )}
              </p>
            </div>

            <div className="segmented" role="group" aria-label="Current desk position">
              <button
                type="button"
                id="btn-posture-sitting"
                className={`segmented-btn ${rhythm.postureState === 'sitting' ? 'segmented-btn--active' : ''}`}
                onClick={() => onSetPostureManual('sitting')}
              >
                Sitting
              </button>
              <button
                type="button"
                id="btn-posture-standing"
                className={`segmented-btn ${rhythm.postureState === 'standing' ? 'segmented-btn--active' : ''}`}
                onClick={() => onSetPostureManual('standing')}
              >
                Standing
              </button>
            </div>
          </div>

          {isRunning && (
            <div className="rhythm-bout-wrap">
              <div className="rhythm-bout-meta tabular">
                <span>
                  {rhythm.postureState === 'sitting' ? 'Current sitting stretch' : 'Current standing stretch'}
                </span>
                <span>
                  {boutMins}m / {targetMins}m gentle window
                </span>
              </div>
              <div className="rhythm-bar-track">
                <div
                  className={`rhythm-bar-fill ${readyToSwitch ? 'rhythm-bar-fill--warm' : ''}`}
                  style={{ width: `${Math.max(3, boutPct)}%` }}
                />
              </div>
            </div>
          )}

          {/* Daily Sitting vs Standing Balance */}
          <div className="rhythm-daily-split">
            <div className="rhythm-split-meta tabular">
              <span>
                Today at desk:{' '}
                <strong>
                  {totalDeskSec > 0 ? formatShortDuration(totalDeskSec) : '0m'}
                </strong>
              </span>
              <span>
                Standing <strong>{formatShortDuration(today.standingSeconds)}</strong>
                {totalDeskSec >= 60 ? ` (${standPct}%)` : ''} · Sitting{' '}
                <strong>{formatShortDuration(today.sittingSeconds)}</strong>
                {today.postureSwitches > 0 ? ` · ${today.postureSwitches} switches` : ''}
              </span>
            </div>
            <div className="split-bar-track" aria-hidden="true">
              <div className="split-bar-stand" style={{ width: `${standPct}%` }} />
              <div className="split-bar-sit" style={{ width: `${sitPct}%` }} />
            </div>
          </div>
        </section>
      )}

      {/* Editorial Stat Trio (Classic Still) */}
      <section className="metrics-strip" aria-label="Today's stillness summary">
        <div className="metric-item">
          <span className="metric-label">Cumulative calm time</span>
          <span className="metric-value tabular">{formatDuration(today.calmSeconds)}</span>
          <span className="metric-footnote">
            {totalCalmSeconds > today.calmSeconds
              ? `${formatDuration(totalCalmSeconds)} all-time · never resets`
              : 'Accumulates gently · never resets'}
          </span>
        </div>

        <div className="metric-item">
          <span className="metric-label">Urges redirected</span>
          <span className="metric-value tabular">{today.urgesRedirected}</span>
          <span className="metric-footnote">Stage 1 &amp; 2 catches today</span>
        </div>

        <div className="metric-item">
          <span className="metric-label">Grace recoveries</span>
          <span className="metric-value tabular">{today.graceRecoveries}</span>
          <span className="metric-footnote">Noticed &amp; reset without shame</span>
        </div>
      </section>

      {/* Quiet Silent-Tracking Strip (No alerts — purely collated for daily pattern summaries) */}
      <section className="silent-strip" aria-label="Quiet background signals">
        <div className="silent-strip-head">
          <span className="silent-strip-title">Logged quietly in the background</span>
          <span className="silent-strip-note">No alerts · Builds tomorrow&rsquo;s summary</span>
        </div>
        <div className="silent-strip-grid">
          <div className="silent-cell">
            <span className="silent-cell-label">Restlessness</span>
            <span className="silent-cell-val tabular">
              {isRunning ? `${restlessnessWord} (${rhythm.restlessnessScore})` : 'Paused'}
            </span>
          </div>
          <div className="silent-cell">
            <span className="silent-cell-label">Neck &amp; shoulder shifts</span>
            <span className="silent-cell-val tabular">
              {adjustmentsToday}{' '}
              <span className="silent-cell-sub">
                {today.forwardLeanSeconds >= 60
                  ? `· ${formatShortDuration(today.forwardLeanSeconds)} leaning`
                  : 'today'}
              </span>
            </span>
          </div>
          <div className="silent-cell">
            <span className="silent-cell-label">Face touches</span>
            <span className="silent-cell-val tabular">
              {touchesToday}{' '}
              <span className="silent-cell-sub">
                {touchesToday > 0 ? `· ${today.faceTouches.chin} chin` : 'today'}
              </span>
            </span>
          </div>
        </div>
      </section>

      {/* Quiet 1-line summary bar linking to Settings */}
      <div className="cue-summary-bar">
        <span className="cue-summary-text">{activeCueSummary || 'All gentle cues paused'}</span>
        <div className="settings-inline-actions">
          <button
            type="button"
            id="btn-today-preview-pause"
            className="text-link-btn"
            onClick={onTestStage2}
          >
            Preview pause
          </button>
          <span className="meta-dot" aria-hidden="true">
            ·
          </span>
          <button
            type="button"
            id="btn-open-cue-settings"
            className="text-link-btn"
            onClick={onOpenSettings}
          >
            Settings →
          </button>
        </div>
      </div>

      {/* Expandable Camera, Calibration & Silhouette Preview */}
      <CalibrationDrawer
        expanded={calibrationOpen}
        onToggleExpand={onToggleCalibration}
        settings={settings}
        calibration={calibration}
        availableCameras={availableCameras}
        onUpdateSettings={onUpdateSettings}
        onSelectCamera={onSelectCamera}
        onCaptureNeutralPosture={onCaptureNeutralPosture}
        onCapturePostureReference={onCapturePostureReference}
        videoRef={videoRef}
        frameGeometry={frameGeometry}
        dwellSec={dwellSec}
        sessionRunning={isRunning}
        diagnostics={diagnostics}
      />
    </div>
  );
}
