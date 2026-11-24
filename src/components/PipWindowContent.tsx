import { COMPETING_RESPONSES, formatDuration } from '../lib/storage';
import type { EngineStatus, PostureState, RestlessnessLevel, WorkContext } from '../types';

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
  onTogglePosture: (next: PostureState) => void;
  onStart: () => void;
  onStop: () => void;
  onTestCue: () => void;
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
  sideAngle,
  cameraState,
  cameraStalled,
  detectCount,
  handsCount,
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
  onTogglePosture,
  onStart,
  onStop,
  onTestCue,
  onAutoCatch,
  onGraceRecovery,
  onFalseAlarm,
  onClosePiP,
}: PipWindowContentProps) {
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

  const confirmText = !isRunning
    ? 'Camera off · Click Begin session'
    : camBroken
      ? 'Camera paused by browser · Click tab'
      : camActivelyDetecting
        ? `Watching live (${fps.toFixed(1)} FPS)`
        : 'Camera starting…';

  const faceMeta = !isRunning
    ? 'Paused'
    : camBroken
      ? 'Stopped'
      : faceState === 'away'
        ? 'Stepped away'
        : `${sideAngle ? 'Side angle' : 'In view'} · ${handsCount} ${handsCount === 1 ? 'hand' : 'hands'}`;

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
        </div>
        <button type="button" className="text-link-btn text-link-btn--muted" onClick={onClosePiP}>
          Return to tab
        </button>
      </div>

      <div
        className={`pip-cam-banner ${
          camBroken
            ? 'pip-cam-banner--warn'
            : camActivelyDetecting
              ? 'pip-cam-banner--live'
              : ''
        }`}
      >
        <span className="pip-cam-line tabular">{confirmText}</span>
        <span className="pip-cam-sub">{faceMeta}</span>
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
      ) : (
        <div className="pip-calm-body">
          <h2 className="pip-headline">
            {camBroken
              ? 'Detection paused'
              : isGlowing
                ? cleanName
                  ? `${cleanName}, hand near zone · ${dwellSec.toFixed(1)}s`
                  : `Hand near zone · ${dwellSec.toFixed(1)}s`
                : !isRunning
                  ? 'Paused'
                  : faceState === 'away'
                    ? 'Waiting until you return'
                    : restlessnessLevel === 'restless'
                      ? 'Restless · try a slow sigh'
                      : 'Hands at ease.'}
          </h2>

          <div className="dwell-track">
            <div className="dwell-fill" style={{ width: `${dwellPct}%` }} />
          </div>

          {/* Ambient Sitting / Standing Rhythm Strip inside Mini-Window (Zero Notifications) */}
          {workContext === 'desk' && isRunning && (
            <div className="pip-posture-strip">
              <div className="pip-posture-head">
                <button
                  type="button"
                  className="text-link-btn"
                  onClick={() =>
                    onTogglePosture(postureState === 'sitting' ? 'standing' : 'sitting')
                  }
                  title="Switch between Sitting and Standing"
                >
                  {postureState === 'sitting' ? 'Sitting' : 'Standing'} · {boutMins}m
                </button>
                <span className={readyToSwitch ? 'pip-posture-ready' : 'pip-posture-calm'}>
                  {readyToSwitch
                    ? postureState === 'sitting'
                      ? 'Good time to stand'
                      : 'Ready to sit'
                    : restlessnessLevel === 'settled'
                      ? 'Settled'
                      : restlessnessLevel === 'stirring'
                        ? 'Stirring'
                        : 'Restless'}
                </span>
              </div>
              <div className="rhythm-bar-track">
                <div
                  className={`rhythm-bar-fill ${readyToSwitch ? 'rhythm-bar-fill--warm' : ''}`}
                  style={{ width: `${Math.max(4, boutPct)}%` }}
                />
              </div>
            </div>
          )}

          <div className="pip-metrics">
            <div>
              <span className="pip-metric-label">Calm today</span>
              <span className="pip-metric-val tabular">{formatDuration(calmSeconds)}</span>
            </div>
            <div>
              <span className="pip-metric-label">Redirected</span>
              <span className="pip-metric-val tabular">{urgesRedirected}</span>
            </div>
          </div>

          <div className="pip-controls">
            {isRunning ? (
              <button type="button" className="btn btn-subtle btn-sm" onClick={onStop}>
                Pause
              </button>
            ) : (
              <button type="button" className="btn btn-primary btn-sm" onClick={onStart}>
                Begin session
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={onTestCue}>
              Test chime
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
