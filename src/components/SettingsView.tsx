import { useRef } from 'react';
import { formatShortDuration, type LegacyStillSummary } from '../lib/storage';
import type { CameraDeviceOption, StillSettings, ThemeMode } from '../types';

interface SettingsViewProps {
  settings: StillSettings;
  theme: ThemeMode;
  autoPipSupported: boolean;
  availableCameras: CameraDeviceOption[];
  legacyStill: LegacyStillSummary;
  onMigrateFromStill: () => void;
  onImportFile: (file: File) => void;
  onUpdateSettings: (patch: Partial<StillSettings>) => void;
  onSelectCamera: (deviceId: string) => void;
  onToggleTheme: () => void;
  onTestStage1: () => void;
  onTestStage2: () => void;
}

export function SettingsView({
  settings,
  theme,
  autoPipSupported,
  availableCameras,
  legacyStill,
  onMigrateFromStill,
  onImportFile,
  onUpdateSettings,
  onSelectCamera,
  onToggleTheme,
  onTestStage1,
  onTestStage2,
}: SettingsViewProps) {
  const trimmedName = settings.userName.trim();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
          Personalize your camera setup, restlessness comfort level, sitting &amp; standing rhythm,
          and gentle eyebrow cues. Everything stays saved locally in this browser.
        </p>
      </header>

      {/* Camera & Workspace */}
      <section className="editorial-section" aria-label="Camera and workspace">
        <div className="section-head-row">
          <h2 className="section-heading">Camera &amp; workspace</h2>
          <span className="section-meta">Desk vs. on the go</span>
        </div>

        <div className="settings-card">
          <div className="camera-picker-row">
            <label htmlFor="select-camera-settings" className="slider-label">
              Preferred camera (e.g. Logitech at desk vs. built-in laptop camera)
            </label>
            <select
              id="select-camera-settings"
              className="editorial-select"
              value={settings.selectedCameraId}
              onChange={(e) => onSelectCamera(e.target.value)}
            >
              <option value="">Automatic (pick camera in front of your face)</option>
              {availableCameras.map((cam) => (
                <option key={cam.deviceId} value={cam.deviceId}>
                  {cam.label}
                </option>
              ))}
            </select>
            <p className="settings-preview-note">
              On <strong>Automatic</strong>, when multiple cameras are plugged in (like your
              MacBook camera on the side and a Logitech webcam on your monitor), Still Rhythm checks
              each camera and chooses the one straight in front of your face.
            </p>
          </div>

          <div className="toggle-row toggle-row--compact">
            <div className="toggle-copy">
              <div className="toggle-title">Current workspace mode</div>
              <p className="toggle-desc">
                Choose <strong>At my desk</strong> to track sitting vs. standing time, or{' '}
                <strong>Meeting / Bed</strong> to pause sit/stand tracking while keeping eyebrow,
                restlessness, and face-touch awareness active.
              </p>
            </div>
            <div className="segmented" role="group" aria-label="Workspace mode">
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
          </div>
        </div>
      </section>

      {/* Restlessness & Sit/Stand Rhythm */}
      <section className="editorial-section" aria-label="Restlessness and posture rhythm">
        <div className="section-head-row">
          <h2 className="section-heading">Restlessness &amp; sitting/standing</h2>
          <span className="section-meta">Calm, non-intrusive guidance</span>
        </div>

        <div className="settings-card">
          <div className="toggle-row toggle-row--compact" style={{ borderTop: 'none', paddingTop: 0 }}>
            <div className="toggle-copy">
              <div className="toggle-title">Offer calming techniques when restlessness rises</div>
              <p className="toggle-desc">
                Quietly shows a context-matched reset card (like a 60s double-inhale sigh or hands
                &amp; jaw release) when restlessness stays above your comfort level.
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
              <div className="toggle-title">Quiet sitting &amp; standing guide (no notifications)</div>
              <p className="toggle-desc">
                Displays a soft rhythm bar showing how long you&rsquo;ve been sitting or standing
                and tracks your daily balance at your desk.
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
                <span className="slider-label">Gentle sitting window (before rising)</span>
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
                <span className="slider-label">Gentle standing window (before sitting)</span>
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

      {/* Personalization: Your name */}
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
              'Add your name so Still Rhythm can gently address you when your hand lifts or greet you with yesterday’s summary.'
            )}
          </p>
        </div>
      </section>

      {/* Classic Still Gentle Cues */}
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
                Calm pause sheet with glowing light, visual hand guide, auto-catch, Grace recovery,
                and False alarm.
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
                Synthesized locally via Web Audio. Turn off for visual-only glowing light in quiet
                rooms or meetings.
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
                Gently repeats the singing bowl every few seconds alongside the glowing light until
                you respond or mute it.
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

      {/* Floating Mini-Window (Picture-in-Picture) */}
      <section className="editorial-section" aria-label="Floating mini-window">
        <div className="section-head-row">
          <h2 className="section-heading">Floating mini-window</h2>
        </div>

        <div className="settings-card">
          <p className="settings-explainer">
            <strong>What is it?</strong> Pops Still Rhythm out into a tiny always-on-top card in the
            corner of your screen so you can work in other tabs while still seeing your sitting/standing
            rhythm and eyebrow awareness glow.
          </p>

          <div className="toggle-row toggle-row--compact">
            <div className="toggle-copy">
              <div className="toggle-title">Auto-float when switching tabs</div>
              <p className="toggle-desc">
                {autoPipSupported
                  ? 'Supported in this browser: when a session is running and you switch tabs, Still Rhythm pops out automatically.'
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

      {/* Bring your personal data from the original Still app */}
      <section className="editorial-section" aria-label="Migrate data from Still">
        <div className="section-head-row">
          <h2 className="section-heading">Bring your data from Still</h2>
          <span className="section-meta">Read-only · Original Still stays untouched</span>
        </div>

        <div className="settings-card">
          {legacyStill.found ? (
            <p className="settings-explainer">
              <strong>Found your Still data in this browser:</strong>{' '}
              {legacyStill.dayCount} {legacyStill.dayCount === 1 ? 'day' : 'days'} of history
              {legacyStill.totalCalmSeconds > 0
                ? ` (${formatShortDuration(legacyStill.totalCalmSeconds)} calm time)`
                : ''}
              {legacyStill.noteCount > 0
                ? `, ${legacyStill.noteCount} ${legacyStill.noteCount === 1 ? 'note' : 'notes'}`
                : ''}
              {legacyStill.hasSettings ? ', plus your Still settings' : ''}. Still Rhythm copies this
              over automatically on first open, and you can safely re-sync anytime.
            </p>
          ) : (
            <p className="settings-explainer">
              Because Still keeps all your data privately inside each browser (with zero cloud
              servers), if you used Still on another device or browser, export a JSON backup from
              Still&rsquo;s <strong>Progress</strong> tab and import it below.
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
              id="btn-settings-import-json"
              className="btn btn-subtle btn-sm"
              onClick={() => fileInputRef.current?.click()}
            >
              Import Still JSON from another device
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="sr-only"
              onChange={handleImportChange}
            />
          </div>
        </div>
      </section>

      {/* Appearance */}
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
    </div>
  );
}
