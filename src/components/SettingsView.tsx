import { useRef, useState } from 'react';
import {
  clearPoseSamples,
  clearTelemetry,
  formatShortDuration,
  formatTelemetryLog,
  getPoseSampleStats,
  loadTelemetry,
  type LegacyStillSummary,
} from '../lib/storage';
import type { VoiceCalibrationProgress } from '../lib/voiceMonitor';
import type {
  CameraDeviceOption,
  FrameGeometry,
  LiveRhythmState,
  PostureCalibration,
  PostureState,
  SettingsSectionId,
  StillSettings,
  ThemeMode,
  VisionDiagnostics,
} from '../types';
import { CalibrationDrawer } from './CalibrationDrawer';

interface SettingsViewProps {
  activeSection: SettingsSectionId;
  onChangeSection: (section: SettingsSectionId) => void;
  settings: StillSettings;
  calibration: PostureCalibration;
  rhythm: LiveRhythmState;
  theme: ThemeMode;
  autoPipSupported: boolean;
  autoPipPermission: 'granted' | 'prompt' | 'denied' | 'unknown';
  availableCameras: CameraDeviceOption[];
  legacyStill: LegacyStillSummary;
  sessionRunning: boolean;
  voiceCalibrating: boolean;
  voiceCalProgress: VoiceCalibrationProgress;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  frameGeometry: FrameGeometry | null;
  dwellSec: number;
  diagnostics: VisionDiagnostics;
  onMigrateFromStill: () => void;
  onExportData: () => void;
  onImportFile: (file: File) => void;
  onClearData: () => void;
  onUpdateSettings: (patch: Partial<StillSettings>) => void;
  onSelectCamera: (deviceId: string) => void;
  onCaptureNeutralPosture: () => void;
  onCapturePostureReference: (which: PostureState) => void;
  onCalibrateVoice: () => void;
  onToggleDesktopBanner: () => void;
  onToggleTheme: () => void;
  onTestStage1: () => void;
  onTestStage2: () => void;
}

const SECTION_TABS: Array<{ id: SettingsSectionId; label: string }> = [
  { id: 'camera', label: 'Camera & Zones' },
  { id: 'voice', label: 'Voice & Rhythm' },
  { id: 'alerts', label: 'Alerts & Window' },
  { id: 'data', label: 'Data & Theme' },
];

export function SettingsView({
  activeSection,
  onChangeSection,
  settings,
  calibration,
  rhythm,
  theme,
  autoPipSupported,
  autoPipPermission,
  availableCameras,
  legacyStill,
  sessionRunning,
  voiceCalibrating,
  voiceCalProgress,
  videoRef,
  frameGeometry,
  dwellSec,
  diagnostics,
  onMigrateFromStill,
  onExportData,
  onImportFile,
  onClearData,
  onUpdateSettings,
  onSelectCamera,
  onCaptureNeutralPosture,
  onCapturePostureReference,
  onCalibrateVoice,
  onToggleDesktopBanner,
  onToggleTheme,
  onTestStage1,
  onTestStage2,
}: SettingsViewProps) {
  const trimmedName = settings.userName.trim();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const handleImportChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onImportFile(file);
    e.target.value = '';
  };

  return (
    <div className="view-stack">
      <header className="page-intro">
        <h1 className="page-title">Settings</h1>
        <p className="page-lead">
          Everything stays saved locally in this browser. Pick a section below to fine-tune.
        </p>
      </header>

      {/* Clean 4-pill Settings Sub-Navigation */}
      <div className="subtab-bar" role="tablist" aria-label="Settings sections">
        {SECTION_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`settings-tab-${tab.id}`}
            aria-selected={activeSection === tab.id}
            className={`subtab-btn ${activeSection === tab.id ? 'subtab-btn--active' : ''}`}
            onClick={() => onChangeSection(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* =====================================================================
          SUB-TAB 1: Camera & Zones (Live preview, dual-cam, watched zones, guards)
          ===================================================================== */}
      {activeSection === 'camera' && (
        <section className="editorial-section" aria-label="Camera and detection zones">
          <CalibrationDrawer
            inline
            expanded
            onToggleExpand={() => {}}
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
            sessionRunning={sessionRunning}
            diagnostics={diagnostics}
          />
        </section>
      )}

      {/* =====================================================================
          SUB-TAB 2: Voice & Rhythm (Mic dB comfort meter, restlessness, sit/stand)
          ===================================================================== */}
      {activeSection === 'voice' && (
        <>
          <section className="editorial-section" aria-label="Voice comfort and rhythm">
            <div className="settings-card">
              <div
                className="toggle-row toggle-row--compact"
                style={{ borderTop: 'none', paddingTop: 0 }}
              >
                <div className="toggle-copy">
                  <div className="toggle-title">Microphone voice meter (dB) &amp; talking pause</div>
                  <p className="toggle-desc">
                    100% local in memory — shows your loudness bar, filters keyboard clacks, and
                    pauses restlessness while speaking.
                  </p>
                </div>
                <button
                  type="button"
                  id="toggle-mic-enabled"
                  role="switch"
                  aria-checked={settings.micEnabled}
                  aria-label="Toggle local microphone voice level monitor"
                  className={`switch ${settings.micEnabled ? 'switch--on' : ''}`}
                  onClick={() => onUpdateSettings({ micEnabled: !settings.micEnabled })}
                >
                  <span className="switch-thumb" />
                </button>
              </div>

              <div className="posture-cal-box">
                <div className="slider-head">
                  <span className="slider-label">Personal voice calibration (IEC dBA)</span>
                  <span className="slider-value tabular">
                    {rhythm.micState === 'active'
                      ? `${rhythm.voiceDb} dBA · 3s avg ${rhythm.voiceLeqDb}`
                      : settings.voiceCalOffsetDb !== 0
                        ? `Trim ${settings.voiceCalOffsetDb > 0 ? '+' : ''}${settings.voiceCalOffsetDb} dB`
                        : 'Standard (+0 dB)'}
                  </span>
                </div>
                <p className="toggle-desc">
                  Uses IEC A-weighting (how human ears perceive loudness) with a 125 ms live curve
                  and 3-second energy average (LAeq). Auto-center in 3 seconds below, or nudge the
                  trim slider to match any reference meter (like Sound Meter or Apple Watch Noise)
                  without changing your Mac&rsquo;s mic volume.
                </p>
                {voiceCalibrating && (
                  <div className="voice-cal-banner" role="status" aria-live="polite">
                    <span>
                      Speak a normal sentence for <strong>{voiceCalProgress.remainingSec || 3}s</strong>{' '}
                      — centering green zone on your voice…
                    </span>
                    <span className="voice-cal-badge">
                      {voiceCalProgress.hearingVoice ? 'Hearing you ✓' : 'Listening…'}
                    </span>
                  </div>
                )}
                <label className="slider-row" htmlFor="slider-voice-cal-offset">
                  <div className="slider-head">
                    <span className="slider-label">Reference trim offset</span>
                    <span className="slider-value tabular">
                      {settings.voiceCalOffsetDb > 0
                        ? `+${settings.voiceCalOffsetDb} dB`
                        : `${settings.voiceCalOffsetDb} dB`}
                    </span>
                  </div>
                  <input
                    id="slider-voice-cal-offset"
                    type="range"
                    min={-25}
                    max={25}
                    step={1}
                    value={settings.voiceCalOffsetDb}
                    onChange={(e) =>
                      onUpdateSettings({ voiceCalOffsetDb: Number(e.target.value) })
                    }
                  />
                </label>
                <div className="welcome-actions">
                  <button
                    type="button"
                    id="btn-calibrate-voice"
                    className="btn btn-subtle btn-sm"
                    disabled={voiceCalibrating}
                    onClick={onCalibrateVoice}
                  >
                    {voiceCalibrating
                      ? `Listening (${voiceCalProgress.remainingSec || 3}s)…`
                      : 'Set my comfortable voice (3s)'}
                  </button>
                  {settings.voiceCalOffsetDb !== 0 && (
                    <button
                      type="button"
                      className="text-link-btn text-link-btn--muted"
                      onClick={() => onUpdateSettings({ voiceCalOffsetDb: 0 })}
                    >
                      Reset to 0
                    </button>
                  )}
                </div>
              </div>

              <div className="toggle-row toggle-row--compact">
                <div className="toggle-copy">
                  <div className="toggle-title">Suggest calming resets when restlessness rises</div>
                  <p className="toggle-desc">
                    Offers a gentle breath or body reset card when restlessness stays elevated.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.restlessnessSuggestionsEnabled}
                  aria-label="Toggle restlessness calming suggestions"
                  className={`switch ${settings.restlessnessSuggestionsEnabled ? 'switch--on' : ''}`}
                  onClick={() =>
                    onUpdateSettings({
                      restlessnessSuggestionsEnabled: !settings.restlessnessSuggestionsEnabled,
                    })
                  }
                >
                  <span className="switch-thumb" />
                </button>
              </div>

              <div className="toggle-row toggle-row--compact">
                <div className="toggle-copy">
                  <div className="toggle-title">Quiet sitting &amp; standing guide</div>
                  <p className="toggle-desc">
                    Tracks your daily balance and stretch timer at your desk without notifications.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.sitStandGuidanceEnabled}
                  aria-label="Toggle quiet sitting and standing guide"
                  className={`switch ${settings.sitStandGuidanceEnabled ? 'switch--on' : ''}`}
                  onClick={() =>
                    onUpdateSettings({ sitStandGuidanceEnabled: !settings.sitStandGuidanceEnabled })
                  }
                >
                  <span className="switch-thumb" />
                </button>
              </div>
            </div>
          </section>

          <details className="streamline-drawer">
            <summary className="streamline-drawer-summary">
              <span>Fine-tune thresholds &amp; windows</span>
              <span className="streamline-drawer-meta tabular">
                Max {settings.voiceComfortMaxDb} dB · Sit {settings.sitWindowMinutes}m / Stand{' '}
                {settings.standWindowMinutes}m
              </span>
            </summary>
            <div className="streamline-drawer-body">
              <div className="sliders-grid">
                <label className="slider-row" htmlFor="slider-voice-ceiling">
                  <div className="slider-head">
                    <span className="slider-label">Voice amber warning above</span>
                    <span className="slider-value tabular">{settings.voiceComfortMaxDb} dB</span>
                  </div>
                  <input
                    id="slider-voice-ceiling"
                    type="range"
                    min={56}
                    max={78}
                    step={1}
                    value={settings.voiceComfortMaxDb}
                    onChange={(e) =>
                      onUpdateSettings({ voiceComfortMaxDb: Number(e.target.value) })
                    }
                  />
                </label>

                <label className="slider-row" htmlFor="slider-restless-threshold">
                  <div className="slider-head">
                    <span className="slider-label">Suggest calm reset above</span>
                    <span className="slider-value tabular">
                      {settings.restlessnessThreshold} / 100
                    </span>
                  </div>
                  <input
                    id="slider-restless-threshold"
                    type="range"
                    min={45}
                    max={85}
                    step={5}
                    value={settings.restlessnessThreshold}
                    onChange={(e) =>
                      onUpdateSettings({ restlessnessThreshold: Number(e.target.value) })
                    }
                  />
                </label>

                <label className="slider-row" htmlFor="slider-sit-window">
                  <div className="slider-head">
                    <span className="slider-label">Gentle sitting window</span>
                    <span className="slider-value tabular">{settings.sitWindowMinutes} min</span>
                  </div>
                  <input
                    id="slider-sit-window"
                    type="range"
                    min={20}
                    max={60}
                    step={5}
                    value={settings.sitWindowMinutes}
                    onChange={(e) =>
                      onUpdateSettings({ sitWindowMinutes: Number(e.target.value) })
                    }
                  />
                </label>

                <label className="slider-row" htmlFor="slider-stand-window">
                  <div className="slider-head">
                    <span className="slider-label">Gentle standing window</span>
                    <span className="slider-value tabular">{settings.standWindowMinutes} min</span>
                  </div>
                  <input
                    id="slider-stand-window"
                    type="range"
                    min={10}
                    max={45}
                    step={5}
                    value={settings.standWindowMinutes}
                    onChange={(e) =>
                      onUpdateSettings({ standWindowMinutes: Number(e.target.value) })
                    }
                  />
                </label>
              </div>
            </div>
          </details>
        </>
      )}

      {/* =====================================================================
          SUB-TAB 3: Alerts & Window (Visual cues for muted audio, chimes, Auto-PiP)
          ===================================================================== */}
      {activeSection === 'alerts' && (
        <>
          <section className="editorial-section" aria-label="Eyebrow awareness cues">
            <div className="section-head-row">
              <h2 className="section-heading">Awareness cues &amp; muted-audio visibility</h2>
              <div className="settings-inline-actions">
                <button
                  type="button"
                  id="btn-settings-test-cue"
                  className="text-link-btn"
                  onClick={onTestStage1}
                >
                  Test cue
                </button>
                <span className="meta-dot" aria-hidden="true">
                  ·
                </span>
                <button
                  type="button"
                  id="btn-preview-pause-sheet"
                  className="text-link-btn"
                  onClick={onTestStage2}
                >
                  Preview 60s pause
                </button>
              </div>
            </div>

            <div className="settings-card">
              <div
                className="toggle-row toggle-row--compact"
                style={{ borderTop: 'none', paddingTop: 0 }}
              >
                <div className="toggle-copy">
                  <div className="toggle-title">
                    Silent Mac desktop banner{' '}
                    <span className="rhythm-quiet-tag">Best when muted / no earphones</span>
                  </div>
                  <p className="toggle-desc">
                    Slides a brief visual banner in the top-right corner over any Mac app — works
                    even when your speakers are muted. (Glowing orange tab icon &amp; pulsing
                    mini-window are always on.)
                  </p>
                </div>
                <button
                  type="button"
                  id="toggle-desktop-banner"
                  role="switch"
                  aria-checked={settings.desktopVisualBanner}
                  aria-label="Toggle silent desktop visual banner"
                  className={`switch ${settings.desktopVisualBanner ? 'switch--on' : ''}`}
                  onClick={onToggleDesktopBanner}
                >
                  <span className="switch-thumb" />
                </button>
              </div>

              <div className="toggle-row toggle-row--compact">
                <div className="toggle-copy">
                  <div className="toggle-title">
                    Stage 1 · Edge glow &amp; singing bowl{' '}
                    <span className="inline-timing tabular">
                      ~{settings.stage1DwellSec.toFixed(1)}s
                    </span>
                  </div>
                  <p className="toggle-desc">
                    Warm peripheral glow &amp; chime with 5s auto-catch when you lower your hand.
                  </p>
                </div>
                <button
                  type="button"
                  id="toggle-stage1"
                  role="switch"
                  aria-checked={settings.stage1Enabled}
                  aria-label="Toggle Stage 1 warm glow and chime"
                  className={`switch ${settings.stage1Enabled ? 'switch--on' : ''}`}
                  onClick={() => onUpdateSettings({ stage1Enabled: !settings.stage1Enabled })}
                >
                  <span className="switch-thumb" />
                </button>
              </div>

              <div className="toggle-row toggle-row--compact">
                <div className="toggle-copy">
                  <div className="toggle-title">
                    Stage 2 · 60s hand-reset pause{' '}
                    <span className="inline-timing tabular">
                      ~{settings.stage2DwellSec.toFixed(1)}s
                    </span>
                  </div>
                  <p className="toggle-desc">
                    Glowing pause sheet with hand guide, Grace recovery, and False alarm.
                  </p>
                </div>
                <button
                  type="button"
                  id="toggle-stage2"
                  role="switch"
                  aria-checked={settings.stage2Enabled}
                  aria-label="Toggle Stage 2 60-second pause sheet"
                  className={`switch ${settings.stage2Enabled ? 'switch--on' : ''}`}
                  onClick={() => onUpdateSettings({ stage2Enabled: !settings.stage2Enabled })}
                >
                  <span className="switch-thumb" />
                </button>
              </div>

              <div className="toggle-row toggle-row--compact">
                <div className="toggle-copy">
                  <div className="toggle-title">Singing-bowl chime audio</div>
                  <p className="toggle-desc">
                    Stays active in meetings too unless muted here.
                  </p>
                </div>
                <button
                  type="button"
                  id="toggle-sound"
                  role="switch"
                  aria-checked={settings.soundEnabled}
                  aria-label="Toggle singing-bowl chime audio"
                  className={`switch ${settings.soundEnabled ? 'switch--on' : ''}`}
                  onClick={() => onUpdateSettings({ soundEnabled: !settings.soundEnabled })}
                >
                  <span className="switch-thumb" />
                </button>
              </div>

              <div className="toggle-row toggle-row--compact">
                <div className="toggle-copy">
                  <div className="toggle-title">Repeat soft chime during 60s pause</div>
                  <p className="toggle-desc">
                    Gently repeats every few seconds until you respond.
                  </p>
                </div>
                <button
                  type="button"
                  id="toggle-repeat-chime"
                  role="switch"
                  aria-checked={settings.stage2RepeatChime}
                  aria-label="Toggle repeating chime during Stage 2 pause alert"
                  className={`switch ${settings.stage2RepeatChime ? 'switch--on' : ''}`}
                  onClick={() =>
                    onUpdateSettings({ stage2RepeatChime: !settings.stage2RepeatChime })
                  }
                >
                  <span className="switch-thumb" />
                </button>
              </div>

              <div className="toggle-row toggle-row--compact">
                <div className="toggle-copy">
                  <div className="toggle-title">Auto-float mini-window on tab switch</div>
                  <p className="toggle-desc">
                    {autoPipPermission === 'denied'
                      ? 'Blocked in Chrome site settings — click the icon left of the address bar to allow Automatic picture-in-picture.'
                      : autoPipSupported
                        ? 'Pops out automatically when you change browser tabs.'
                        : 'Click Mini-window on Today to float over other apps.'}
                  </p>
                </div>
                <button
                  type="button"
                  id="toggle-auto-pip"
                  role="switch"
                  aria-checked={settings.autoPipOnTabSwitch}
                  aria-label="Toggle automatic floating mini-window when switching tabs"
                  className={`switch ${settings.autoPipOnTabSwitch ? 'switch--on' : ''}`}
                  onClick={() =>
                    onUpdateSettings({ autoPipOnTabSwitch: !settings.autoPipOnTabSwitch })
                  }
                >
                  <span className="switch-thumb" />
                </button>
              </div>
            </div>
          </section>

          <details className="streamline-drawer">
            <summary className="streamline-drawer-summary">
              <span>Your name</span>
              <span className="streamline-drawer-meta">
                {trimmedName || 'Optional · used in gentle cues'}
              </span>
            </summary>
            <div className="streamline-drawer-body">
              <label htmlFor="input-user-name" className="slider-label" style={{ display: 'block', marginBottom: 8 }}>
                First name or nickname (stored locally)
              </label>
              <input
                id="input-user-name"
                type="text"
                className="editorial-input"
                maxLength={32}
                placeholder="e.g. Alex"
                value={settings.userName}
                onChange={(e) => onUpdateSettings({ userName: e.target.value })}
              />
            </div>
          </details>
        </>
      )}

      {/* =====================================================================
          SUB-TAB 4: Data & Theme (Theme, Still migration, Backup, Clear)
          ===================================================================== */}
      {activeSection === 'data' && (
        <>
          <section className="editorial-section" aria-label="Appearance">
            <div className="section-head-row">
              <h2 className="section-heading">Appearance</h2>
            </div>
            <div className="toggle-list">
              <div className="toggle-row">
                <div className="toggle-copy">
                  <div className="toggle-title">
                    Theme · {theme === 'light' ? 'Warm Paper' : 'Dark Editorial'}
                  </div>
                  <p className="toggle-desc">
                    Switch between light warm alabaster paper and low-glare dark charcoal.
                  </p>
                </div>
                <button type="button" className="btn btn-subtle btn-sm" onClick={onToggleTheme}>
                  Switch to {theme === 'light' ? 'Dark' : 'Paper'}
                </button>
              </div>
            </div>
          </section>

          <section className="editorial-section" aria-label="Local backup and migration">
            <div className="section-head-row">
              <h2 className="section-heading">Local data &amp; Still migration</h2>
              <span className="section-meta">100% private · Zero cloud</span>
            </div>

            <div className="settings-card">
              {legacyStill.found ? (
                <p className="settings-explainer">
                  <strong>Found your original Still data in this browser:</strong>{' '}
                  {legacyStill.dayCount} {legacyStill.dayCount === 1 ? 'day' : 'days'} of history
                  {legacyStill.totalCalmSeconds > 0
                    ? ` (${formatShortDuration(legacyStill.totalCalmSeconds)} calm time)`
                    : ''}
                  {legacyStill.noteCount > 0
                    ? `, ${legacyStill.noteCount} ${legacyStill.noteCount === 1 ? 'note' : 'notes'}`
                    : ''}
                  . Original Still stays completely untouched.
                </p>
              ) : (
                <p className="settings-explainer">
                  All history, notes, and settings live privately inside this browser. Export a JSON
                  file anytime to back up or move to another computer.
                </p>
              )}

              <div className="welcome-actions">
                {legacyStill.found && (
                  <button
                    type="button"
                    id="btn-settings-migrate-still"
                    className="btn btn-primary btn-sm"
                    onClick={onMigrateFromStill}
                  >
                    Copy &amp; merge from Still
                  </button>
                )}
                <button
                  type="button"
                  id="btn-settings-export-json"
                  className="btn btn-subtle btn-sm"
                  onClick={onExportData}
                >
                  Export JSON backup
                </button>
                <button
                  type="button"
                  id="btn-settings-import-json"
                  className="btn btn-ghost btn-sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  Import &amp; merge JSON
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="sr-only"
                  onChange={handleImportChange}
                />
              </div>

              <div className="data-foot" style={{ paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                <span className="composer-hint">Danger zone</span>
                {!confirmClear ? (
                  <button
                    type="button"
                    className="text-link-btn text-link-btn--muted"
                    onClick={() => setConfirmClear(true)}
                  >
                    Reset local history
                  </button>
                ) : (
                  <span className="confirm-inline">
                    Clear all stats &amp; notes?{' '}
                    <button
                      type="button"
                      className="text-link-btn text-link-btn--danger"
                      onClick={() => {
                        onClearData();
                        setConfirmClear(false);
                      }}
                    >
                      Yes, clear
                    </button>{' '}
                    <button
                      type="button"
                      className="text-link-btn text-link-btn--muted"
                      onClick={() => setConfirmClear(false)}
                    >
                      Cancel
                    </button>
                  </span>
                )}
              </div>
            </div>
          </section>

          <details className="streamline-drawer">
            <summary className="streamline-drawer-summary">
              <span>Light diagnostic &amp; sample log</span>
              <span className="streamline-drawer-meta tabular">
                {(() => {
                  const st = getPoseSampleStats();
                  return `${st.realCount} catches · ${st.labeledFpCount} labeled FPs`;
                })()}
              </span>
            </summary>
            <div className="streamline-drawer-body">
              <p className="toggle-desc" style={{ marginBottom: 10 }}>
                Quietly collects compact numeric hand-pose snapshots on catches &amp; tagged false
                alarms (zero video/audio) so we can review real numbers before turning on any
                self-improving tuning later.
              </p>
              <div className="welcome-actions" style={{ marginBottom: 10 }}>
                <button
                  type="button"
                  id="btn-copy-debug-log"
                  className="btn btn-subtle btn-xs"
                  onClick={() => {
                    const text = formatTelemetryLog(loadTelemetry(), 60);
                    navigator.clipboard?.writeText(text).catch(() => {});
                  }}
                >
                  Copy debug &amp; sample log
                </button>
                <button
                  type="button"
                  className="text-link-btn text-link-btn--muted"
                  onClick={() => {
                    clearTelemetry();
                    clearPoseSamples();
                    setConfirmClear((c) => !c);
                    window.setTimeout(() => setConfirmClear(false), 0);
                  }}
                >
                  Clear log
                </button>
              </div>
              <pre className="telemetry-preview">
                {formatTelemetryLog(loadTelemetry(), 10)}
              </pre>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
