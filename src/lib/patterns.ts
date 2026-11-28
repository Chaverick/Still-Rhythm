import {
  emptyFaceTouches,
  formatShortDuration,
  getLocalDateKey,
  totalFaceTouches,
  totalReliefMoves,
} from './storage';
import type { AwarenessEvent, DaySummary, FaceTouchRegion, FiveMinBucket } from '../types';

export interface HourlySummaryPoint {
  hour: number; // 0..23
  shortLabel: string; // e.g. '9a', '2p'
  rangeLabel: string; // e.g. '2:00 PM – 3:00 PM'
  activeSeconds: number;
  sittingSeconds: number;
  standingSeconds: number;
  dominantPosture: 'sitting' | 'standing' | 'mixed';
  avgRestlessness: number; // 0..100
  peakRestlessness: number;
  forwardLeanMinutes: number;
  reliefMoves: number;
  faceTouches: number;
  browUrges: number;
  calmingResets: number;
}

export interface PlainPatternInsight {
  id: string;
  category: string;
  headline: string;
  detail: string;
}

export interface DailyStoryReport {
  dateKey: string;
  titleLabel: string;
  hasEnoughData: boolean;
  totalTrackedSeconds: number;
  standingPct: number | null;
  sittingSeconds: number;
  standingSeconds: number;
  postureSwitches: number;
  urgesRedirected: number;
  graceRecoveries: number;
  totalTouches: number;
  topTouchRegionLabel: string | null;
  totalAdjustments: number;
  calmingResetsUsed: number;
  peakWindowLabel: string | null;
  insights: PlainPatternInsight[];
  hourly: HourlySummaryPoint[];
  markdownDigest: string;
}

const REGION_LABELS: Record<FaceTouchRegion, string> = {
  chin: 'chin or jaw',
  cheek: 'cheek',
  noseMouth: 'nose or mouth',
  forehead: 'forehead',
};

function formatHourShort(h: number): string {
  if (h === 0) return '12a';
  if (h < 12) return `${h}a`;
  if (h === 12) return '12p';
  return `${h - 12}p`;
}

function formatHourRange(h: number): string {
  const fmt = (hr: number) => {
    const norm = hr % 24;
    if (norm === 0) return '12:00 AM';
    if (norm < 12) return `${norm}:00 AM`;
    if (norm === 12) return '12:00 PM';
    return `${norm - 12}:00 PM`;
  };
  return `${fmt(h)} – ${fmt(h + 1)}`;
}

function describeDayLabel(dateKey: string): string {
  const todayKey = getLocalDateKey();
  if (dateKey === todayKey) return 'Today so far';
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (dateKey === getLocalDateKey(y.getTime())) return 'Yesterday';
  const [yr, mo, dy] = dateKey.split('-').map(Number);
  return new Date(yr, mo - 1, dy).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

function pearson(xs: number[], ys: number[]): number | null {
  if (xs.length < 4 || xs.length !== ys.length) return null;
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx2 = 0;
  let dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    dx2 += dx * dx;
    dy2 += dy * dy;
  }
  if (dx2 < 1e-6 || dy2 < 1e-6) return null;
  return num / Math.sqrt(dx2 * dy2);
}

/**
 * Collapses 5-minute local buckets into clean hourly points for visual timelines.
 */
export function buildHourlyTimeline(buckets: FiveMinBucket[]): HourlySummaryPoint[] {
  const byHour = new Map<number, FiveMinBucket[]>();
  for (const b of buckets) {
    if (b.activeSeconds <= 0 && b.browUrges <= 0 && b.reliefMoves <= 0) continue;
    const hr = Math.floor(b.slotIndex / 12);
    const list = byHour.get(hr) ?? [];
    list.push(b);
    byHour.set(hr, list);
  }

  if (byHour.size === 0) return [];

  const hours = Array.from(byHour.keys()).sort((a, b) => a - b);
  const minH = hours[0];
  const maxH = hours[hours.length - 1];
  const out: HourlySummaryPoint[] = [];

  for (let h = minH; h <= maxH; h++) {
    const list = byHour.get(h) ?? [];
    let activeSeconds = 0;
    let sittingSeconds = 0;
    let standingSeconds = 0;
    let rSum = 0;
    let rSamples = 0;
    let peakR = 0;
    let leanSec = 0;
    let reliefMoves = 0;
    let touches = 0;
    let browUrges = 0;
    let calmingResets = 0;

    for (const b of list) {
      activeSeconds += b.activeSeconds;
      sittingSeconds += b.sittingSeconds;
      standingSeconds += b.standingSeconds;
      rSum += b.restlessnessSum;
      rSamples += b.restlessnessSamples;
      if (b.peakRestlessness > peakR) peakR = b.peakRestlessness;
      leanSec += b.forwardLeanSeconds;
      reliefMoves += b.reliefMoves;
      touches += totalFaceTouches(b.faceTouches);
      browUrges += b.browUrges;
      calmingResets += b.calmingResets;
    }

    const totalPosture = sittingSeconds + standingSeconds;
    const dominantPosture: 'sitting' | 'standing' | 'mixed' =
      totalPosture === 0
        ? 'sitting'
        : standingSeconds / totalPosture >= 0.65
          ? 'standing'
          : sittingSeconds / totalPosture >= 0.65
            ? 'sitting'
            : 'mixed';

    out.push({
      hour: h,
      shortLabel: formatHourShort(h),
      rangeLabel: formatHourRange(h),
      activeSeconds,
      sittingSeconds,
      standingSeconds,
      dominantPosture,
      avgRestlessness: rSamples > 0 ? Math.round(rSum / rSamples) : 0,
      peakRestlessness: Math.round(peakR),
      forwardLeanMinutes: Math.round(leanSec / 60),
      reliefMoves,
      faceTouches: touches,
      browUrges,
      calmingResets,
    });
  }

  return out;
}

/**
 * Generates a warm, plain-English story explaining which signals came together on a given day.
 * Zero clinical/statistical jargon — designed for morning review and sharing.
 */
export function buildDailyStory(
  dateKey: string,
  day: DaySummary,
  buckets: FiveMinBucket[],
  threshold = 65
): DailyStoryReport {
  const titleLabel = describeDayLabel(dateKey);
  const hourly = buildHourlyTimeline(buckets);
  const activeBuckets = buckets.filter((b) => b.activeSeconds >= 30);

  const totalTrackedSeconds = Math.max(
    day.calmSeconds,
    day.sittingSeconds + day.standingSeconds,
    activeBuckets.reduce((acc, b) => acc + b.activeSeconds, 0)
  );
  const hasEnoughData = totalTrackedSeconds >= 10 * 60 || activeBuckets.length >= 2;

  const postureTotal = day.sittingSeconds + day.standingSeconds;
  const standingPct =
    postureTotal >= 60 ? Math.round((day.standingSeconds / postureTotal) * 100) : null;

  const totalTouches = totalFaceTouches(day.faceTouches);
  const totalAdjustments = totalReliefMoves(day);

  // Top face-touch region in plain language
  let topTouchRegionLabel: string | null = null;
  if (totalTouches > 0) {
    const pairs: Array<[FaceTouchRegion, number]> = [
      ['chin', day.faceTouches.chin],
      ['cheek', day.faceTouches.cheek],
      ['noseMouth', day.faceTouches.noseMouth],
      ['forehead', day.faceTouches.forehead],
    ];
    pairs.sort((a, b) => b[1] - a[1]);
    if (pairs[0][1] > 0) {
      topTouchRegionLabel = REGION_LABELS[pairs[0][0]];
    }
  }

  // Peak restlessness / urge hour
  const activeHours = hourly.filter((h) => h.activeSeconds >= 120);
  let peakWindowLabel: string | null = null;
  if (activeHours.length > 0) {
    const scored = [...activeHours].sort(
      (a, b) =>
        b.avgRestlessness + b.browUrges * 18 + b.reliefMoves * 4 -
        (a.avgRestlessness + a.browUrges * 18 + a.reliefMoves * 4)
    );
    if (scored[0].avgRestlessness > 0 || scored[0].browUrges > 0) {
      peakWindowLabel = scored[0].rangeLabel;
    }
  }

  const insights: PlainPatternInsight[] = [];

  // 1. Sitting vs. Standing comparison (when both postures were used)
  const sitBuckets = activeBuckets.filter((b) => b.sittingSeconds > b.standingSeconds);
  const standBuckets = activeBuckets.filter((b) => b.standingSeconds > b.sittingSeconds);
  if (sitBuckets.length >= 2 && standBuckets.length >= 2) {
    const avgSitR =
      sitBuckets.reduce(
        (acc, b) => acc + (b.restlessnessSamples ? b.restlessnessSum / b.restlessnessSamples : 0),
        0
      ) / sitBuckets.length;
    const avgStandR =
      standBuckets.reduce(
        (acc, b) => acc + (b.restlessnessSamples ? b.restlessnessSum / b.restlessnessSamples : 0),
        0
      ) / standBuckets.length;

    const sitTouchRate =
      sitBuckets.reduce((acc, b) => acc + totalFaceTouches(b.faceTouches), 0) /
      Math.max(0.25, sitBuckets.reduce((acc, b) => acc + b.sittingSeconds, 0) / 3600);
    const standTouchRate =
      standBuckets.reduce((acc, b) => acc + totalFaceTouches(b.faceTouches), 0) /
      Math.max(0.25, standBuckets.reduce((acc, b) => acc + b.standingSeconds, 0) / 3600);

    if (avgSitR - avgStandR >= 6) {
      const pctLower = Math.round(((avgSitR - avgStandR) / Math.max(1, avgSitR)) * 100);
      insights.push({
        id: 'sit-vs-stand',
        category: 'Sitting & standing',
        headline: `Standing blocks felt noticeably calmer (${pctLower}% less restlessness)`,
        detail:
          standTouchRate < sitTouchRate * 0.85
            ? 'While standing, your body stayed steadier and you also touched your face less often than during longer seated stretches.'
            : 'Switching to standing broke up long seated stretches and kept restlessness noticeably lower.',
      });
    } else if (standingPct !== null) {
      insights.push({
        id: 'sit-vs-stand',
        category: 'Sitting & standing',
        headline: `You spent ${standingPct}% of your desk time standing (${formatShortDuration(day.standingSeconds)})`,
        detail:
          day.postureSwitches > 0
            ? `You changed between sitting and standing ${day.postureSwitches} ${day.postureSwitches === 1 ? 'time' : 'times'}, which helps take steady pressure off your neck and upper back.`
            : 'Alternating between sitting and standing every 30–45 minutes usually helps keep afternoon restlessness down.',
      });
    }
  } else if (day.sittingSeconds >= 45 * 60 && day.standingSeconds < 5 * 60) {
    insights.push({
      id: 'long-sitting',
      category: 'Sitting & standing',
      headline: `Mostly seated (${formatShortDuration(day.sittingSeconds)} at your desk)`,
      detail:
        'Try adding two or three 15–25 minute standing blocks tomorrow so we can compare how standing affects your neck comfort and restlessness.',
    });
  }

  // 2. Neck & shoulder comfort buildup before restlessness or urges (lag check)
  if (totalAdjustments >= 3 || day.forwardLeanSeconds >= 10 * 60) {
    const sorted = [...activeBuckets].sort((a, b) => a.slotIndex - b.slotIndex);
    let precededCount = 0;
    let spikeCount = 0;
    for (let i = 0; i < sorted.length; i++) {
      const b = sorted[i];
      const avgR = b.restlessnessSamples ? b.restlessnessSum / b.restlessnessSamples : 0;
      const isSpike = avgR >= threshold || b.browUrges > 0;
      if (isSpike) {
        spikeCount += 1;
        const prior = sorted.filter(
          (p) => p.slotIndex < b.slotIndex && b.slotIndex - p.slotIndex <= 5
        );
        const hadStrainBefore = prior.some(
          (p) => p.reliefMoves >= 1 || p.forwardLeanSeconds >= 90
        );
        if (hadStrainBefore) precededCount += 1;
      }
    }

    if (spikeCount > 0 && precededCount >= Math.ceil(spikeCount * 0.5)) {
      insights.push({
        id: 'neck-precedes-restless',
        category: 'Neck & shoulder comfort',
        headline: 'Neck stiffness and posture shifts often showed up right before restlessness',
        detail: `Leaning forward and small comfort adjustments (${totalAdjustments} shoulder rolls, neck tilts, back shifts, or neck rubs) frequently appeared 10–25 minutes before restlessness or eyebrow urges peaked.`,
      });
    } else {
      insights.push({
        id: 'neck-summary',
        category: 'Neck & shoulder comfort',
        headline: `${totalAdjustments} comfort adjustments noticed alongside ${formatShortDuration(day.forwardLeanSeconds)} of leaning forward`,
        detail:
          'These quiet shoulder rolls, neck tilts, and back shifts show when your body is trying to ease neck tension — especially useful to compare against long seated blocks.',
      });
    }
  }

  // 3. Face touches & restlessness connection
  if (totalTouches >= 4) {
    const r = pearson(
      activeBuckets.map((b) =>
        b.restlessnessSamples ? b.restlessnessSum / b.restlessnessSamples : 0
      ),
      activeBuckets.map((b) => totalFaceTouches(b.faceTouches))
    );
    const linked = r !== null && r >= 0.45;
    insights.push({
      id: 'face-touch-link',
      category: 'Face touches',
      headline: linked
        ? `Face touches and restlessness rose together (${totalTouches} touches)`
        : `${totalTouches} quiet face touches logged — mostly your ${topTouchRegionLabel ?? 'face'}`,
      detail: linked
        ? `When mental effort or restlessness climbed, your hand naturally went to your ${topTouchRegionLabel ?? 'face'} more often. Noticing this early makes it easier to pause before reaching your eyebrows.`
        : `Most touches were resting your hand on your ${topTouchRegionLabel ?? 'face'}. Research shows spontaneous face touching is a common way the brain handles deep focus or stress.`,
    });
  }

  // 4. Peak window & eyebrow awareness / calming summary
  if (peakWindowLabel && (day.urgesRedirected > 0 || day.calmingResetsUsed > 0)) {
    insights.push({
      id: 'peak-window',
      category: 'Timing & resets',
      headline: `Toughest stretch was ${peakWindowLabel}`,
      detail:
        day.calmingResetsUsed > 0
          ? `You redirected ${day.urgesRedirected} ${day.urgesRedirected === 1 ? 'urge' : 'urges'} and used ${day.calmingResetsUsed} calming ${day.calmingResetsUsed === 1 ? 'reset' : 'resets'}. Planning a standing switch or brief breath just before ${peakWindowLabel.split(' – ')[0]} can soften that wave.`
          : `You redirected ${day.urgesRedirected} ${day.urgesRedirected === 1 ? 'urge' : 'urges'} today. A short standing switch or 60-second double-inhale sigh right around ${peakWindowLabel.split(' – ')[0]} may help prevent buildup.`,
    });
  }

  if (insights.length === 0 && hasEnoughData) {
    insights.push({
      id: 'steady-day',
      category: 'Overall rhythm',
      headline: 'A steady, mostly calm stretch at your computer',
      detail:
        'As you collect a couple more hours or days of sessions, Still Rhythm will automatically highlight how sitting length, posture comfort, face touches, and restlessness connect for you.',
    });
  }

  // Plain-English Markdown Digest for daily review or sharing
  const digestLines = [
    `# Still Rhythm — ${titleLabel} (${dateKey})`,
    '',
    `- **Time tracked:** ${formatShortDuration(totalTrackedSeconds)}`,
    standingPct !== null
      ? `- **Sitting vs. standing:** ${formatShortDuration(day.standingSeconds)} standing (${standingPct}%) · ${formatShortDuration(day.sittingSeconds)} sitting · ${day.postureSwitches} switches`
      : `- **Sitting vs. standing:** Not tracked at a desk yet`,
    `- **Eyebrow awareness:** ${day.urgesRedirected} urges redirected · ${day.graceRecoveries} grace recoveries`,
    `- **Neck & shoulder comfort (silent):** ${totalAdjustments} adjustments (${day.shoulderRolls} shoulder rolls, ${day.neckTilts} neck tilts, ${day.backShifts} back shifts, ${day.neckRubs} neck rubs) · ${formatShortDuration(day.forwardLeanSeconds)} leaning forward`,
    `- **Face touches (silent):** ${totalTouches} total${topTouchRegionLabel ? ` (most often ${topTouchRegionLabel})` : ''}`,
    '',
    '## What came together',
    ...insights.map((ins) => `- **${ins.headline}:** ${ins.detail}`),
  ];

  return {
    dateKey,
    titleLabel,
    hasEnoughData,
    totalTrackedSeconds,
    standingPct,
    sittingSeconds: day.sittingSeconds,
    standingSeconds: day.standingSeconds,
    postureSwitches: day.postureSwitches,
    urgesRedirected: day.urgesRedirected,
    graceRecoveries: day.graceRecoveries,
    totalTouches,
    topTouchRegionLabel,
    totalAdjustments,
    calmingResetsUsed: day.calmingResetsUsed,
    peakWindowLabel,
    insights,
    hourly,
    markdownDigest: digestLines.join('\n'),
  };
}

/**
 * Generates a realistic, non-persisted sample day so users (and anyone they share the link with)
 * can immediately explore what a Next-Day Summary & Pattern Timeline looks like on Day 1.
 */
export function buildSampleDayStory(): DailyStoryReport {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const dateKey = getLocalDateKey(y.getTime());

  // Build 8 hours (9 AM – 5 PM) of realistic 5-minute buckets
  const buckets: FiveMinBucket[] = [];
  const hourProfiles = [
    { hr: 9,  posture: 'sitting',  r: 26, lean: 35,  relief: 1, touches: { chin: 1, cheek: 1, noseMouth: 1, forehead: 0 }, urges: 0, resets: 0 },
    { hr: 10, posture: 'standing', r: 28, lean: 20,  relief: 1, touches: { chin: 1, cheek: 1, noseMouth: 0, forehead: 0 }, urges: 0, resets: 0 },
    { hr: 11, posture: 'sitting',  r: 67, lean: 145, relief: 5, touches: { chin: 4, cheek: 2, noseMouth: 1, forehead: 1 }, urges: 1, resets: 1 },
    { hr: 12, posture: 'standing', r: 31, lean: 25,  relief: 1, touches: { chin: 1, cheek: 1, noseMouth: 1, forehead: 0 }, urges: 0, resets: 0 },
    { hr: 13, posture: 'sitting',  r: 50, lean: 110, relief: 3, touches: { chin: 2, cheek: 1, noseMouth: 1, forehead: 1 }, urges: 1, resets: 0 },
    { hr: 14, posture: 'sitting',  r: 74, lean: 170, relief: 6, touches: { chin: 4, cheek: 2, noseMouth: 2, forehead: 1 }, urges: 2, resets: 1 },
    { hr: 15, posture: 'standing', r: 33, lean: 30,  relief: 1, touches: { chin: 1, cheek: 0, noseMouth: 1, forehead: 1 }, urges: 0, resets: 0 },
    { hr: 16, posture: 'sitting',  r: 39, lean: 70,  relief: 1, touches: { chin: 1, cheek: 1, noseMouth: 0, forehead: 0 }, urges: 0, resets: 0 },
  ] as const;

  for (const p of hourProfiles) {
    // 6 active 5-min buckets per hour = 30m active tracked per hour -> 4h total workday sample
    for (let s = 0; s < 6; s++) {
      const slotIndex = p.hr * 12 + s * 2;
      const rVal = Math.min(92, Math.max(18, p.r + (s - 2) * 3));
      const isPeakSlot = s === 4;
      const isBeforePeak = s === 2 || s === 3;
      buckets.push({
        dateKey,
        slotIndex,
        activeSeconds: 300,
        sittingSeconds: p.posture === 'sitting' ? 300 : 0,
        standingSeconds: p.posture === 'standing' ? 300 : 0,
        restlessnessSum: rVal * 10,
        restlessnessSamples: 10,
        peakRestlessness: rVal + 4,
        forwardLeanSeconds: isBeforePeak ? Math.round(p.lean) : Math.round(p.lean * 0.45),
        shoulderTensionSum: p.lean * 2,
        reliefMoves: isBeforePeak ? Math.ceil(p.relief / 2) : s === 0 ? 0 : Math.floor(p.relief / 6),
        shoulderRolls: isBeforePeak && p.relief >= 3 ? 1 : 0,
        neckTilts: isBeforePeak && p.relief >= 5 ? 1 : 0,
        backShifts: isPeakSlot && p.relief >= 3 ? 1 : 0,
        neckRubs: isBeforePeak && p.relief >= 6 ? 1 : 0,
        faceTouches: isPeakSlot ? { ...p.touches } : emptyFaceTouches(),
        browUrges: isPeakSlot ? p.urges : 0,
        calmingResets: isPeakSlot ? p.resets : 0,
      });
    }
  }

  const sampleDay: DaySummary = {
    dateKey,
    calmSeconds: 4 * 3600,
    urgesRedirected: 4,
    graceRecoveries: 1,
    falseAlarms: 1,
    sittingSeconds: 2.5 * 3600,
    standingSeconds: 1.5 * 3600,
    postureSwitches: 6,
    restlessSeconds: 38 * 60,
    calmingResetsUsed: 2,
    forwardLeanSeconds: 44 * 60,
    shoulderRolls: 7,
    neckTilts: 4,
    backShifts: 5,
    neckRubs: 3,
    faceTouches: { chin: 15, cheek: 9, noseMouth: 7, forehead: 4 },
  };

  return buildDailyStory(dateKey, sampleDay, buckets, 65);
}

export interface SevenDayOverview {
  activeDays: number;
  totalCalmSeconds: number;
  totalRedirected: number;
  totalGrace: number;
  standingPct: number | null;
  totalTouches: number;
  totalResets: number;
  summaryLines: string[];
}

const SEVEN_DAY_BLOCKS = [
  { label: 'early morning (5–9am)', start: 5, end: 9 },
  { label: 'late morning (9am–1pm)', start: 9, end: 13 },
  { label: 'afternoon (1–5pm)', start: 13, end: 17 },
  { label: 'evening (5–9pm)', start: 17, end: 21 },
  { label: 'late night (9pm–1am)', start: 21, end: 25 },
  { label: 'overnight (1–5am)', start: 1, end: 5 },
] as const;

export function buildSevenDaySummary(
  days: Record<string, DaySummary>,
  events: AwarenessEvent[]
): SevenDayOverview {
  const now = new Date();
  const keys = new Set<string>();
  let activeDays = 0;
  let totalCalmSeconds = 0;
  let totalRedirected = 0;
  let totalGrace = 0;
  let totalSitting = 0;
  let totalStanding = 0;
  let totalTouches = 0;
  let totalAdjustments = 0;
  let totalResets = 0;
  let bestStandDay: { label: string; pct: number; calmSec: number } | null = null;

  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = getLocalDateKey(d.getTime());
    keys.add(key);
    const s = days[key];
    if (!s) continue;
    const desk = (s.sittingSeconds || 0) + (s.standingSeconds || 0);
    if (s.calmSeconds >= 60 || desk >= 60 || s.urgesRedirected > 0) {
      activeDays += 1;
    }
    totalCalmSeconds += s.calmSeconds || 0;
    totalRedirected += s.urgesRedirected || 0;
    totalGrace += s.graceRecoveries || 0;
    totalSitting += s.sittingSeconds || 0;
    totalStanding += s.standingSeconds || 0;
    totalTouches += totalFaceTouches(s.faceTouches);
    totalAdjustments += totalReliefMoves(s);
    totalResets += s.calmingResetsUsed || 0;

    if (desk >= 15 * 60) {
      const pct = Math.round(((s.standingSeconds || 0) / desk) * 100);
      if (!bestStandDay || pct > bestStandDay.pct) {
        bestStandDay = {
          label: i === 0 ? 'Today' : i === 1 ? 'Yesterday' : describeDayLabel(key),
          pct,
          calmSec: s.calmSeconds || 0,
        };
      }
    }
  }

  const totalDesk = totalSitting + totalStanding;
  const standingPct = totalDesk >= 120 ? Math.round((totalStanding / totalDesk) * 100) : null;

  // Find peak urge window across the last 7 days
  const blockCounts = SEVEN_DAY_BLOCKS.map((b) => ({ ...b, count: 0 }));
  for (const ev of events) {
    if (!keys.has(ev.dateKey)) continue;
    if (ev.kind !== 'redirect-stage1' && ev.kind !== 'redirect-stage2' && ev.kind !== 'grace') {
      continue;
    }
    const hr = new Date(ev.timestamp).getHours();
    const normHr = hr === 0 ? 24 : hr;
    const found = blockCounts.find((b) => normHr >= b.start && normHr < b.end);
    if (found) found.count += 1;
  }
  const peakBlock = [...blockCounts].sort((a, b) => b.count - a.count)[0];

  const summaryLines: string[] = [];

  if (activeDays === 0) {
    summaryLines.push(
      'Your 7-day pattern summary fills in automatically as you use Still Rhythm across the week.'
    );
  } else {
    const urgeTotal = totalRedirected + totalGrace;
    const redirectPart =
      urgeTotal > 0
        ? ` and caught ${totalRedirected} brow ${totalRedirected === 1 ? 'urge' : 'urges'}`
        : '';
    summaryLines.push(
      `Over the last 7 days (${activeDays} active ${activeDays === 1 ? 'day' : 'days'}), you logged ${formatShortDuration(totalCalmSeconds)} of calm time${redirectPart}.`
    );

    if (standingPct !== null) {
      summaryLines.push(
        `Desk balance averaged ${standingPct}% standing (${formatShortDuration(totalStanding)} standing vs. ${formatShortDuration(totalSitting)} sitting)${
          bestStandDay && activeDays > 1 ? ` — highest on ${bestStandDay.label} (${bestStandDay.pct}%)` : ''
        }.`
      );
    }

    if (peakBlock && peakBlock.count >= 2) {
      summaryLines.push(
        `Most brow moments clustered in the ${peakBlock.label} (${peakBlock.count} times) — a quick 60s breath or posture switch right before that window helps most.`
      );
    } else if (totalTouches > 0 || totalAdjustments > 0) {
      summaryLines.push(
        `Background rhythm logged ${totalTouches} face touches, ${totalAdjustments} neck/shoulder comfort shifts, and ${totalResets} guided calming ${totalResets === 1 ? 'reset' : 'resets'}.`
      );
    }
  }

  return {
    activeDays,
    totalCalmSeconds,
    totalRedirected,
    totalGrace,
    standingPct,
    totalTouches,
    totalResets,
    summaryLines,
  };
}
