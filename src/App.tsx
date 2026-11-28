import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { EdgeGlow } from './components/EdgeGlow';
import { PatternsView } from './components/PatternsView';
import { PauseSheet } from './components/PauseSheet';
import { PipWindowContent } from './components/PipWindowContent';
import { SettingsView } from './components/SettingsView';
import { TodayView } from './components/TodayView';
import { WhatWorksView } from './components/WhatWorksView';
import { usePictureInPicture } from './hooks/usePictureInPicture';
import { useStillSession, type RhythmTickSample } from './hooks/useStillSession';
import { unlockAudio } from './lib/audio';
import { buildDailyStory } from './lib/patterns';
import { requestDesktopBannerPermission, setTabAlertVisual } from './lib/visualAlerts';
import {
  clearAllLocalData,
  createId,
  getEmptyBucket,
  getEmptyDay,
  getFiveMinSlotIndex,
  getLocalDateKey,
  hasMigratedFromStill,
  inspectLegacyStillData,
  loadBuckets,
  loadCalibration,
  loadDays,
  loadDismissedSummaryDate,
  loadEvents,
  loadNotes,
  loadSettings,
  markMigratedFromStill,
  mergeBackupPayload,
  mergeLegacySettings,
  readLegacyStillBackup,
  saveBuckets,
  saveCalibration,
  saveDays,
  saveDismissedSummaryDate,
  saveEvents,
  saveNotes,
  saveSettings,
  type LegacyStillSummary,
  type StillBackupPayload,
} from './lib/storage';
import type {
  AwarenessEvent,
  CalmingTechniqueId,
  DaySummary,
  FaceTouchRegion,
  FalseAlarmReason,
  FiveMinBucket,
  NoteEntry,
  PostureCalibration,
  PostureState,
  ReliefMoveKind,
  SettingsSectionId,
  StillSettings,
  TabId,
  ThemeMode,
} from './types';

const FALSE_ALARM_WINDOW_MS = 15 * 60 * 1000;

function getInitialTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem('stillrhythm:theme');
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // ignore
  }
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

export function App() {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [activeTab, setActiveTab] = useState<TabId>('today');
  const [settingsSection, setSettingsSection] = useState<SettingsSectionId>('camera');
  const [settings, setSettings] = useState<StillSettings>(loadSettings);
  const [calibration, setCalibration] = useState<PostureCalibration>(loadCalibration);
  const [days, setDays] = useState<Record<string, DaySummary>>(loadDays);
  const [buckets, setBuckets] = useState<Record<string, FiveMinBucket[]>>(loadBuckets);
  const [events, setEvents] = useState<AwarenessEvent[]>(loadEvents);
  const [notes, setNotes] = useState<NoteEntry[]>(loadNotes);
  const [dismissedSummaryDate, setDismissedSummaryDate] = useState<string>(loadDismissedSummaryDate);
  const [pipActive, setPipActive] = useState(false);
  const [pipWindowRef, setPipWindowRef] = useState<Window | null>(null);
  const [falseAlarmTimestamps, setFalseAlarmTimestamps] = useState<number[]>([]);
  const [legacyStill] = useState<LegacyStillSummary>(() => inspectLegacyStillData());

  const [pauseSheetState, setPauseSheetState] = useState<{
    open: boolean;
    isPreview: boolean;
  }>({ open: false, isPreview: false });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem('stillrhythm:theme', theme);
    } catch {
      // ignore
    }
  }, [theme]);

  const updateSettings = useCallback((patch: Partial<StillSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const updateCalibration = useCallback((patch: Partial<PostureCalibration>) => {
    setCalibration((prev) => {
      const next = { ...prev, ...patch };
      saveCalibration(next);
      return next;
    });
  }, []);

  const appendEvent = useCallback((ev: AwarenessEvent) => {
    setEvents((prev) => {
      const next = [ev, ...prev].slice(0, 500);
      saveEvents(next);
      return next;
    });
  }, []);

  const updateTodaySummary = useCallback((updater: (cur: DaySummary) => DaySummary) => {
    const dateKey = getLocalDateKey();
    setDays((prev) => {
      const current = prev[dateKey] ?? getEmptyDay(dateKey);
      const updated = updater(current);
      const next = { ...prev, [dateKey]: updated };
      saveDays(next);
      return next;
    });
  }, []);

  const updateCurrentBucket = useCallback(
    (updater: (cur: FiveMinBucket) => FiveMinBucket) => {
      const now = Date.now();
      const dateKey = getLocalDateKey(now);
      const slotIndex = getFiveMinSlotIndex(now);
      setBuckets((prev) => {
        const list = prev[dateKey] ? [...prev[dateKey]] : [];
        const idx = list.findIndex((b) => b.slotIndex === slotIndex);
        if (idx >= 0) {
          list[idx] = updater(list[idx]);
        } else {
          list.push(updater(getEmptyBucket(dateKey, slotIndex)));
        }
        const next = { ...prev, [dateKey]: list };
        saveBuckets(next);
        return next;
      });
    },
    []
  );

  const recordFalseAlarmMoment = useCallback(() => {
    const now = Date.now();
    setFalseAlarmTimestamps((prev) => [
      ...prev.filter((ts) => now - ts <= FALSE_ALARM_WINDOW_MS),
      now,
    ]);
  }, []);

  // 1-second silent rhythm tick -> updates DaySummary & current 5-minute bucket
  const handleRhythmSecond = useCallback(
    (sample: RhythmTickSample) => {
      updateTodaySummary((cur) => ({
        ...cur,
        calmSeconds: cur.calmSeconds + 1,
        sittingSeconds:
          cur.sittingSeconds + (sample.trackPosture && sample.postureState === 'sitting' ? 1 : 0),
        standingSeconds:
          cur.standingSeconds + (sample.trackPosture && sample.postureState === 'standing' ? 1 : 0),
        restlessSeconds: cur.restlessSeconds + (sample.isRestless ? 1 : 0),
        forwardLeanSeconds: cur.forwardLeanSeconds + (sample.isForwardLean ? 1 : 0),
      }));

      updateCurrentBucket((b) => ({
        ...b,
        activeSeconds: b.activeSeconds + 1,
        sittingSeconds:
          b.sittingSeconds + (sample.trackPosture && sample.postureState === 'sitting' ? 1 : 0),
        standingSeconds:
          b.standingSeconds + (sample.trackPosture && sample.postureState === 'standing' ? 1 : 0),
        restlessnessSum: b.restlessnessSum + sample.restlessnessScore,
        restlessnessSamples: b.restlessnessSamples + 1,
        peakRestlessness: Math.max(b.peakRestlessness, sample.restlessnessScore),
        forwardLeanSeconds: b.forwardLeanSeconds + (sample.isForwardLean ? 1 : 0),
        shoulderTensionSum: b.shoulderTensionSum + sample.shoulderGuardPct,
      }));
    },
    [updateCurrentBucket, updateTodaySummary]
  );

  // Silent face-touch detection (no alert, collated into DaySummary + 5-min bucket)
  const handleFaceTouchDetected = useCallback(
    (region: FaceTouchRegion) => {
      updateTodaySummary((cur) => ({
        ...cur,
        faceTouches: {
          ...cur.faceTouches,
          [region]: (cur.faceTouches[region] || 0) + 1,
        },
      }));
      updateCurrentBucket((b) => ({
        ...b,
        faceTouches: {
          ...b.faceTouches,
          [region]: (b.faceTouches[region] || 0) + 1,
        },
      }));
    },
    [updateCurrentBucket, updateTodaySummary]
  );

  // Silent cervical/shoulder comfort-adjustment detection (no alert!)
  const handleReliefMoveDetected = useCallback(
    (kind: ReliefMoveKind) => {
      updateTodaySummary((cur) => ({
        ...cur,
        shoulderRolls: cur.shoulderRolls + (kind === 'shoulderRoll' ? 1 : 0),
        neckTilts: cur.neckTilts + (kind === 'neckTilt' ? 1 : 0),
        backShifts: cur.backShifts + (kind === 'backShift' ? 1 : 0),
        neckRubs: cur.neckRubs + (kind === 'neckRub' ? 1 : 0),
      }));
      updateCurrentBucket((b) => ({
        ...b,
        reliefMoves: b.reliefMoves + 1,
        shoulderRolls: b.shoulderRolls + (kind === 'shoulderRoll' ? 1 : 0),
        neckTilts: b.neckTilts + (kind === 'neckTilt' ? 1 : 0),
        backShifts: b.backShifts + (kind === 'backShift' ? 1 : 0),
        neckRubs: b.neckRubs + (kind === 'neckRub' ? 1 : 0),
      }));
    },
    [updateCurrentBucket, updateTodaySummary]
  );

  const handlePostureSwitched = useCallback(
    (_next: PostureState, _source: 'auto' | 'manual') => {
      updateTodaySummary((cur) => ({
        ...cur,
        postureSwitches: cur.postureSwitches + 1,
      }));
    },
    [updateTodaySummary]
  );

  const handleStage1AutoCaught = useCallback(() => {
    const id = createId();
    const dateKey = getLocalDateKey();
    updateTodaySummary((cur) => ({
      ...cur,
      urgesRedirected: cur.urgesRedirected + 1,
    }));
    updateCurrentBucket((b) => ({
      ...b,
      browUrges: b.browUrges + 1,
    }));
    appendEvent({
      id,
      timestamp: Date.now(),
      dateKey,
      kind: 'redirect-stage1',
    });
    return id;
  }, [appendEvent, updateCurrentBucket, updateTodaySummary]);

  const handleStage2Triggered = useCallback(() => {
    setPauseSheetState({ open: true, isPreview: false });
  }, []);

  const session = useStillSession({
    settings,
    calibration,
    onUpdateCalibration: updateCalibration,
    onRhythmSecond: handleRhythmSecond,
    onFaceTouchDetected: handleFaceTouchDetected,
    onReliefMoveDetected: handleReliefMoveDetected,
    onPostureSwitched: handlePostureSwitched,
    onStage1AutoCaught: handleStage1AutoCaught,
    onStage2Triggered: handleStage2Triggered,
    pauseSheetOpen: pauseSheetState.open,
    pipActive,
    pipWindow: pipWindowRef,
  });

  const todayKey = getLocalDateKey();
  const today = days[todayKey] ?? getEmptyDay(todayKey);

  // Build Yesterday's (or most recent prior day's) Morning Summary Card starting the next day!
  const morningStory = useMemo(() => {
    if (dismissedSummaryDate === todayKey) return null;
    const priorKeys = Object.keys(days)
      .filter((k) => {
        if (k >= todayKey) return false;
        const d = days[k];
        return d && (d.calmSeconds >= 10 * 60 || d.sittingSeconds + d.standingSeconds >= 10 * 60);
      })
      .sort((a, b) => (a < b ? 1 : -1));
    if (priorKeys.length === 0) return null;
    const targetKey = priorKeys[0];
    const story = buildDailyStory(
      targetKey,
      days[targetKey],
      buckets[targetKey] ?? [],
      settings.restlessnessThreshold
    );
    return story.hasEnoughData ? story : null;
  }, [buckets, days, dismissedSummaryDate, settings.restlessnessThreshold, todayKey]);

  const handleDismissMorningStory = useCallback(() => {
    setDismissedSummaryDate(todayKey);
    saveDismissedSummaryDate(todayKey);
  }, [todayKey]);

  const handleSelectCamera = useCallback(
    (deviceId: string) => {
      updateSettings({ selectedCameraId: deviceId });
      if (session.status === 'running') {
        void session.switchCamera(deviceId);
      }
    },
    [session, updateSettings]
  );

  const handleCompleteCalmingReset = useCallback(
    (techniqueId: CalmingTechniqueId) => {
      session.markCalmingCompleted();
      updateTodaySummary((cur) => ({
        ...cur,
        calmingResetsUsed: cur.calmingResetsUsed + 1,
      }));
      updateCurrentBucket((b) => ({
        ...b,
        calmingResets: b.calmingResets + 1,
      }));
      appendEvent({
        id: createId(),
        timestamp: Date.now(),
        dateKey: getLocalDateKey(),
        kind: 'calming-reset',
        responseId: techniqueId,
      });
      session.showWhisper('Calming reset noted · take your time returning', undefined, 4000);
    },
    [appendEvent, session, updateCurrentBucket, updateTodaySummary]
  );

  const pip = usePictureInPicture(
    {
      theme,
      userName: settings.userName,
      autoPipOnTabSwitch: settings.autoPipOnTabSwitch,
      status: session.status,
      calmSeconds: today.calmSeconds,
      urgesRedirected: today.urgesRedirected,
      handInZone: Boolean(session.frameGeometry?.handInZone),
      stage1Glow: session.edgeGlowActive,
      stage2AlertOpen: pauseSheetState.open,
      faceState: session.diagnostics.faceState,
      sideAngle: session.diagnostics.sideAngle,
      cameraState: session.diagnostics.cameraState,
      cameraStalled: session.diagnostics.cameraStalled,
      detectCount: session.diagnostics.detectCount,
      handsCount: session.diagnostics.handsCount,
      fps: session.diagnostics.fps,
      dwellSec: session.dwellSec,
      stage2DwellSec: settings.stage2DwellSec,
      workContext: settings.workContext,
      postureState: session.rhythm.postureState,
      boutSeconds: session.rhythm.boutSeconds,
      sitWindowMinutes: settings.sitWindowMinutes,
      standWindowMinutes: settings.standWindowMinutes,
      restlessnessScore: session.rhythm.restlessnessScore,
      restlessnessLevel: session.rhythm.restlessnessLevel,
    },
    session.videoRef
  );

  useEffect(() => {
    setPipActive(pip.pipActive);
    setPipWindowRef(pip.pipWindow);
  }, [pip.pipActive, pip.pipWindow]);

  useEffect(() => {
    const v = session.videoRef.current;
    if (v) {
      v.setAttribute('webkit-playsinline', 'true');
      v.setAttribute('playsinline', 'true');
    }
    const pv = pip.pipVideoRef.current;
    if (pv) {
      pv.setAttribute('webkit-playsinline', 'true');
      pv.setAttribute('playsinline', 'true');
    }
  }, [session.videoRef, pip.pipVideoRef]);

  const handleTagFalseAlarm = useCallback(
    (reason: FalseAlarmReason, eventId?: string) => {
      const labelMap: Record<FalseAlarmReason, string> = {
        'eye-scratch': 'Eye scratch',
        drinking: 'Drinking',
        ear: 'Ear touch',
        other: 'Other',
      };
      const outcomeMap = {
        'eye-scratch': 'fp-eye-scratch',
        drinking: 'fp-drinking',
        ear: 'fp-ear',
        other: 'fp-other',
      } as const;
      const tagLabel = labelMap[reason];
      setEvents((prev) => {
        const idx = eventId
          ? prev.findIndex((e) => e.id === eventId)
          : prev.findIndex((e) => e.kind === 'false-alarm');
        if (idx < 0) return prev;
        const next = [...prev];
        next[idx] = { ...next[idx], tag: tagLabel };
        saveEvents(next);
        return next;
      });
      session.relabelPoseSample(eventId, outcomeMap[reason]);
      session.logFalseAlarmTelemetry('quick-tag', reason);
      session.showWhisper(`Tagged as ${tagLabel} · saved for future tuning`, undefined, 3200);
    },
    [session]
  );

  const handleCancelStage1FalseAlarm = useCallback(() => {
    const evId = createId();
    session.recordPoseSample('fp-unlabeled', evId);
    session.logFalseAlarmTelemetry('stage1');
    session.cancelStage1FalseAlarm(evId);
    recordFalseAlarmMoment();
    updateTodaySummary((cur) => ({
      ...cur,
      falseAlarms: cur.falseAlarms + 1,
    }));
    appendEvent({
      id: evId,
      timestamp: Date.now(),
      dateKey: getLocalDateKey(),
      kind: 'false-alarm',
    });
  }, [appendEvent, recordFalseAlarmMoment, session, updateTodaySummary]);

  const handleUndoAutoCatchAsFalseAlarm = useCallback(
    (eventId: string) => {
      const dateKey = getLocalDateKey();
      const faId = createId();
      setEvents((prev) => {
        const next = prev.filter((e) => e.id !== eventId);
        saveEvents(next);
        return next;
      });
      updateTodaySummary((cur) => ({
        ...cur,
        urgesRedirected: Math.max(0, cur.urgesRedirected - 1),
        falseAlarms: cur.falseAlarms + 1,
      }));
      appendEvent({
        id: faId,
        timestamp: Date.now(),
        dateKey,
        kind: 'false-alarm',
      });
      recordFalseAlarmMoment();
      session.relabelPoseSample(eventId, 'fp-unlabeled');
      session.logFalseAlarmTelemetry('undo-autocatch');
      session.dismissWhisper();
      session.showWhisper('Undone · false alarm noted', undefined, 6800, eventId);
    },
    [appendEvent, recordFalseAlarmMoment, session, updateTodaySummary]
  );

  const handlePauseAutoCatch = useCallback(
    (responseId: string) => {
      const wasPreview = pauseSheetState.isPreview;
      setPauseSheetState({ open: false, isPreview: false });
      session.resetDwellState();
      if (!wasPreview) {
        const dateKey = getLocalDateKey();
        const evId = createId();
        session.recordPoseSample('real-stage2', evId);
        updateTodaySummary((cur) => ({
          ...cur,
          urgesRedirected: cur.urgesRedirected + 1,
        }));
        updateCurrentBucket((b) => ({
          ...b,
          browUrges: b.browUrges + 1,
        }));
        appendEvent({
          id: evId,
          timestamp: Date.now(),
          dateKey,
          kind: 'redirect-stage2',
          responseId,
        });
        session.showWhisper('Urge redirected · calm time continues', undefined, 4500);
      } else {
        session.showWhisper('Pause sheet preview complete', undefined, 3000);
      }
    },
    [appendEvent, pauseSheetState.isPreview, session, updateCurrentBucket, updateTodaySummary]
  );

  const handlePauseGraceRecovery = useCallback(
    (tag?: string) => {
      const wasPreview = pauseSheetState.isPreview;
      setPauseSheetState({ open: false, isPreview: false });
      session.resetDwellState();
      if (!wasPreview) {
        const dateKey = getLocalDateKey();
        const evId = createId();
        session.recordPoseSample('real-grace', evId);
        updateTodaySummary((cur) => ({
          ...cur,
          graceRecoveries: cur.graceRecoveries + 1,
        }));
        updateCurrentBucket((b) => ({
          ...b,
          browUrges: b.browUrges + 1,
        }));
        appendEvent({
          id: evId,
          timestamp: Date.now(),
          dateKey,
          kind: 'grace',
          tag,
        });
        session.showWhisper('Grace recovery noted · continuing gently', undefined, 4500);
      } else {
        session.showWhisper('Grace recovery previewed (not logged)', undefined, 3000);
      }
    },
    [appendEvent, pauseSheetState.isPreview, session, updateCurrentBucket, updateTodaySummary]
  );

  const handlePauseFalseAlarm = useCallback(() => {
    const wasPreview = pauseSheetState.isPreview;
    setPauseSheetState({ open: false, isPreview: false });
    session.resetDwellState();
    if (!wasPreview) {
      const dateKey = getLocalDateKey();
      const faId = createId();
      session.recordPoseSample('fp-unlabeled', faId);
      updateTodaySummary((cur) => ({
        ...cur,
        falseAlarms: cur.falseAlarms + 1,
      }));
      appendEvent({
        id: faId,
        timestamp: Date.now(),
        dateKey,
        kind: 'false-alarm',
      });
      recordFalseAlarmMoment();
      session.logFalseAlarmTelemetry('stage2');
      session.showWhisper('False alarm noted', undefined, 6800, faId);
    }
  }, [appendEvent, pauseSheetState.isPreview, recordFalseAlarmMoment, session, updateTodaySummary]);

  const handleTuneAddDwell = useCallback(() => {
    const next1 = Math.min(2.5, Number((settings.stage1DwellSec + 0.2).toFixed(1)));
    const next2 = Math.min(
      4.5,
      Math.max(Number((settings.stage2DwellSec + 0.2).toFixed(1)), Number((next1 + 0.6).toFixed(1)))
    );
    updateSettings({ stage1DwellSec: next1, stage2DwellSec: next2 });
    setFalseAlarmTimestamps([]);
    session.showWhisper(`Dwell nudged to ${next1.toFixed(1)}s / ${next2.toFixed(1)}s`, undefined, 4000);
  }, [session, settings.stage1DwellSec, settings.stage2DwellSec, updateSettings]);

  const handleTuneTightenZone = useCallback(() => {
    const nextZone = Math.max(0.65, Number((settings.zoneScale - 0.1).toFixed(2)));
    updateSettings({ zoneScale: nextZone });
    setFalseAlarmTimestamps([]);
    session.showWhisper(`Watched zone tightened to ${Math.round(nextZone * 100)}%`, undefined, 4000);
  }, [session, settings.zoneScale, updateSettings]);

  const handleTuneEnablePinch = useCallback(() => {
    updateSettings({ pinchFilterEnabled: true });
    setFalseAlarmTimestamps([]);
    session.showWhisper('Pinch-posture filter enabled · ignores open-palm scratches', undefined, 4500);
  }, [session, updateSettings]);

  const handleDismissFalseAlarmNudge = useCallback(() => {
    setFalseAlarmTimestamps([]);
  }, []);

  const handleWelcomeCalm = useCallback(
    (addAwayMinutes: boolean) => {
      const mins = session.welcomeBack?.awayMinutes ?? 5;
      if (addAwayMinutes) {
        updateTodaySummary((cur) => ({
          ...cur,
          calmSeconds: cur.calmSeconds + mins * 60,
        }));
      }
      appendEvent({
        id: createId(),
        timestamp: Date.now(),
        dateKey: getLocalDateKey(),
        kind: 'welcome-back-calm',
        note: `Returned calm after ${mins}m away`,
      });
      session.dismissWelcomeBack();
      session.showWhisper(`Welcome back · +${mins}m added to calm time`, undefined, 4500);
    },
    [appendEvent, session, updateTodaySummary]
  );

  const handleAddNote = useCallback((text: string, tags: string[]) => {
    const entry: NoteEntry = {
      id: createId(),
      timestamp: Date.now(),
      dateKey: getLocalDateKey(),
      text,
      tags,
    };
    setNotes((prev) => {
      const next = [entry, ...prev];
      saveNotes(next);
      return next;
    });
  }, []);

  const handleDeleteNote = useCallback((id: string) => {
    setNotes((prev) => {
      const next = prev.filter((n) => n.id !== id);
      saveNotes(next);
      return next;
    });
  }, []);

  const handleExportData = useCallback(() => {
    const payload = {
      exportedAt: new Date().toISOString(),
      settings,
      days,
      buckets,
      events,
      notes,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `still-rhythm-backup-${getLocalDateKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [buckets, days, events, notes, settings]);

  const applyIncomingBackup = useCallback(
    (payload: StillBackupPayload, sourceLabel: 'still-local' | 'file') => {
      const merged = mergeBackupPayload({ days, events, notes, buckets }, payload);
      setDays(merged.days);
      setEvents(merged.events);
      setNotes(merged.notes);
      setBuckets(merged.buckets);
      saveDays(merged.days);
      saveEvents(merged.events);
      saveNotes(merged.notes);
      saveBuckets(merged.buckets);

      if (payload.settings) {
        const nextSettings = mergeLegacySettings(settings, payload.settings);
        setSettings(nextSettings);
        saveSettings(nextSettings);
      }
      if (payload.theme === 'light' || payload.theme === 'dark') {
        setTheme(payload.theme);
      }

      if (sourceLabel === 'still-local') {
        markMigratedFromStill();
        const totalDays = Object.keys(merged.days).length;
        session.showWhisper(
          totalDays > 0
            ? `Copied your Still history & settings (${totalDays} ${totalDays === 1 ? 'day' : 'days'}) · Still is untouched`
            : 'Copied your settings & notes from Still · Still is untouched',
          undefined,
          5500
        );
      } else {
        session.showWhisper(
          merged.addedDays > 0
            ? `Imported & merged ${merged.addedDays} new ${merged.addedDays === 1 ? 'day' : 'days'} (plus settings)`
            : 'Backup & settings merged with your local history',
          undefined,
          4500
        );
      }
    },
    [buckets, days, events, notes, session, settings]
  );

  const handleMigrateFromStill = useCallback(() => {
    const legacy = inspectLegacyStillData();
    if (!legacy.found) {
      session.showWhisper('No Still data found in this browser — try importing a JSON backup instead', undefined, 4500);
      return;
    }
    applyIncomingBackup(readLegacyStillBackup(), 'still-local');
  }, [applyIncomingBackup, session]);

  // Automatic one-time safe read-only migration from Still when opened on the same browser
  useEffect(() => {
    if (legacyStill.found && !hasMigratedFromStill()) {
      applyIncomingBackup(readLegacyStillBackup(), 'still-local');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleImportFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(String(reader.result)) as StillBackupPayload;
          applyIncomingBackup(parsed, 'file');
        } catch {
          session.showWhisper('Could not read that JSON backup file', undefined, 4500);
        }
      };
      reader.readAsText(file);
    },
    [applyIncomingBackup, session]
  );

  const handleClearData = useCallback(() => {
    clearAllLocalData();
    setDays({});
    setBuckets({});
    setEvents([]);
    setNotes([]);
    setDismissedSummaryDate('');
    setFalseAlarmTimestamps([]);
    session.showWhisper('Local history cleared', undefined, 3500);
  }, [session]);

  const totalCalmSeconds = useMemo(
    () => Object.values(days).reduce((acc, d) => acc + d.calmSeconds, 0),
    [days]
  );

  const handleOpenCameraSetup = useCallback(() => {
    setSettingsSection('camera');
    setActiveTab('settings');
  }, []);

  const handleOpenVoiceSettings = useCallback(() => {
    setSettingsSection('voice');
    setActiveTab('settings');
  }, []);

  const handleCalibrateVoice = useCallback(() => {
    void session.calibrateVoiceComfort((offset) => {
      updateSettings({ voiceCalOffsetDb: offset });
    });
  }, [session, updateSettings]);

  const handleToggleDesktopBanner = useCallback(async () => {
    if (settings.desktopVisualBanner) {
      updateSettings({ desktopVisualBanner: false });
      return;
    }
    const perm = await requestDesktopBannerPermission();
    if (perm === 'granted') {
      updateSettings({ desktopVisualBanner: true });
      session.showWhisper('Silent visual desktop banners enabled · works even when muted', undefined, 4200);
    } else if (perm === 'denied') {
      updateSettings({ desktopVisualBanner: false });
      session.showWhisper(
        'Allow Notifications for chaverick.github.io in Chrome site settings to show visual banners',
        undefined,
        5200
      );
    } else {
      updateSettings({ desktopVisualBanner: false });
      session.showWhisper('Desktop banners are not supported in this browser', undefined, 3800);
    }
  }, [session, settings.desktopVisualBanner, updateSettings]);

  // Glowing amber tab favicon & title beacon (works even when Mac audio is muted!)
  useEffect(() => {
    const isAlert = pauseSheetState.open || session.edgeGlowActive;
    const stage = pauseSheetState.open ? 'stage2' : 'stage1';
    setTabAlertVisual(isAlert, stage, pipWindowRef);
    return () => {
      if (isAlert) setTabAlertVisual(false, 'stage1', pipWindowRef);
    };
  }, [pauseSheetState.open, session.edgeGlowActive, pipWindowRef]);

  const glowIntensity = pauseSheetState.open
    ? 'prominent'
    : session.edgeGlowActive
      ? 'gentle'
      : 'none';

  const glowProgress = pauseSheetState.open
    ? 1
    : Math.min(1, session.dwellSec / Math.max(0.5, settings.stage2DwellSec));

  return (
    <div className="app-shell">
      <EdgeGlow intensity={glowIntensity} progress={glowProgress} />

      <video
        ref={session.videoRef}
        className="safari-live-video"
        autoPlay
        playsInline
        muted
        aria-hidden="true"
      />
      <video
        ref={session.secondaryVideoRef}
        className="safari-live-video"
        autoPlay
        playsInline
        muted
        aria-hidden="true"
      />

      <canvas
        ref={pip.canvasRef}
        width={480}
        height={280}
        className="safari-live-video"
        aria-hidden="true"
      />
      <video
        ref={pip.pipVideoRef}
        className="pip-source-video"
        autoPlay
        playsInline
        muted
        aria-hidden="true"
      />

      {pip.pipContainer &&
        createPortal(
          <PipWindowContent
            userName={settings.userName}
            status={session.status}
            calmSeconds={today.calmSeconds}
            urgesRedirected={today.urgesRedirected}
            handInZone={Boolean(session.frameGeometry?.handInZone)}
            stage1Glow={session.edgeGlowActive}
            stage2AlertOpen={pauseSheetState.open}
            faceState={session.diagnostics.faceState}
            sideAngle={session.diagnostics.sideAngle}
            cameraState={session.diagnostics.cameraState}
            cameraStalled={session.diagnostics.cameraStalled}
            detectCount={session.diagnostics.detectCount}
            handsCount={session.diagnostics.handsCount}
            fps={session.diagnostics.fps}
            dwellSec={session.dwellSec}
            stage2DwellSec={settings.stage2DwellSec}
            pinnedResponses={settings.pinnedResponses}
            workContext={settings.workContext}
            sitStandGuidanceEnabled={settings.sitStandGuidanceEnabled}
            micEnabled={settings.micEnabled}
            postureState={session.rhythm.postureState}
            boutSeconds={session.rhythm.boutSeconds}
            sitWindowMinutes={settings.sitWindowMinutes}
            standWindowMinutes={settings.standWindowMinutes}
            restlessnessLevel={session.rhythm.restlessnessLevel}
            voiceDb={session.rhythm.voiceDb}
            voiceLeqDb={session.rhythm.voiceLeqDb}
            voiceStatus={session.rhythm.voiceStatus}
            micState={session.rhythm.micState}
            voiceComfortMinDb={settings.voiceComfortMinDb}
            voiceComfortMaxDb={settings.voiceComfortMaxDb}
            isSpeaking={session.rhythm.isSpeaking}
            inMeetingMode={session.inMeetingMode}
            pendingPosturePrompt={session.rhythm.pendingPosturePrompt}
            cameraAngleWarning={session.cameraAngleWarning}
            onAcknowledgeCameraAngle={session.acknowledgeCameraAngle}
            onTogglePosture={session.setPostureManual}
            onConfirmPosturePrompt={session.confirmPosturePrompt}
            onToggleMeetingMode={session.toggleMeetingMode}
            onClearSpeaking={session.clearSpeaking}
            onCompleteCalmingReset={handleCompleteCalmingReset}
            onStart={() => {
              pip.primeCanvasVideo();
              void session.startSession();
            }}
            onStop={session.stopSession}
            onAutoCatch={handlePauseAutoCatch}
            onGraceRecovery={() => handlePauseGraceRecovery()}
            onFalseAlarm={handlePauseFalseAlarm}
            onTagFalseAlarm={(reason) => handleTagFalseAlarm(reason)}
            onClosePiP={() => void pip.closePiP()}
          />,
          pip.pipContainer
        )}

      {/* Minimal Claude-inspired Warm Paper Header (4 calm top-level tabs) */}
      <header className="top-header">
        <div className="top-header-inner">
          <div className="brand-group">
            <span className="brand-mark" aria-hidden="true">
              <span
                className={`brand-dot ${session.status === 'running' ? 'brand-dot--live' : ''}`}
              />
            </span>
            <span className="brand-name">Still Rhythm</span>
          </div>

          <nav className="nav-tabs" aria-label="Primary navigation">
            <button
              type="button"
              id="nav-today"
              className={`nav-tab ${activeTab === 'today' ? 'nav-tab--active' : ''}`}
              aria-current={activeTab === 'today' ? 'page' : undefined}
              onClick={() => setActiveTab('today')}
            >
              Today
            </button>
            <button
              type="button"
              id="nav-patterns"
              className={`nav-tab ${activeTab === 'patterns' ? 'nav-tab--active' : ''}`}
              aria-current={activeTab === 'patterns' ? 'page' : undefined}
              onClick={() => setActiveTab('patterns')}
            >
              Patterns
            </button>
            <button
              type="button"
              id="nav-calm"
              className={`nav-tab ${activeTab === 'calm' ? 'nav-tab--active' : ''}`}
              aria-current={activeTab === 'calm' ? 'page' : undefined}
              onClick={() => setActiveTab('calm')}
            >
              Calm
            </button>
            <button
              type="button"
              id="nav-settings"
              className={`nav-tab ${activeTab === 'settings' ? 'nav-tab--active' : ''}`}
              aria-current={activeTab === 'settings' ? 'page' : undefined}
              onClick={() => setActiveTab('settings')}
            >
              Settings
            </button>
          </nav>

          <button
            type="button"
            id="btn-theme-toggle"
            className="theme-btn"
            aria-label={`Switch to ${theme === 'light' ? 'dark editorial' : 'warm paper'} theme`}
            title={theme === 'light' ? 'Dark editorial theme' : 'Warm paper theme'}
            onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
          >
            {theme === 'light' ? 'Dark' : 'Paper'}
          </button>
        </div>
      </header>

      {/* Main Centered Editorial Column */}
      <main className="main-column">
        {activeTab === 'today' && (
          <TodayView
            status={session.status}
            errorMessage={session.errorMessage}
            today={today}
            totalCalmSeconds={totalCalmSeconds}
            settings={settings}
            rhythm={session.rhythm}
            inMeetingMode={session.inMeetingMode}
            cameraOn={session.cameraOn}
            micOn={session.micOn}
            availableCameras={session.availableCameras}
            voiceCalibrating={session.voiceCalibrating}
            voiceCalProgress={session.voiceCalProgress}
            cameraAngleWarning={session.cameraAngleWarning}
            morningStory={morningStory}
            onDismissMorningStory={handleDismissMorningStory}
            onOpenPatterns={() => setActiveTab('patterns')}
            onOpenCalmTools={() => setActiveTab('calm')}
            onOpenCameraSetup={handleOpenCameraSetup}
            onOpenVoiceSettings={handleOpenVoiceSettings}
            onUpdateSettings={updateSettings}
            onToggleCamera={() => {
              pip.primeCanvasVideo();
              session.toggleCamera();
            }}
            onToggleMic={() => {
              if (!settings.micEnabled && !session.micOn) {
                updateSettings({ micEnabled: true });
              }
              void session.toggleMic();
            }}
            onToggleMeetingMode={session.toggleMeetingMode}
            onClearSpeaking={session.clearSpeaking}
            onSetPostureManual={session.setPostureManual}
            onConfirmPosturePrompt={session.confirmPosturePrompt}
            onAcknowledgeCameraAngle={session.acknowledgeCameraAngle}
            onCalibrateVoice={handleCalibrateVoice}
            onSnoozeCalming={session.snoozeCalmingSuggestion}
            onCompleteCalmingReset={handleCompleteCalmingReset}
            onStart={() => {
              pip.primeCanvasVideo();
              if (!settings.micEnabled) {
                updateSettings({ micEnabled: true });
              }
              void session.startSession(undefined, { withMic: true });
            }}
            onStop={session.stopSession}
            pipSupported={pip.isSupported}
            autoPipSupported={pip.autoPipSupported}
            autoPipPermission={pip.autoPipPermission}
            pipKind={pip.pipKind}
            pipError={pip.pipError}
            onTogglePiP={() => {
              unlockAudio();
              void pip.togglePiP();
            }}
            recentFalseAlarms={falseAlarmTimestamps.length}
            onTuneAddDwell={handleTuneAddDwell}
            onTuneTightenZone={handleTuneTightenZone}
            onTuneEnablePinch={handleTuneEnablePinch}
            onDismissFalseAlarmNudge={handleDismissFalseAlarmNudge}
            stage1AutoCatch={session.stage1AutoCatch}
            onCancelStage1FalseAlarm={handleCancelStage1FalseAlarm}
            frameGeometry={session.frameGeometry}
            diagnostics={session.diagnostics}
          />
        )}

        {activeTab === 'patterns' && (
          <PatternsView
            days={days}
            buckets={buckets}
            events={events}
            notes={notes}
            restlessnessThreshold={settings.restlessnessThreshold}
            onAddNote={handleAddNote}
            onDeleteNote={handleDeleteNote}
            onCopiedDigest={() =>
              session.showWhisper('Plain-English daily summary copied', undefined, 3200)
            }
          />
        )}

        {activeTab === 'calm' && (
          <WhatWorksView
            settings={settings}
            onUpdateSettings={updateSettings}
            onLogCalmingReset={handleCompleteCalmingReset}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsView
            activeSection={settingsSection}
            onChangeSection={setSettingsSection}
            settings={settings}
            calibration={calibration}
            rhythm={session.rhythm}
            theme={theme}
            autoPipSupported={pip.autoPipSupported}
            autoPipPermission={pip.autoPipPermission}
            availableCameras={session.availableCameras}
            legacyStill={legacyStill}
            sessionRunning={session.status === 'running'}
            voiceCalibrating={session.voiceCalibrating}
            voiceCalProgress={session.voiceCalProgress}
            videoRef={session.videoRef}
            frameGeometry={session.frameGeometry}
            dwellSec={session.dwellSec}
            diagnostics={session.diagnostics}
            onMigrateFromStill={handleMigrateFromStill}
            onExportData={handleExportData}
            onImportFile={handleImportFile}
            onClearData={handleClearData}
            onUpdateSettings={updateSettings}
            onSelectCamera={handleSelectCamera}
            onCaptureNeutralPosture={session.captureNeutralPosture}
            onCapturePostureReference={session.capturePostureReference}
            onCalibrateVoice={handleCalibrateVoice}
            onToggleDesktopBanner={() => void handleToggleDesktopBanner()}
            onToggleTheme={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
            onTestStage1={session.triggerTestCue}
            onTestStage2={() => {
              unlockAudio();
              setPauseSheetState({ open: true, isPreview: true });
            }}
          />
        )}
      </main>

      {session.whisper ? (
        <div className="whisper-toast" role="status" aria-live="polite">
          <span>{session.whisper.message}</span>
          {session.whisper.undoEventId && (
            <button
              type="button"
              className="whisper-undo"
              onClick={() =>
                handleUndoAutoCatchAsFalseAlarm(session.whisper!.undoEventId!)
              }
            >
              False alarm
            </button>
          )}
          {session.whisper.falseAlarmEventId && (
            <span className="whisper-tag-group">
              <button
                type="button"
                className="whisper-tag-btn"
                onClick={() =>
                  handleTagFalseAlarm('eye-scratch', session.whisper!.falseAlarmEventId)
                }
              >
                Eye scratch
              </button>
              <button
                type="button"
                className="whisper-tag-btn"
                onClick={() =>
                  handleTagFalseAlarm('drinking', session.whisper!.falseAlarmEventId)
                }
              >
                Drink
              </button>
              <button
                type="button"
                className="whisper-tag-btn"
                onClick={() =>
                  handleTagFalseAlarm('ear', session.whisper!.falseAlarmEventId)
                }
              >
                Ear
              </button>
              <button
                type="button"
                className="whisper-tag-btn"
                onClick={() =>
                  handleTagFalseAlarm('other', session.whisper!.falseAlarmEventId)
                }
              >
                Other
              </button>
            </span>
          )}
        </div>
      ) : session.welcomeBack ? (
        <div className="whisper-toast" role="status" aria-live="polite">
          <span>
            Welcome back · {session.welcomeBack.awayMinutes}m away
          </span>
          <button
            type="button"
            className="whisper-undo"
            onClick={() => handleWelcomeCalm(true)}
          >
            +{session.welcomeBack.awayMinutes}m calm
          </button>
          <button
            type="button"
            className="whisper-dismiss"
            aria-label="Dismiss welcome back notice"
            onClick={session.dismissWelcomeBack}
          >
            ✕
          </button>
        </div>
      ) : null}

      <PauseSheet
        open={pauseSheetState.open}
        isPreview={pauseSheetState.isPreview}
        userName={settings.userName}
        handInZone={Boolean(session.frameGeometry?.handInZone)}
        sessionRunning={session.status === 'running'}
        soundEnabled={settings.soundEnabled}
        repeatChimeEnabled={settings.stage2RepeatChime}
        pinnedResponses={settings.pinnedResponses}
        onAutoCatch={handlePauseAutoCatch}
        onGraceRecovery={handlePauseGraceRecovery}
        onFalseAlarm={handlePauseFalseAlarm}
      />
    </div>
  );
}

export default App;
