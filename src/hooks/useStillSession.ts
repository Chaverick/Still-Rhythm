import { useCallback, useEffect, useRef, useState } from 'react';
import { playSingingBowl, unlockAudio } from '../lib/audio';
import { RhythmSignalProcessor } from '../lib/rhythmSignals';
import { checkModelsCached, LocalVisionEngine } from '../lib/vision';
import { WakeLockController } from '../lib/wakeLock';
import type {
  CameraDeviceOption,
  EngineStatus,
  FaceTouchRegion,
  FrameGeometry,
  LiveRhythmState,
  PostureCalibration,
  PostureState,
  ReliefMoveKind,
  Stage1AutoCatch,
  StillSettings,
  VisionDiagnostics,
  WelcomeBackPrompt,
} from '../types';

const TARGET_INTERVAL_MS = 250; // 4 FPS loop
const HAND_FLICKER_HOLD_MS = 380;
const CAMERA_STALL_MS = 2600;
const STAGE1_AUTOCATCH_MS = 5000;
const AWAY_PAUSE_CALM_MS = 30_000;
const WELCOME_BACK_THRESHOLD_MS = 5 * 60 * 1000;

export interface WhisperToast {
  id: number;
  message: string;
  undoEventId?: string;
}

export interface RhythmTickSample {
  postureState: PostureState;
  trackPosture: boolean;
  restlessnessScore: number;
  isRestless: boolean;
  isForwardLean: boolean;
  shoulderGuardPct: number;
}

interface UseStillSessionOptions {
  settings: StillSettings;
  calibration: PostureCalibration;
  onUpdateCalibration: (patch: Partial<PostureCalibration>) => void;
  onRhythmSecond: (sample: RhythmTickSample) => void;
  onFaceTouchDetected: (region: FaceTouchRegion) => void;
  onReliefMoveDetected: (kind: ReliefMoveKind) => void;
  onPostureSwitched: (next: PostureState, source: 'auto' | 'manual') => void;
  onStage1AutoCaught: () => string;
  onStage2Triggered: () => void;
  pauseSheetOpen: boolean;
  pipActive: boolean;
  pipWindow: Window | null;
}

export function useStillSession({
  settings,
  calibration,
  onUpdateCalibration,
  onRhythmSecond,
  onFaceTouchDetected,
  onReliefMoveDetected,
  onPostureSwitched,
  onStage1AutoCaught,
  onStage2Triggered,
  pauseSheetOpen,
  pipActive,
  pipWindow,
}: UseStillSessionOptions) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const engineRef = useRef<LocalVisionEngine | null>(null);
  const wakeLockRef = useRef<WakeLockController | null>(null);
  const processorRef = useRef<RhythmSignalProcessor | null>(null);
  if (!processorRef.current) {
    processorRef.current = new RhythmSignalProcessor(calibration);
  }

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const calibrationRef = useRef(calibration);
  calibrationRef.current = calibration;
  const pauseSheetOpenRef = useRef(pauseSheetOpen);
  pauseSheetOpenRef.current = pauseSheetOpen;
  const pipActiveRef = useRef(pipActive);
  pipActiveRef.current = pipActive;

  const onRhythmSecondRef = useRef(onRhythmSecond);
  onRhythmSecondRef.current = onRhythmSecond;
  const onFaceTouchRef = useRef(onFaceTouchDetected);
  onFaceTouchRef.current = onFaceTouchDetected;
  const onReliefMoveRef = useRef(onReliefMoveDetected);
  onReliefMoveRef.current = onReliefMoveDetected;
  const onPostureSwitchedRef = useRef(onPostureSwitched);
  onPostureSwitchedRef.current = onPostureSwitched;
  const onStage1AutoCaughtRef = useRef(onStage1AutoCaught);
  onStage1AutoCaughtRef.current = onStage1AutoCaught;
  const onStage2TriggeredRef = useRef(onStage2Triggered);
  onStage2TriggeredRef.current = onStage2Triggered;

  // Sync calibration changes into processor
  useEffect(() => {
    processorRef.current?.applyCalibration(calibration);
  }, [calibration]);

  const [status, setStatus] = useState<EngineStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [edgeGlowActive, setEdgeGlowActive] = useState(false);
  const [dwellSec, setDwellSec] = useState(0);
  const [stage1AutoCatch, setStage1AutoCatch] = useState<Stage1AutoCatch | null>(null);
  const [welcomeBack, setWelcomeBack] = useState<WelcomeBackPrompt | null>(null);
  const [whisper, setWhisper] = useState<WhisperToast | null>(null);
  const [frameGeometry, setFrameGeometry] = useState<FrameGeometry | null>(null);
  const [availableCameras, setAvailableCameras] = useState<CameraDeviceOption[]>([]);
  const [rhythm, setRhythm] = useState<LiveRhythmState>(() =>
    processorRef.current!.getState(settings)
  );
  const rhythmRef = useRef(rhythm);
  rhythmRef.current = rhythm;
  const lastFrameRef = useRef<FrameGeometry | null>(null);

  const [diagnostics, setDiagnostics] = useState<VisionDiagnostics>({
    delegate: null,
    fps: 0,
    faceState: 'away',
    poseActive: false,
    sideAngle: false,
    cameraState: 'ended',
    cameraStalled: false,
    cameraLabel: '',
    detectCount: 0,
    handsCount: 0,
    modelsCached: false,
    wakeLockActive: false,
  });

  // Mutable loop state refs
  const runningRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const rvfcRef = useRef<number | null>(null);
  const lastDetectMsRef = useRef(0);
  const lastHandInZoneMsRef = useRef(0);
  const lastVideoTimeRef = useRef(-1);
  const lastFrameAdvanceMsRef = useRef(0);
  const detectCountRef = useRef(0);
  const dwellRef = useRef(0);
  const stage1FiredRef = useRef(false);
  const stage1StartedAtRef = useRef(0);
  const stage1ClearedAtRef = useRef<number | null>(null);
  const lastFaceSeenMsRef = useRef<number>(Date.now());
  const awaySinceMsRef = useRef<number | null>(null);
  const hiddenAtMsRef = useRef<number | null>(null);
  const fpsSamplesRef = useRef<number[]>([]);
  const testGlowTimerRef = useRef<number | null>(null);
  const whisperTimerRef = useRef<number | null>(null);
  const welcomeBackRef = useRef<WelcomeBackPrompt | null>(null);
  welcomeBackRef.current = welcomeBack;

  const showWhisper = useCallback((message: string, undoEventId?: string, durationMs = 5500) => {
    if (whisperTimerRef.current) {
      window.clearTimeout(whisperTimerRef.current);
    }
    setWhisper({ id: Date.now(), message, undoEventId });
    whisperTimerRef.current = window.setTimeout(() => {
      setWhisper(null);
      whisperTimerRef.current = null;
    }, durationMs);
  }, []);

  const dismissWhisper = useCallback(() => {
    if (whisperTimerRef.current) {
      window.clearTimeout(whisperTimerRef.current);
      whisperTimerRef.current = null;
    }
    setWhisper(null);
  }, []);

  const refreshCameras = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cams = devices
        .filter((d) => d.kind === 'videoinput')
        .map((d, idx) => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${idx + 1}`,
        }));
      setAvailableCameras(cams);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void refreshCameras();
    const md = navigator.mediaDevices;
    if (!md?.addEventListener) return;
    const onChange = () => void refreshCameras();
    md.addEventListener('devicechange', onChange);
    return () => md.removeEventListener('devicechange', onChange);
  }, [refreshCameras]);

  // Check offline cache status on mount
  useEffect(() => {
    let active = true;
    const refreshCache = async () => {
      const cached = await checkModelsCached();
      if (active) {
        setDiagnostics((d) => ({ ...d, modelsCached: cached }));
      }
    };
    void refreshCache();
    const timer = window.setTimeout(refreshCache, 4000);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const controller = new WakeLockController((wakeLockActive) => {
      setDiagnostics((d) => ({ ...d, wakeLockActive }));
    });
    wakeLockRef.current = controller;
    return () => {
      controller.dispose();
      wakeLockRef.current = null;
    };
  }, []);

  const stopCameraTracks = useCallback(() => {
    const video = videoRef.current;
    if (video && rvfcRef.current !== null && video.cancelVideoFrameCallback) {
      try {
        video.cancelVideoFrameCallback(rvfcRef.current);
      } catch {
        // ignore
      }
      rvfcRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore
        }
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.onpause = null;
      videoRef.current.srcObject = null;
    }
  }, []);

  const resetDwellState = useCallback(() => {
    dwellRef.current = 0;
    stage1FiredRef.current = false;
    stage1StartedAtRef.current = 0;
    stage1ClearedAtRef.current = null;
    setDwellSec(0);
    setStage1AutoCatch(null);
    setEdgeGlowActive(false);
  }, []);

  const stopSession = useCallback(() => {
    runningRef.current = false;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    stopCameraTracks();
    engineRef.current?.resetCache();
    void wakeLockRef.current?.disable();
    resetDwellState();
    setFrameGeometry(null);
    lastFrameRef.current = null;
    setStatus('idle');
    setErrorMessage(null);
    setDiagnostics((d) => ({
      ...d,
      fps: 0,
      faceState: 'away',
      poseActive: false,
      sideAngle: false,
      cameraState: 'ended',
      cameraStalled: false,
      handsCount: 0,
    }));
  }, [resetDwellState, stopCameraTracks]);

  const stepDetection = useCallback(() => {
    if (!runningRef.current) return;

    const now = performance.now();
    const wallNow = Date.now();

    if (now - lastDetectMsRef.current < TARGET_INTERVAL_MS) {
      return;
    }

    const prevDetect = lastDetectMsRef.current || now - TARGET_INTERVAL_MS;
    const dt = Math.min(Math.max((now - prevDetect) / 1000, 0.05), 1.2);
    lastDetectMsRef.current = now;

    const track = streamRef.current?.getVideoTracks()[0];
    const liveCamState: 'live' | 'muted' | 'ended' =
      !track || track.readyState !== 'live'
        ? 'ended'
        : track.muted
          ? 'muted'
          : 'live';

    if (liveCamState !== 'live') {
      setDiagnostics((d) => ({
        ...d,
        fps: 0,
        cameraState: liveCamState,
        cameraStalled: true,
      }));
      return;
    }

    const video = videoRef.current;
    const engine = engineRef.current;
    const s = settingsRef.current;

    if (!video || !engine || !engine.isReady) return;

    if (video.paused && runningRef.current) {
      video.play().catch(() => {});
    }

    if (video.currentTime !== lastVideoTimeRef.current) {
      lastVideoTimeRef.current = video.currentTime;
      lastFrameAdvanceMsRef.current = now;
    }
    const cameraStalled =
      lastFrameAdvanceMsRef.current > 0 &&
      now - lastFrameAdvanceMsRef.current > CAMERA_STALL_MS;

    if (cameraStalled) {
      setDiagnostics((d) => ({
        ...d,
        fps: 0,
        cameraState: 'live',
        cameraStalled: true,
      }));
      return;
    }

    const frame = engine.detectFrame(
      video,
      {
        zoneScale: s.zoneScale,
        activeZones: s.activeZones,
        pinchFilterEnabled: s.pinchFilterEnabled,
        smartFalseAlarmGuard: s.smartFalseAlarmGuard,
      },
      now
    );

    if (!frame) return;

    detectCountRef.current += 1;
    lastFrameRef.current = frame;

    fpsSamplesRef.current.push(now);
    while (
      fpsSamplesRef.current.length > 0 &&
      now - fpsSamplesRef.current[0] > 2000
    ) {
      fpsSamplesRef.current.shift();
    }
    const measuredFps =
      fpsSamplesRef.current.length > 1
        ? ((fpsSamplesRef.current.length - 1) * 1000) /
          Math.max(1, now - fpsSamplesRef.current[0])
        : 4.0;

    setFrameGeometry(frame);

    const faceState = frame.facePresent
      ? frame.usingOcclusionCache
        ? 'cached'
        : 'detected'
      : 'away';
    const handsCount = new Set(frame.fingertips.map((f) => f.handIndex)).size;

    setDiagnostics((d) => ({
      ...d,
      delegate: engine.activeDelegate,
      fps: Math.round(measuredFps * 10) / 10,
      faceState,
      poseActive: frame.upperBody.posePresent,
      sideAngle: frame.sideAngle,
      cameraState: 'live',
      cameraStalled: false,
      detectCount: detectCountRef.current,
      handsCount,
    }));

    // Step Still Rhythm signal processor (restlessness, sit/stand, neck comfort, silent face touches)
    if (processorRef.current) {
      const nextRhythm = processorRef.current.step(
        frame,
        dt,
        s,
        calibrationRef.current,
        {
          onFaceTouch: (region) => onFaceTouchRef.current(region),
          onReliefMove: (kind) => onReliefMoveRef.current(kind),
          onPostureAutoSwitched: (next) => {
            onPostureSwitchedRef.current(next, 'auto');
          },
        },
        now,
        wallNow
      );
      rhythmRef.current = nextRhythm;
      setRhythm(nextRhythm);
    }

    // Track stepping away >= 5 minutes -> Welcome Back check-in on return
    if (frame.facePresent) {
      if (awaySinceMsRef.current !== null) {
        const awayMs = wallNow - awaySinceMsRef.current;
        if (awayMs >= WELCOME_BACK_THRESHOLD_MS && !welcomeBackRef.current) {
          setWelcomeBack({
            awayMinutes: Math.max(5, Math.round(awayMs / 60_000)),
            reason: 'stepped-away',
          });
        }
        awaySinceMsRef.current = null;
      }
      lastFaceSeenMsRef.current = wallNow;
    } else {
      if (awaySinceMsRef.current === null) {
        awaySinceMsRef.current = wallNow;
      }
    }

    // Classic Still two-stage gentle brow awareness alerting logic
    if (!pauseSheetOpenRef.current && !welcomeBackRef.current) {
      if (frame.handInZone) {
        lastHandInZoneMsRef.current = now;
        const nextDwell = Math.min(s.stage2DwellSec + 1.5, dwellRef.current + dt);
        dwellRef.current = nextDwell;
        setDwellSec(nextDwell);

        if (stage1FiredRef.current) {
          stage1ClearedAtRef.current = null;
          setEdgeGlowActive(true);
          setStage1AutoCatch({
            startedAt: stage1StartedAtRef.current,
            handClearedAt: null,
            remainingSec: 5,
          });
        }

        if (
          s.stage1Enabled &&
          !stage1FiredRef.current &&
          nextDwell >= s.stage1DwellSec
        ) {
          stage1FiredRef.current = true;
          stage1StartedAtRef.current = wallNow;
          stage1ClearedAtRef.current = null;
          setEdgeGlowActive(true);
          if (s.soundEnabled) {
            playSingingBowl('gentle');
          }
          setStage1AutoCatch({
            startedAt: wallNow,
            handClearedAt: null,
            remainingSec: 5,
          });
        }

        const effectiveStage2 = Math.max(s.stage2DwellSec, s.stage1DwellSec + 0.5);
        if (s.stage2Enabled && nextDwell >= effectiveStage2) {
          dwellRef.current = 0;
          stage1FiredRef.current = false;
          stage1ClearedAtRef.current = null;
          setDwellSec(0);
          setStage1AutoCatch(null);
          setEdgeGlowActive(false);
          onStage2TriggeredRef.current();
        }
      } else {
        const sinceInZone = now - lastHandInZoneMsRef.current;
        if (dwellRef.current > 0 && sinceInZone >= HAND_FLICKER_HOLD_MS) {
          const nextDwell = Math.max(0, dwellRef.current - dt * 1.1);
          dwellRef.current = nextDwell;
          setDwellSec(nextDwell);
        }

        if (stage1FiredRef.current && sinceInZone >= HAND_FLICKER_HOLD_MS) {
          if (stage1ClearedAtRef.current === null) {
            stage1ClearedAtRef.current = wallNow;
          }
          const elapsedClearMs = wallNow - stage1ClearedAtRef.current;

          const glowHoldMs = pipActiveRef.current ? 2500 : 1000;
          if (elapsedClearMs >= glowHoldMs) {
            setEdgeGlowActive(false);
          }

          const remainingMs = Math.max(0, STAGE1_AUTOCATCH_MS - elapsedClearMs);
          if (remainingMs <= 0) {
            stage1FiredRef.current = false;
            stage1ClearedAtRef.current = null;
            dwellRef.current = 0;
            setDwellSec(0);
            setStage1AutoCatch(null);
            setEdgeGlowActive(false);
            const eventId = onStage1AutoCaughtRef.current();
            showWhisper('Hand lowered · urge redirected', eventId, 6500);
          } else {
            setStage1AutoCatch({
              startedAt: stage1StartedAtRef.current,
              handClearedAt: stage1ClearedAtRef.current,
              remainingSec: Math.ceil(remainingMs / 1000),
            });
          }
        }
      }
    }
  }, [showWhisper]);

  const runLoop = useCallback(() => {
    if (!runningRef.current) return;
    stepDetection();
    rafRef.current = requestAnimationFrame(runLoop);
  }, [stepDetection]);

  useEffect(() => {
    if (status !== 'running' || !pipActive) return;

    const resumeCam = () => {
      const v = videoRef.current;
      if (v && v.paused && runningRef.current) {
        v.play().catch(() => {});
      }
    };
    resumeCam();
    const t1 = window.setTimeout(resumeCam, 100);
    const t2 = window.setTimeout(resumeCam, 400);

    let pipRafId: number | null = null;
    if (pipWindow && !pipWindow.closed) {
      const tickPipRaf = () => {
        if (!runningRef.current || pipWindow.closed) return;
        stepDetection();
        pipRafId = pipWindow.requestAnimationFrame(tickPipRaf);
      };
      pipRafId = pipWindow.requestAnimationFrame(tickPipRaf);
    }

    const id = window.setInterval(() => {
      resumeCam();
      stepDetection();
    }, TARGET_INTERVAL_MS);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearInterval(id);
      if (pipRafId !== null && pipWindow && !pipWindow.closed) {
        pipWindow.cancelAnimationFrame(pipRafId);
      }
    };
  }, [status, pipActive, pipWindow, stepDetection]);

  const startSession = useCallback(
    async (overrideCameraId?: string) => {
      if (
        runningRef.current ||
        status === 'requesting-camera' ||
        status === 'loading-models' ||
        status === 'choosing-camera'
      ) {
        return;
      }

      unlockAudio();
      setErrorMessage(null);
      setStatus('requesting-camera');

      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus('error');
        setErrorMessage(
          'Camera access is unavailable in this browser. Open Still Rhythm over HTTPS in Chrome, Edge, or Safari.'
        );
        return;
      }

      const desiredDeviceId =
        overrideCameraId !== undefined
          ? overrideCameraId
          : settingsRef.current.selectedCameraId;

      const buildConstraints = (deviceId: string): MediaStreamConstraints => ({
        video: deviceId
          ? {
              deviceId: { exact: deviceId },
              width: { ideal: 640 },
              height: { ideal: 480 },
              frameRate: { ideal: 15, max: 30 },
            }
          : {
              facingMode: { ideal: 'user' },
              width: { ideal: 640 },
              height: { ideal: 480 },
              frameRate: { ideal: 15, max: 30 },
            },
        audio: false,
      });

      const stopStreamQuietly = (s: MediaStream | null) => {
        if (!s) return;
        for (const t of s.getTracks()) {
          try {
            t.stop();
          } catch {
            // ignore
          }
        }
      };

      const attachAndWaitForFrame = async (
        vid: HTMLVideoElement,
        s: MediaStream,
        timeoutMs = 1000
      ): Promise<boolean> => {
        vid.srcObject = s;
        vid.muted = true;
        vid.playsInline = true;
        try {
          await vid.play();
        } catch {
          // ignore autoplay race; check readyState loop below
        }
        const start = performance.now();
        while (performance.now() - start < timeoutMs) {
          if (vid.readyState >= 2 && vid.videoWidth > 0 && vid.videoHeight > 0) {
            return true;
          }
          await new Promise((r) => window.setTimeout(r, 60));
        }
        return vid.readyState >= 2 && vid.videoWidth > 0;
      };

      const scoreVideoFrontFacing = async (
        eng: LocalVisionEngine,
        vid: HTMLVideoElement
      ): Promise<{ faceFound: boolean; frontScore: number; sideAngle: boolean }> => {
        let best = { faceFound: false, frontScore: -1, sideAngle: true };
        for (let i = 0; i < 3; i++) {
          const res = eng.evaluateFrontFacingScore(vid, performance.now());
          if (res.faceFound && res.frontScore > best.frontScore) {
            best = { faceFound: true, frontScore: res.frontScore, sideAngle: res.sideAngle };
          }
          if (i < 2) {
            await new Promise((r) => window.setTimeout(r, 95));
          }
        }
        return best;
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(buildConstraints(desiredDeviceId));
      } catch (err) {
        // If their external Logitech camera is unplugged (e.g. in a meeting room or on bed), fall back smoothly to laptop webcam
        if (desiredDeviceId) {
          try {
            stream = await navigator.mediaDevices.getUserMedia(buildConstraints(''));
          } catch (fallbackErr) {
            const msg =
              fallbackErr instanceof DOMException && fallbackErr.name === 'NotAllowedError'
                ? 'Camera permission was declined. Enable camera access in your browser settings to watch locally.'
                : 'Could not open your camera. Make sure no other app is holding it exclusively.';
            setStatus('error');
            setErrorMessage(msg);
            return;
          }
        } else {
          const msg =
            err instanceof DOMException && err.name === 'NotAllowedError'
              ? 'Camera permission was declined. Enable camera access in your browser settings to watch locally.'
              : 'Could not open your camera. Make sure no other app is holding it exclusively.';
          setStatus('error');
          setErrorMessage(msg);
          return;
        }
      }

      // Now that permission is granted, refresh labeled camera list (e.g. Logitech vs MacBook FaceTime)
      void refreshCameras();

      const video = videoRef.current;
      if (video) {
        await attachAndWaitForFrame(video, stream, 1500);
      }

      void wakeLockRef.current?.enable();

      setStatus('loading-models');
      try {
        if (!engineRef.current) {
          engineRef.current = new LocalVisionEngine();
        }
        const delegate = await engineRef.current.init();
        const cached = await checkModelsCached();
        setDiagnostics((d) => ({
          ...d,
          delegate,
          modelsCached: cached,
        }));
      } catch (err) {
        stopStreamQuietly(stream);
        stopCameraTracks();
        void wakeLockRef.current?.disable();
        setStatus('error');
        setErrorMessage(
          err instanceof Error
            ? `Local vision models could not initialize: ${err.message}`
            : 'Local vision models could not initialize in this browser.'
        );
        return;
      }

      // Automatic front-facing camera selection:
      // When in Automatic mode and 2+ cameras are connected (e.g. side MacBook + front Logitech),
      // inspect each camera briefly and choose the one most directly in front of the user's face!
      let autoPickedNotice: string | null = null;
      if (!desiredDeviceId && video && engineRef.current && navigator.mediaDevices?.enumerateDevices) {
        try {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const allCams = devices.filter((d) => d.kind === 'videoinput' && d.deviceId);
          const isVirtualOrDesk = (label: string) =>
            /desk view|virtual|obs|snap camera|ndi|mmhmm|loom/i.test(label);
          const physicalCams = allCams.filter((c) => !isVirtualOrDesk(c.label || ''));
          const candidates = (physicalCams.length > 0 ? physicalCams : allCams).slice(0, 4);

          if (candidates.length >= 2) {
            setStatus('choosing-camera');
            const initialTrack = stream.getVideoTracks()[0];
            const initialDeviceId = initialTrack?.getSettings?.().deviceId || '';
            const initialLabel = initialTrack?.label || 'Camera 1';

            // 1. Score the already-open stream first
            const initialEval = await scoreVideoFrontFacing(engineRef.current, video);
            let bestStream: MediaStream = stream;
            let bestScore = initialEval.faceFound ? initialEval.frontScore : -1;
            let bestLabel = initialLabel;

            // 2. Probe each remaining candidate camera briefly
            for (const cam of candidates) {
              if (cam.deviceId === initialDeviceId) continue;
              let probeStream: MediaStream | null = null;
              try {
                probeStream = await navigator.mediaDevices.getUserMedia(
                  buildConstraints(cam.deviceId)
                );
                const ready = await attachAndWaitForFrame(video, probeStream, 900);
                if (ready) {
                  const evalRes = await scoreVideoFrontFacing(engineRef.current, video);
                  const score = evalRes.faceFound ? evalRes.frontScore : -1;
                  if (score > bestScore + 2) {
                    stopStreamQuietly(bestStream);
                    bestStream = probeStream;
                    bestScore = score;
                    bestLabel = probeStream.getVideoTracks()[0]?.label || cam.label || 'Front camera';
                    probeStream = null; // keep open as winner
                  }
                }
              } catch {
                // Skip cameras that cannot be opened (e.g. busy or sleeping Continuity Camera)
              } finally {
                if (probeStream) {
                  stopStreamQuietly(probeStream);
                }
              }
            }

            stream = bestStream;
            await attachAndWaitForFrame(video, stream, 900);
            if (bestScore >= 0) {
              autoPickedNotice = `Using ${bestLabel} · best front view of ${candidates.length} cameras`;
            }
          }
        } catch {
          // If enumeration/probing fails, proceed gracefully with the open stream
        }
      }

      streamRef.current = stream;
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        setDiagnostics((d) => ({
          ...d,
          cameraState: videoTrack.muted ? 'muted' : 'live',
          cameraStalled: false,
          cameraLabel: videoTrack.label || 'Front camera',
        }));
        videoTrack.onmute = () => {
          setDiagnostics((d) => ({ ...d, cameraState: 'muted', cameraStalled: true, fps: 0 }));
        };
        videoTrack.onunmute = () => {
          lastFrameAdvanceMsRef.current = performance.now();
          setDiagnostics((d) => ({ ...d, cameraState: 'live', cameraStalled: false }));
        };
        videoTrack.onended = () => {
          setDiagnostics((d) => ({ ...d, cameraState: 'ended', cameraStalled: true, fps: 0 }));
        };
      }

      if (video) {
        video.onpause = () => {
          if (runningRef.current) {
            window.setTimeout(() => {
              if (runningRef.current && video.paused) {
                video.play().catch(() => {});
              }
            }, 60);
          }
        };
      }

      engineRef.current?.resetCache();
      runningRef.current = true;
      lastDetectMsRef.current = 0;
      lastVideoTimeRef.current = -1;
      lastFrameAdvanceMsRef.current = performance.now();
      detectCountRef.current = 0;
      lastFaceSeenMsRef.current = Date.now();
      awaySinceMsRef.current = null;
      fpsSamplesRef.current = [];
      processorRef.current?.resetSession(calibrationRef.current);
      resetDwellState();
      setStatus('running');
      rafRef.current = requestAnimationFrame(runLoop);

      if (autoPickedNotice) {
        showWhisper(autoPickedNotice, undefined, 5000);
      }

      if (video && typeof video.requestVideoFrameCallback === 'function') {
        const onVideoFrame = () => {
          if (!runningRef.current) return;
          lastFrameAdvanceMsRef.current = performance.now();
          stepDetection();
          rvfcRef.current = video.requestVideoFrameCallback?.(onVideoFrame) ?? null;
        };
        rvfcRef.current = video.requestVideoFrameCallback(onVideoFrame);
      }
    },
    [refreshCameras, resetDwellState, runLoop, showWhisper, status, stepDetection, stopCameraTracks]
  );

  // Switch cameras seamlessly (or pass '' to re-scan all cameras and pick the front-facing one)
  const switchCamera = useCallback(
    async (deviceId: string) => {
      if (!runningRef.current) return;
      stopSession();
      window.setTimeout(() => {
        void startSession(deviceId);
      }, 120);
    },
    [startSession, stopSession]
  );

  // 1-second tick for cumulative calm time, sitting/standing time, restlessness & forward-lean seconds
  useEffect(() => {
    if (status !== 'running') return;
    const interval = window.setInterval(() => {
      if (pauseSheetOpenRef.current || welcomeBackRef.current) return;
      if (document.visibilityState !== 'visible' && !pipActiveRef.current) return;
      const sinceFace = Date.now() - lastFaceSeenMsRef.current;
      if (sinceFace <= AWAY_PAUSE_CALM_MS) {
        const cur = rhythmRef.current;
        const s = settingsRef.current;
        onRhythmSecondRef.current({
          postureState: cur.postureState,
          trackPosture: s.workContext === 'desk' && s.sitStandGuidanceEnabled,
          restlessnessScore: cur.restlessnessScore,
          isRestless: cur.restlessnessScore >= s.restlessnessThreshold,
          isForwardLean: cur.forwardLeanPct >= 14,
          shoulderGuardPct: cur.shoulderGuardPct,
        });
      }
    }, 1000);
    return () => window.clearInterval(interval);
  }, [status]);

  // Visibility change handler for Welcome Back check-in
  useEffect(() => {
    const onVisibility = () => {
      if (!runningRef.current) return;
      if (document.visibilityState === 'hidden') {
        if (!pipActiveRef.current) {
          hiddenAtMsRef.current = Date.now();
        }
      } else if (document.visibilityState === 'visible') {
        const hiddenAt = hiddenAtMsRef.current;
        hiddenAtMsRef.current = null;
        if (hiddenAt && !pipActiveRef.current) {
          const awayMs = Date.now() - hiddenAt;
          if (awayMs >= WELCOME_BACK_THRESHOLD_MS) {
            setWelcomeBack({
              awayMinutes: Math.max(5, Math.round(awayMs / 60_000)),
              reason: 'tab-returned',
            });
          }
        }

        const track = streamRef.current?.getVideoTracks()[0];
        if (!track || track.readyState !== 'live') {
          stopSession();
          showWhisper('Camera paused while away · tap Begin to resume', undefined, 6000);
        } else if (videoRef.current && videoRef.current.paused) {
          videoRef.current.play().catch(() => {});
        }
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [showWhisper, stopSession]);

  useEffect(() => {
    return () => {
      runningRef.current = false;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (testGlowTimerRef.current) window.clearTimeout(testGlowTimerRef.current);
      if (whisperTimerRef.current) window.clearTimeout(whisperTimerRef.current);
      stopCameraTracks();
      engineRef.current?.dispose();
    };
  }, [stopCameraTracks]);

  // Manual controls for posture, calming resets, and 1-tap calibration
  const setPostureManual = useCallback(
    (next: PostureState) => {
      const prev = rhythmRef.current.postureState;
      processorRef.current?.setPostureManual(next);
      const updated = processorRef.current?.getState(settingsRef.current);
      if (updated) {
        rhythmRef.current = updated;
        setRhythm(updated);
      }
      if (prev !== next) {
        onPostureSwitchedRef.current(next, 'manual');
        showWhisper(
          next === 'standing'
            ? 'Switched to Standing · enjoy the stretch'
            : 'Switched to Sitting · settled back in',
          undefined,
          3200
        );
      }
    },
    [showWhisper]
  );

  const snoozeCalmingSuggestion = useCallback(() => {
    processorRef.current?.snoozeSuggestion(15);
    const updated = processorRef.current?.getState(settingsRef.current);
    if (updated) {
      rhythmRef.current = updated;
      setRhythm(updated);
    }
  }, []);

  const markCalmingCompleted = useCallback(() => {
    processorRef.current?.markCalmingCompleted();
    const updated = processorRef.current?.getState(settingsRef.current);
    if (updated) {
      rhythmRef.current = updated;
      setRhythm(updated);
    }
  }, []);

  const captureNeutralPosture = useCallback(() => {
    const f = lastFrameRef.current;
    if (!f || !f.facePresent) {
      showWhisper('Start your session and face the camera first to save your comfortable posture', undefined, 4000);
      return;
    }
    onUpdateCalibration({
      neutralEyeSpan: f.eyeSpan,
      neutralShoulderSpan: f.upperBody.shoulderSpan,
      neutralNeckGap: f.upperBody.neckGap,
      neutralShoulderTilt: f.upperBody.shoulderTilt,
      neutralHeadRollDeg: f.upperBody.headRollDeg,
      updatedAt: Date.now(),
    });
    showWhisper('Comfortable neutral posture saved for this desk', undefined, 3600);
  }, [onUpdateCalibration, showWhisper]);

  const capturePostureReference = useCallback(
    (which: PostureState) => {
      const f = lastFrameRef.current;
      if (!f || !f.facePresent || !f.upperBody.headCenter) {
        showWhisper('Start your session first so we can capture this position', undefined, 4000);
        return;
      }
      if (which === 'sitting') {
        onUpdateCalibration({
          sitFaceY: f.upperBody.headCenter.y,
          sitBgHash: f.upperBody.bgHash,
          updatedAt: Date.now(),
        });
        processorRef.current?.setPostureManual('sitting');
        showWhisper('Sitting position saved · now stand up and tap "Save standing"', undefined, 4500);
      } else {
        onUpdateCalibration({
          standFaceY: f.upperBody.headCenter.y,
          standBgHash: f.upperBody.bgHash,
          updatedAt: Date.now(),
        });
        processorRef.current?.setPostureManual('standing');
        showWhisper('Standing position saved · auto sit/stand detection is ready', undefined, 4500);
      }
      const updated = processorRef.current?.getState(settingsRef.current);
      if (updated) {
        rhythmRef.current = updated;
        setRhythm(updated);
      }
    },
    [onUpdateCalibration, showWhisper]
  );

  const triggerTestCue = useCallback(() => {
    unlockAudio();
    if (settingsRef.current.soundEnabled) {
      playSingingBowl('gentle');
    }
    setEdgeGlowActive(true);
    if (testGlowTimerRef.current) {
      window.clearTimeout(testGlowTimerRef.current);
    }
    testGlowTimerRef.current = window.setTimeout(() => {
      if (!stage1FiredRef.current) {
        setEdgeGlowActive(false);
      }
      testGlowTimerRef.current = null;
    }, 2800);
    showWhisper(
      settingsRef.current.soundEnabled
        ? 'Gentle cue test · warm edge glow & singing bowl'
        : 'Gentle cue test · warm edge glow (chime muted)',
      undefined,
      3600
    );
  }, [showWhisper]);

  const cancelStage1FalseAlarm = useCallback(() => {
    resetDwellState();
    showWhisper('Marked as false alarm — calm time untouched', undefined, 4000);
  }, [resetDwellState, showWhisper]);

  const dismissWelcomeBack = useCallback(() => {
    setWelcomeBack(null);
    lastFaceSeenMsRef.current = Date.now();
    awaySinceMsRef.current = null;
  }, []);

  return {
    videoRef,
    status,
    errorMessage,
    edgeGlowActive,
    dwellSec,
    stage1AutoCatch,
    welcomeBack,
    whisper,
    frameGeometry,
    diagnostics,
    rhythm,
    availableCameras,
    startSession,
    stopSession,
    switchCamera,
    setPostureManual,
    snoozeCalmingSuggestion,
    markCalmingCompleted,
    captureNeutralPosture,
    capturePostureReference,
    triggerTestCue,
    cancelStage1FalseAlarm,
    dismissWelcomeBack,
    dismissWhisper,
    showWhisper,
    resetDwellState,
  };
}
