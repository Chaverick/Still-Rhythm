import { useCallback, useEffect, useRef, useState } from 'react';
import { getPipAudioTrack, setVideoPiPAudioActive } from '../lib/audio';
import { formatDuration } from '../lib/storage';
import type { EngineStatus, PiPKind, PostureState, RestlessnessLevel, ThemeMode, WorkContext } from '../types';

interface DocumentPiPApi {
  requestWindow: (opts?: { width?: number; height?: number }) => Promise<Window>;
  window?: Window | null;
}

interface WebKitVideoElement extends HTMLVideoElement {
  webkitSupportsPresentationMode?: (mode: string) => boolean;
  webkitSetPresentationMode?: (mode: string) => void;
  webkitPresentationMode?: string;
}

export interface PipCanvasState {
  theme: ThemeMode;
  userName: string;
  autoPipOnTabSwitch: boolean;
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
  // Still Rhythm ambient fields
  workContext: WorkContext;
  postureState: PostureState;
  boutSeconds: number;
  sitWindowMinutes: number;
  standWindowMinutes: number;
  restlessnessScore: number;
  restlessnessLevel: RestlessnessLevel;
}

export type AutoPipPermissionState = 'granted' | 'prompt' | 'denied' | 'unknown';

export function usePictureInPicture(
  canvasState: PipCanvasState,
  cameraVideoRef?: React.RefObject<HTMLVideoElement | null>
) {
  const [pipKind, setPipKind] = useState<PiPKind>('none');
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [pipContainer, setPipContainer] = useState<HTMLElement | null>(null);
  const [pipError, setPipError] = useState<string | null>(null);
  const [autoPipSupported, setAutoPipSupported] = useState(false);
  const [autoPipPermission, setAutoPipPermission] = useState<AutoPipPermissionState>('unknown');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pipVideoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const activePipVideoElRef = useRef<WebKitVideoElement | null>(null);
  const openingRef = useRef(false);
  const stateRef = useRef(canvasState);
  stateRef.current = canvasState;

  const isSupported =
    typeof window !== 'undefined' &&
    ('documentPictureInPicture' in window ||
      (typeof document !== 'undefined' &&
        (document.pictureInPictureEnabled ||
          typeof (HTMLVideoElement.prototype as WebKitVideoElement)
            .webkitSetPresentationMode === 'function')));

  const drawCanvasFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const s = stateRef.current;
    const w = canvas.width;
    const h = canvas.height;
    const isDark = s.theme === 'dark';
    const isRunning = s.status === 'running';
    const camBroken = isRunning && (s.cameraState !== 'live' || s.cameraStalled);
    const camActivelyDetecting = isRunning && !camBroken && s.detectCount > 0;
    const isAlert = s.stage2AlertOpen;
    const isStage1 = !camBroken && (s.stage1Glow || s.handInZone);
    const cleanName = s.userName.trim();

    const t = performance.now() / 1000;
    const pulse = 0.5 + 0.5 * Math.sin(t * (isAlert ? 3.2 : 2.2));

    ctx.fillStyle = isDark ? '#1A1917' : '#FAF9F5';
    ctx.fillRect(0, 0, w, h);

    if (isAlert || isStage1) {
      const grad = ctx.createRadialGradient(w / 2, h / 2, 16, w / 2, h / 2, w * 0.65);
      const alpha = isAlert ? 0.34 + 0.22 * pulse : 0.16 + 0.1 * pulse;
      grad.addColorStop(0, `rgba(232, 150, 74, ${alpha.toFixed(3)})`);
      grad.addColorStop(1, 'rgba(201, 100, 66, 0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      ctx.save();
      ctx.strokeStyle = isAlert
        ? `rgba(236, 156, 78, ${(0.72 + 0.28 * pulse).toFixed(3)})`
        : `rgba(217, 130, 68, ${(0.45 + 0.25 * pulse).toFixed(3)})`;
      ctx.lineWidth = isAlert ? 14 : 8;
      ctx.strokeRect(
        ctx.lineWidth / 2,
        ctx.lineWidth / 2,
        w - ctx.lineWidth,
        h - ctx.lineWidth
      );
      ctx.restore();
    }

    const ink = isDark ? '#F2EFE8' : '#1F1E1C';
    const inkMuted = isDark ? '#B2ACA1' : '#5C5952';
    const accent = isDark ? '#D97757' : '#C96442';
    const sage = isDark ? '#7DA388' : '#587B64';

    ctx.font = '500 20px Georgia, serif';
    ctx.fillStyle = ink;
    ctx.fillText('Still Rhythm', 28, 38);

    const boutMins = Math.floor(s.boutSeconds / 60);
    const postureTag =
      s.workContext === 'desk'
        ? `${s.postureState === 'standing' ? 'Standing' : 'Sitting'} · ${boutMins}m`
        : 'On the go';

    ctx.font = '500 13px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = camBroken ? accent : inkMuted;
    ctx.textAlign = 'right';
    ctx.fillText(isRunning ? postureTag : 'Session paused', w - 28, 36);
    ctx.textAlign = 'left';

    const pillX = 28;
    const pillY = 50;
    const pillW = w - 56;
    const pillH = 30;
    ctx.fillStyle = camBroken
      ? isDark
        ? 'rgba(217,119,87,0.18)'
        : 'rgba(201,100,66,0.12)'
      : camActivelyDetecting
        ? isDark
          ? 'rgba(125,163,136,0.18)'
          : 'rgba(88,123,100,0.12)'
        : isDark
          ? 'rgba(242,239,232,0.06)'
          : 'rgba(31,30,28,0.05)';
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillW, pillH, 8);
    ctx.fill();

    const dotX = pillX + 15;
    const dotY = pillY + pillH / 2;
    ctx.beginPath();
    ctx.arc(dotX, dotY, camActivelyDetecting ? 4.5 + 1.2 * pulse : 4.5, 0, Math.PI * 2);
    ctx.fillStyle = camBroken ? accent : camActivelyDetecting ? sage : inkMuted;
    ctx.fill();

    const confirmLine = !isRunning
      ? 'Camera off · Click Begin session'
      : camBroken
        ? 'Camera paused by browser · Return to tab'
        : camActivelyDetecting
          ? `Watching locally (${s.fps.toFixed(1)} FPS) · ${s.restlessnessLevel === 'restless' ? 'Restless' : s.restlessnessLevel === 'stirring' ? 'Stirring' : 'Settled'}`
          : 'Camera starting · Waiting for first frame…';

    ctx.font = '500 13px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = camBroken ? accent : camActivelyDetecting ? sage : inkMuted;
    ctx.fillText(confirmLine, pillX + 28, pillY + 20);

    const title = camBroken
      ? 'Detection paused'
      : isAlert
        ? cleanName
          ? `${cleanName} — hands down.`
          : 'Gentle pause — hands down.'
        : isStage1
          ? cleanName
            ? `${cleanName}, hand near zone · ${s.dwellSec.toFixed(1)}s`
            : `Hand near zone · ${s.dwellSec.toFixed(1)}s`
          : !isRunning
            ? 'Paused'
            : s.faceState === 'away'
              ? 'Waiting until you return'
              : s.restlessnessLevel === 'restless'
                ? 'A brief breath could help.'
                : 'Hands at ease.';

    ctx.font = '400 25px Georgia, serif';
    ctx.fillStyle = camBroken || isAlert ? accent : ink;
    ctx.fillText(title, 28, 126);

    const barX = 28;
    const barY = 144;
    const barW = w - 56;
    const barH = 7;
    const dwellPct = Math.min(1, s.dwellSec / Math.max(0.5, s.stage2DwellSec));
    ctx.fillStyle = isDark ? 'rgba(242,239,232,0.1)' : 'rgba(31,30,28,0.08)';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 4);
    ctx.fill();
    if (dwellPct > 0.01) {
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.roundRect(barX, barY, Math.max(8, Math.round(barW * dwellPct)), barH, 4);
      ctx.fill();
    }

    ctx.strokeStyle = isDark ? 'rgba(242,239,232,0.12)' : 'rgba(31,30,28,0.1)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(28, h - 76);
    ctx.lineTo(w - 28, h - 76);
    ctx.stroke();

    ctx.font = '500 12px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = inkMuted;
    ctx.fillText('CALM TODAY', 28, h - 50);
    ctx.fillText('REDIRECTED', 210, h - 50);

    ctx.font = '400 24px Georgia, serif';
    ctx.fillStyle = ink;
    ctx.fillText(formatDuration(s.calmSeconds), 28, h - 20);
    ctx.fillText(String(s.urgesRedirected), 210, h - 20);

    const vTrack = streamRef.current?.getVideoTracks()[0] as
      | (MediaStreamTrack & { requestFrame?: () => void })
      | undefined;
    try {
      vTrack?.requestFrame?.();
    } catch {
      // ignore
    }
  }, []);

  const primeCanvasVideo = useCallback(() => {
    const canvas = canvasRef.current;
    const video = pipVideoRef.current as WebKitVideoElement | null;
    if (!canvas || !video) return;

    drawCanvasFrame();

    if (!streamRef.current && typeof canvas.captureStream === 'function') {
      let canvasStream: MediaStream | null = null;
      try {
        canvasStream = canvas.captureStream(15);
      } catch {
        try {
          canvasStream = canvas.captureStream();
        } catch {
          return;
        }
      }
      if (canvasStream) {
        const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];
        const audioTrack = getPipAudioTrack();
        if (audioTrack) {
          tracks.push(audioTrack);
        }
        streamRef.current = new MediaStream(tracks);
      }
    }

    if (streamRef.current && video.srcObject !== streamRef.current) {
      video.srcObject = streamRef.current;
    }

    if (pipKind !== 'video') {
      video.muted = true;
    }
    video.playsInline = true;
    video.setAttribute('webkit-playsinline', 'true');
    video.setAttribute('playsinline', 'true');

    if (video.paused) {
      video.play().catch(() => {});
    }
  }, [drawCanvasFrame, pipKind]);

  useEffect(() => {
    if ('documentPictureInPicture' in window) return;

    primeCanvasVideo();

    const onFirstTouch = () => {
      primeCanvasVideo();
    };
    window.addEventListener('pointerdown', onFirstTouch, { passive: true, once: true });

    const keepAlive = window.setInterval(() => {
      if (streamRef.current) {
        drawCanvasFrame();
      }
    }, 1000);

    return () => {
      window.removeEventListener('pointerdown', onFirstTouch);
      window.clearInterval(keepAlive);
    };
  }, [drawCanvasFrame, primeCanvasVideo]);

  useEffect(() => {
    if (pipKind !== 'video') return;
    drawCanvasFrame();
  }, [
    pipKind,
    canvasState.stage1Glow,
    canvasState.stage2AlertOpen,
    canvasState.handInZone,
    canvasState.dwellSec,
    canvasState.urgesRedirected,
    canvasState.faceState,
    canvasState.cameraState,
    canvasState.cameraStalled,
    canvasState.detectCount,
    canvasState.calmSeconds,
    canvasState.postureState,
    canvasState.boutSeconds,
    canvasState.restlessnessLevel,
    drawCanvasFrame,
  ]);

  useEffect(() => {
    if (pipKind !== 'video') return;
    const timer = window.setInterval(drawCanvasFrame, 200);
    return () => window.clearInterval(timer);
  }, [pipKind, drawCanvasFrame]);

  useEffect(() => {
    if (pipWindow && !pipWindow.closed) {
      pipWindow.document.documentElement.setAttribute('data-theme', canvasState.theme);
    }
  }, [pipWindow, canvasState.theme]);

  const attachLeaveListeners = useCallback((video: WebKitVideoElement) => {
    activePipVideoElRef.current = video;

    const cleanupPiPAudio = () => {
      setVideoPiPAudioActive(false);
      video.muted = true;
    };

    const onLeave = () => {
      cleanupPiPAudio();
      setPipKind('none');
      activePipVideoElRef.current = null;
      video.removeEventListener('leavepictureinpicture', onLeave);
    };
    video.addEventListener('leavepictureinpicture', onLeave);

    const onWebKitChange = () => {
      if (video.webkitPresentationMode !== 'picture-in-picture') {
        cleanupPiPAudio();
        setPipKind('none');
        activePipVideoElRef.current = null;
        video.removeEventListener('webkitpresentationmodechanged', onWebKitChange);
      }
    };
    video.addEventListener('webkitpresentationmodechanged', onWebKitChange);
  }, []);

  const tryEnterVideoPiPSync = useCallback(
    async (video: WebKitVideoElement): Promise<{ ok: boolean; error?: string }> => {
      if (
        typeof video.webkitSupportsPresentationMode === 'function' &&
        typeof video.webkitSetPresentationMode === 'function' &&
        video.webkitSupportsPresentationMode('picture-in-picture')
      ) {
        try {
          attachLeaveListeners(video);
          video.webkitSetPresentationMode('picture-in-picture');
          return { ok: true };
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }

      if (typeof video.requestPictureInPicture === 'function') {
        try {
          attachLeaveListeners(video);
          await video.requestPictureInPicture();
          return { ok: true };
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }

      return { ok: false, error: 'PiP API not exposed on this video element' };
    },
    [attachLeaveListeners]
  );

  const closePiP = useCallback(async () => {
    setPipError(null);
    setVideoPiPAudioActive(false);
    if (pipVideoRef.current) {
      pipVideoRef.current.muted = true;
    }
    if (pipWindow && !pipWindow.closed) {
      pipWindow.close();
    }
    setPipWindow(null);
    setPipContainer(null);

    if (document.pictureInPictureElement) {
      try {
        await document.exitPictureInPicture();
      } catch {
        // ignore
      }
    }
    const activeVid =
      activePipVideoElRef.current ?? (pipVideoRef.current as WebKitVideoElement | null);
    if (activeVid?.webkitPresentationMode === 'picture-in-picture') {
      try {
        activeVid.webkitSetPresentationMode?.('inline');
      } catch {
        // ignore
      }
    }
    activePipVideoElRef.current = null;
    setPipKind('none');
  }, [pipWindow]);

  const openPiP = useCallback(
    async (opts?: { silent?: boolean }) => {
      const silent = Boolean(opts?.silent);
      if (openingRef.current) return;

      const docPiP = (window as unknown as { documentPictureInPicture?: DocumentPiPApi })
        .documentPictureInPicture;

      // Avoid close-and-reopen flicker if Document PiP window is already open
      if (docPiP?.window && !docPiP.window.closed) {
        return;
      }

      openingRef.current = true;
      if (!silent) {
        setPipError(null);
      }

      try {
        if (docPiP?.requestWindow) {
          try {
            const win = await docPiP.requestWindow({ width: 356, height: 418 });
            win.document.documentElement.setAttribute('data-theme', stateRef.current.theme);
            win.document.title = 'Still Rhythm · Floating';

            for (const sheet of Array.from(document.styleSheets)) {
              try {
                if (sheet.href) {
                  const link = win.document.createElement('link');
                  link.rel = 'stylesheet';
                  link.href = sheet.href;
                  win.document.head.appendChild(link);
                } else if (sheet.cssRules) {
                  const style = win.document.createElement('style');
                  style.textContent = Array.from(sheet.cssRules)
                    .map((r) => r.cssText)
                    .join('\n');
                  win.document.head.appendChild(style);
                }
              } catch {
                if (sheet.href) {
                  const link = win.document.createElement('link');
                  link.rel = 'stylesheet';
                  link.href = sheet.href;
                  win.document.head.appendChild(link);
                }
              }
            }

            const root = win.document.createElement('div');
            root.className = 'pip-doc-root';
            win.document.body.innerHTML = '';
            win.document.body.appendChild(root);

            win.addEventListener('pagehide', () => {
              setPipWindow(null);
              setPipContainer(null);
              setPipKind('none');
            });

            setPipWindow(win);
            setPipContainer(root);
            setPipKind('document');
            return;
          } catch {
            if (silent) return;
            // Fall through to Video PiP
          }
        }

        const pipVideo = pipVideoRef.current as WebKitVideoElement | null;
        if (pipVideo) {
          primeCanvasVideo();

          if (pipVideo.readyState >= 1) {
            pipVideo.muted = false;
            pipVideo.volume = 1;
            const res = await tryEnterVideoPiPSync(pipVideo);
            if (res.ok) {
              setVideoPiPAudioActive(true);
              setPipKind('video');
              const nudgeCamera = () => {
                const cam = cameraVideoRef?.current;
                if (cam && cam.paused && cam.srcObject) {
                  cam.play().catch(() => {});
                }
              };
              window.setTimeout(nudgeCamera, 60);
              window.setTimeout(nudgeCamera, 300);
              return;
            } else {
              pipVideo.muted = true;
              setVideoPiPAudioActive(false);
            }
          }
        }

        const camVideo = cameraVideoRef?.current as WebKitVideoElement | null;
        if (camVideo && camVideo.readyState >= 1 && camVideo.srcObject) {
          const camRes = await tryEnterVideoPiPSync(camVideo);
          if (camRes.ok) {
            setPipKind('video');
            return;
          }
        }

        if (silent) return;

        if (pipVideo && pipVideo.readyState === 0) {
          primeCanvasVideo();
          setPipError('Mini-window is warmed up — click "Float mini-window" once more to pop it out.');
          return;
        }

        setPipError(
          'This browser blocked floating mini-window mode. Desktop Chrome and Edge support it best.'
        );
      } finally {
        openingRef.current = false;
      }
    },
    [cameraVideoRef, primeCanvasVideo, tryEnterVideoPiPSync]
  );

  const openPiPRef = useRef(openPiP);
  openPiPRef.current = openPiP;

  const togglePiP = useCallback(async () => {
    if (pipKind !== 'none') {
      await closePiP();
    } else {
      await openPiP();
    }
  }, [closePiP, openPiP, pipKind]);

  // Query Chrome's per-site "Automatic picture-in-picture" permission if supported
  useEffect(() => {
    let active = true;
    let statusObj: PermissionStatus | null = null;

    const queryPerm = async () => {
      try {
        if (!navigator.permissions?.query) return;
        const result = await navigator.permissions.query({
          name: 'automatic-picture-in-picture' as PermissionName,
        });
        if (!active) return;
        statusObj = result;
        setAutoPipPermission(result.state as AutoPipPermissionState);
        result.onchange = () => {
          if (active) {
            setAutoPipPermission(result.state as AutoPipPermissionState);
          }
        };
      } catch {
        // Browser does not expose the automatic-picture-in-picture permission query
      }
    };

    void queryPerm();
    return () => {
      active = false;
      if (statusObj) {
        statusObj.onchange = null;
      }
    };
  }, []);

  // Register MediaSession 'enterpictureinpicture' as soon as the session starts (including while
  // models warm up or front-facing cameras are scanned) and keep it stable across PiP state changes.
  const isSessionActive =
    canvasState.status === 'requesting-camera' ||
    canvasState.status === 'loading-models' ||
    canvasState.status === 'choosing-camera' ||
    canvasState.status === 'running';

  useEffect(() => {
    const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
    if (!ms || typeof ms.setActionHandler !== 'function') {
      setAutoPipSupported(false);
      return;
    }

    const msExtended = ms as MediaSession & {
      setCameraActive?: (active: boolean) => void;
    };

    const canRegister = isSessionActive && canvasState.autoPipOnTabSwitch;

    try {
      if (isSessionActive) {
        ms.playbackState = 'playing';
        if (typeof MediaMetadata !== 'undefined') {
          ms.metadata = new MediaMetadata({
            title: 'Still Rhythm',
            artist: 'Watching gently · 100% local',
          });
        }
        msExtended.setCameraActive?.(true);
      } else {
        ms.playbackState = 'none';
        msExtended.setCameraActive?.(false);
      }
    } catch {
      // ignore optional MediaSession metadata/camera hooks
    }

    try {
      if (canRegister) {
        ms.setActionHandler('enterpictureinpicture' as MediaSessionAction, () => {
          void openPiPRef.current({ silent: true });
        });
        setAutoPipSupported(true);
      } else {
        ms.setActionHandler('enterpictureinpicture' as MediaSessionAction, null);
        setAutoPipSupported(true);
      }
    } catch {
      setAutoPipSupported(false);
    }

    return () => {
      try {
        ms.setActionHandler('enterpictureinpicture' as MediaSessionAction, null);
        ms.playbackState = 'none';
        msExtended.setCameraActive?.(false);
      } catch {
        // ignore
      }
    };
  }, [isSessionActive, canvasState.autoPipOnTabSwitch]);

  // Bonus: if the user clicks into another desktop app within Chrome's brief user-activation window
  // right after interacting with a running session, pop out the floating mini-window automatically.
  useEffect(() => {
    if (canvasState.status !== 'running' || !canvasState.autoPipOnTabSwitch || pipKind !== 'none') {
      return;
    }

    const onWindowBlur = () => {
      if (document.visibilityState !== 'visible') return;
      const ua = (navigator as Navigator & { userActivation?: { isActive: boolean } })
        .userActivation;
      if (!ua?.isActive) return;
      void openPiPRef.current({ silent: true });
    };

    window.addEventListener('blur', onWindowBlur);
    return () => window.removeEventListener('blur', onWindowBlur);
  }, [canvasState.status, canvasState.autoPipOnTabSwitch, pipKind]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) track.stop();
      }
    };
  }, []);

  return {
    pipKind,
    pipActive: pipKind !== 'none',
    pipWindow,
    pipContainer,
    pipError,
    isSupported,
    autoPipSupported,
    autoPipPermission,
    canvasRef,
    pipVideoRef,
    primeCanvasVideo,
    togglePiP,
    closePiP,
  };
}
