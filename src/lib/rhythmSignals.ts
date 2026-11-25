import type {
  CalmingTechniqueId,
  FaceTouchRegion,
  FrameGeometry,
  LiveRhythmState,
  MicState,
  PostureCalibration,
  PostureChangePrompt,
  PostureState,
  ReliefMoveKind,
  StillSettings,
  VoiceComfortStatus,
} from '../types';
import type { SecondaryCameraSample } from './dualCameraPosture';
import { loadPostureStretch, savePostureStretch } from './storage';
import type { VoiceSample } from './voiceMonitor';

export interface RhythmStepCallbacks {
  onFaceTouch: (region: FaceTouchRegion) => void;
  onReliefMove: (kind: ReliefMoveKind) => void;
  onPostureAutoSwitched: (next: PostureState) => void;
  onLearnPostureCalibration: (patch: Partial<PostureCalibration>) => void;
}

export interface RhythmStepContext {
  voice: VoiceSample;
  secondaryCam: SecondaryCameraSample | null;
  dualCameraActive: boolean;
  secondaryCameraLabel: string;
  inMeetingMode: boolean;
}

interface MotionSample {
  t: number;
  headSpeed: number;
  shoulderSpeed: number;
  handFidgeting: boolean;
  tension: number;
  dampened: boolean;
}

const MOTION_WINDOW_MS = 45_000;
const SUGGEST_SUSTAIN_SEC = 18;
const SUGGEST_COOLDOWN_MS = 12 * 60 * 1000;
const FACE_TOUCH_MIN_MS = 450;
const FACE_TOUCH_COOLDOWN_MS = 3200;
const NECK_RUB_MIN_MS = 650;
const RELIEF_COOLDOWN_MS = 7500;

// Talking grace windows (hold calm restlessness briefly after a sentence ends)
const AUDIO_VISUAL_SPEAK_GRACE_MS = 15_000;
const VISUAL_ONLY_SPEAK_GRACE_MS = 11_000;

// Dual-camera sit/stand confirmation guardrails ("don't do it too much")
const POSTURE_CANDIDATE_CONFIRM_MS = 5200; // must hold new posture steadily for ~5.2s
const POSTURE_PROMPT_AUTO_DISMISS_MS = 22_000; // quietly disappears if ignored
const POSTURE_COOLDOWN_AFTER_YES_MS = 5 * 60 * 1000; // 5m cooldown after confirming
const POSTURE_COOLDOWN_AFTER_NO_MS = 10 * 60 * 1000; // 10m cooldown after saying "Still sitting/standing"

function hashDistance(a: number[] | null | undefined, b: number[] | null | undefined): number {
  if (!a || !b) return Infinity;
  const len = Math.min(a.length, b.length);
  if (len === 0) return Infinity;
  let sum = 0;
  for (let i = 0; i < len; i++) {
    sum += Math.abs(a[i] - b[i]);
  }
  return sum / len;
}

/**
 * Transforms 4-FPS FrameGeometry + optional local VoiceSample + optional SecondaryCameraSample
 * into smooth, human-friendly live signals:
 * - Restlessness score (0-100) that automatically pauses during talking/meetings & ignores smiles/open gestures
 * - Audio-Visual Talking Detection + Voice Comfort (dB) state
 * - Dual-Camera Sit vs. Stand Detection with rare, auto-learning confirmation prompts
 * - Silent neck/shoulder comfort-adjustment & face-touch logging (zero alerts)
 */
export class RhythmSignalProcessor {
  private samples: MotionSample[] = [];
  private prevHead: { x: number; y: number } | null = null;
  private prevShoulderY: number | null = null;
  private prevShoulderSpan: number | null = null;

  // Auto-calibrated neutral baseline
  private neutralSamples = 0;
  private baseEyeSpan = 0;
  private baseShoulderSpan = 0;
  private baseNeckGap = 0;
  private baseShoulderTilt = 0;
  private baseHeadRoll = 0;
  private baseTension = 0.08;

  // Smooth EMA states
  private restlessnessEma = 24;
  private aboveThresholdSec = 0;
  private cooldownUntilMs = 0;
  private forwardLeanEma = 0;
  private shoulderGuardEma = 0;

  // Audio-Visual & Visual Talking Detection state
  private mouthWindow: Array<{ t: number; open: number }> = [];
  private lastAudioVisualSpeakMs = 0;
  private lastVisualSpeakMs = 0;
  private lastVoiceSample: VoiceSample = {
    micState: 'off',
    rawDb: 0,
    smoothedDb: 0,
    voiceBandActive: false,
    status: 'off',
  };

  // Posture state & Dual-Camera confirmation prompt state
  private postureState: PostureState = 'sitting';
  private postureSource: 'auto' | 'manual' = 'manual';
  private boutStartWallMs = Date.now();
  private lastPosturePersistWallMs = 0;
  private pendingCandidate: { candidate: PostureState; reason: string; sinceMs: number } | null = null;
  private pendingPrompt: PostureChangePrompt | null = null;
  private posturePromptCooldownUntilWallMs = 0;

  // Anchor snapshots of the CURRENT posture so zero-calibration transitions & auto-learning work immediately
  private currentAnchorFaceY: number | null = null;
  private currentAnchorBgHash: number[] | null = null;
  private currentAnchorSecHash: number[] | null = null;
  private currentAnchorSecMassY: number | null = null;
  private lastPrimaryFaceY: number | null = null;
  private lastPrimaryBgHash: number[] | null = null;
  private lastSecondarySample: SecondaryCameraSample | null = null;
  private dualCameraActive = false;
  private secondaryCameraLabel = '';

  // Debounced silent face-touch state
  private activeTouchRegion: FaceTouchRegion | 'neck' | null = null;
  private touchStartedMs = 0;
  private touchLoggedForHold = false;
  private lastTouchEndMs = 0;
  private recentFaceTouchRegion: FaceTouchRegion | null = null;
  private recentFaceTouchUntilMs = 0;

  // Debounced silent cervical relief-movement detectors
  private shoulderPeakWindow: Array<{ t: number; y: number }> = [];
  private neckTiltSinceMs: number | null = null;
  private lastReliefMs: Record<ReliefMoveKind, number> = {
    shoulderRoll: 0,
    neckTilt: 0,
    backShift: 0,
    neckRub: 0,
  };
  private recentReliefLabel: string | null = null;
  private recentReliefUntilMs = 0;

  private recentFaceTouchTimes: number[] = [];
  private recentReliefTimes: number[] = [];

  constructor(calibration: PostureCalibration) {
    this.applyCalibration(calibration);
    const savedStretch = loadPostureStretch();
    if (savedStretch) {
      this.postureState = savedStretch.postureState;
      this.boutStartWallMs = savedStretch.boutStartWallMs;
      this.lastPosturePersistWallMs = savedStretch.updatedAt;
    }
  }

  applyCalibration(cal: PostureCalibration): void {
    if (cal.neutralEyeSpan && cal.neutralEyeSpan > 0.04) {
      this.baseEyeSpan = cal.neutralEyeSpan;
      this.neutralSamples = 20;
    }
    if (cal.neutralShoulderSpan && cal.neutralShoulderSpan > 0.05) {
      this.baseShoulderSpan = cal.neutralShoulderSpan;
    }
    if (cal.neutralNeckGap !== null && cal.neutralNeckGap !== undefined) {
      this.baseNeckGap = cal.neutralNeckGap;
    }
    if (cal.neutralShoulderTilt !== null && cal.neutralShoulderTilt !== undefined) {
      this.baseShoulderTilt = cal.neutralShoulderTilt;
    }
    if (cal.neutralHeadRollDeg !== null && cal.neutralHeadRollDeg !== undefined) {
      this.baseHeadRoll = cal.neutralHeadRollDeg;
    }
  }

  private captureCurrentAnchors(): void {
    if (this.lastPrimaryFaceY !== null) {
      this.currentAnchorFaceY = this.lastPrimaryFaceY;
    }
    if (this.lastPrimaryBgHash) {
      this.currentAnchorBgHash = this.lastPrimaryBgHash;
    }
    if (this.lastSecondarySample) {
      this.currentAnchorSecHash = this.lastSecondarySample.edgeHash;
      this.currentAnchorSecMassY = this.lastSecondarySample.upperMassY;
    }
  }

  setPostureManual(
    next: PostureState,
    onLearn?: (patch: Partial<PostureCalibration>) => void,
    nowWallMs: number = Date.now()
  ): void {
    const prev = this.postureState;
    if (prev !== next) {
      // Save pre-switch anchor for previous posture if available, and new posture anchor
      if (onLearn && this.currentAnchorBgHash) {
        const prevPatch: Partial<PostureCalibration> =
          prev === 'sitting'
            ? {
                sitFaceY: this.currentAnchorFaceY,
                sitBgHash: this.currentAnchorBgHash,
                ...(this.currentAnchorSecHash ? { sitSecondaryHash: this.currentAnchorSecHash } : {}),
                ...(this.currentAnchorSecMassY !== null
                  ? { sitSecondaryMassY: this.currentAnchorSecMassY }
                  : {}),
              }
            : {
                standFaceY: this.currentAnchorFaceY,
                standBgHash: this.currentAnchorBgHash,
                ...(this.currentAnchorSecHash
                  ? { standSecondaryHash: this.currentAnchorSecHash }
                  : {}),
                ...(this.currentAnchorSecMassY !== null
                  ? { standSecondaryMassY: this.currentAnchorSecMassY }
                  : {}),
              };
        onLearn(prevPatch);
      }

      this.postureState = next;
      this.boutStartWallMs = nowWallMs;
      this.captureCurrentAnchors();

      if (onLearn && this.lastPrimaryBgHash) {
        const nextPatch: Partial<PostureCalibration> =
          next === 'sitting'
            ? {
                sitFaceY: this.lastPrimaryFaceY,
                sitBgHash: this.lastPrimaryBgHash,
                ...(this.lastSecondarySample
                  ? {
                      sitSecondaryHash: this.lastSecondarySample.edgeHash,
                      sitSecondaryMassY: this.lastSecondarySample.upperMassY,
                    }
                  : {}),
                updatedAt: nowWallMs,
              }
            : {
                standFaceY: this.lastPrimaryFaceY,
                standBgHash: this.lastPrimaryBgHash,
                ...(this.lastSecondarySample
                  ? {
                      standSecondaryHash: this.lastSecondarySample.edgeHash,
                      standSecondaryMassY: this.lastSecondarySample.upperMassY,
                    }
                  : {}),
                updatedAt: nowWallMs,
              };
        onLearn(nextPatch);
      }
    }
    this.postureSource = 'manual';
    this.pendingCandidate = null;
    this.pendingPrompt = null;
    this.posturePromptCooldownUntilWallMs = nowWallMs + POSTURE_COOLDOWN_AFTER_YES_MS;
    savePostureStretch(this.postureState, this.boutStartWallMs, nowWallMs);
    this.lastPosturePersistWallMs = nowWallMs;
  }

  /**
   * Handles the user's answer to the rare "Looks like you stood up / sat down" confirmation bar,
   * automatically updating both cameras' learned posture references so detection keeps improving.
   */
  resolvePosturePrompt(
    accepted: boolean,
    calibration: PostureCalibration,
    onLearn: (patch: Partial<PostureCalibration>) => void,
    onSwitched: (next: PostureState) => void,
    nowWallMs: number = Date.now()
  ): void {
    const prompt = this.pendingPrompt;
    this.pendingPrompt = null;
    this.pendingCandidate = null;

    if (!prompt) return;

    if (accepted) {
      const prev = this.postureState;
      const next = prompt.candidate;
      const patch: Partial<PostureCalibration> = {
        confirmedSwitches: (calibration.confirmedSwitches || 0) + 1,
        updatedAt: nowWallMs,
      };

      // Save previous posture anchor if not yet learned
      if (this.currentAnchorBgHash) {
        if (prev === 'sitting') {
          if (calibration.sitFaceY === null && this.currentAnchorFaceY !== null) {
            patch.sitFaceY = this.currentAnchorFaceY;
          }
          if (!calibration.sitBgHash) patch.sitBgHash = this.currentAnchorBgHash;
          if (!calibration.sitSecondaryHash && this.currentAnchorSecHash) {
            patch.sitSecondaryHash = this.currentAnchorSecHash;
            patch.sitSecondaryMassY = this.currentAnchorSecMassY;
          }
        } else {
          if (calibration.standFaceY === null && this.currentAnchorFaceY !== null) {
            patch.standFaceY = this.currentAnchorFaceY;
          }
          if (!calibration.standBgHash) patch.standBgHash = this.currentAnchorBgHash;
          if (!calibration.standSecondaryHash && this.currentAnchorSecHash) {
            patch.standSecondaryHash = this.currentAnchorSecHash;
            patch.standSecondaryMassY = this.currentAnchorSecMassY;
          }
        }
      }

      // Save newly confirmed posture's fresh dual-camera snapshot
      if (next === 'sitting') {
        if (this.lastPrimaryFaceY !== null) patch.sitFaceY = this.lastPrimaryFaceY;
        if (this.lastPrimaryBgHash) patch.sitBgHash = this.lastPrimaryBgHash;
        if (this.lastSecondarySample) {
          patch.sitSecondaryHash = this.lastSecondarySample.edgeHash;
          patch.sitSecondaryMassY = this.lastSecondarySample.upperMassY;
        }
      } else {
        if (this.lastPrimaryFaceY !== null) patch.standFaceY = this.lastPrimaryFaceY;
        if (this.lastPrimaryBgHash) patch.standBgHash = this.lastPrimaryBgHash;
        if (this.lastSecondarySample) {
          patch.standSecondaryHash = this.lastSecondarySample.edgeHash;
          patch.standSecondaryMassY = this.lastSecondarySample.upperMassY;
        }
      }

      this.postureState = next;
      this.postureSource = 'auto';
      this.boutStartWallMs = nowWallMs;
      this.captureCurrentAnchors();
      this.posturePromptCooldownUntilWallMs = nowWallMs + POSTURE_COOLDOWN_AFTER_YES_MS;
      savePostureStretch(this.postureState, this.boutStartWallMs, nowWallMs);
      this.lastPosturePersistWallMs = nowWallMs;
      onLearn(patch);
      onSwitched(next);
    } else {
      // User said "No, still sitting/standing" -> learn this view as the current posture & back off 10 min!
      const cur = this.postureState;
      const patch: Partial<PostureCalibration> = { updatedAt: nowWallMs };
      if (cur === 'sitting') {
        if (this.lastPrimaryFaceY !== null) patch.sitFaceY = this.lastPrimaryFaceY;
        if (this.lastPrimaryBgHash) patch.sitBgHash = this.lastPrimaryBgHash;
        if (this.lastSecondarySample) {
          patch.sitSecondaryHash = this.lastSecondarySample.edgeHash;
          patch.sitSecondaryMassY = this.lastSecondarySample.upperMassY;
        }
      } else {
        if (this.lastPrimaryFaceY !== null) patch.standFaceY = this.lastPrimaryFaceY;
        if (this.lastPrimaryBgHash) patch.standBgHash = this.lastPrimaryBgHash;
        if (this.lastSecondarySample) {
          patch.standSecondaryHash = this.lastSecondarySample.edgeHash;
          patch.standSecondaryMassY = this.lastSecondarySample.upperMassY;
        }
      }
      this.captureCurrentAnchors();
      this.posturePromptCooldownUntilWallMs = nowWallMs + POSTURE_COOLDOWN_AFTER_NO_MS;
      onLearn(patch);
    }
  }

  snoozeSuggestion(minutes = 12, nowWallMs: number = Date.now()): void {
    this.cooldownUntilMs = nowWallMs + minutes * 60 * 1000;
    this.aboveThresholdSec = 0;
  }

  markCalmingCompleted(nowWallMs: number = Date.now()): void {
    this.cooldownUntilMs = nowWallMs + SUGGEST_COOLDOWN_MS;
    this.aboveThresholdSec = 0;
    this.restlessnessEma = Math.max(22, this.restlessnessEma - 24);
  }

  resetSession(calibration: PostureCalibration): void {
    this.samples = [];
    this.mouthWindow = [];
    this.prevHead = null;
    this.prevShoulderY = null;
    this.prevShoulderSpan = null;
    this.aboveThresholdSec = 0;
    this.restlessnessEma = 24;
    this.forwardLeanEma = 0;
    this.shoulderGuardEma = 0;
    this.boutStartWallMs = Date.now();
    this.pendingCandidate = null;
    this.pendingPrompt = null;
    this.posturePromptCooldownUntilWallMs = Date.now() + 20_000; // give 20s to settle after pressing Begin
    this.currentAnchorFaceY = null;
    this.currentAnchorBgHash = null;
    this.currentAnchorSecHash = null;
    this.currentAnchorSecMassY = null;
    this.lastPrimaryFaceY = null;
    this.lastPrimaryBgHash = null;
    this.lastSecondarySample = null;
    this.activeTouchRegion = null;
    this.touchLoggedForHold = false;
    this.shoulderPeakWindow = [];
    this.neckTiltSinceMs = null;
    this.neutralSamples = 0;
    this.lastAudioVisualSpeakMs = 0;
    this.lastVisualSpeakMs = 0;
    this.applyCalibration(calibration);
  }

  getState(
    settings: StillSettings,
    nowWallMs: number = Date.now(),
    nowPerfMs: number = performance.now(),
    inMeetingMode = false
  ): LiveRhythmState {
    const score = Math.round(Math.max(0, Math.min(100, this.restlessnessEma)));
    const level =
      score >= settings.restlessnessThreshold
        ? 'restless'
        : score >= Math.max(42, settings.restlessnessThreshold - 16)
          ? 'stirring'
          : 'settled';

    const audioVisualActive =
      this.lastAudioVisualSpeakMs > 0 &&
      nowPerfMs - this.lastAudioVisualSpeakMs <= AUDIO_VISUAL_SPEAK_GRACE_MS;
    const visualActive =
      this.lastVisualSpeakMs > 0 &&
      nowPerfMs - this.lastVisualSpeakMs <= VISUAL_ONLY_SPEAK_GRACE_MS;
    const isSpeaking = audioVisualActive || visualActive;
    const speakingSource: 'audio-visual' | 'visual' | 'none' = audioVisualActive
      ? 'audio-visual'
      : visualActive
        ? 'visual'
        : 'none';

    const boutSeconds = Math.max(0, Math.floor((nowWallMs - this.boutStartWallMs) / 1000));
    const suggestCalming =
      !inMeetingMode &&
      !isSpeaking &&
      settings.restlessnessSuggestionsEnabled &&
      this.aboveThresholdSec >= SUGGEST_SUSTAIN_SEC &&
      nowWallMs >= this.cooldownUntilMs;

    const match = this.pickBestTechnique(settings, boutSeconds, nowWallMs);

    // Auto-expire ignored posture confirmation prompt after 22s
    if (
      this.pendingPrompt &&
      nowWallMs - this.pendingPrompt.createdAt >= POSTURE_PROMPT_AUTO_DISMISS_MS
    ) {
      this.pendingPrompt = null;
      this.posturePromptCooldownUntilWallMs = nowWallMs + POSTURE_COOLDOWN_AFTER_YES_MS;
    }

    const voiceStatus: VoiceComfortStatus =
      this.lastVoiceSample.micState === 'active' ? this.lastVoiceSample.status : 'off';

    return {
      restlessnessScore: score,
      restlessnessLevel: level,
      restlessnessAboveThresholdSec: Math.round(this.aboveThresholdSec),
      suggestCalming,
      recommendedTechniqueId: match.id,
      recommendationReason: match.reason,
      postureState: this.postureState,
      postureSource: this.postureSource,
      boutSeconds,
      forwardLeanPct: Math.round(this.forwardLeanEma),
      shoulderGuardPct: Math.round(this.shoulderGuardEma),
      baselineReady: this.neutralSamples >= 10,
      recentReliefLabel: nowWallMs < this.recentReliefUntilMs ? this.recentReliefLabel : null,
      recentFaceTouchRegion:
        nowWallMs < this.recentFaceTouchUntilMs ? this.recentFaceTouchRegion : null,
      isSpeaking,
      speakingSource,
      voiceDb: this.lastVoiceSample.smoothedDb,
      voiceStatus,
      micState: this.lastVoiceSample.micState as MicState,
      dualCameraActive: this.dualCameraActive,
      secondaryCameraLabel: this.secondaryCameraLabel,
      pendingPosturePrompt: this.pendingPrompt,
    };
  }

  private pickBestTechnique(
    settings: StillSettings,
    boutSeconds: number,
    nowWallMs: number
  ): { id: CalmingTechniqueId; reason: string } {
    const recentTouches = this.recentFaceTouchTimes.filter(
      (t) => nowWallMs - t <= 10 * 60 * 1000
    ).length;
    const recentRelief = this.recentReliefTimes.filter(
      (t) => nowWallMs - t <= 12 * 60 * 1000
    ).length;

    if (
      settings.workContext === 'desk' &&
      this.postureState === 'sitting' &&
      boutSeconds >= Math.max(25, settings.sitWindowMinutes - 5) * 60
    ) {
      return {
        id: 'short-walk',
        reason: `You've been sitting for ${Math.round(boutSeconds / 60)} minutes — rising or taking a 2-minute walk helps settle restlessness and ease neck pressure.`,
      };
    }

    if (recentRelief >= 2 || this.shoulderGuardEma >= 35 || this.forwardLeanEma >= 16) {
      return {
        id: 'hands-jaw-release',
        reason:
          'Your shoulders and posture look a bit tight — releasing tension through your hands and jaw calms your body without straining your neck.',
      };
    }

    if (recentTouches >= 3) {
      return {
        id: 'cyclic-sigh',
        reason:
          'Frequent face touches often show up during heavy mental load — a 60-second double-inhale sigh is the fastest way to settle your nervous system.',
      };
    }

    return {
      id: 'cyclic-sigh',
      reason:
        'A few slow double-inhale sighs with long exhales gently tell your body to downshift.',
    };
  }

  step(
    frame: FrameGeometry,
    dtSec: number,
    settings: StillSettings,
    calibration: PostureCalibration,
    context: RhythmStepContext,
    callbacks: RhythmStepCallbacks,
    nowMs: number = performance.now(),
    nowWallMs: number = Date.now()
  ): LiveRhythmState {
    const ub = frame.upperBody;
    this.lastVoiceSample = context.voice;
    this.dualCameraActive = context.dualCameraActive;
    this.secondaryCameraLabel = context.secondaryCameraLabel;
    if (context.secondaryCam) {
      this.lastSecondarySample = context.secondaryCam;
    }

    if (!frame.facePresent || !ub.headCenter) {
      this.aboveThresholdSec = Math.max(0, this.aboveThresholdSec - dtSec * 0.6);
      this.activeTouchRegion = null;
      this.touchLoggedForHold = false;
      this.neckTiltSinceMs = null;
      return this.getState(settings, nowWallMs, nowMs, context.inMeetingMode);
    }

    this.lastPrimaryFaceY = ub.headCenter.y;
    if (ub.bgHash) {
      this.lastPrimaryBgHash = ub.bgHash;
    }

    // Capture initial anchors once settled after session start
    if (this.currentAnchorBgHash === null && ub.bgHash && this.neutralSamples >= 4) {
      this.captureCurrentAnchors();
    }

    // 1. Auto-learn personal neutral posture over the first ~14 calm frames
    if (this.neutralSamples < 14 && !frame.handInZone && !frame.usingOcclusionCache) {
      const n = this.neutralSamples;
      this.baseEyeSpan = (this.baseEyeSpan * n + frame.eyeSpan) / (n + 1);
      this.baseHeadRoll = (this.baseHeadRoll * n + ub.headRollDeg) / (n + 1);
      this.baseTension = (this.baseTension * n + ub.facialTension) / (n + 1);
      if (ub.shoulderSpan !== null && ub.shoulderTilt !== null && ub.neckGap !== null) {
        if (this.baseShoulderSpan === 0) {
          this.baseShoulderSpan = ub.shoulderSpan;
          this.baseShoulderTilt = ub.shoulderTilt;
          this.baseNeckGap = ub.neckGap;
        } else {
          this.baseShoulderSpan = this.baseShoulderSpan * 0.85 + ub.shoulderSpan * 0.15;
          this.baseShoulderTilt = this.baseShoulderTilt * 0.85 + ub.shoulderTilt * 0.15;
          this.baseNeckGap = this.baseNeckGap * 0.85 + ub.neckGap * 0.15;
        }
      }
      this.neutralSamples += 1;
    }

    // 2. Audio-Visual & Visual Talking Detection (zero recording, 100% local)
    if (!frame.usingOcclusionCache) {
      this.mouthWindow.push({ t: nowMs, open: ub.mouthOpenRatio });
      while (this.mouthWindow.length > 0 && nowMs - this.mouthWindow[0].t > 5500) {
        this.mouthWindow.shift();
      }

      // Count repeated mouth open/close articulation deltas over rolling 5.5s window
      let articulationSum = 0;
      let transitions = 0;
      for (let i = 1; i < this.mouthWindow.length; i++) {
        const delta = Math.abs(this.mouthWindow[i].open - this.mouthWindow[i - 1].open);
        if (delta >= 0.032) {
          articulationSum += delta;
          transitions += 1;
        }
      }

      const lipMoving = transitions >= 2 || articulationSum >= 0.12 || ub.mouthOpenRatio >= 0.16;

      if (context.voice.micState === 'active') {
        // Gold-standard Audio-Visual Voice Activity: mic speech band + lip movement!
        if (context.voice.voiceBandActive && lipMoving) {
          this.lastAudioVisualSpeakMs = nowMs;
        } else if (context.voice.voiceBandActive && context.voice.smoothedDb >= settings.voiceComfortMinDb + 4 && ub.mouthOpenRatio >= 0.08) {
          this.lastAudioVisualSpeakMs = nowMs;
        }
      } else {
        // Camera-only graceful fallback: require clear repeated mouth oscillation (not a single yawn/sip)
        if (transitions >= 4 && articulationSum >= 0.24) {
          this.lastVisualSpeakMs = nowMs;
        }
      }
    }

    const isSpeakingNow =
      (this.lastAudioVisualSpeakMs > 0 &&
        nowMs - this.lastAudioVisualSpeakMs <= AUDIO_VISUAL_SPEAK_GRACE_MS) ||
      (this.lastVisualSpeakMs > 0 &&
        nowMs - this.lastVisualSpeakMs <= VISUAL_ONLY_SPEAK_GRACE_MS);

    const conversationalPause = context.inMeetingMode || isSpeakingNow;

    // 3. Measure micro-fidget kinematics for Restlessness Index
    let headSpeed = 0;
    if (this.prevHead && !frame.usingOcclusionCache) {
      const dx = ub.headCenter.x - this.prevHead.x;
      const dy = ub.headCenter.y - this.prevHead.y;
      const normDist = Math.hypot(dx, dy) / Math.max(0.05, frame.eyeSpan);
      const rawSpeed = normDist / Math.max(0.12, dtSec);
      headSpeed = rawSpeed < 0.035 ? 0 : Math.min(0.85, rawSpeed - 0.035);
    }
    this.prevHead = ub.headCenter;

    let shoulderSpeed = 0;
    if (ub.shoulderMidY !== null && this.prevShoulderY !== null) {
      const dy = Math.abs(ub.shoulderMidY - this.prevShoulderY) / Math.max(0.12, dtSec);
      shoulderSpeed = dy < 0.015 ? 0 : Math.min(0.4, dy - 0.015);
    }

    // Only count hands toward restlessness when drifting near face/neck/brow — NOT open talking gestures!
    const handFidgeting = Boolean(frame.handInZone || ub.handNearFaceRegion !== null);
    const tensionDelta = Math.max(0, ub.facialTension - this.baseTension);

    this.samples.push({
      t: nowMs,
      headSpeed: conversationalPause ? 0 : headSpeed,
      shoulderSpeed: conversationalPause ? 0 : shoulderSpeed,
      handFidgeting: conversationalPause ? false : handFidgeting,
      tension: conversationalPause ? 0 : tensionDelta,
      dampened: conversationalPause,
    });
    while (this.samples.length > 0 && nowMs - this.samples[0].t > MOTION_WINDOW_MS) {
      this.samples.shift();
    }

    if (conversationalPause) {
      // Gently settle restlessness while speaking or in a meeting so calls never inflate it
      this.restlessnessEma = this.restlessnessEma * 0.96 + 24 * 0.04;
      this.aboveThresholdSec = Math.max(0, this.aboveThresholdSec - dtSec * 1.5);
    } else if (this.samples.length >= 6) {
      let headSum = 0;
      let headBursts = 0;
      let shoulderSum = 0;
      let handFrames = 0;
      let tensionSum = 0;
      for (const s of this.samples) {
        headSum += s.headSpeed;
        if (s.headSpeed > 0.14) headBursts += 1;
        shoulderSum += s.shoulderSpeed;
        if (s.handFidgeting) handFrames += 1;
        tensionSum += s.tension;
      }
      const n = this.samples.length;
      const headComponent = Math.min(44, (headSum / n) * 145 + (headBursts / n) * 28);
      const shoulderComponent = Math.min(24, (shoulderSum / n) * 260);
      const handComponent = Math.min(18, (handFrames / n) * 42);
      const tensionComponent = Math.min(16, (tensionSum / n) * 58);

      const rawRestless = Math.min(
        100,
        14 + headComponent + shoulderComponent + handComponent + tensionComponent
      );
      this.restlessnessEma = this.restlessnessEma * 0.92 + rawRestless * 0.08;

      if (this.restlessnessEma >= settings.restlessnessThreshold) {
        this.aboveThresholdSec = Math.min(600, this.aboveThresholdSec + dtSec);
      } else {
        this.aboveThresholdSec = Math.max(0, this.aboveThresholdSec - dtSec * 1.4);
      }
    }

    // 4. Silent Cervical Posture Drift & Comfort-Adjustment Detectors (NO alerts!)
    if (this.baseEyeSpan > 0.04) {
      let leanScore = 0;
      if (ub.shoulderSpan && this.baseShoulderSpan > 0.05) {
        const baseRatio = this.baseEyeSpan / this.baseShoulderSpan;
        const curRatio = frame.eyeSpan / ub.shoulderSpan;
        const ratioIncrease = Math.max(0, (curRatio - baseRatio) / Math.max(0.15, baseRatio));
        leanScore += ratioIncrease * 100;
      } else {
        const scaleIncrease = Math.max(0, (frame.eyeSpan - this.baseEyeSpan) / this.baseEyeSpan);
        leanScore += scaleIncrease * 100;
      }

      if (ub.neckGap !== null && this.baseNeckGap > 0.1) {
        const gapDrop = Math.max(0, (this.baseNeckGap - ub.neckGap) / this.baseNeckGap);
        leanScore = leanScore * 0.6 + gapDrop * 55;
      }
      const clampedLean = Math.min(35, Math.max(0, leanScore));
      this.forwardLeanEma = this.forwardLeanEma * 0.9 + clampedLean * 0.1;

      if (ub.shoulderTilt !== null) {
        const tiltDiff = Math.abs(ub.shoulderTilt - this.baseShoulderTilt);
        const gapDrop =
          ub.neckGap !== null && this.baseNeckGap > 0.1
            ? Math.max(0, (this.baseNeckGap - ub.neckGap) / this.baseNeckGap)
            : 0;
        const guardRaw = Math.min(100, tiltDiff * 240 + gapDrop * 90);
        this.shoulderGuardEma = this.shoulderGuardEma * 0.9 + guardRaw * 0.1;
      }
    }

    // 4a. Shoulder roll / shrug comfort adjustment detector
    if (ub.shoulderMidY !== null) {
      this.shoulderPeakWindow.push({ t: nowMs, y: ub.shoulderMidY });
      while (this.shoulderPeakWindow.length > 0 && nowMs - this.shoulderPeakWindow[0].t > 2600) {
        this.shoulderPeakWindow.shift();
      }
      if (
        this.shoulderPeakWindow.length >= 4 &&
        nowMs - this.lastReliefMs.shoulderRoll > RELIEF_COOLDOWN_MS
      ) {
        let minY = 1;
        let maxY = 0;
        for (const p of this.shoulderPeakWindow) {
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }
        const travel = maxY - minY;
        const endReturned =
          Math.abs(
            this.shoulderPeakWindow[this.shoulderPeakWindow.length - 1].y -
              this.shoulderPeakWindow[0].y
          ) <
          travel * 0.55;
        if (travel > 0.036 && endReturned) {
          this.lastReliefMs.shoulderRoll = nowMs;
          this.recentReliefTimes.push(nowWallMs);
          this.recentReliefLabel = 'Shoulder roll';
          this.recentReliefUntilMs = nowWallMs + 4000;
          callbacks.onReliefMove('shoulderRoll');
        }
      }

      // 4b. Back shift / lean-back adjustment detector
      if (
        ub.shoulderSpan !== null &&
        this.prevShoulderSpan !== null &&
        nowMs - this.lastReliefMs.backShift > RELIEF_COOLDOWN_MS &&
        nowMs - this.lastReliefMs.shoulderRoll > 3000
      ) {
        const spanDelta =
          Math.abs(ub.shoulderSpan - this.prevShoulderSpan) /
          Math.max(0.08, this.prevShoulderSpan);
        if (spanDelta > 0.13) {
          this.lastReliefMs.backShift = nowMs;
          this.recentReliefTimes.push(nowWallMs);
          this.recentReliefLabel = 'Back shift';
          this.recentReliefUntilMs = nowWallMs + 4000;
          callbacks.onReliefMove('backShift');
        }
      }
      this.prevShoulderY = ub.shoulderMidY;
      this.prevShoulderSpan = ub.shoulderSpan;
    }

    // 4c. Sustained lateral neck stretch / tilt hold detector
    const rollOffset = Math.abs(ub.headRollDeg - this.baseHeadRoll);
    if (rollOffset >= 12.5 && !frame.usingOcclusionCache) {
      if (this.neckTiltSinceMs === null) {
        this.neckTiltSinceMs = nowMs;
      } else if (
        nowMs - this.neckTiltSinceMs >= 1800 &&
        nowMs - this.lastReliefMs.neckTilt > RELIEF_COOLDOWN_MS
      ) {
        this.lastReliefMs.neckTilt = nowMs;
        this.recentReliefTimes.push(nowWallMs);
        this.recentReliefLabel = 'Neck tilt';
        this.recentReliefUntilMs = nowWallMs + 4000;
        callbacks.onReliefMove('neckTilt');
      }
    } else {
      this.neckTiltSinceMs = null;
    }

    // 5. Silent debounced Face-Touch & Neck-Rub detection (NO alerts!)
    const region = ub.handNearFaceRegion;
    if (region) {
      if (this.activeTouchRegion !== region) {
        this.activeTouchRegion = region;
        this.touchStartedMs = nowMs;
        this.touchLoggedForHold = false;
      } else if (!this.touchLoggedForHold) {
        const minHold = region === 'neck' ? NECK_RUB_MIN_MS : FACE_TOUCH_MIN_MS;
        if (nowMs - this.touchStartedMs >= minHold) {
          if (region === 'neck') {
            if (nowMs - this.lastReliefMs.neckRub > RELIEF_COOLDOWN_MS) {
              this.touchLoggedForHold = true;
              this.lastReliefMs.neckRub = nowMs;
              this.recentReliefTimes.push(nowWallMs);
              this.recentReliefLabel = 'Neck rub';
              this.recentReliefUntilMs = nowWallMs + 4000;
              callbacks.onReliefMove('neckRub');
            }
          } else if (nowMs - this.lastTouchEndMs >= FACE_TOUCH_COOLDOWN_MS) {
            this.touchLoggedForHold = true;
            this.recentFaceTouchTimes.push(nowWallMs);
            this.recentFaceTouchRegion = region;
            this.recentFaceTouchUntilMs = nowWallMs + 3500;
            callbacks.onFaceTouch(region);
          }
        }
      }
    } else {
      if (this.activeTouchRegion !== null) {
        this.lastTouchEndMs = nowMs;
      }
      this.activeTouchRegion = null;
      this.touchLoggedForHold = false;
    }

    if (this.recentFaceTouchTimes.length > 40) {
      this.recentFaceTouchTimes = this.recentFaceTouchTimes.filter(
        (t) => nowWallMs - t <= 15 * 60 * 1000
      );
    }
    if (this.recentReliefTimes.length > 40) {
      this.recentReliefTimes = this.recentReliefTimes.filter(
        (t) => nowWallMs - t <= 15 * 60 * 1000
      );
    }

    // 6. Dual-Camera Sit vs. Stand Detection + Rare Gentle Confirmation Prompt
    if (
      settings.workContext === 'desk' &&
      settings.sitStandGuidanceEnabled &&
      !this.pendingPrompt &&
      nowWallMs >= this.posturePromptCooldownUntilWallMs &&
      !frame.usingOcclusionCache
    ) {
      const opposite: PostureState = this.postureState === 'sitting' ? 'standing' : 'sitting';
      let candidate: PostureState | null = null;
      let reason = '';
      let highConfidenceLearned = false;

      // Mode A: Compare against learned / calibrated Sitting & Standing references (supports BOTH cameras!)
      const hasPrimaryFaceCal =
        calibration.sitFaceY !== null && calibration.standFaceY !== null;
      const hasPrimaryBgCal = Boolean(calibration.sitBgHash && calibration.standBgHash && ub.bgHash);
      const hasSecondaryCal = Boolean(
        calibration.sitSecondaryHash &&
          calibration.standSecondaryHash &&
          context.secondaryCam
      );

      if (hasPrimaryFaceCal || hasPrimaryBgCal || hasSecondaryCal) {
        let votesForOpposite = 0;
        let votesForCurrent = 0;

        if (hasPrimaryFaceCal) {
          const yGap = Math.abs(calibration.sitFaceY! - calibration.standFaceY!);
          if (yGap >= 0.08) {
            const dSit = Math.abs(ub.headCenter.y - calibration.sitFaceY!);
            const dStand = Math.abs(ub.headCenter.y - calibration.standFaceY!);
            if (Math.abs(dSit - dStand) >= yGap * 0.25) {
              const pick: PostureState = dStand < dSit ? 'standing' : 'sitting';
              if (pick === opposite) votesForOpposite += 1.4;
              else votesForCurrent += 1.4;
            }
          }
        }

        if (hasPrimaryBgCal) {
          const dSit = hashDistance(ub.bgHash, calibration.sitBgHash);
          const dStand = hashDistance(ub.bgHash, calibration.standBgHash);
          const sep = hashDistance(calibration.sitBgHash, calibration.standBgHash);
          if (sep > 0.14 && Math.abs(dSit - dStand) > sep * 0.22) {
            const pick: PostureState = dStand < dSit ? 'standing' : 'sitting';
            if (pick === opposite) votesForOpposite += 1.1;
            else votesForCurrent += 1.1;
          }
        }

        if (hasSecondaryCal && context.secondaryCam) {
          const dSit = hashDistance(context.secondaryCam.edgeHash, calibration.sitSecondaryHash);
          const dStand = hashDistance(
            context.secondaryCam.edgeHash,
            calibration.standSecondaryHash
          );
          const sep = hashDistance(calibration.sitSecondaryHash, calibration.standSecondaryHash);
          if (sep > 0.14 && Math.abs(dSit - dStand) > sep * 0.22) {
            const pick: PostureState = dStand < dSit ? 'standing' : 'sitting';
            if (pick === opposite) votesForOpposite += 1.3;
            else votesForCurrent += 1.3;
          }

          if (
            calibration.sitSecondaryMassY !== null &&
            calibration.standSecondaryMassY !== null
          ) {
            const mGap = Math.abs(
              calibration.sitSecondaryMassY - calibration.standSecondaryMassY
            );
            if (mGap >= 0.045) {
              const dmSit = Math.abs(
                context.secondaryCam.upperMassY - calibration.sitSecondaryMassY
              );
              const dmStand = Math.abs(
                context.secondaryCam.upperMassY - calibration.standSecondaryMassY
              );
              if (Math.abs(dmSit - dmStand) >= mGap * 0.25) {
                const pick: PostureState = dmStand < dmSit ? 'standing' : 'sitting';
                if (pick === opposite) votesForOpposite += 0.8;
                else votesForCurrent += 0.8;
              }
            }
          }
        }

        if (votesForOpposite >= 1.1 && votesForOpposite > votesForCurrent + 0.5) {
          candidate = opposite;
          reason = hasSecondaryCal ? 'Both cameras matched' : 'Camera angle matched';
          highConfidenceLearned =
            (calibration.confirmedSwitches || 0) >= 3 && votesForOpposite >= 2.1;
        }
      } else if (this.currentAnchorBgHash && ub.bgHash) {
        // Mode B: Zero-calibration transition detection!
        // Detects a clear, sustained vertical / background shift across 1 or 2 cameras without prior setup.
        const primaryBgShift = hashDistance(ub.bgHash, this.currentAnchorBgHash);
        const faceYShift =
          this.currentAnchorFaceY !== null
            ? Math.abs(ub.headCenter.y - this.currentAnchorFaceY)
            : 0;
        const secBgShift =
          this.currentAnchorSecHash && context.secondaryCam
            ? hashDistance(context.secondaryCam.edgeHash, this.currentAnchorSecHash)
            : 0;
        const secMassShift =
          this.currentAnchorSecMassY !== null && context.secondaryCam
            ? Math.abs(context.secondaryCam.upperMassY - this.currentAnchorSecMassY)
            : 0;

        const bothCamerasShifted =
          Boolean(this.currentAnchorSecHash && context.secondaryCam) &&
          primaryBgShift >= 0.34 &&
          (secBgShift >= 0.32 || secMassShift >= 0.065);

        const strongSingleShift =
          faceYShift >= 0.13 || (!this.currentAnchorSecHash && primaryBgShift >= 0.58);

        if (bothCamerasShifted || strongSingleShift) {
          candidate = opposite;
          reason = bothCamerasShifted ? 'Both cameras saw a height shift' : 'Desk height changed';
        }
      }

      if (candidate && candidate !== this.postureState) {
        if (this.pendingCandidate?.candidate === candidate) {
          if (nowMs - this.pendingCandidate.sinceMs >= POSTURE_CANDIDATE_CONFIRM_MS) {
            if (highConfidenceLearned) {
              // After 3+ confirmed switches with strong dual-camera agreement, switch automatically!
              this.postureState = candidate;
              this.postureSource = 'auto';
              this.boutStartWallMs = nowWallMs;
              this.captureCurrentAnchors();
              this.pendingCandidate = null;
              this.posturePromptCooldownUntilWallMs = nowWallMs + POSTURE_COOLDOWN_AFTER_YES_MS;
              savePostureStretch(this.postureState, this.boutStartWallMs, nowWallMs);
              this.lastPosturePersistWallMs = nowWallMs;
              callbacks.onPostureAutoSwitched(candidate);
            } else {
              // Show a single quiet, non-blocking confirmation bar in Today & PiP
              this.pendingPrompt = {
                candidate,
                reason: this.pendingCandidate.reason,
                createdAt: nowWallMs,
              };
              this.pendingCandidate = null;
            }
          }
        } else {
          this.pendingCandidate = { candidate, reason, sinceMs: nowMs };
        }
      } else {
        this.pendingCandidate = null;
      }
    }

    if (nowWallMs - this.lastPosturePersistWallMs >= 15_000) {
      savePostureStretch(this.postureState, this.boutStartWallMs, nowWallMs);
      this.lastPosturePersistWallMs = nowWallMs;
    }

    return this.getState(settings, nowWallMs, nowMs, context.inMeetingMode);
  }
}
