import type {
  CalmingTechniqueId,
  FaceTouchRegion,
  FrameGeometry,
  LiveRhythmState,
  PostureCalibration,
  PostureState,
  ReliefMoveKind,
  StillSettings,
} from '../types';

export interface RhythmStepCallbacks {
  onFaceTouch: (region: FaceTouchRegion) => void;
  onReliefMove: (kind: ReliefMoveKind) => void;
  onPostureAutoSwitched: (next: PostureState) => void;
}

interface MotionSample {
  t: number;
  headSpeed: number;
  shoulderSpeed: number;
  handNearUpper: boolean;
  tension: number;
}

const MOTION_WINDOW_MS = 45_000;
const SUGGEST_SUSTAIN_SEC = 18; // require sustained elevation before calmly offering a reset
const SUGGEST_COOLDOWN_MS = 12 * 60 * 1000; // avoid repeating suggestions for 12m after dismiss/reset
const FACE_TOUCH_MIN_MS = 450;
const FACE_TOUCH_COOLDOWN_MS = 3200;
const NECK_RUB_MIN_MS = 650;
const RELIEF_COOLDOWN_MS = 7500;
const AUTO_POSTURE_CONFIRM_MS = 3200;

function bgHashDistance(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return Infinity;
  let sum = 0;
  for (let i = 0; i < len; i++) {
    sum += Math.abs(a[i] - b[i]);
  }
  return sum / len;
}

/**
 * Transforms raw 4-FPS FrameGeometry into smooth, human-friendly live signals:
 * - Restlessness score (0-100) + context-matched calming recommendation
 * - Ambient Sitting vs. Standing detection (works for both fixed cameras & moving standing desks)
 * - Silent neck/shoulder comfort-adjustment detection (shoulder rolls, neck tilts, back shifts, neck rubs)
 * - Silent debounced face-touch event logging (chin, cheek, nose/mouth, forehead)
 */
export class RhythmSignalProcessor {
  private samples: MotionSample[] = [];
  private prevHead: { x: number; y: number } | null = null;
  private prevShoulderY: number | null = null;
  private prevShoulderSpan: number | null = null;

  // Auto-calibrated neutral baseline (refined during first ~14 steady frames or manual calibration)
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

  // Posture state
  private postureState: PostureState = 'sitting';
  private postureSource: 'auto' | 'manual' = 'manual';
  private boutStartWallMs = Date.now();
  private pendingAutoPosture: { candidate: PostureState; sinceMs: number } | null = null;

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

  // Recent silent signal counters (last 10 min) used only to match the best calming technique
  private recentFaceTouchTimes: number[] = [];
  private recentReliefTimes: number[] = [];

  constructor(calibration: PostureCalibration) {
    this.applyCalibration(calibration);
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

  setPostureManual(next: PostureState, nowWallMs: number = Date.now()): void {
    if (this.postureState !== next) {
      this.postureState = next;
      this.boutStartWallMs = nowWallMs;
    }
    this.postureSource = 'manual';
    this.pendingAutoPosture = null;
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
    this.prevHead = null;
    this.prevShoulderY = null;
    this.prevShoulderSpan = null;
    this.aboveThresholdSec = 0;
    this.restlessnessEma = 24;
    this.forwardLeanEma = 0;
    this.shoulderGuardEma = 0;
    this.boutStartWallMs = Date.now();
    this.pendingAutoPosture = null;
    this.activeTouchRegion = null;
    this.touchLoggedForHold = false;
    this.shoulderPeakWindow = [];
    this.neckTiltSinceMs = null;
    this.neutralSamples = 0;
    this.applyCalibration(calibration);
  }

  getState(settings: StillSettings, nowWallMs: number = Date.now()): LiveRhythmState {
    const score = Math.round(Math.max(0, Math.min(100, this.restlessnessEma)));
    const level =
      score >= settings.restlessnessThreshold
        ? 'restless'
        : score >= Math.max(42, settings.restlessnessThreshold - 16)
          ? 'stirring'
          : 'settled';

    const boutSeconds = Math.max(0, Math.floor((nowWallMs - this.boutStartWallMs) / 1000));
    const suggestCalming =
      settings.restlessnessSuggestionsEnabled &&
      this.aboveThresholdSec >= SUGGEST_SUSTAIN_SEC &&
      nowWallMs >= this.cooldownUntilMs;

    const match = this.pickBestTechnique(settings, boutSeconds, nowWallMs);

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
    };
  }

  private pickBestTechnique(
    settings: StillSettings,
    boutSeconds: number,
    nowWallMs: number
  ): { id: CalmingTechniqueId; reason: string } {
    const recentTouches = this.recentFaceTouchTimes.filter((t) => nowWallMs - t <= 10 * 60 * 1000).length;
    const recentRelief = this.recentReliefTimes.filter((t) => nowWallMs - t <= 12 * 60 * 1000).length;

    // 1. Long seated stretch -> posture change / short walk
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

    // 2. Noticeable shoulder/neck comfort adjustments -> neck-safe hands & jaw release
    if (recentRelief >= 2 || this.shoulderGuardEma >= 35 || this.forwardLeanEma >= 16) {
      return {
        id: 'hands-jaw-release',
        reason:
          'Your shoulders and posture look a bit tight — releasing tension through your hands and jaw calms your body without straining your neck.',
      };
    }

    // 3. Frequent face touches / high mental load -> Cyclic Sighing
    if (recentTouches >= 3) {
      return {
        id: 'cyclic-sigh',
        reason:
          'Frequent face touches often show up during heavy mental load — a 60-second double-inhale sigh is the fastest way to settle your nervous system.',
      };
    }

    // 4. Default highest-evidence fast desk reset -> Cyclic Sighing
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
    callbacks: RhythmStepCallbacks,
    nowMs: number = performance.now(),
    nowWallMs: number = Date.now()
  ): LiveRhythmState {
    const ub = frame.upperBody;

    if (!frame.facePresent || !ub.headCenter) {
      // Gently decay restlessness when stepped away
      this.aboveThresholdSec = Math.max(0, this.aboveThresholdSec - dtSec * 0.6);
      this.activeTouchRegion = null;
      this.touchLoggedForHold = false;
      this.neckTiltSinceMs = null;
      return this.getState(settings, nowWallMs);
    }

    // 1. Auto-learn personal neutral posture over the first ~14 calm frames if not manually calibrated
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

    // 2. Measure micro-fidget kinematics for Restlessness Index
    let headSpeed = 0;
    if (this.prevHead && !frame.usingOcclusionCache) {
      const dx = ub.headCenter.x - this.prevHead.x;
      const dy = ub.headCenter.y - this.prevHead.y;
      const normDist = Math.hypot(dx, dy) / Math.max(0.05, frame.eyeSpan);
      const rawSpeed = normDist / Math.max(0.12, dtSec);
      // Ignore tiny sensor jitter (< 0.03) and clamp huge deliberate walks/turns (> 0.9)
      headSpeed = rawSpeed < 0.035 ? 0 : Math.min(0.85, rawSpeed - 0.035);
    }
    this.prevHead = ub.headCenter;

    let shoulderSpeed = 0;
    if (ub.shoulderMidY !== null && this.prevShoulderY !== null) {
      const dy = Math.abs(ub.shoulderMidY - this.prevShoulderY) / Math.max(0.12, dtSec);
      shoulderSpeed = dy < 0.015 ? 0 : Math.min(0.4, dy - 0.015);
    }

    const handNearUpper = frame.fingertips.length > 0;
    const tensionDelta = Math.max(0, ub.facialTension - this.baseTension);

    this.samples.push({
      t: nowMs,
      headSpeed,
      shoulderSpeed,
      handNearUpper,
      tension: tensionDelta,
    });
    while (this.samples.length > 0 && nowMs - this.samples[0].t > MOTION_WINDOW_MS) {
      this.samples.shift();
    }

    if (this.samples.length >= 6) {
      let headSum = 0;
      let headBursts = 0;
      let shoulderSum = 0;
      let handFrames = 0;
      let tensionSum = 0;
      for (const s of this.samples) {
        headSum += s.headSpeed;
        if (s.headSpeed > 0.14) headBursts += 1;
        shoulderSum += s.shoulderSpeed;
        if (s.handNearUpper) handFrames += 1;
        tensionSum += s.tension;
      }
      const n = this.samples.length;
      const headComponent = Math.min(44, (headSum / n) * 145 + (headBursts / n) * 28);
      const shoulderComponent = Math.min(24, (shoulderSum / n) * 260);
      const handComponent = Math.min(18, (handFrames / n) * 34);
      const tensionComponent = Math.min(16, (tensionSum / n) * 58);

      const rawRestless = Math.min(
        100,
        14 + headComponent + shoulderComponent + handComponent + tensionComponent
      );
      this.restlessnessEma = this.restlessnessEma * 0.92 + rawRestless * 0.08;
    }

    if (this.restlessnessEma >= settings.restlessnessThreshold) {
      this.aboveThresholdSec = Math.min(600, this.aboveThresholdSec + dtSec);
    } else {
      this.aboveThresholdSec = Math.max(0, this.aboveThresholdSec - dtSec * 1.4);
    }

    // 3. Silent Cervical Posture Drift & Comfort-Adjustment Detectors (NO alerts!)
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

    // 3a. Shoulder roll / shrug comfort adjustment detector
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
          Math.abs(this.shoulderPeakWindow[this.shoulderPeakWindow.length - 1].y - this.shoulderPeakWindow[0].y) <
          travel * 0.55;
        if (travel > 0.036 && endReturned) {
          this.lastReliefMs.shoulderRoll = nowMs;
          this.recentReliefTimes.push(nowWallMs);
          this.recentReliefLabel = 'Shoulder roll';
          this.recentReliefUntilMs = nowWallMs + 4000;
          callbacks.onReliefMove('shoulderRoll');
        }
      }

      // 3b. Back shift / lean-back adjustment detector
      if (
        ub.shoulderSpan !== null &&
        this.prevShoulderSpan !== null &&
        nowMs - this.lastReliefMs.backShift > RELIEF_COOLDOWN_MS &&
        nowMs - this.lastReliefMs.shoulderRoll > 3000
      ) {
        const spanDelta = Math.abs(ub.shoulderSpan - this.prevShoulderSpan) / Math.max(0.08, this.prevShoulderSpan);
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

    // 3c. Sustained lateral neck stretch / tilt hold detector (1.8s–10s)
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

    // 4. Silent debounced Face-Touch & Neck-Rub detection (NO alerts!)
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

    // Prune rolling 15m event timestamps
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

    // 5. Passive Sit vs. Stand auto-detection (only in 'desk' mode when calibrated!)
    if (
      settings.workContext === 'desk' &&
      settings.sitStandGuidanceEnabled &&
      calibration.sitFaceY !== null &&
      calibration.standFaceY !== null
    ) {
      const yGap = Math.abs(calibration.sitFaceY - calibration.standFaceY);
      let candidate: PostureState | null = null;

      if (yGap >= 0.08) {
        // Stationary camera: faceY clearly separates sitting vs standing
        const dSit = Math.abs(ub.headCenter.y - calibration.sitFaceY);
        const dStand = Math.abs(ub.headCenter.y - calibration.standFaceY);
        if (Math.abs(dSit - dStand) >= yGap * 0.25) {
          candidate = dStand < dSit ? 'standing' : 'sitting';
        }
      } else if (calibration.sitBgHash && calibration.standBgHash && ub.bgHash) {
        // Moving sit-stand desk (Logitech camera rises with monitor): compare 16x12 background horizon!
        const dSit = bgHashDistance(ub.bgHash, calibration.sitBgHash);
        const dStand = bgHashDistance(ub.bgHash, calibration.standBgHash);
        const sep = bgHashDistance(calibration.sitBgHash, calibration.standBgHash);
        if (sep > 0.03 && Math.abs(dSit - dStand) > sep * 0.22) {
          candidate = dStand < dSit ? 'standing' : 'sitting';
        }
      }

      if (candidate && candidate !== this.postureState) {
        if (this.pendingAutoPosture?.candidate === candidate) {
          if (nowMs - this.pendingAutoPosture.sinceMs >= AUTO_POSTURE_CONFIRM_MS) {
            this.postureState = candidate;
            this.postureSource = 'auto';
            this.boutStartWallMs = nowWallMs;
            this.pendingAutoPosture = null;
            callbacks.onPostureAutoSwitched(candidate);
          }
        } else {
          this.pendingAutoPosture = { candidate, sinceMs: nowMs };
        }
      } else {
        this.pendingAutoPosture = null;
      }
    }

    return this.getState(settings, nowWallMs);
  }
}
