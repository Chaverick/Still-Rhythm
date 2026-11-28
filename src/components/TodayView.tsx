import { useState } from 'react';
import type { DailyStoryReport } from '../lib/patterns';
import type { VoiceCalibrationProgress } from '../lib/voiceMonitor';
import {
  CALMING_TECHNIQUES,
  formatCameraLabel,
  formatDuration,
  formatShortDuration,
  totalFaceTouches,
  totalReliefMoves,
} from '../lib/storage';
import type {
  CalmingTechniqueId,
  CameraAngleWarning,
  CameraDeviceOption,
  DaySummary,
  EngineStatus,
  FrameGeometry,
  LiveRhythmState,
  PiPKind,
  PostureState,
  Stage1AutoCatch,
  StillSettings,
  VisionDiagnostics,
} from '../types';
import { CyclicSighPacer } from './CyclicSighPacer';
import { MorningSummaryCard } from './MorningSummaryCard';
import { TypewriterHeadline } from './TypewriterHeadline';
import { VoiceWaveMeter } from './VoiceWaveMeter';

interface TodayViewProps {
  status: EngineStatus;
  errorMessage: string | null;
  today: DaySummary;
  totalCalmSeconds: number;
  settings: StillSettings;
  rhythm: LiveRhythmState;
  inMeetingMode: boolean;
  cameraOn: boolean;
  micOn: boolean;
  availableCameras: CameraDeviceOption[];
  voiceCalibrating: boolean;
  voiceCalProgress: VoiceCalibrationProgress;
  cameraAngleWarning: CameraAngleWarning | null;
  morningStory: DailyStoryReport | null;
  onDismissMorningStory: () => void;
  onOpenPatterns: () => void;
  onOpenCalmTools: () => void;
  onOpenCameraSetup: () => void;
  onOpenVoiceSettings: () => void;
  onUpdateSettings: (patch: Partial<StillSettings>) => void;
  onToggleCamera: () => void;
  onToggleMic: () => void;
  onToggleMeetingMode: () => void;
  onClearSpeaking: () => void;
  onSetPostureManual: (next: PostureState) => void;
  onConfirmPosturePrompt: (accepted: boolean) => void;
  onAcknowledgeCameraAngle: () => void;
  onCalibrateVoice: () => void;
  onSnoozeCalming: () => void;
  onCompleteCalmingReset: (techniqueId: CalmingTechniqueId) => void;
  onStart: () => void;
  onStop: () => void;
  pipSupported: boolean;
  autoPipSupported: boolean;
  autoPipPermission: 'granted' | 'prompt' | 'denied' | 'unknown';
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
  frameGeometry: FrameGeometry | null;
  diagnostics: VisionDiagnostics;
}

export function TodayView({
  status,
  errorMessage,
  today,
  totalCalmSeconds,
  settings,
  rhythm,
  inMeetingMode,
  cameraOn,
  micOn,
  availableCameras,
  voiceCalibrating,
  voiceCalProgress,
  cameraAngleWarning,
  morningStory,
  onDismissMorningStory,
  onOpenPatterns,
  onOpenCalmTools,
  onOpenCameraSetup,
  onOpenVoiceSettings,
  onUpdateSettings,
  onToggleCamera,
  onToggleMic,
  onToggleMeetingMode,
  onClearSpeaking,
  onSetPostureManual,
  onConfirmPosturePrompt,
  onAcknowledgeCameraAngle,
  onCalibrateVoice,
  onSnoozeCalming,
  onCompleteCalmingReset,
  onStart,
  onStop,
  pipSupported,
  autoPipPermission,
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
  frameGeometry,
  diagnostics,
}: TodayViewProps) {
  const [inlinePacerOpen, setInlinePacerOpen] = useState(false);
  const [altTechniqueOffset, setAltTechniqueOffset] = useState(0);

  const isRunning = status === 'running';
  const isBusy =
    status === 'requesting-camera' ||
    status === 'loading-models' ||
    status === 'choosing-camera';
  const pipActive = pipKind !== 'none';
  const name = settings.userName.trim();
  const shortCameraName = formatCameraLabel(
    diagnostics.cameraLabel ||
      availableCameras.find((c) => c.deviceId === settings.selectedCameraId)?.label ||
      availableCameras[0]?.label
  );

  const headline = (() => {
    if (status === 'requesting-camera') return 'Opening your camera & mic.';
    if (status === 'loading-models') return 'Preparing on-device awareness.';
    if (status === 'choosing-camera') return 'Finding the camera in front of you.';
    if (status === 'running') {
      if (!cameraOn && micOn) return 'Mic active · camera off.';
      if (frameGeometry?.handInZone) {
        return name
          ? `${name}, noticing a hand near your brow.`
          : 'Noticing a hand in your watched zone.';
      }
      if (diagnostics.faceState === 'away') return 'Waiting quietly until you return.';
      if (inMeetingMode) return 'In a meeting. Hands watched gently.';
      if (rhythm.isSpeaking) return 'Speaking · restlessness paused.';
      if (rhythm.suggestCalming) {
        return name
          ? `${name}, you seem a little restless.`
          : 'Noticing a bit of restlessness.';
      }
      return 'You are here. Hands at ease.';
    }
    if (today.calmSeconds > 0) return 'Stillness builds quietly.';
    return 'A quiet companion for your day.';
  })();

  const subline = (() => {
    if (status === 'requesting-camera') {
      return '100% on-device in this tab — nothing is recorded or sent.';
    }
    if (status === 'loading-models') {
      return 'Loading local face, hand, and posture models from cache.';
    }
    if (status === 'choosing-camera') {
      return 'Checking connected cameras to pick the straight-on view.';
    }
    if (status === 'running') {
      if (pipActive) {
        return 'Floating in your mini-window. Work in other tabs or apps freely.';
      }
      return '';
    }
    return 'Begin switches your camera and mic on together, or toggle either below.';
  })();

  // Sit vs. Stand stretch progress
  const boutMins = Math.floor(rhythm.boutSeconds / 60);
  const targetMins =
    rhythm.postureState === 'sitting' ? settings.sitWindowMinutes : settings.standWindowMinutes;
  const boutPct = Math.min(100, Math.round((boutMins / Math.max(5, targetMins)) * 100));
  const readyToSwitch = isRunning && boutMins >= Math.max(5, targetMins - 3);

  const totalDeskSec = today.sittingSeconds + today.standingSeconds;
  const standPct = totalDeskSec > 0 ? Math.round((today.standingSeconds / totalDeskSec) * 100) : 0;
  const sitPct = totalDeskSec > 0 ? 100 - standPct : 100;

  // Calming recommendation matching
  const baseIdx = Math.max(
    0,
    CALMING_TECHNIQUES.findIndex((t) => t.id === rhythm.recommendedTechniqueId)
  );
  const shownTechnique =
    CALMING_TECHNIQUES[(baseIdx + altTechniqueOffset) % CALMING_TECHNIQUES.length];

  const touchesToday = totalFaceTouches(today.faceTouches);
  const adjustmentsToday = totalReliefMoves(today);

  const restlessnessLabel = !isRunning
    ? 'Paused'
    : inMeetingMode
      ? 'Meeting · paused'
      : rhythm.isSpeaking
        ? 'Speaking · paused'
        : rhythm.restlessnessLevel === 'restless'
          ? `Restless (${rhythm.restlessnessScore})`
          : rhythm.restlessnessLevel === 'stirring'
            ? `Stirring (${rhythm.restlessnessScore})`
            : `Settled (${rhythm.restlessnessScore})`;

  return (
    <div className="view-stack">
      {/* Contextual: Morning Summary Card (only shows starting the next day until dismissed) */}
      {morningStory && (
        <MorningSummaryCard
          story={morningStory}
          userName={name}
          onOpenPatterns={onOpenPatterns}
          onDismiss={onDismissMorningStory}
        />
      )}

      {/* Contextual: Non-blocking Camera-Angle Tip (tracking & brow alerts keep running normally) */}
      {isRunning && cameraAngleWarning && (
        <section className="nudge-card" role="status" aria-live="polite" aria-label="Camera angle tip">
          <div className="welcome-header">
            <span className="section-label">Camera angle tip · still watching</span>
          </div>
          <p className="nudge-copy">
            <strong>{cameraAngleWarning.label}</strong> — tracking and alerts are still active,
            though a steep angle can occasionally cause false alarms. Adjust if needed, or save this
            as your normal desk view.
          </p>
          <div className="welcome-actions">
            <button
              type="button"
              id="btn-ack-camera-angle"
              className="btn btn-subtle btn-sm"
              onClick={onAcknowledgeCameraAngle}
            >
              My camera is fine
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onOpenCameraSetup}
            >
              Switch camera
            </button>
          </div>
        </section>
      )}

      {/* Contextual: Adaptive False-Alarm Nudge */}
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
            You dismissed {recentFalseAlarms} false alarms recently. Want to soften sensitivity by
            one small step?
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

      {/* =====================================================================
          LAYER 1: Quiet Hero (generous whitespace, just 2 primary buttons)
          ===================================================================== */}
      <section className="hero-section" aria-label="Session status">
        <TypewriterHeadline text={headline} />
        {subline && <p className="hero-subline">{subline}</p>}

        <div className="hero-toolbar">
          {!isRunning ? (
            <button
              type="button"
              id="btn-session-toggle"
              className="btn btn-primary btn-sm"
              disabled={isBusy}
              onClick={onStart}
            >
              {status === 'requesting-camera'
                ? 'Starting…'
                : status === 'loading-models'
                  ? 'Loading…'
                  : status === 'choosing-camera'
                    ? 'Finding camera…'
                    : 'Begin session'}
            </button>
          ) : (
            <button
              type="button"
              id="btn-session-toggle"
              className="btn btn-subtle btn-sm"
              onClick={onStop}
            >
              Pause
            </button>
          )}

          {pipSupported && (
            <button
              type="button"
              id="btn-toggle-pip"
              className={`btn btn-sm ${pipActive ? 'btn-subtle' : 'btn-ghost'}`}
              title="Floats a tiny Still Rhythm card in the corner over other tabs and Mac apps"
              onClick={onTogglePiP}
            >
              {pipActive ? 'Close mini' : 'Mini-window'}
            </button>
          )}

          <span className="hero-toolbar-sep" aria-hidden="true" />

          <div className="segmented segmented--compact" role="group" aria-label="Where you are working">
            <button
              type="button"
              className={`segmented-btn ${settings.workContext === 'desk' ? 'segmented-btn--active' : ''}`}
              onClick={() => onUpdateSettings({ workContext: 'desk' })}
            >
              At desk
            </button>
            <button
              type="button"
              className={`segmented-btn ${settings.workContext === 'portable' ? 'segmented-btn--active' : ''}`}
              onClick={() => onUpdateSettings({ workContext: 'portable' })}
            >
              Away
            </button>
          </div>

          {isRunning && rhythm.isSpeaking && !inMeetingMode ? (
            <button
              type="button"
              id="btn-clear-speaking"
              className="meeting-pill meeting-pill--compact meeting-pill--speaking"
              title="Auto-detected speaking — click if you're not talking to clear for 20s"
              onClick={onClearSpeaking}
            >
              <span className="meeting-pill-dot" aria-hidden="true" />
              Speaking · ✕
            </button>
          ) : (
            <button
              type="button"
              id="btn-meeting-toggle"
              className={`meeting-pill meeting-pill--compact ${
                inMeetingMode ? 'meeting-pill--active' : ''
              }`}
              aria-pressed={inMeetingMode}
              title="Pauses restlessness during listen-only meetings (talking is also detected automatically)"
              onClick={onToggleMeetingMode}
            >
              <span className="meeting-pill-dot" aria-hidden="true" />
              {inMeetingMode ? 'In meeting' : 'Meeting'}
            </button>
          )}
        </div>

        {/* Clean Camera & Mic on/off switches (both switch on automatically when you start) */}
        <div className="sensor-switch-row" role="group" aria-label="Camera and microphone switches">
          <button
            type="button"
            id="btn-switch-camera"
            role="switch"
            aria-checked={cameraOn}
            disabled={isBusy}
            className={`sensor-toggle-pill ${cameraOn ? 'sensor-toggle-pill--on' : ''}`}
            title={cameraOn ? `Turn ${shortCameraName} off` : `Turn ${shortCameraName} on`}
            onClick={onToggleCamera}
          >
            <span>{shortCameraName}</span>
            <span className="sensor-mini-switch" aria-hidden="true">
              <span className="sensor-mini-thumb" />
            </span>
          </button>

          <button
            type="button"
            id="btn-switch-mic"
            role="switch"
            aria-checked={micOn}
            disabled={isBusy}
            className={`sensor-toggle-pill ${micOn ? 'sensor-toggle-pill--on' : ''}`}
            title={micOn ? 'Turn mic off' : 'Turn mic on'}
            onClick={onToggleMic}
          >
            <span>Mic</span>
            <span className="sensor-mini-switch" aria-hidden="true">
              <span className="sensor-mini-thumb" />
            </span>
          </button>

          {cameraOn && rhythm.dualCameraActive && (
            <span className="rhythm-quiet-tag">2 cams</span>
          )}
        </div>

        {/* Only show Auto-PiP tip when Chrome has explicitly blocked it */}
        {pipSupported && autoPipPermission === 'denied' && (
          <p className="pip-helper-line">
            <strong>Auto-float is blocked in Chrome</strong> — click the site icon left of the
            address bar to allow Automatic picture-in-picture, or use{' '}
            <strong>Mini-window</strong> above.
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

      {/* Contextual: Threshold-Triggered Calming Suggestion */}
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

      {/* =====================================================================
          TOP-LINE SUMMARY: Calm today · Urges redirected · Grace recoveries
          ===================================================================== */}
      <section className="metrics-strip metrics-strip--top" aria-label="Today's stillness summary">
        <div className="metric-item">
          <span className="metric-label">Calm today</span>
          <span className="metric-value tabular">{formatDuration(today.calmSeconds)}</span>
          <span className="metric-footnote">
            {totalCalmSeconds > today.calmSeconds
              ? `${formatDuration(totalCalmSeconds)} all-time`
              : 'Accumulates gently'}
          </span>
        </div>

        <div className="metric-item">
          <span className="metric-label">Urges redirected</span>
          <span className="metric-value tabular">{today.urgesRedirected}</span>
          <span className="metric-footnote">Eyebrow catches today</span>
        </div>

        <div className="metric-item">
          <span className="metric-label">Grace recoveries</span>
          <span className="metric-value tabular">{today.graceRecoveries}</span>
          <span className="metric-footnote">Reset without shame</span>
        </div>
      </section>

      {/* =====================================================================
          UNIFIED LIVE RHYTHM CARD
          (Desk Position + Voice Comfort dB + Quiet Background Signals)
          ===================================================================== */}
      <section className="unified-rhythm-card" aria-label="Live daily rhythm">
        {/* Band 1: Desk Sitting vs. Standing (Desk mode only) */}
        {settings.workContext === 'desk' && settings.sitStandGuidanceEnabled && (
          <div className="rhythm-band">
            <div className="rhythm-band-head">
              <div className="rhythm-band-title-col">
                <div className="rhythm-label-row">
                  <span className="section-label">Desk rhythm</span>
                  {rhythm.dualCameraActive && (
                    <span className="rhythm-quiet-tag">2 cameras</span>
                  )}
                </div>
                <p className="rhythm-band-sub">
                  {!isRunning ? (
                    <>
                      Currently <strong>{rhythm.postureState === 'standing' ? 'Standing' : 'Sitting'}</strong> · quiet sit &amp; stand balance.
                    </>
                  ) : rhythm.postureState === 'sitting' ? (
                    readyToSwitch ? (
                      <>
                        Sitting <strong className="tabular">{boutMins}m</strong> — good moment to
                        stand at a natural pause.
                      </>
                    ) : (
                      <>
                        Sitting <strong className="tabular">{boutMins}m</strong> of {targetMins}m
                        gentle window.
                      </>
                    )
                  ) : readyToSwitch ? (
                    <>
                      Standing <strong className="tabular">{boutMins}m</strong> — nice stretch; sit
                      whenever you&rsquo;re ready.
                    </>
                  ) : (
                    <>
                      Standing <strong className="tabular">{boutMins}m</strong> of {targetMins}m
                      gentle window.
                    </>
                  )}
                </p>
              </div>

              <div className="segmented posture-segmented" role="group" aria-label="Current desk position">
                <button
                  type="button"
                  id="btn-posture-sitting"
                  className={`segmented-btn ${rhythm.postureState === 'sitting' ? 'segmented-btn--active segmented-btn--sit' : ''}`}
                  onClick={() => onSetPostureManual('sitting')}
                >
                  Sitting
                </button>
                <button
                  type="button"
                  id="btn-posture-standing"
                  className={`segmented-btn ${rhythm.postureState === 'standing' ? 'segmented-btn--active segmented-btn--stand' : ''}`}
                  onClick={() => onSetPostureManual('standing')}
                >
                  Standing
                </button>
              </div>
            </div>

            {/* Rare, gentle dual-camera posture change confirmation bar */}
            {isRunning && rhythm.pendingPosturePrompt && (
              <div className="posture-confirm-bar" role="status" aria-live="polite">
                <span className="posture-confirm-text">
                  Looks like you{' '}
                  <strong>
                    {rhythm.pendingPosturePrompt.candidate === 'standing'
                      ? 'stood up'
                      : 'sat down'}
                  </strong>{' '}
                  — switch to{' '}
                  {rhythm.pendingPosturePrompt.candidate === 'standing' ? 'Standing' : 'Sitting'}?
                </span>
                <div className="posture-confirm-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-xs"
                    onClick={() => onConfirmPosturePrompt(true)}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-xs"
                    onClick={() => onConfirmPosturePrompt(false)}
                  >
                    Still {rhythm.postureState}
                  </button>
                </div>
              </div>
            )}

            {isRunning && (
              <div className="rhythm-bar-track">
                <div
                  className={`rhythm-bar-fill ${readyToSwitch ? 'rhythm-bar-fill--warm' : ''}`}
                  style={{ width: `${Math.max(4, boutPct)}%` }}
                />
              </div>
            )}

            <div className="rhythm-split-meta tabular">
              <span>
                Stand <strong>{formatShortDuration(today.standingSeconds)}</strong>
                {totalDeskSec >= 60 ? ` (${standPct}%)` : ''} · Sit{' '}
                <strong>{formatShortDuration(today.sittingSeconds)}</strong>
              </span>
              <div className="split-bar-track split-bar-track--inline" aria-hidden="true">
                <div className="split-bar-stand" style={{ width: `${standPct}%` }} />
                <div className="split-bar-sit" style={{ width: `${sitPct}%` }} />
              </div>
            </div>
          </div>
        )}

        {/* Band 2: Live IEC dBA Voice Loudness Wave (modular: hides when mic is turned off) */}
        {settings.micEnabled && (
        <div className="rhythm-band">
          <div className="rhythm-band-head">
            <div className="rhythm-band-title-col">
              <div className="rhythm-label-row">
                <span className="section-label">Voice level</span>
                <span
                  className={`voice-status-tag tabular ${
                    rhythm.voiceStatus === 'loud'
                      ? 'voice-status-tag--loud'
                      : rhythm.voiceStatus === 'comfortable'
                        ? 'voice-status-tag--ok'
                        : ''
                  }`}
                >
                  {!isRunning
                    ? 'Starts with session'
                    : rhythm.micState === 'denied'
                      ? 'Mic blocked'
                      : rhythm.micState !== 'active'
                        ? 'Mic off'
                        : rhythm.voiceStatus === 'loud'
                          ? `${rhythm.voiceDb} dBA · A bit loud`
                          : rhythm.voiceStatus === 'comfortable'
                            ? `${rhythm.voiceDb} dBA · Comfortable`
                            : `${rhythm.voiceDb} dBA · Quiet`}
                </span>
                {isRunning && rhythm.micState === 'active' && rhythm.voiceLeqDb > 0 && (
                  <span
                    className="voice-leq-chip tabular"
                    title="3-second equivalent continuous energy average (LAeq) — ignores brief clicks"
                  >
                    3s avg {rhythm.voiceLeqDb}
                  </span>
                )}
              </div>
            </div>

            <div className="voice-head-actions">
              {isRunning && rhythm.micState === 'active' && (
                <div
                  className="voice-trim-group"
                  role="group"
                  aria-label="Manual decibel calibration trim"
                  title="Nudge calibration offset up or down to match a reference sound meter"
                >
                  <button
                    type="button"
                    className="voice-trim-btn"
                    aria-label="Decrease calibration by 1 dB"
                    onClick={() =>
                      onUpdateSettings({
                        voiceCalOffsetDb: Math.max(-25, settings.voiceCalOffsetDb - 1),
                      })
                    }
                  >
                    −
                  </button>
                  <span className="voice-trim-val tabular">
                    {settings.voiceCalOffsetDb > 0
                      ? `+${settings.voiceCalOffsetDb}`
                      : settings.voiceCalOffsetDb}
                  </span>
                  <button
                    type="button"
                    className="voice-trim-btn"
                    aria-label="Increase calibration by 1 dB"
                    onClick={() =>
                      onUpdateSettings({
                        voiceCalOffsetDb: Math.min(25, settings.voiceCalOffsetDb + 1),
                      })
                    }
                  >
                    +
                  </button>
                </div>
              )}
              {isRunning && rhythm.micState === 'active' ? (
                <button
                  type="button"
                  className="text-link-btn"
                  disabled={voiceCalibrating}
                  title="Talk normally for 3 seconds to center the green zone on your natural voice (does not change Mac mic volume)"
                  onClick={onCalibrateVoice}
                >
                  {voiceCalibrating
                    ? `Listening (${voiceCalProgress.remainingSec || 3}s)…`
                    : 'Set my voice'}
                </button>
              ) : (
                <button
                  type="button"
                  className="text-link-btn"
                  onClick={onOpenVoiceSettings}
                >
                  Voice settings
                </button>
              )}
            </div>
          </div>

          {voiceCalibrating && (
            <div className="voice-cal-banner" role="status" aria-live="polite">
              <span>
                Speak normally for <strong>{voiceCalProgress.remainingSec || 3}s</strong> — centering
                green zone on your voice
              </span>
              <span className="voice-cal-badge">
                {voiceCalProgress.hearingVoice ? 'Hearing you ✓' : 'Listening…'}
              </span>
            </div>
          )}

          <VoiceWaveMeter
            active={isRunning && rhythm.micState === 'active'}
            historyDb={rhythm.voiceHistoryDb}
            liveDb={rhythm.voiceDb}
            leqDb={rhythm.voiceLeqDb}
            noiseFloorDb={rhythm.voiceNoiseFloorDb}
            comfortMinDb={settings.voiceComfortMinDb}
            comfortMaxDb={settings.voiceComfortMaxDb}
            status={rhythm.voiceStatus}
          />
          <div className="voice-scale-row tabular">
            <span>Quiet · room {isRunning && rhythm.micState === 'active' ? `${rhythm.voiceNoiseFloorDb} dBA` : 'baseline'}</span>
            <span>
              Comfort ({settings.voiceComfortMinDb}–{settings.voiceComfortMaxDb} dBA)
            </span>
            <span>IEC dBA · 125ms</span>
          </div>
        </div>
        )}

        {/* Band 3: Quiet Background Signals (one clean 3-column row, zero alerts) */}
        <div className="rhythm-band rhythm-band--quiet">
          <div className="silent-strip-grid">
            <div className="silent-cell">
              <span className="silent-cell-label">Restlessness</span>
              <span className="silent-cell-val tabular">{restlessnessLabel}</span>
            </div>
            <div className="silent-cell">
              <span className="silent-cell-label">Neck &amp; shoulder shifts</span>
              <span className="silent-cell-val tabular">
                {adjustmentsToday}{' '}
                <span className="silent-cell-sub">
                  {today.forwardLeanSeconds >= 60
                    ? `· ${formatShortDuration(today.forwardLeanSeconds)} lean`
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
        </div>
      </section>

      <div className="today-quiet-foot">
        <span className="today-quiet-note">
          100% on-device · Zero video or audio saved
        </span>
        <button
          type="button"
          id="btn-open-camera-setup"
          className="text-link-btn"
          onClick={onOpenCameraSetup}
        >
          Camera &amp; zone preview →
        </button>
      </div>
    </div>
  );
}
