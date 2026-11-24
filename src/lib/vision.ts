import {
  FaceLandmarker,
  FilesetResolver,
  HandLandmarker,
  PoseLandmarker,
  type NormalizedLandmark,
} from '@mediapipe/tasks-vision';
import type {
  DelegateMode,
  DetectionZoneId,
  FaceTouchRegion,
  FrameGeometry,
  Point2D,
  UpperBodySnapshot,
  ZoneGeometry,
} from '../types';

const OCCLUSION_CACHE_MS = 1500;
const OCCLUSION_CACHE_WITH_HAND_MS = 5000;
const BASE_HALO_RATIO = 0.25;
const PINCH_RATIO_THRESHOLD = 0.62;

// MediaPipe 468-point Face Mesh landmark indices
const FACE_OVAL_IDX = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379,
  378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162,
  21, 54, 103, 67, 109,
];

const RIGHT_BROW_IDX = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
const LEFT_BROW_IDX = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276];
const RIGHT_EYE_IDX = [33, 160, 158, 133, 153, 144];
const LEFT_EYE_IDX = [362, 385, 387, 263, 373, 380];
const FOREHEAD_ARC_IDX = [21, 54, 103, 67, 109, 10, 338, 297, 332, 284, 251];

// Silent passive face-touch region anchors (completely separate from active Still brow alerts)
const CHIN_JAW_IDX = [152, 148, 176, 149, 377, 400, 378, 199, 175];
const CHEEK_LEFT_IDX = [425, 280, 352, 411, 346];
const CHEEK_RIGHT_IDX = [205, 50, 123, 187, 117];
const NOSE_MOUTH_IDX = [1, 4, 13, 14, 61, 291, 0, 17];
const FOREHEAD_CENTER_IDX = [10, 151, 9, 108, 337];

const OUTER_EYE_LEFT_IMG = 33;
const OUTER_EYE_RIGHT_IMG = 263;
const FOREHEAD_TOP = 10;
const CHIN_BOTTOM = 152;
const NOSE_BRIDGE = 6;

const TRACKED_HAND_INDICES = [4, 8, 12, 16, 7, 6, 3, 11];
const FACE_TOUCH_HAND_INDICES = [4, 8, 12, 9];

interface CachedFace {
  timestamp: number;
  faceOval: Point2D[];
  leftBrow: Point2D[];
  rightBrow: Point2D[];
  leftEye: Point2D[];
  rightEye: Point2D[];
  hairline: Point2D[];
  chinPoly: Point2D[];
  leftCheekPoly: Point2D[];
  rightCheekPoly: Point2D[];
  noseMouthPoly: Point2D[];
  foreheadPoly: Point2D[];
  chinPoint: Point2D;
  headCenter: Point2D;
  headRollDeg: number;
  faceHeight: number;
  eyeSpan: number;
  sideAngle: boolean;
}

interface CachedPose {
  timestamp: number;
  leftShoulder: Point2D | null;
  rightShoulder: Point2D | null;
  shoulderSpan: number | null;
  shoulderMidY: number | null;
  shoulderTilt: number | null;
}

export interface DetectOptions {
  zoneScale: number;
  activeZones: DetectionZoneId[];
  pinchFilterEnabled: boolean;
}

function resolveLocalUrl(relativePath: string): string {
  const base = window.location.href.split('#')[0].split('?')[0];
  const dir = base.endsWith('/') ? base : base.slice(0, base.lastIndexOf('/') + 1);
  return new URL(relativePath, dir).href;
}

function pickPoints(landmarks: NormalizedLandmark[], indices: number[]): Point2D[] {
  const out: Point2D[] = [];
  for (const idx of indices) {
    const lm = landmarks[idx];
    if (lm) out.push({ x: lm.x, y: lm.y });
  }
  return out;
}

function distIso(a: Point2D, b: Point2D, aspect: number): number {
  const dx = (a.x - b.x) * aspect;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function distPointToPolylineIso(
  p: Point2D,
  poly: Point2D[],
  aspect: number,
  closed: boolean
): number {
  if (poly.length === 0) return Infinity;
  if (poly.length === 1) return distIso(p, poly[0], aspect);

  let minD = Infinity;
  const px = p.x * aspect;
  const py = p.y;
  const segCount = closed ? poly.length : poly.length - 1;

  for (let i = 0; i < segCount; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const ax = a.x * aspect;
    const ay = a.y;
    const bx = b.x * aspect;
    const by = b.y;

    const abx = bx - ax;
    const aby = by - ay;
    const lenSq = abx * abx + aby * aby;
    let t = 0;
    if (lenSq > 1e-8) {
      t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lenSq));
    }
    const cx = ax + t * abx;
    const cy = ay + t * aby;
    const d = Math.hypot(px - cx, py - cy);
    if (d < minD) minD = d;
  }
  return minD;
}

function isHandPinching(hand: NormalizedLandmark[], aspect: number): boolean {
  const wrist = hand[0];
  const midMcp = hand[9];
  const thumbTip = hand[4];
  const indexTip = hand[8];
  const middleTip = hand[12];
  if (!wrist || !midMcp || !thumbTip || !indexTip) return true;

  const palmLen = Math.max(0.03, distIso(wrist, midMcp, aspect));
  const thumbIndex = distIso(thumbTip, indexTip, aspect) / palmLen;
  const thumbMiddle = middleTip ? distIso(thumbTip, middleTip, aspect) / palmLen : Infinity;

  return Math.min(thumbIndex, thumbMiddle) <= PINCH_RATIO_THRESHOLD;
}

function extractFacialTension(
  categories: Array<{ categoryName: string; score: number }> | undefined
): number {
  if (!categories || categories.length === 0) return 0;
  let browDownL = 0;
  let browDownR = 0;
  let squintL = 0;
  let squintR = 0;
  let mouthPressL = 0;
  let mouthPressR = 0;
  for (const c of categories) {
    switch (c.categoryName) {
      case 'browDownLeft':
        browDownL = c.score;
        break;
      case 'browDownRight':
        browDownR = c.score;
        break;
      case 'eyeSquintLeft':
        squintL = c.score;
        break;
      case 'eyeSquintRight':
        squintR = c.score;
        break;
      case 'mouthPressLeft':
        mouthPressL = c.score;
        break;
      case 'mouthPressRight':
        mouthPressR = c.score;
        break;
    }
  }
  const brow = (browDownL + browDownR) * 0.5;
  const squint = (squintL + squintR) * 0.5;
  const jaw = (mouthPressL + mouthPressR) * 0.5;
  return Math.min(1, brow * 0.5 + squint * 0.3 + jaw * 0.2);
}

export class LocalVisionEngine {
  private faceLandmarker: FaceLandmarker | null = null;
  private handLandmarker: HandLandmarker | null = null;
  private poseLandmarker: PoseLandmarker | null = null;
  private delegate: DelegateMode = null;
  private cachedFace: CachedFace | null = null;
  private cachedPose: CachedPose | null = null;
  private lastVideoTs = 0;
  private frameCounter = 0;
  private lastBgSampleMs = 0;
  private lastBgHash: number[] | null = null;
  private bgCanvas: HTMLCanvasElement | null = null;
  private consecutiveGpuErrors = 0;
  private initializing: Promise<void> | null = null;

  get activeDelegate(): DelegateMode {
    return this.delegate;
  }

  get isReady(): boolean {
    return this.faceLandmarker !== null && this.handLandmarker !== null;
  }

  get hasPoseModel(): boolean {
    return this.poseLandmarker !== null;
  }

  async init(): Promise<DelegateMode> {
    if (this.isReady) return this.delegate;
    if (this.initializing) {
      await this.initializing;
      return this.delegate;
    }

    this.initializing = this.loadWithFallback();
    try {
      await this.initializing;
      return this.delegate;
    } finally {
      this.initializing = null;
    }
  }

  private async loadWithFallback(forceCpu = false): Promise<void> {
    this.closeModels();

    const wasmRoot = resolveLocalUrl('wasm').replace(/\/$/, '');
    const faceModelUrl = resolveLocalUrl('models/face_landmarker.task');
    const handModelUrl = resolveLocalUrl('models/hand_landmarker.task');
    const poseModelUrl = resolveLocalUrl('models/pose_landmarker_lite.task');

    const vision = await FilesetResolver.forVisionTasks(wasmRoot);

    const tryDelegate = async (delegate: 'GPU' | 'CPU'): Promise<void> => {
      const face = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: faceModelUrl,
          delegate,
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        minFaceDetectionConfidence: 0.3,
        minFacePresenceConfidence: 0.3,
        minTrackingConfidence: 0.3,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: false,
      });

      try {
        const hand = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: handModelUrl,
            delegate,
          },
          runningMode: 'VIDEO',
          numHands: 2,
          minHandDetectionConfidence: 0.25,
          minHandPresenceConfidence: 0.25,
          minTrackingConfidence: 0.25,
        });

        // PoseLandmarker Lite is optional-graceful: if GPU fails for pose alone, fall back to CPU pose
        let pose: PoseLandmarker | null = null;
        try {
          pose = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: poseModelUrl,
              delegate,
            },
            runningMode: 'VIDEO',
            numPoses: 1,
            minPoseDetectionConfidence: 0.35,
            minPosePresenceConfidence: 0.35,
            minTrackingConfidence: 0.35,
          });
        } catch {
          try {
            pose = await PoseLandmarker.createFromOptions(vision, {
              baseOptions: {
                modelAssetPath: poseModelUrl,
                delegate: 'CPU',
              },
              runningMode: 'VIDEO',
              numPoses: 1,
              minPoseDetectionConfidence: 0.35,
              minPosePresenceConfidence: 0.35,
              minTrackingConfidence: 0.35,
            });
          } catch {
            pose = null;
          }
        }

        this.faceLandmarker = face;
        this.handLandmarker = hand;
        this.poseLandmarker = pose;
        this.delegate = delegate;
        this.consecutiveGpuErrors = 0;
      } catch (err) {
        face.close();
        throw err;
      }
    };

    if (!forceCpu) {
      try {
        await tryDelegate('GPU');
        return;
      } catch {
        // Silent graceful fallback to CPU delegate
      }
    }

    await tryDelegate('CPU');
  }

  /**
   * Samples a tiny 16x12 grayscale background-horizon fingerprint (top 40% & outer columns)
   * every ~1.5s so Sit vs. Stand detection works even when a Logitech camera rises with a standing desk.
   */
  private sampleBackgroundHash(video: HTMLVideoElement, nowMs: number): number[] | null {
    if (nowMs - this.lastBgSampleMs < 1500 && this.lastBgHash) {
      return this.lastBgHash;
    }
    this.lastBgSampleMs = nowMs;

    try {
      if (!this.bgCanvas) {
        this.bgCanvas = document.createElement('canvas');
        this.bgCanvas.width = 16;
        this.bgCanvas.height = 12;
      }
      const ctx = this.bgCanvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return this.lastBgHash;
      ctx.drawImage(video, 0, 0, 16, 12);
      const data = ctx.getImageData(0, 0, 16, 12).data;

      // Sample top 4 rows + outer 3 columns left/right (avoids center person silhouette)
      const vals: number[] = [];
      let sum = 0;
      for (let y = 0; y < 12; y++) {
        for (let x = 0; x < 16; x++) {
          const isBgBand = y < 4 || x < 3 || x >= 13;
          if (!isBgBand) continue;
          const idx = (y * 16 + x) * 4;
          const lum = (data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114) / 255;
          vals.push(lum);
          sum += lum;
        }
      }
      // Mean-normalize so minor exposure changes don't look like a desk height change
      const mean = vals.length > 0 ? sum / vals.length : 0.5;
      this.lastBgHash = vals.map((v) => Math.round((v - mean) * 1000) / 1000);
      return this.lastBgHash;
    } catch {
      return this.lastBgHash;
    }
  }

  detectFrame(
    video: HTMLVideoElement,
    options: DetectOptions,
    nowMs: number = performance.now()
  ): FrameGeometry | null {
    if (!this.faceLandmarker || !this.handLandmarker) return null;
    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      return null;
    }

    const ts = Math.max(Math.round(nowMs), this.lastVideoTs + 1);
    this.lastVideoTs = ts;
    this.frameCounter += 1;

    const aspect = video.videoWidth / video.videoHeight;

    let faceResult;
    let handResult;
    try {
      faceResult = this.faceLandmarker.detectForVideo(video, ts);
      handResult = this.handLandmarker.detectForVideo(video, ts);
      this.consecutiveGpuErrors = 0;
    } catch {
      this.consecutiveGpuErrors += 1;
      if (this.delegate === 'GPU' && this.consecutiveGpuErrors >= 3 && !this.initializing) {
        this.initializing = this.loadWithFallback(true).finally(() => {
          this.initializing = null;
        });
      }
      return null;
    }

    // Stagger PoseLandmarker Lite at ~2 FPS (every 2nd frame) for cool battery & low CPU
    if (this.poseLandmarker && this.frameCounter % 2 === 1) {
      try {
        const poseRes = this.poseLandmarker.detectForVideo(video, ts);
        const poseLms = poseRes.landmarks?.[0];
        if (poseLms && poseLms.length > 12) {
          const lS = poseLms[11];
          const rS = poseLms[12];
          const lVis = (lS.visibility ?? 1) > 0.35;
          const rVis = (rS.visibility ?? 1) > 0.35;
          if (lVis && rVis) {
            const leftShoulder = { x: lS.x, y: lS.y };
            const rightShoulder = { x: rS.x, y: rS.y };
            const shoulderSpan = Math.max(0.05, distIso(leftShoulder, rightShoulder, aspect));
            const shoulderMidY = (leftShoulder.y + rightShoulder.y) * 0.5;
            const shoulderTilt = (leftShoulder.y - rightShoulder.y) / shoulderSpan;
            this.cachedPose = {
              timestamp: nowMs,
              leftShoulder,
              rightShoulder,
              shoulderSpan,
              shoulderMidY,
              shoulderTilt,
            };
          }
        }
      } catch {
        // Pose errors never interrupt core Still face+hand awareness
      }
    }

    const activePose =
      this.cachedPose && nowMs - this.cachedPose.timestamp <= 3000 ? this.cachedPose : null;

    const hands = handResult.landmarks ?? [];
    const faceLandmarks = faceResult.faceLandmarks?.[0];
    const facialTension = extractFacialTension(faceResult.faceBlendshapes?.[0]?.categories);
    let usingOcclusionCache = false;
    let activeFace: CachedFace | null = null;

    if (faceLandmarks && faceLandmarks.length > 425) {
      const leftOuter = faceLandmarks[OUTER_EYE_LEFT_IMG];
      const rightOuter = faceLandmarks[OUTER_EYE_RIGHT_IMG];
      const foreheadTop = faceLandmarks[FOREHEAD_TOP];
      const chinBottom = faceLandmarks[CHIN_BOTTOM];
      const noseBridge = faceLandmarks[NOSE_BRIDGE] ?? foreheadTop;

      const rawEyeSpan = distIso(leftOuter, rightOuter, aspect);
      const faceHeight = distIso(foreheadTop, chinBottom, aspect);
      const heightEquivSpan = faceHeight * 0.68;
      const robustScale = Math.max(0.05, rawEyeSpan, heightEquivSpan);
      const sideAngle = heightEquivSpan > 0.04 && rawEyeSpan / heightEquivSpan < 0.82;

      const headRollDeg =
        (Math.atan2(rightOuter.y - leftOuter.y, (rightOuter.x - leftOuter.x) * aspect) * 180) /
        Math.PI;

      const forehead = pickPoints(faceLandmarks, FOREHEAD_ARC_IDX);
      const liftY = robustScale * 0.16;
      const hairline = forehead.map((p) => ({
        x: p.x,
        y: Math.max(0.01, p.y - liftY),
      }));

      activeFace = {
        timestamp: nowMs,
        faceOval: pickPoints(faceLandmarks, FACE_OVAL_IDX),
        leftBrow: pickPoints(faceLandmarks, LEFT_BROW_IDX),
        rightBrow: pickPoints(faceLandmarks, RIGHT_BROW_IDX),
        leftEye: pickPoints(faceLandmarks, LEFT_EYE_IDX),
        rightEye: pickPoints(faceLandmarks, RIGHT_EYE_IDX),
        hairline,
        chinPoly: pickPoints(faceLandmarks, CHIN_JAW_IDX),
        leftCheekPoly: pickPoints(faceLandmarks, CHEEK_LEFT_IDX),
        rightCheekPoly: pickPoints(faceLandmarks, CHEEK_RIGHT_IDX),
        noseMouthPoly: pickPoints(faceLandmarks, NOSE_MOUTH_IDX),
        foreheadPoly: pickPoints(faceLandmarks, FOREHEAD_CENTER_IDX),
        chinPoint: { x: chinBottom.x, y: chinBottom.y },
        headCenter: { x: noseBridge.x, y: noseBridge.y },
        headRollDeg,
        faceHeight,
        eyeSpan: robustScale,
        sideAngle,
      };
      this.cachedFace = activeFace;
    } else if (this.cachedFace) {
      const maxCacheMs =
        hands.length > 0 ? OCCLUSION_CACHE_WITH_HAND_MS : OCCLUSION_CACHE_MS;
      if (nowMs - this.cachedFace.timestamp <= maxCacheMs) {
        activeFace = this.cachedFace;
        usingOcclusionCache = true;
      } else {
        this.cachedFace = null;
      }
    }

    const sideBoost = activeFace?.sideAngle ? 1.15 : 1.0;
    const haloRadius = activeFace
      ? activeFace.eyeSpan * BASE_HALO_RATIO * options.zoneScale * sideBoost
      : 0;

    const activeZones: ZoneGeometry[] = [];
    const selected =
      options.activeZones.length > 0
        ? options.activeZones
        : (['left-brow', 'right-brow'] as DetectionZoneId[]);

    if (activeFace && haloRadius > 0) {
      if (selected.includes('left-brow')) {
        activeZones.push({
          id: 'left-brow',
          points: activeFace.leftBrow,
          closed: true,
          radius: haloRadius,
        });
      }
      if (selected.includes('right-brow')) {
        activeZones.push({
          id: 'right-brow',
          points: activeFace.rightBrow,
          closed: true,
          radius: haloRadius,
        });
      }
      if (selected.includes('lashes')) {
        activeZones.push(
          {
            id: 'lashes',
            points: activeFace.leftEye,
            closed: true,
            radius: haloRadius * 0.78,
          },
          {
            id: 'lashes',
            points: activeFace.rightEye,
            closed: true,
            radius: haloRadius * 0.78,
          }
        );
      }
      if (selected.includes('hairline')) {
        activeZones.push({
          id: 'hairline',
          points: activeFace.hairline,
          closed: false,
          radius: haloRadius * 1.15,
        });
      }
    }

    const fingertips: FrameGeometry['fingertips'] = [];
    let handInZone = false;
    let closestRatio: number | null = null;
    let handNearFaceRegion: FaceTouchRegion | 'neck' | null = null;

    for (let h = 0; h < hands.length; h++) {
      const hand = hands[h];
      const pinching = isHandPinching(hand, aspect);
      const passesPinch = !options.pinchFilterEnabled || pinching;

      for (const idx of TRACKED_HAND_INDICES) {
        const pt = hand[idx];
        if (!pt) continue;

        let inZone = false;
        if (activeZones.length > 0) {
          for (const zone of activeZones) {
            const d = distPointToPolylineIso(pt, zone.points, aspect, zone.closed);
            const ratio = d / zone.radius;
            if (closestRatio === null || ratio < closestRatio) {
              closestRatio = ratio;
            }
            if (d <= zone.radius && passesPinch) {
              inZone = true;
              handInZone = true;
            }
          }
        }

        if (idx === 4 || idx === 8 || idx === 12 || idx === 16 || inZone) {
          fingertips.push({
            x: pt.x,
            y: pt.y,
            inZone,
            handIndex: h,
            pinching,
          });
        }
      }

      // Silent passive face-touch & neck-rub region classification (only when not triggering brow alert)
      if (activeFace && !handInZone && handNearFaceRegion === null) {
        const touchRadius = activeFace.eyeSpan * 0.26;
        const neckTop = activeFace.chinPoint.y + activeFace.faceHeight * 0.08;
        const neckBottom = activeFace.chinPoint.y + activeFace.faceHeight * 0.78;
        const neckHalfW = activeFace.eyeSpan * 0.72;

        for (const idx of FACE_TOUCH_HAND_INDICES) {
          const pt = hand[idx];
          if (!pt) continue;

          // Check neck / upper trapezius rub first (distinct cervical comfort signal)
          if (
            pt.y >= neckTop &&
            pt.y <= neckBottom &&
            Math.abs((pt.x - activeFace.chinPoint.x) * aspect) <= neckHalfW
          ) {
            handNearFaceRegion = 'neck';
            break;
          }

          if (distPointToPolylineIso(pt, activeFace.chinPoly, aspect, false) <= touchRadius) {
            handNearFaceRegion = 'chin';
            break;
          }
          if (
            distPointToPolylineIso(pt, activeFace.leftCheekPoly, aspect, false) <= touchRadius ||
            distPointToPolylineIso(pt, activeFace.rightCheekPoly, aspect, false) <= touchRadius
          ) {
            handNearFaceRegion = 'cheek';
            break;
          }
          if (distPointToPolylineIso(pt, activeFace.noseMouthPoly, aspect, false) <= touchRadius * 0.9) {
            handNearFaceRegion = 'noseMouth';
            break;
          }
          if (distPointToPolylineIso(pt, activeFace.foreheadPoly, aspect, false) <= touchRadius * 0.8) {
            handNearFaceRegion = 'forehead';
            break;
          }
        }
      }
    }

    const neckGap =
      activeFace && activePose?.shoulderMidY !== null && activePose?.shoulderMidY !== undefined
        ? (activePose.shoulderMidY - activeFace.chinPoint.y) / Math.max(0.05, activeFace.eyeSpan)
        : null;

    const upperBody: UpperBodySnapshot = {
      posePresent: activePose !== null,
      leftShoulder: activePose?.leftShoulder ?? null,
      rightShoulder: activePose?.rightShoulder ?? null,
      shoulderSpan: activePose?.shoulderSpan ?? null,
      shoulderMidY: activePose?.shoulderMidY ?? null,
      shoulderTilt: activePose?.shoulderTilt ?? null,
      neckGap,
      headCenter: activeFace?.headCenter ?? null,
      headRollDeg: activeFace?.headRollDeg ?? 0,
      facialTension,
      handNearFaceRegion,
      bgHash: this.sampleBackgroundHash(video, nowMs),
    };

    return {
      videoWidth: video.videoWidth,
      videoHeight: video.videoHeight,
      facePresent: activeFace !== null,
      usingOcclusionCache,
      sideAngle: Boolean(activeFace?.sideAngle),
      faceOval: activeFace?.faceOval ?? [],
      leftEye: activeFace?.leftEye ?? [],
      rightEye: activeFace?.rightEye ?? [],
      activeZones,
      eyeSpan: activeFace?.eyeSpan ?? 0,
      haloRadius,
      fingertips,
      handInZone,
      closestRatio,
      upperBody,
    };
  }

  resetCache(): void {
    this.cachedFace = null;
    this.cachedPose = null;
    this.lastBgHash = null;
  }

  private closeModels(): void {
    try {
      this.faceLandmarker?.close();
    } catch {
      // ignore
    }
    try {
      this.handLandmarker?.close();
    } catch {
      // ignore
    }
    try {
      this.poseLandmarker?.close();
    } catch {
      // ignore
    }
    this.faceLandmarker = null;
    this.handLandmarker = null;
    this.poseLandmarker = null;
  }

  dispose(): void {
    this.closeModels();
    this.resetCache();
  }
}

export async function checkModelsCached(): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  try {
    const cacheNames = await caches.keys();
    for (const name of cacheNames) {
      const cache = await caches.open(name);
      const keys = await cache.keys();
      const hasFace = keys.some((r) => r.url.includes('face_landmarker.task'));
      const hasHand = keys.some((r) => r.url.includes('hand_landmarker.task'));
      if (hasFace && hasHand) return true;
    }
  } catch {
    // ignore
  }
  return false;
}
