import { useEffect, useState } from 'react';
import { COMPETING_RESPONSES, formatDuration } from '../lib/storage';
import type {
  CalmingTechniqueId,
  CameraAngleWarning,
  EngineStatus,
  FalseAlarmReason,
  MicState,
  PostureChangePrompt,
  PostureState,
  RestlessnessLevel,
  VoiceComfortStatus,
  WorkContext,
} from '../types';
import { CyclicSighPacer } from './CyclicSighPacer';

interface PipWindowContentProps {
  userName?: string;
  status: EngineStatus;
  calmSeconds: number;
  urgesRedirected: number;
  handInZone: boolean;
  stage1Glow: boolean;
  stage2AlertOpen: boolean;
  faceState: 'detected' | 'cached' | 'away';
  sideAngle: boolean;
  cameraState: 'live' | 'muted' | 'ended';
  cameraStalled: boolean;
  detectCount: number;
  handsCount: number;
  fps: number;
  dwellSec: number;
  stage2DwellSec: number;
  pinnedResponses: string[];
  workContext: WorkContext;
  sitStandGuidanceEnabled: boolean;
  micEnabled: boolean;
  postureState: PostureState;
  boutSeconds: number;
  sitWindowMinutes: number;
  standWindowMinutes: number;
  restlessnessLevel: RestlessnessLevel;
  // Voice dBA comfort, Meeting/Speaking, Dual-camera confirm, Camera angle tip
  voiceDb: number;
  voiceLeqDb: number;
  voiceStatus: VoiceComfortStatus;
  micState: MicState;
  voiceComfortMinDb: number;
  voiceComfortMaxDb: number;
  isSpeaking: boolean;
  inMeetingMode: boolean;
  pendingPosturePrompt: PostureChangePrompt | null;
  cameraAngleWarning: CameraAngleWarning | null;
  onAcknowledgeCameraAngle: () => void;
  onTogglePosture: (next: PostureState) => void;
  onConfirmPosturePrompt: (accepted: boolean) => void;
  onToggleMeetingMode: () => void;
  onClearSpeaking: () => void;
  onCompleteCalmingReset: (id: CalmingTechniqueId) => void;
  onStart: () => void;
  onStop: () => void;
  onAutoCatch: (responseId: string) => void;
  onGraceRecovery: () => void;
  onFalseAlarm: () => void;
  onTagFalseAlarm: (reason: FalseAlarmReason) => void;
  onClosePiP: () => void;
}

export function PipWindowContent({
  userName = '',
  status,
  calmSeconds,
  urgesRedirected,
  handInZone,
  stage1Glow,
  stage2AlertOpen,
  faceState,
  cameraState,
  cameraStalled,
  detectCount,
  fps,
  dwellSec,
  stage2DwellSec,
  pinnedResponses,
  workContext,
  sitStandGuidanceEnabled,
  micEnabled,
  postureState,
  boutSeconds,
  sitWindowMinutes,
  standWindowMinutes,
  restlessnessLevel,
  voiceDb,
  voiceLeqDb,
  voiceStatus,
  micState,
  voiceComfortMinDb,
  voiceComfortMaxDb,
  isSpeaking,
  inMeetingMode,
  pendingPosturePrompt,
  cameraAngleWarning,
  onAcknowledgeCameraAngle,
  onTogglePosture,
  onConfirmPosturePrompt,
  onToggleMeetingMode,
  onClearSpeaking,
  onCompleteCalmingReset,
  onStart,
  onStop,
  onAutoCatch,
  onGraceRecovery,
  onFalseAlarm,
  onTagFalseAlarm,
  onClosePiP,
}: PipWindowContentProps) {
  const [pacerOpen, setPacerOpen] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [showFalseTagRow, setShowFalseTagRow] = useState(false);

  useEffect(() => {
    if (!showFalseTagRow) return;
    const t = window.setTimeout(() => setShowFalseTagRow(false), 6500);
    return () => window.clearTimeout(t);
  }, [showFalseTagRow]);

  const isRunning = status === 'running';
  const camBroken = isRunning && (cameraState !== 'live' || cameraStalled);
  const camActivelyDetecting = isRunning && !camBroken && detectCount > 0;
  const isGlowing = !camBroken && (stage2AlertOpen || stage1Glow || handInZone);
  const dwellPct = Math.min(100, Math.round((dwellSec / Math.max(0.5, stage2DwellSec)) * 100));
  const cleanName = userName.trim();

  const topResponse =
    COMPETING_RESPONSES.find((r) => pinnedResponses.includes(r.id)) ?? COMPETING_RESPONSES[0];

  const boutMins = Math.floor(boutSeconds / 60);
  const targetMins = postureState === 'sitting' ? sitWindowMinutes : standWindowMinutes;
  const boutPct = Math.min(100, Math.round((boutMins / Math.max(5, targetMins)) * 100));
  const readyToSwitch = boutMins >= Math.max(5, targetMins - 3);

  // Voice dBA meter positioning (26..88 dBA)
  const DB_MIN = 26;
  const DB_MAX = 88;
  const toDbPct = (db: number) =>
    Math.max(0, Math.min(100, ((db - DB_MIN) / (DB_MAX - DB_MIN)) * 100));
  const liveDbPct = micState === 'active' ? toDbPct(voiceDb) : 0;
  const leqDbPct = micState === 'active' && voiceLeqDb > 0 ? toDbPct(voiceLeqDb) : 0;
  const comfortStartPct = toDbPct(voiceComfortMinDb);
  const comfortWidthPct = Math.max(8, toDbPct(voiceComfortMaxDb) - comfortStartPct);

  const confirmText = !isRunning
    ? 'Paused'
    : camBroken
      ? 'Camera paused'
      : camActivelyDetecting
        ? `Live · ${fps.toFixed(0)} FPS`
        : 'Starting…';

  const statusChip = !isRunning
    ? 'Idle'
    : faceState === 'away'
      ? 'Away'
      : inMeetingMode
        ? 'Meeting'
        : isSpeaking
          ? 'Speaking'
          : restlessnessLevel === 'restless'
            ? 'Restless'
            : restlessnessLevel === 'stirring'
              ? 'Stirring'
              : 'Settled';

  const dwellRatio = Math.min(1, Math.max(0, dwellSec / Math.max(0.5, stage2DwellSec)));
  const pipGlowLevel = camBroken
    ? 0
    : stage2AlertOpen
      ? 1
      : stage1Glow
        ? Math.max(0.48, Math.min(0.88, dwellRatio))
        : handInZone
          ? Math.max(0.14, dwellRatio * 0.72)
          : 0;

  const pipGlowStyle: React.CSSProperties | undefined =
    pipGlowLevel > 0.02
      ? {
          boxShadow: `inset 0 0 ${Math.round(24 + pipGlowLevel * 44)}px ${Math.round(
            6 + pipGlowLevel * 14
          )}px rgba(214, 126, 76, ${(0.14 + pipGlowLevel * 0.34).toFixed(3)})`,
        }
      : undefined;

  // In compact mode, automatically surface the alert headline + dwell bar the moment a hand rises!
  const showHeadlineBlock = !compactMode || isGlowing || camBroken;

  const handlePipFalseAlarm = () => {
    onFalseAlarm();
    setShowFalseTagRow(true);
  };

  const handlePickFalseTag = (reason: FalseAlarmReason) => {
    onTagFalseAlarm(reason);
    setShowFalseTagRow(false);
  };

  return (
    <div
      className={`pip-shell ${compactMode && !stage2AlertOpen && !pacerOpen ? 'pip-shell--compact' : ''} ${
        stage2AlertOpen ? 'pip-shell--alert' : isGlowing ? 'pip-shell--stage1' : ''
      }`}
      style={pipGlowStyle}
    >
      <div className="pip-top-row pip-top-row--slim">
        <div className="pip-brand">
          <span
            className={`pip-orb ${
              camBroken
                ? 'pip-orb--warn'
                : isGlowing
                  ? 'pip-orb--glow'
                  : camActivelyDetecting
                    ? 'pip-orb--live'
                    : ''
            }`}
          />
          <span className="pip-mini-status tabular">
            {confirmText} · <strong>{statusChip}</strong>
          </span>
        </div>
        <div className="pip-top-actions">
          {!stage2AlertOpen && !pacerOpen && (
            <button
              type="button"
              className="text-link-btn text-link-btn--muted pip-tab-btn"
              title={compactMode ? 'Show full mini-window' : 'Switch to compact strip'}
              onClick={() => setCompactMode((c) => !c)}
            >
              {compactMode ? 'Expand' : 'Compact'}
            </button>
          )}
          <button type="button" className="text-link-btn text-link-btn--muted pip-tab-btn" onClick={onClosePiP}>
            Tab ↗
          </button>
        </div>
      </div>

      {stage2AlertOpen ? (
        <div className="pip-alert-body">
          <h2 className="pip-headline">
            {cleanName ? `${cleanName} — hands down.` : 'Hands down · let it pass.'}
          </h2>
          <p className="pip-prompt">{topResponse.instruction}</p>
          <div className="pip-alert-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => onAutoCatch(topResponse.id)}
            >
              Caught it
            </button>
            <button type="button" className="btn btn-subtle btn-sm" onClick={onGraceRecovery}>
              Grace
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={handlePipFalseAlarm}>
              False alarm
            </button>
          </div>
        </div>
      ) : pacerOpen ? (
        <div className="pip-pacer-wrap">
          <CyclicSighPacer
            compact
            totalCycles={5}
            onComplete={() => {
              setPacerOpen(false);
              onCompleteCalmingReset('cyclic-sigh');
            }}
            onCancel={() => setPacerOpen(false)}
          />
        </div>
      ) : (
        <div className="pip-calm-body">
          {/* Proactive Camera Angle Tip inside PiP (tracking & alerts stay active) */}
          {isRunning && cameraAngleWarning && (
            <div className="pip-angle-bar" role="status">
              <span className="pip-angle-text">
                Angle looks off · still watching
              </span>
              <button
                type="button"
                className="btn btn-subtle btn-xs"
                onClick={onAcknowledgeCameraAngle}
              >
                Camera is fine
              </button>
            </div>
          )}

          {/* Optional post-false-alarm 1-tap label strip (auto-vanishes in 6.5s) */}
          {showFalseTagRow && (
            <div className="pip-angle-bar" role="status">
              <span className="pip-angle-text">Was it:</span>
              <div className="pip-confirm-btns">
                <button
                  type="button"
                  className="btn btn-subtle btn-xs"
                  onClick={() => handlePickFalseTag('eye-scratch')}
                >
                  Eye scratch
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => handlePickFalseTag('drinking')}
                >
                  Drink
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs"
                  onClick={() => handlePickFalseTag('ear')}
                >
                  Ear
                </button>
              </div>
            </div>
          )}

          {/* 1. Eyebrow Awareness Headline + Dwell Bar (auto-appears in compact mode when hand rises!) */}
          {showHeadlineBlock && (
            <div>
              <h2 className="pip-headline">
                {camBroken
                  ? 'Detection paused'
                  : isGlowing
                    ? cleanName
                      ? `${cleanName}, hand near zone · ${dwellSec.toFixed(1)}s`
                      : `Hand near zone · ${dwellSec.toFixed(1)}s`
                    : !isRunning
                      ? 'Session paused'
                      : faceState === 'away'
                        ? 'Waiting until you return'
                        : restlessnessLevel === 'restless' && !inMeetingMode && !isSpeaking
                          ? 'A quick sigh could help.'
                          : 'Hands at ease.'}
              </h2>
              <div className="dwell-track" style={{ marginTop: 6 }}>
                <div className="dwell-fill" style={{ width: `${dwellPct}%` }} />
              </div>
            </div>
          )}

          {/* Compact single-line Calm & Redirected summary when collapsed */}
          {compactMode && (
            <div className="pip-compact-stats tabular">
              <span>
                Calm <strong>{formatDuration(calmSeconds)}</strong>
              </span>
              <span className="pip-compact-dot" aria-hidden="true">
                ·
              </span>
              <span>
                Redirected <strong>{urgesRedirected}</strong>
              </span>
            </div>
          )}

          {/* 2. Sitting | Standing Toggle (modular: hides when sit/stand guide is off or Away) */}
          {workContext === 'desk' && sitStandGuidanceEnabled && (
            <div className="pip-posture-strip">
              <div className="pip-posture-head">
                <div className="segmented segmented--mini posture-segmented" role="group" aria-label="Desk position">
                  <button
                    type="button"
                    className={`segmented-btn ${postureState === 'sitting' ? 'segmented-btn--active segmented-btn--sit' : ''}`}
                    onClick={() => onTogglePosture('sitting')}
                  >
                    Sit
                  </button>
                  <button
                    type="button"
                    className={`segmented-btn ${postureState === 'standing' ? 'segmented-btn--active segmented-btn--stand' : ''}`}
                    onClick={() => onTogglePosture('standing')}
                  >
                    Stand
                  </button>
                </div>
                <span className={readyToSwitch ? 'pip-posture-ready tabular' : 'pip-posture-calm tabular'}>
                  {readyToSwitch
                    ? postureState === 'sitting'
                      ? `${boutMins}m · Stand soon`
                      : `${boutMins}m · Sit soon`
                    : `${postureState === 'standing' ? 'Standing' : 'Sitting'} · ${boutMins}m / ${targetMins}m`}
                </span>
              </div>

              {isRunning && pendingPosturePrompt ? (
                <div className="pip-confirm-row">
                  <span>
                    {pendingPosturePrompt.candidate === 'standing' ? 'Stood up?' : 'Sat down?'}
                  </span>
                  <div className="pip-confirm-btns">
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
                      No
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rhythm-bar-track rhythm-bar-track--visible">
                  <div
                    className={`rhythm-bar-fill ${readyToSwitch ? 'rhythm-bar-fill--warm' : ''}`}
                    style={{ width: `${boutMins === 0 ? 0 : Math.max(6, boutPct)}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {/* 3. Live Voice Level (dBA) Comfort Strip (modular: hides when mic is turned off) */}
          {micEnabled && (
            <div className="pip-voice-strip">
              <div className="pip-voice-head">
                <span className="pip-voice-label">Voice</span>
                <span
                  className={`pip-voice-val tabular ${
                    voiceStatus === 'loud'
                      ? 'pip-voice-val--loud'
                      : voiceStatus === 'comfortable'
                        ? 'pip-voice-val--ok'
                        : ''
                  }`}
                >
                  {micState === 'active'
                    ? voiceStatus === 'loud'
                      ? `${voiceDb} dBA · Loud`
                      : `${voiceDb} dBA${voiceLeqDb > 0 ? ` · avg ${voiceLeqDb}` : ''}`
                    : micState === 'denied'
                      ? 'Mic blocked'
                      : 'Mic off'}
                </span>
              </div>
              <div
                className={`voice-meter-track voice-meter-track--compact ${
                  voiceStatus === 'loud' ? 'voice-meter-track--loud' : ''
                }`}
              >
                <div
                  className="voice-comfort-band"
                  style={{ left: `${comfortStartPct}%`, width: `${comfortWidthPct}%` }}
                />
                <div
                  className={`voice-meter-fill ${
                    voiceStatus === 'loud'
                      ? 'voice-meter-fill--loud'
                      : voiceStatus === 'comfortable'
                        ? 'voice-meter-fill--ok'
                        : ''
                  }`}
                  style={{ width: `${liveDbPct}%` }}
                />
                {micState === 'active' && voiceLeqDb > 0 && (
                  <div
                    className="pip-voice-leq-tick"
                    style={{ left: `${leqDbPct}%` }}
                    title={`3-second average: ${voiceLeqDb} dBA`}
                  />
                )}
              </div>
            </div>
          )}

          {!compactMode && (
            <div className="pip-metrics">
              <div>
                <span className="pip-metric-label">Calm</span>
                <span className="pip-metric-val tabular">{formatDuration(calmSeconds)}</span>
              </div>
              <div>
                <span className="pip-metric-label">Redirected</span>
                <span className="pip-metric-val tabular">{urgesRedirected}</span>
              </div>
            </div>
          )}

          {/* 4. Three Quick Action Buttons on ONE Single Row: Pause · Meeting/Speaking · 60s Sigh */}
          <div className="pip-controls pip-controls--triple">
            {isRunning ? (
              <button type="button" className="btn btn-subtle btn-xs pip-action-btn" onClick={onStop}>
                Pause
              </button>
            ) : (
              <button type="button" className="btn btn-primary btn-xs pip-action-btn" onClick={onStart}>
                Begin
              </button>
            )}
            {isRunning && isSpeaking && !inMeetingMode ? (
              <button
                type="button"
                className="btn btn-xs pip-action-btn btn-subtle"
                title="Auto-detected speaking — click if you're not talking"
                onClick={onClearSpeaking}
              >
                Speaking ✕
              </button>
            ) : (
              <button
                type="button"
                className={`btn btn-xs pip-action-btn ${inMeetingMode ? 'btn-subtle' : 'btn-ghost'}`}
                aria-pressed={inMeetingMode}
                onClick={onToggleMeetingMode}
              >
                {inMeetingMode ? 'In meeting' : 'Meeting'}
              </button>
            )}
            <button
              type="button"
              className={`btn btn-xs pip-action-btn ${
                restlessnessLevel === 'restless' && !inMeetingMode && !isSpeaking
                  ? 'btn-primary'
                  : 'btn-ghost'
              }`}
              onClick={() => setPacerOpen(true)}
            >
              60s Sigh
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
