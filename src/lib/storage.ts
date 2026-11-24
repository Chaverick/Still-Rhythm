import type {
  AwarenessEvent,
  CalmingTechnique,
  CompetingResponse,
  DaySummary,
  FaceTouchCounts,
  FiveMinBucket,
  NoteEntry,
  PostureCalibration,
  StillSettings,
} from '../types';

const KEYS = {
  settings: 'stillrhythm:settings:v1',
  days: 'stillrhythm:days:v1',
  events: 'stillrhythm:events:v1',
  notes: 'stillrhythm:notes:v1',
  buckets: 'stillrhythm:buckets:v1',
  calibration: 'stillrhythm:calibration:v1',
  dismissedSummary: 'stillrhythm:dismissed-summary:v1',
  theme: 'stillrhythm:theme',
} as const;

export const COMPETING_RESPONSES: CompetingResponse[] = [
  {
    id: 'palms-flat',
    title: 'Rest palms flat',
    instruction:
      'Place both palms gently flat on your lap or desk, fingers lightly spread. Let your shoulders drop a centimeter.',
    durationHint: '60 seconds',
    why: 'Incompatible with plucking and discharges fine-motor tension through broad palm contact.',
  },
  {
    id: 'thumb-index-press',
    title: 'Soft thumb & index press',
    instruction:
      'Touch the pads of your thumb and index finger together in your lap with steady, gentle pressure — notice the warmth until the urge crests.',
    durationHint: '60 seconds',
    why: 'Gives the exact fingertips seeking sensory feedback a calm, non-harmful tactile signal.',
  },
  {
    id: 'clasp-and-breathe',
    title: 'Interlace & soften the jaw',
    instruction:
      'Loosely interlace your fingers below chest height. Unclench your jaw and exhale slightly longer than you inhale.',
    durationHint: '60 seconds',
    why: 'Shifts attention from micro-searching to a slower, calmer breathing rhythm.',
  },
  {
    id: 'smooth-brow-palm',
    title: 'Cool fingertip reset',
    instruction:
      'If an eyebrow feels itchy or tight, press the flat back of your cool wrist gently over the brow for five seconds, then lower both hands.',
    durationHint: '60 seconds',
    why: 'Addresses sensory discomfort without isolating or pinching individual hairs.',
  },
  {
    id: 'five-min-walk',
    title: 'Step away for water',
    instruction:
      'Stand up, take a slow sip of water, or walk around the room for five minutes. Still Rhythm will welcome you back when you return.',
    durationHint: '5 minutes',
    why: 'Breaks trance-like reading or screen posture where unconscious hand drift thrives.',
  },
];

export const CALMING_TECHNIQUES: CalmingTechnique[] = [
  {
    id: 'cyclic-sigh',
    title: 'Double-inhale sigh (Cyclic Sighing)',
    shortTitle: 'Guided sigh (60s)',
    durationHint: '1–2 minutes',
    summary:
      'Take one comfortable breath in through your nose, add a quick second sip of air at the top, then breathe out slowly through your mouth.',
    steps: [
      'Sit or stand tall without straining your neck.',
      'Breathe in gently through your nose until your lungs feel about three-quarters full.',
      'Take one short second breath in through your nose to top up.',
      'Exhale slowly and softly through your mouth for twice as long as you breathed in.',
      'Repeat 4 to 6 times and let your shoulders settle on each exhale.',
    ],
    whyItHelps:
      'In a Stanford clinical trial (Balban et al., 2023), five minutes of daily cyclic sighing improved mood and lowered stress breathing faster than box breathing or standard meditation — because the long exhale directly tells your heart to slow down.',
    neckSafetyNote: 'Completely gentle on your neck — keep your shoulders soft as you breathe in.',
    bestFor: 'Mental overload, restlessness with frequent face touches, or mid-afternoon tension.',
  },
  {
    id: 'steady-breath',
    title: 'Slow, steady breathing (6 breaths a minute)',
    shortTitle: 'Steady breath (2m)',
    durationHint: '2–3 minutes',
    summary:
      'Breathe in calmly for 4 seconds, then breathe out smoothly for 6 seconds. No holding or forcing.',
    steps: [
      'Rest your hands comfortably on your desk or lap.',
      'Inhale quietly through your nose for 4 seconds.',
      'Exhale smoothly for 6 seconds — letting your jaw unclench.',
      'Continue for 10 to 12 gentle breaths.',
    ],
    whyItHelps:
      'Large reviews of breathing research (Laborde et al., 2022; Zaccaro et al., 2018) show that breathing around 6 times per minute with a slightly longer exhale steadily restores calm nervous-system balance.',
    neckSafetyNote: 'Keep the breath low and easy in your ribs so your upper neck muscles stay relaxed.',
    bestFor: 'Sustained restlessness that has been building quietly over 15+ minutes.',
  },
  {
    id: 'hands-jaw-release',
    title: 'Hands & jaw tension release (neck-safe)',
    shortTitle: 'Hands & jaw release',
    durationHint: '90 seconds',
    summary:
      'Gently tense and release your hands, forearms, and feet — then simply let your jaw and shoulders drop without shrugging or pulling your neck.',
    steps: [
      'Lightly curl your fingers into soft fists for 5 seconds, then open your palms wide and feel the warmth release for 10 seconds.',
      'Press your heels gently into the floor for 5 seconds, then let your legs go heavy and loose.',
      'Let your tongue rest on the floor of your mouth and leave a tiny gap between your back teeth.',
      'On a slow exhale, let both shoulders sink down a centimeter — release only, never force a shrug.',
    ],
    whyItHelps:
      'Studies on Progressive Muscle Relaxation (Toussaint et al., 2021; Khir et al., 2024) show an immediate, steady drop in physical stress signals by helping your body feel the contrast between holding tight and letting go.',
    neckSafetyNote:
      'Designed specifically to be safe for a sensitive neck or herniated disc — works through your hands, feet, and jaw with zero neck pulling.',
    bestFor: 'Restlessness paired with shoulder hunching, leaning forward, or physical tension.',
  },
  {
    id: 'short-walk',
    title: 'Change position & take a 2-minute reset',
    shortTitle: 'Stand & short break',
    durationHint: '2–5 minutes',
    summary:
      'Step away from the screen for a glass of water, or switch smoothly between sitting and standing to give your spine and mind a fresh reset.',
    steps: [
      'Pause where you are — leave a quick mental bookmark so you do not lose your thread.',
      'Stand up slowly (or settle into your chair if you have been standing for a while).',
      'Walk gently across the room or look out a window for 1 to 2 minutes.',
      'Return when your head feels clearer.',
    ],
    whyItHelps:
      'A major review of 22 studies (Albulescu et al., 2022) found short breaks under 10 minutes reliably restore energy and lower fatigue, while changing posture breaks up static neck and back pressure.',
    neckSafetyNote: 'Changing between sitting and standing unloads prolonged static pressure on cervical discs.',
    bestFor: 'Restlessness after sitting continuously for 35–45+ minutes or boredom/mental fog.',
  },
  {
    id: 'soften-gaze',
    title: 'Soften your gaze & hold a calm anchor',
    shortTitle: 'Soften gaze (30s)',
    durationHint: '30–60 seconds',
    summary:
      'Look away from your screen toward something across the room, widen your side vision, and give your idle hand a smooth object to rest on.',
    steps: [
      'Look at a wall, tree, or window at least 20 feet away.',
      'Without moving your eyes, gently notice the edges of the room in your side vision.',
      'Rest your hands on a smooth mug, pen, or flat on the desk for 30 seconds.',
      'Take one unhurried exhale before returning to the screen.',
    ],
    whyItHelps:
      'Staring closely at text locks your nervous system into tight focus. Widening your vision and giving restless fingers a quiet tactile anchor eases the urge to fidget or search your face.',
    neckSafetyNote: 'Keep your head balanced neutrally over your shoulders instead of craning toward the screen.',
    bestFor: 'Tight tunnel-vision focus, reading fatigue, or restless hands drifting upward.',
  },
];

export const ENVIRONMENT_ANCHORS = [
  {
    id: 'keep-hands-occupied',
    title: 'Give the idle hand a quiet anchor',
    detail: 'Hold a smooth stone, pen, or warm mug while reading long pages.',
  },
  {
    id: 'screen-eye-level',
    title: 'Bring your screen closer to eye level',
    detail: 'Raising your monitor or laptop stand reduces leaning forward and eases neck strain.',
  },
  {
    id: 'hydrate-brows',
    title: 'Soothe dry skin or tight brows early',
    detail: 'A dab of light balm or moisturizer removes the tactile snag that triggers searching.',
  },
  {
    id: 'soften-lighting',
    title: 'Soften harsh overhead light',
    detail: 'Warm ambient light reduces eye strain and brow tension during evening focus.',
  },
  {
    id: 'five-min-walk-anchor',
    title: 'Alternate sitting & standing before stiffness builds',
    detail: 'Switching position every 30–45 minutes keeps both your body and attention fresher.',
  },
];

export const CONTEXT_TAGS = [
  'Reading',
  'Deep focus',
  'Meeting',
  'Neck stiff',
  'Restless',
  'Evening',
  'Tired',
  'After a walk',
];

export const ZONE_OPTIONS: Array<{
  id: 'left-brow' | 'right-brow' | 'lashes' | 'hairline';
  label: string;
  shortLabel: string;
}> = [
  { id: 'left-brow', label: 'Left eyebrow', shortLabel: 'Left brow' },
  { id: 'right-brow', label: 'Right eyebrow', shortLabel: 'Right brow' },
  { id: 'lashes', label: 'Eyelashes', shortLabel: 'Eyelashes' },
  { id: 'hairline', label: 'Hairline / scalp', shortLabel: 'Hairline' },
];

export const DEFAULT_SETTINGS: StillSettings = {
  userName: '',
  stage1Enabled: true,
  stage2Enabled: true,
  soundEnabled: true,
  stage2RepeatChime: true,
  autoPipOnTabSwitch: true,
  stage1DwellSec: 1.2,
  stage2DwellSec: 2.6,
  zoneScale: 1.0,
  activeZones: ['left-brow', 'right-brow'],
  pinchFilterEnabled: false,
  previewMode: 'silhouette',
  pinnedResponses: ['palms-flat', 'thumb-index-press'],
  checkedAnchors: [],
  // Still Rhythm defaults
  selectedCameraId: '',
  workContext: 'desk',
  restlessnessSuggestionsEnabled: true,
  restlessnessThreshold: 65,
  sitStandGuidanceEnabled: true,
  sitWindowMinutes: 40,
  standWindowMinutes: 25,
};

export const EMPTY_CALIBRATION: PostureCalibration = {
  neutralEyeSpan: null,
  neutralShoulderSpan: null,
  neutralNeckGap: null,
  neutralShoulderTilt: null,
  neutralHeadRollDeg: null,
  sitFaceY: null,
  standFaceY: null,
  sitBgHash: null,
  standBgHash: null,
  updatedAt: null,
};

export function emptyFaceTouches(): FaceTouchCounts {
  return { chin: 0, cheek: 0, noseMouth: 0, forehead: 0 };
}

export function totalFaceTouches(ft: FaceTouchCounts | undefined): number {
  if (!ft) return 0;
  return (ft.chin || 0) + (ft.cheek || 0) + (ft.noseMouth || 0) + (ft.forehead || 0);
}

export function totalReliefMoves(d: Pick<DaySummary, 'shoulderRolls' | 'neckTilts' | 'backShifts' | 'neckRubs'>): number {
  return (d.shoulderRolls || 0) + (d.neckTilts || 0) + (d.backShifts || 0) + (d.neckRubs || 0);
}

export function getLocalDateKey(ts: number = Date.now()): string {
  const d = new Date(ts);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getFiveMinSlotIndex(ts: number = Date.now()): number {
  const d = new Date(ts);
  return Math.floor((d.getHours() * 60 + d.getMinutes()) / 5);
}

export function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors in restricted private browsing
  }
}

export function getEmptyDay(dateKey: string): DaySummary {
  return {
    dateKey,
    calmSeconds: 0,
    urgesRedirected: 0,
    graceRecoveries: 0,
    falseAlarms: 0,
    sittingSeconds: 0,
    standingSeconds: 0,
    postureSwitches: 0,
    restlessSeconds: 0,
    calmingResetsUsed: 0,
    forwardLeanSeconds: 0,
    shoulderRolls: 0,
    neckTilts: 0,
    backShifts: 0,
    neckRubs: 0,
    faceTouches: emptyFaceTouches(),
  };
}

export function normalizeDay(dateKey: string, raw?: Partial<DaySummary>): DaySummary {
  const base = getEmptyDay(dateKey);
  if (!raw) return base;
  return {
    ...base,
    ...raw,
    dateKey,
    faceTouches: {
      chin: Math.max(0, Number(raw.faceTouches?.chin) || 0),
      cheek: Math.max(0, Number(raw.faceTouches?.cheek) || 0),
      noseMouth: Math.max(0, Number(raw.faceTouches?.noseMouth) || 0),
      forehead: Math.max(0, Number(raw.faceTouches?.forehead) || 0),
    },
  };
}

export function getEmptyBucket(dateKey: string, slotIndex: number): FiveMinBucket {
  return {
    dateKey,
    slotIndex,
    activeSeconds: 0,
    sittingSeconds: 0,
    standingSeconds: 0,
    restlessnessSum: 0,
    restlessnessSamples: 0,
    peakRestlessness: 0,
    forwardLeanSeconds: 0,
    shoulderTensionSum: 0,
    reliefMoves: 0,
    shoulderRolls: 0,
    neckTilts: 0,
    backShifts: 0,
    neckRubs: 0,
    faceTouches: emptyFaceTouches(),
    browUrges: 0,
    calmingResets: 0,
  };
}

export function loadSettings(): StillSettings {
  const saved = readJson<Partial<StillSettings>>(KEYS.settings, {});
  return { ...DEFAULT_SETTINGS, ...saved };
}

export function saveSettings(settings: StillSettings): void {
  writeJson(KEYS.settings, settings);
}

export function loadCalibration(): PostureCalibration {
  const saved = readJson<Partial<PostureCalibration>>(KEYS.calibration, {});
  return { ...EMPTY_CALIBRATION, ...saved };
}

export function saveCalibration(cal: PostureCalibration): void {
  writeJson(KEYS.calibration, cal);
}

export function loadDays(): Record<string, DaySummary> {
  const raw = readJson<Record<string, Partial<DaySummary>>>(KEYS.days, {});
  const out: Record<string, DaySummary> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k] = normalizeDay(k, v);
  }
  return out;
}

export function saveDays(days: Record<string, DaySummary>): void {
  writeJson(KEYS.days, days);
}

export function loadBuckets(): Record<string, FiveMinBucket[]> {
  return readJson<Record<string, FiveMinBucket[]>>(KEYS.buckets, {});
}

export function saveBuckets(buckets: Record<string, FiveMinBucket[]>): void {
  // Retain latest 21 days of 5-minute buckets so localStorage stays lean and fast
  const keys = Object.keys(buckets).sort((a, b) => (a < b ? 1 : -1)).slice(0, 21);
  const pruned: Record<string, FiveMinBucket[]> = {};
  for (const k of keys) {
    pruned[k] = buckets[k];
  }
  writeJson(KEYS.buckets, pruned);
}

export function loadEvents(): AwarenessEvent[] {
  return readJson<AwarenessEvent[]>(KEYS.events, []);
}

export function saveEvents(events: AwarenessEvent[]): void {
  writeJson(KEYS.events, events.slice(0, 500));
}

export function loadNotes(): NoteEntry[] {
  return readJson<NoteEntry[]>(KEYS.notes, []);
}

export function saveNotes(notes: NoteEntry[]): void {
  writeJson(KEYS.notes, notes.slice(0, 300));
}

export function loadDismissedSummaryDate(): string {
  try {
    return localStorage.getItem(KEYS.dismissedSummary) || '';
  } catch {
    return '';
  }
}

export function saveDismissedSummaryDate(dateKey: string): void {
  try {
    localStorage.setItem(KEYS.dismissedSummary, dateKey);
  } catch {
    // ignore
  }
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  if (mins > 0) {
    return `${mins}m ${String(secs).padStart(2, '0')}s`;
  }
  return `${secs}s`;
}

export function formatShortDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m`;
  return `${s}s`;
}

export function clearAllLocalData(): void {
  try {
    localStorage.removeItem(KEYS.days);
    localStorage.removeItem(KEYS.events);
    localStorage.removeItem(KEYS.notes);
    localStorage.removeItem(KEYS.buckets);
    localStorage.removeItem(KEYS.dismissedSummary);
  } catch {
    // ignore
  }
}

export interface StillBackupPayload {
  days?: Record<string, Partial<DaySummary>>;
  events?: AwarenessEvent[];
  notes?: NoteEntry[];
  buckets?: Record<string, FiveMinBucket[]>;
}

export function mergeBackupPayload(
  current: {
    days: Record<string, DaySummary>;
    events: AwarenessEvent[];
    notes: NoteEntry[];
    buckets: Record<string, FiveMinBucket[]>;
  },
  incoming: StillBackupPayload
): {
  days: Record<string, DaySummary>;
  events: AwarenessEvent[];
  notes: NoteEntry[];
  buckets: Record<string, FiveMinBucket[]>;
  addedDays: number;
} {
  const mergedDays: Record<string, DaySummary> = { ...current.days };
  let addedDays = 0;

  if (incoming.days && typeof incoming.days === 'object') {
    for (const [key, rawDay] of Object.entries(incoming.days)) {
      if (!rawDay || typeof rawDay !== 'object' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
      const incomingDay = normalizeDay(key, rawDay);
      const existing = mergedDays[key];
      if (!existing) {
        mergedDays[key] = incomingDay;
        addedDays += 1;
      } else {
        mergedDays[key] = {
          dateKey: key,
          calmSeconds: Math.max(existing.calmSeconds, incomingDay.calmSeconds),
          urgesRedirected: Math.max(existing.urgesRedirected, incomingDay.urgesRedirected),
          graceRecoveries: Math.max(existing.graceRecoveries, incomingDay.graceRecoveries),
          falseAlarms: Math.max(existing.falseAlarms, incomingDay.falseAlarms),
          sittingSeconds: Math.max(existing.sittingSeconds, incomingDay.sittingSeconds),
          standingSeconds: Math.max(existing.standingSeconds, incomingDay.standingSeconds),
          postureSwitches: Math.max(existing.postureSwitches, incomingDay.postureSwitches),
          restlessSeconds: Math.max(existing.restlessSeconds, incomingDay.restlessSeconds),
          calmingResetsUsed: Math.max(existing.calmingResetsUsed, incomingDay.calmingResetsUsed),
          forwardLeanSeconds: Math.max(existing.forwardLeanSeconds, incomingDay.forwardLeanSeconds),
          shoulderRolls: Math.max(existing.shoulderRolls, incomingDay.shoulderRolls),
          neckTilts: Math.max(existing.neckTilts, incomingDay.neckTilts),
          backShifts: Math.max(existing.backShifts, incomingDay.backShifts),
          neckRubs: Math.max(existing.neckRubs, incomingDay.neckRubs),
          faceTouches: {
            chin: Math.max(existing.faceTouches.chin, incomingDay.faceTouches.chin),
            cheek: Math.max(existing.faceTouches.cheek, incomingDay.faceTouches.cheek),
            noseMouth: Math.max(existing.faceTouches.noseMouth, incomingDay.faceTouches.noseMouth),
            forehead: Math.max(existing.faceTouches.forehead, incomingDay.faceTouches.forehead),
          },
        };
      }
    }
  }

  const eventMap = new Map<string, AwarenessEvent>();
  for (const ev of current.events) eventMap.set(ev.id, ev);
  if (Array.isArray(incoming.events)) {
    for (const ev of incoming.events) {
      if (ev && typeof ev.id === 'string' && typeof ev.timestamp === 'number') {
        eventMap.set(ev.id, ev);
      }
    }
  }
  const mergedEvents = Array.from(eventMap.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 500);

  const noteMap = new Map<string, NoteEntry>();
  for (const n of current.notes) noteMap.set(n.id, n);
  if (Array.isArray(incoming.notes)) {
    for (const n of incoming.notes) {
      if (n && typeof n.id === 'string' && typeof n.text === 'string') {
        noteMap.set(n.id, n);
      }
    }
  }
  const mergedNotes = Array.from(noteMap.values())
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 300);

  const mergedBuckets: Record<string, FiveMinBucket[]> = { ...current.buckets };
  if (incoming.buckets && typeof incoming.buckets === 'object') {
    for (const [key, list] of Object.entries(incoming.buckets)) {
      if (!Array.isArray(list) || !/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
      if (!mergedBuckets[key] || list.length > mergedBuckets[key].length) {
        mergedBuckets[key] = list;
      }
    }
  }

  return {
    days: mergedDays,
    events: mergedEvents,
    notes: mergedNotes,
    buckets: mergedBuckets,
    addedDays,
  };
}
