import { useRef, useState } from 'react';
import { formatShortDuration, type LegacyStillSummary } from '../lib/storage';
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
          <section className="editorial-section" aria-label="Voice comfort and talking detection">
            <div className="section-head-row">
              <h2 className="section-heading">Voice comfort &amp; talking detection</h2>
              <span className="section-meta">100% local · Never recorded</span>
            </div>

            <div className="settings-card">
              <div
                className="toggle-row toggle-row--compact"
                style={{ borderTop: 'none', paddingTop: 0 }}
              >
                <div className="toggle-copy">
                  <div className="toggle-title">Use microphone for voice level (dB) &amp; talking</div>
                  <p className="toggle-desc">
                    Measures live speaking loudness in memory so you can stay in a comfortable range,
                    and pairs with lip movement so talking in meetings never inflates restlessness.
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
                  <span className="slider-label">Personal voice calibration</span>
                  <span className="slider-value tabular">
                    {rhythm.micState === 'active'
                      ? `Live: ${rhythm.voiceDb} dB`
                      : settings.voiceCalOffsetDb !== 0
                        ? `Tuned (${settings.voiceCalOffsetDb > 0 ? '+' : ''}${settings.voiceCalOffsetDb} dB)`
                        : 'Default mic scale'}
                  </span>
                </div>
                <p className="toggle-desc">
                  Because every Mac or Logitech microphone has slightly different sensitivity, speak
                  at your natural comfortable volume for 3 seconds to center the green zone around
                  your voice.
                </p>
                <div className="welcome-actions">
                  <button
                    type="button"
                    id="btn-calibrate-voice"
                    className="btn btn-subtle btn-sm"
                    disabled={voiceCalibrating}
                    onClick={onCalibrateVoice}
                  >
                    {voiceCalibrating ? 'Listening for 3 seconds…' : 'Set my comfortable voice (3s)'}
                  </button>
                  {settings.voiceCalOffsetDb !== 0 && (
                    <button
                      type="button"
                      className="text-link-btn text-link-btn--muted"
                      onClick={() => onUpdateSettings({ voiceCalOffsetDb: 0 })}
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>

              <label className="slider-row" htmlFor="slider-voice-ceiling">
                <div className="slider-head">
                  <span className="slider-label">Soft amber warning above (loudness ceiling)</span>
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
            </div>
          </section>

          <section className="editorial-section" aria-label="Restlessness and desk rhythm">
            <div className="section-head-row">
              <h2 className="section-heading">Restlessness &amp; sitting/standing</h2>
              <span className="section-meta">Calm, non-intrusive guidance</span>
            </div>

            <div className="settings-card">
              <div
                className="toggle-row toggle-row--compact"
                style={{ borderTop: 'none', paddingTop: 0 }}
              >
                <div className="toggle-copy">
                  <div className="toggle-title">Offer calming techniques when restlessness rises</div>
                  <p className="toggle-desc">
                    Quietly shows a context-matched reset card (like a 60s double-inhale sigh or
                    hands &amp; jaw release) when restlessness stays above your comfort level.
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

              <label className="slider-row" htmlFor="slider-restless-threshold">
                <div className="slider-head">
                  <span className="slider-label">Suggest a calming reset above</span>
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

              <div className="toggle-row toggle-row--compact">
                <div className="toggle-copy">
                  <div className="toggle-title">Quiet sitting &amp; standing guide</div>
                  <p className="toggle-desc">
                    Displays a soft rhythm bar showing how long you&rsquo;ve been sitting or
                    standing and tracks your daily balance at your desk.
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

              <div className="sliders-grid">
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
          </section>
        </>
      )}

      {/* =====================================================================
          SUB-TAB 3: Alerts & Window (Name, eyebrow cues, sound, Auto-PiP)
          ===================================================================== */}
      {activeSection === 'alerts' && (
        <>
          <section className="editorial-section" aria-label="Personalization">
            <div className="section-head-row">
              <h2 className="section-heading">Your name</h2>
              <span className="section-meta">Optional · Stored locally</span>
            </div>

            <div className="settings-card">
              <label htmlFor="input-user-name" className="slider-label">
                First name or nickname for gentle cues &amp; morning summaries
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
              <p className="settings-preview-note">
                {trimmedName ? (
                  <>
                    Preview: <em>“{trimmedName}, let the urge crest and pass.”</em>
                  </>
                ) : (
                  'Add your name so Still Rhythm can gently address you when your hand lifts.'
                )}
              </p>
            </div>
          </section>

          <section className="editorial-section" aria-label="Eyebrow awareness cues">
            <div className="section-head-row">
              <h2 className="section-heading">Eyebrow awareness cues</h2>
              <div className="settings-inline-actions">
                <button
                  type="button"
                  id="btn-settings-test-cue"
                  className="text-link-btn"
                  onClick={onTestStage1}
                >
                  Test glow &amp; chime
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

            <div className="toggle-list">
              <div className="toggle-row">
                <div className="toggle-copy">
                  <div className="toggle-title">
                    Stage 1 · Edge glow &amp; singing bowl{' '}
                    <span className="inline-timing tabular">
                      ~{settings.stage1DwellSec.toFixed(1)}s
                    </span>
                  </div>
                  <p className="toggle-desc">
                    Warm peripheral screen glow and soft chime, with a 5-second auto-catch when you
                    lower your hand.
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

              <div className="toggle-row">
                <div className="toggle-copy">
                  <div className="toggle-title">
                    Stage 2 · 60s hand-reset pause{' '}
                    <span className="inline-timing tabular">
                      ~{settings.stage2DwellSec.toFixed(1)}s
                    </span>
                  </div>
                  <p className="toggle-desc">
                    Calm pause sheet with glowing light, visual hand guide, auto-catch, Grace
                    recovery, and False alarm.
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

              <div className="toggle-row">
                <div className="toggle-copy">
                  <div className="toggle-title">Singing-bowl chime audio</div>
                  <p className="toggle-desc">
                    Synthesized locally via Web Audio. Stays active even in meeting mode unless you
                    turn it off here.
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

              <div className="toggle-row">
                <div className="toggle-copy">
                  <div className="toggle-title">Repeat soft chime during pause alert</div>
                  <p className="toggle-desc">
                    Gently repeats the singing bowl every few seconds alongside the glowing light
                    until you respond or mute it.
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
            </div>
          </section>

          <section className="editorial-section" aria-label="Floating mini-window">
            <div className="section-head-row">
              <h2 className="section-heading">Floating mini-window</h2>
            </div>

            <div className="settings-card">
              <div
                className="toggle-row toggle-row--compact"
                style={{ borderTop: 'none', paddingTop: 0 }}
              >
                <div className="toggle-copy">
                  <div className="toggle-title">Auto-float when switching browser tabs</div>
                  <p className="toggle-desc">
                    {autoPipPermission === 'denied'
                      ? 'Currently blocked in Chrome site settings. Click the tune icon left of the address bar and allow "Automatic picture-in-picture".'
                      : autoPipSupported
                        ? 'When a session is running and you switch browser tabs, Still Rhythm pops out automatically. To stay on top of other desktop apps (like Slack or Notes), click "Float mini-window" once.'
                        : 'Supported automatically on Desktop Chrome & Edge. In other browsers, click "Float mini-window" directly.'}
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
        </>
      )}
    </div>
  );
}
