import { useState } from 'react';
import { COMPETING_RESPONSES, formatDuration } from '../lib/storage';
import type {
  CalmingTechniqueId,
  EngineStatus,
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
  postureState: PostureState;
  boutSeconds: number;
  sitWindowMinutes: number;
  standWindowMinutes: number;
  restlessnessLevel: RestlessnessLevel;
  // New: Voice dB comfort, Meeting/Speaking, Dual-camera confirm, and inline 60s sigh
  voiceDb: number;
  voiceStatus: VoiceComfortStatus;
  micState: MicState;
  voiceComfortMinDb: number;
  voiceComfortMaxDb: number;
  isSpeaking: boolean;
  inMeetingMode: boolean;
  pendingPosturePrompt: PostureChangePrompt | null;
  onTogglePosture: (next: PostureState) => void;
  onConfirmPosturePrompt: (accepted: boolean) => void;
  onToggleMeetingMode: () => void;
  onCompleteCalmingReset: (id: CalmingTechniqueId) => void;
  onStart: () => void;
  onStop: () => void;
  onAutoCatch: (responseId: string) => void;
  onGraceRecovery: () => void;
  onFalseAlarm: () => void;
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
  postureState,
  boutSeconds,
  sitWindowMinutes,
  standWindowMinutes,
  restlessnessLevel,
  voiceDb,
  voiceStatus,
  micState,
  voiceComfortMinDb,
  voiceComfortMaxDb,
  isSpeaking,
  inMeetingMode,
  pendingPosturePrompt,
  onTogglePosture,
  onConfirmPosturePrompt,
  onToggleMeetingMode,
  onCompleteCalmingReset,
  onStart,
  onStop,
  onAutoCatch,
  onGraceRecovery,
  onFalseAlarm,
  onClosePiP,
}: PipWindowContentProps) {
  const [pacerOpen, setPacerOpen] = useState(false);

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

  // Voice meter positioning (32..86 dB)
  const DB_MIN = 32;
  const DB_MAX = 86;
  const toDbPct = (db: number) =>
    Math.max(0, Math.min(100, ((db - DB_MIN) / (DB_MAX - DB_MIN)) * 100));
  const liveDbPct = micState === 'active' ? toDbPct(voiceDb) : 0;
  const comfortStartPct = toDbPct(voiceComfortMinDb);
  const comfortWidthPct = Math.max(8, toDbPct(voiceComfortMaxDb) - comfortStartPct);

  const confirmText = !isRunning
    ? 'Paused'
    : camBroken
      ? 'Camera paused · click tab'
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

  return (
    <div
      className={`pip-shell ${
        stage2AlertOpen ? 'pip-shell--alert' : isGlowing ? 'pip-shell--stage1' : ''
      }`}
    >
      <div className="pip-top-row">
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
          <span className="pip-title">Still Rhythm</span>
          <span className="pip-mini-status tabular">
            {confirmText} · {statusChip}
          </span>
        </div>
        <button type="button" className="text-link-btn text-link-btn--muted" onClick={onClosePiP}>
          Tab
        </button>
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
            <button type="button" className="btn btn-ghost btn-sm" onClick={onFalseAlarm}>
              False alarm
            </button>
          </div>
        </div>
      ) : pacerOpen ? (
        <div className="pip-pacer-wrap">
          <CyclicSighPacer
            compact
            totalCycles={4}
            onComplete={() => {
              setPacerOpen(false);
              onCompleteCalmingReset('cyclic-sigh');
            }}
            onCancel={() => setPacerOpen(false)}
          />
        </div>
      ) : (
        <div className="pip-calm-body">
          {/* 1. Eyebrow Awareness Headline + Live Dwell Bar */}
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

          {/* 2. Explicit Sitting | Standing Toggle Button + Stretch Bar */}
          {workContext === 'desk' && (
            <div className="pip-posture-strip">
              <div className="pip-posture-head">
                <div className="segmented segmented--mini" role="group" aria-label="Desk position">
                  <button
                    type="button"
                    className={`segmented-btn ${postureState === 'sitting' ? 'segmented-btn--active' : ''}`}
                    onClick={() => onTogglePosture('sitting')}
                  >
                    Sit
                  </button>
                  <button
                    type="button"
                    className={`segmented-btn ${postureState === 'standing' ? 'segmented-btn--active' : ''}`}
                    onClick={() => onTogglePosture('standing')}
                  >
                    Stand
                  </button>
                </div>
                <span className={readyToSwitch ? 'pip-posture-ready tabular' : 'pip-posture-calm tabular'}>
                  {readyToSwitch
                    ? postureState === 'sitting'
                      ? `${boutMins}m · Rise soon`
                      : `${boutMins}m · Sit soon`
                    : `${boutMins}m / ${targetMins}m`}
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
                <div className="rhythm-bar-track">
                  <div
                    className={`rhythm-bar-fill ${readyToSwitch ? 'rhythm-bar-fill--warm' : ''}`}
                    style={{ width: `${Math.max(4, boutPct)}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {/* 3. Live Voice Level (dB) Comfort Strip */}
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
                    ? `${voiceDb} dB · Loud`
                    : `${voiceDb} dB`
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
            </div>
          </div>

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

          {/* 4. Three Quick Action Buttons: Pause · Meeting · 60s Sigh */}
          <div className="pip-controls">
            {isRunning ? (
              <button type="button" className="btn btn-subtle btn-sm" onClick={onStop}>
                Pause
              </button>
            ) : (
              <button type="button" className="btn btn-primary btn-sm" onClick={onStart}>
                Begin
              </button>
            )}
            <button
              type="button"
              className={`btn btn-sm ${inMeetingMode ? 'btn-subtle' : 'btn-ghost'}`}
              aria-pressed={inMeetingMode}
              onClick={onToggleMeetingMode}
            >
              {inMeetingMode ? 'In meeting' : isSpeaking ? 'Speaking' : 'Meeting'}
            </button>
            <button
              type="button"
              className={`btn btn-sm ${
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
