export interface SecondaryCameraSample {
  edgeHash: number[];
  upperMassY: number; // 0..1 vertical center-of-contrast for upper torso / head shift
}

/**
 * Computes a lighting-resistant 16x12 background & structure gradient fingerprint from any video element.
 * Uses normalized horizontal + vertical luminance differences so sunlight/cloud exposure changes
 * don't look like raising or lowering a standing desk.
 */
export function computeLightingResistantEdgeHash(
  video: HTMLVideoElement,
  scratchCanvas: HTMLCanvasElement
): SecondaryCameraSample | null {
  if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
    return null;
  }

  try {
    const W = 16;
    const H = 12;
    if (scratchCanvas.width !== W || scratchCanvas.height !== H) {
      scratchCanvas.width = W;
      scratchCanvas.height = H;
    }
    const ctx = scratchCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0, W, H);
    const data = ctx.getImageData(0, 0, W, H).data;

    const lum = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const p = i * 4;
      lum[i] = (data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114) / 255;
    }

    // 1. Sample top 4 rows + outer 3 columns left/right using both mean-normalized luminance
    //    AND vertical/horizontal edge gradients (resistant to brightness drift).
    const rawVals: number[] = [];
    let meanLum = 0;
    let countLum = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (y < 4 || x < 3 || x >= W - 3) {
          meanLum += lum[y * W + x];
          countLum += 1;
        }
      }
    }
    meanLum = countLum > 0 ? meanLum / countLum : 0.5;

    let stdSum = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (y < 4 || x < 3 || x >= W - 3) {
          const d = lum[y * W + x] - meanLum;
          stdSum += d * d;
        }
      }
    }
    const std = Math.max(0.04, Math.sqrt(stdSum / Math.max(1, countLum)));

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!(y < 4 || x < 3 || x >= W - 3)) continue;
        const cur = lum[y * W + x];
        const normLum = (cur - meanLum) / std;
        const right = x + 1 < W ? lum[y * W + (x + 1)] : cur;
        const down = y + 1 < H ? lum[(y + 1) * W + x] : cur;
        const grad = ((right - cur) + (down - cur)) / std;
        rawVals.push(Math.round((normLum * 0.5 + grad * 0.5) * 100) / 100);
      }
    }

    // 2. Vertical center-of-contrast in center region (tracks person/chair rising or dropping in side view)
    let weightedY = 0;
    let totalEnergy = 0;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 3; x < W - 3; x++) {
        const idx = y * W + x;
        const gx = Math.abs(lum[idx + 1] - lum[idx - 1]);
        const gy = Math.abs(lum[idx + W] - lum[idx - W]);
        const e = gx + gy;
        weightedY += (y / (H - 1)) * e;
        totalEnergy += e;
      }
    }
    const upperMassY = totalEnergy > 0.01 ? weightedY / totalEnergy : 0.5;

    return {
      edgeHash: rawVals,
      upperMassY: Math.round(upperMassY * 1000) / 1000,
    };
  } catch {
    return null;
  }
}

/**
 * Lightweight secondary-camera monitor (320x240 @ ~2 FPS) that runs alongside the primary desk camera
 * so Sit vs. Stand detection can cross-check BOTH views (e.g. Logitech + MacBook).
 */
export class DualCameraMonitor {
  private stream: MediaStream | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private lastSampleMs = 0;
  private lastSample: SecondaryCameraSample | null = null;
  private activeLabel = '';

  get isActive(): boolean {
    const track = this.stream?.getVideoTracks()[0];
    return Boolean(track && track.readyState === 'live');
  }

  get label(): string {
    return this.activeLabel;
  }

  async start(deviceId: string, label: string, videoEl: HTMLVideoElement): Promise<boolean> {
    this.stop();
    if (!deviceId || !navigator.mediaDevices?.getUserMedia) return false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: deviceId },
          width: { ideal: 320, max: 640 },
          height: { ideal: 240, max: 480 },
          frameRate: { ideal: 2, max: 5 },
        },
        audio: false,
      });

      this.stream = stream;
      this.videoEl = videoEl;
      this.activeLabel = stream.getVideoTracks()[0]?.label || label || 'Second camera';
      videoEl.srcObject = stream;
      videoEl.muted = true;
      videoEl.playsInline = true;
      await videoEl.play().catch(() => {});

      const track = stream.getVideoTracks()[0];
      if (track) {
        track.onended = () => {
          this.activeLabel = '';
        };
      }
      return true;
    } catch {
      this.stop();
      return false;
    }
  }

  sample(nowMs: number): SecondaryCameraSample | null {
    if (!this.isActive || !this.videoEl) return null;
    if (nowMs - this.lastSampleMs < 1400 && this.lastSample) {
      return this.lastSample;
    }
    this.lastSampleMs = nowMs;

    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = 16;
      this.canvas.height = 12;
    }
    const next = computeLightingResistantEdgeHash(this.videoEl, this.canvas);
    if (next) {
      this.lastSample = next;
    }
    return this.lastSample;
  }

  stop(): void {
    if (this.stream) {
      for (const t of this.stream.getTracks()) {
        try {
          t.stop();
        } catch {
          // ignore
        }
      }
      this.stream = null;
    }
    if (this.videoEl) {
      this.videoEl.srcObject = null;
      this.videoEl = null;
    }
    this.lastSample = null;
    this.activeLabel = '';
  }
}
