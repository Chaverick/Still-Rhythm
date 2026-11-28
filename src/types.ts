export type ThemeMode = 'light' | 'dark';
export type TabId = 'today' | 'patterns' | 'calm' | 'settings';
export type SettingsSectionId = 'camera' | 'voice' | 'alerts' | 'data';
export type PreviewMode = 'silhouette' | 'camera';
export type DelegateMode = 'GPU' | 'CPU' | null;
export type DetectionZoneId = 'left-brow' | 'right-brow' | 'lashes' | 'hairline';
export type PiPKind = 'none' | 'document' | 'video';

export type WorkContext = 'desk' | 'portable';
export type PostureState = 'sitting' | 'standing';
export type RestlessnessLevel = 'settled' | 'stirring' | 'restless';
export type FaceTouchRegion = 'chin' | 'cheek' | 'noseMouth' | 'forehead';
export type ReliefMoveKind = 'shoulderRoll' | 'neckTilt' | 'backShift' | 'neckRub';
export type MicState = 'off' | 'active' | 'denied' | 'unavailable';
export type VoiceComfortStatus = 'off' | 'quiet' | 'comfortable' | 'loud';
export type CalmingTechniqueId =
  | 'cyclic-sigh'
  | 'steady-breath'
  | 'hands-jaw-release'
  | 'short-walk'
  | 'soften-gaze';

export interface CameraDeviceOption {
  deviceId: string;
  label: string;
}

export interface PostureChangePrompt {
  candidate: PostureState;
  reason: string;
  createdAt: number;
}

export interface PostureCalibration {
  neutralEyeSpan: number | null;
  neutralShoulderSpan: number | null;
  neutralNeckGap: number | null;
  neutralShoulderTilt: number | null;
  neutralHeadRollDeg: number | null;
  sitFaceY: number | null;
  standFaceY: number | null;
  sitBgHash: number[] | null;
  standBgHash: number[] | null;
  sitSecondaryHash: number[] | null;
  standSecondaryHash: number[] | null;
  sitSecondaryMassY: number | null;
  standSecondaryMassY: number | null;
  confirmedSwitches: number;
  acceptedYawSymmetry?: number | null;
  acceptedTopDownStrength?: number | null;
  updatedAt: number | null;
}

export interface StillSettings {
  userName: string;
  stage1Enabled: boolean;
  stage2Enabled: boolean;
  soundEnabled: boolean;
  stage2RepeatChime: boolean;
  desktopVisualBanner: boolean; // silent macOS/desktop visual banner for muted speaker / no earphones
  autoPipOnTabSwitch: boolean;
  stage1DwellSec: number; // default 1.2s
  stage2DwellSec: number; // default 2.6s
  zoneScale: number; // multiplier on eye-width normalized halo, default 1.0
  activeZones: DetectionZoneId[];
  pinchFilterEnabled: boolean;
  smartFalseAlarmGuard: boolean; // reduces false alarms from ear touches, drinking & top-down angles
  previewMode: PreviewMode;
  pinnedResponses: string[];
  checkedAnchors: string[];
  // Still Rhythm additions
  selectedCameraId: string; // '' = automatic front-facing camera selection
  dualCameraSitStand: boolean; // quietly uses 2nd camera at desk for sit/stand accuracy
  workContext: WorkContext; // 'desk' (Logitech / sit-stand) vs 'portable' (laptop away / bed)
  restlessnessSuggestionsEnabled: boolean;
  restlessnessThreshold: number; // 45..85, default 65
  sitStandGuidanceEnabled: boolean;
  sitWindowMinutes: number; // gentle window to rise, default 40
  standWindowMinutes: number; // gentle window to sit, default 25
  // Local Voice Volume (dB) & Audio-Visual Talking Detection
  micEnabled: boolean; // default true (100% local loudness + speech band only)
  voiceComfortMinDb: number; // default 46
  voiceComfortMaxDb: number; // default 66
  voiceCalOffsetDb: number; // learned via 3-second comfortable-voice calibration
}

export type AwarenessEventKind =
  | 'redirect-stage1'
  | 'redirect-stage2'
  | 'grace'
  | 'false-alarm'
  | 'welcome-back-calm'
  | 'calming-reset';

export interface AwarenessEvent {
  id: string;
  timestamp: number;
  dateKey: string; // YYYY-MM-DD local
  kind: AwarenessEventKind;
  note?: string;
  tag?: string;
  responseId?: string;
}

export interface FaceTouchCounts {
  chin: number;
  cheek: number;
  noseMouth: number;
  forehead: number;
}

export interface DaySummary {
  dateKey: string;
  calmSeconds: number;
  urgesRedirected: number;
  graceRecoveries: number;
  falseAlarms: number;
  // Still Rhythm daily totals
  sittingSeconds: number;
  standingSeconds: number;
  postureSwitches: number;
  restlessSeconds: number;
  calmingResetsUsed: number;
  forwardLeanSeconds: number;
  shoulderRolls: number;
  neckTilts: number;
  backShifts: number;
  neckRubs: number;
  faceTouches: FaceTouchCounts;
}

/**
 * Compact 5-minute local telemetry bucket used for visual day timelines,
 * next-day plain-English summaries, and multi-day pattern correlations.
 */
export interface FiveMinBucket {
  dateKey: string;
  slotIndex: number; // 0..287 (5-minute slot of day: hour = Math.floor(slotIndex / 12))
  activeSeconds: number;
  sittingSeconds: number;
  standingSeconds: number;
  restlessnessSum: number; // divided by samples = average restlessness (0..100)
  restlessnessSamples: number;
  peakRestlessness: number;
  forwardLeanSeconds: number;
  shoulderTensionSum: number;
  reliefMoves: number; // shoulder rolls + neck tilts + back shifts + neck rubs
  shoulderRolls: number;
  neckTilts: number;
  backShifts: number;
  neckRubs: number;
  faceTouches: FaceTouchCounts;
  browUrges: number;
  calmingResets: number;
}

export interface NoteEntry {
  id: string;
  timestamp: number;
  dateKey: string;
  text: string;
  tags: string[];
}

export interface CompetingResponse {
  id: string;
  title: string;
  instruction: string;
  durationHint: string;
  why: string;
}

export interface CalmingTechnique {
  id: CalmingTechniqueId;
  title: string;
  shortTitle: string;
  durationHint: string;
  summary: string;
  steps: string[];
  whyItHelps: string;
  neckSafetyNote: string;
  bestFor: string;
}

export interface Point2D {
  x: number;
  y: number;
}

export interface ZoneGeometry {
  id: DetectionZoneId;
  points: Point2D[];
  closed: boolean;
  radius: number;
}

export interface UpperBodySnapshot {
  posePresent: boolean;
  leftShoulder: Point2D | null;
  rightShoulder: Point2D | null;
  shoulderSpan: number | null;
  shoulderMidY: number | null;
  shoulderTilt: number | null; // (leftY - rightY) / shoulderSpan
  neckGap: number | null; // (shoulderMidY - chinY) / eyeSpan
  headCenter: Point2D | null;
  headRollDeg: number; // lateral head tilt angle in degrees
  facialTension: number; // 0..1 blendshape composite (smiles excluded)
  mouthOpenRatio: number; // 0..1 combined jawOpen + lip gap for visual speech detection
  smileScore: number; // 0..1 smile blendshape average
  handNearFaceRegion: FaceTouchRegion | 'neck' | null;
  bgHash: number[] | null; // lighting-resistant background-horizon gradient fingerprint
}

export interface FrameGeometry {
  videoWidth: number;
  videoHeight: number;
  facePresent: boolean;
  usingOcclusionCache: boolean;
  sideAngle: boolean;
  yawSymmetry: number; // 1.0 = dead-on straight, drops <0.56 when genuinely angled sideways
  topDownAngle: boolean;
  topDownStrength: number; // 0..1 steep downward pitch strength
  faceEdgeClipped: boolean; // face cut off or far off-center
  faceOval: Point2D[];
  leftEye: Point2D[];
  rightEye: Point2D[];
  activeZones: ZoneGeometry[];
  eyeSpan: number;
  haloRadius: number;
  fingertips: Array<Point2D & { inZone: boolean; handIndex: number; pinching: boolean }>;
  handInZone: boolean;
  filteredReason: 'ear' | 'drinking' | 'foreground' | 'below-brow' | null;
  closestRatio: number | null;
  poseSnapshot: Omit<HandPoseSnapshot, 'dwellSec'> | null;
  upperBody: UpperBodySnapshot;
}

export interface LiveRhythmState {
  restlessnessScore: number; // 0..100
  restlessnessLevel: RestlessnessLevel;
  restlessnessAboveThresholdSec: number;
  suggestCalming: boolean;
  recommendedTechniqueId: CalmingTechniqueId;
  recommendationReason: string;
  postureState: PostureState;
  postureSource: 'auto' | 'manual';
  boutSeconds: number;
  forwardLeanPct: number; // 0..35 relative drift from neutral
  shoulderGuardPct: number; // 0..100 relative shoulder lift/unevenness
  baselineReady: boolean;
  recentReliefLabel: string | null; // transient silent indicator in calibration only
  recentFaceTouchRegion: FaceTouchRegion | null;
  // Audio-visual talking & Voice dB comfort state
  isSpeaking: boolean;
  speakingSource: 'audio-visual' | 'visual' | 'none';
  lipTransitions: number;
  backgroundAudioIgnored: boolean;
  voiceDb: number;
  voiceStatus: VoiceComfortStatus;
  micState: MicState;
  // Dual-camera sit/stand confirmation state
  dualCameraActive: boolean;
  secondaryCameraLabel: string;
  pendingPosturePrompt: PostureChangePrompt | null;
}

export type EngineStatus =
  | 'idle'
  | 'requesting-camera'
  | 'loading-models'
  | 'choosing-camera'
  | 'running'
  | 'error';

export interface VisionDiagnostics {
  delegate: DelegateMode;
  fps: number;
  faceState: 'detected' | 'cached' | 'away';
  poseActive: boolean;
  sideAngle: boolean;
  topDownAngle?: boolean;
  cameraState: 'live' | 'muted' | 'ended';
  cameraStalled: boolean;
  cameraLabel: string;
  detectCount: number;
  handsCount: number;
  modelsCached: boolean;
  wakeLockActive: boolean;
}

export interface Stage1AutoCatch {
  startedAt: number;
  handClearedAt: number | null;
  remainingSec: number;
}

export interface WelcomeBackPrompt {
  awayMinutes: number;
  reason: 'stepped-away' | 'tab-returned';
}

export type FalseAlarmReason = 'eye-scratch' | 'drinking' | 'ear' | 'other';

export interface CameraAngleWarning {
  reason: 'side' | 'top-down' | 'edge';
  label: string;
  sinceMs: number;
}

export type TelemetryEventKind =
  | 'stage1'
  | 'stage2'
  | 'auto-catch'
  | 'false-alarm'
  | 'false-alarm-tag'
  | 'camera-angle-warn'
  | 'camera-angle-ack'
  | 'speaking-start'
  | 'speaking-cleared'
  | 'bg-audio-ignored'
  | 'posture-prompt'
  | 'posture-confirm'
  | 'session-start';

export interface HandPoseSnapshot {
  /** Closest distance to active brow halo divided by halo radius (smaller = closer) */
  closestRatio: number;
  /** Vertical offset of closest fingertip relative to eye center, normalized by eyeSpan (+ = below eye, - = above brow) */
  relYToEye: number;
  /** Horizontal distance from outer brow corner toward ear, normalized by eyeSpan (>0 = outside brow) */
  lateralOutside: number;
  /** Thumb-to-index tip distance divided by palm size (smaller = tighter pinch) */
  pinchRatio: number;
  /** Hand size relative to eyeSpan (larger = closer to camera / foreground) */
  handToEyeScale: number;
  /** True if primary plucking fingertips (thumb/index/middle) triggered rather than back/ring/pinky */
  primaryTipHit: boolean;
  /** Steep top-down camera angle strength (0..1) */
  topDownStrength: number;
  /** Side-angle camera flag */
  sideAngle: boolean;
  /** Dwell duration in seconds at moment of event */
  dwellSec: number;
  /** Which zone was closest */
  zoneId: DetectionZoneId | null;
}

export type SampleOutcome =
  | 'real-autocatch'
  | 'real-stage2'
  | 'real-grace'
  | 'fp-eye-scratch'
  | 'fp-drinking'
  | 'fp-ear'
  | 'fp-other'
  | 'fp-unlabeled';

export interface LabeledPoseSample {
  id: string;
  eventId?: string;
  t: number;
  outcome: SampleOutcome;
  cameraLabel: string;
  pose: HandPoseSnapshot;
}

export interface TelemetryEntry {
  id: string;
  t: number; // epoch ms
  kind: TelemetryEventKind;
  detail: string;
  meta?: Record<string, string | number | boolean | null>;
}
