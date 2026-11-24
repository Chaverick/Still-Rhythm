export type ThemeMode = 'light' | 'dark';
export type TabId = 'today' | 'patterns' | 'calm-tools' | 'notes' | 'settings';
export type PreviewMode = 'silhouette' | 'camera';
export type DelegateMode = 'GPU' | 'CPU' | null;
export type DetectionZoneId = 'left-brow' | 'right-brow' | 'lashes' | 'hairline';
export type PiPKind = 'none' | 'document' | 'video';

export type WorkContext = 'desk' | 'portable';
export type PostureState = 'sitting' | 'standing';
export type RestlessnessLevel = 'settled' | 'stirring' | 'restless';
export type FaceTouchRegion = 'chin' | 'cheek' | 'noseMouth' | 'forehead';
export type ReliefMoveKind = 'shoulderRoll' | 'neckTilt' | 'backShift' | 'neckRub';
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
  updatedAt: number | null;
}

export interface StillSettings {
  userName: string;
  stage1Enabled: boolean;
  stage2Enabled: boolean;
  soundEnabled: boolean;
  stage2RepeatChime: boolean;
  autoPipOnTabSwitch: boolean;
  stage1DwellSec: number; // default 1.2s
  stage2DwellSec: number; // default 2.6s
  zoneScale: number; // multiplier on eye-width normalized halo, default 1.0
  activeZones: DetectionZoneId[];
  pinchFilterEnabled: boolean;
  smartFalseAlarmGuard: boolean; // reduces false alarms from ear touches & drinking from a glass while keeping high brow recall
  previewMode: PreviewMode;
  pinnedResponses: string[];
  checkedAnchors: string[];
  // Still Rhythm additions
  selectedCameraId: string; // '' = system default, or specific webcam (e.g. Logitech)
  workContext: WorkContext; // 'desk' (Logitech / sit-stand) vs 'portable' (laptop in meetings / bed)
  restlessnessSuggestionsEnabled: boolean;
  restlessnessThreshold: number; // 45..85, default 65
  sitStandGuidanceEnabled: boolean;
  sitWindowMinutes: number; // gentle window to rise, default 40
  standWindowMinutes: number; // gentle window to sit, default 25
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
  facialTension: number; // 0..1 blendshape composite (brow lowering + eye squint)
  handNearFaceRegion: FaceTouchRegion | 'neck' | null;
  bgHash: number[] | null; // 16x12 background-horizon luminance vector
}

export interface FrameGeometry {
  videoWidth: number;
  videoHeight: number;
  facePresent: boolean;
  usingOcclusionCache: boolean;
  sideAngle: boolean;
  faceOval: Point2D[];
  leftEye: Point2D[];
  rightEye: Point2D[];
  activeZones: ZoneGeometry[];
  eyeSpan: number;
  haloRadius: number;
  fingertips: Array<Point2D & { inZone: boolean; handIndex: number; pinching: boolean }>;
  handInZone: boolean;
  filteredReason: 'ear' | 'drinking' | 'foreground' | null;
  closestRatio: number | null;
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
}

export type EngineStatus =
  | 'idle'
  | 'requesting-camera'
  | 'loading-models'
  | 'running'
  | 'error';

export interface VisionDiagnostics {
  delegate: DelegateMode;
  fps: number;
  faceState: 'detected' | 'cached' | 'away';
  poseActive: boolean;
  sideAngle: boolean;
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
