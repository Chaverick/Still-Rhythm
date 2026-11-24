import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildDailyStory,
  buildSampleDayStory,
  type DailyStoryReport,
} from '../lib/patterns';
import {
  formatDuration,
  formatShortDuration,
  getEmptyDay,
  getLocalDateKey,
  totalFaceTouches,
  totalReliefMoves,
} from '../lib/storage';
import type { AwarenessEvent, DaySummary, FiveMinBucket, NoteEntry } from '../types';

type MetricKey = 'calm' | 'standing' | 'redirected' | 'touches';

interface PatternsViewProps {
  days: Record<string, DaySummary>;
  buckets: Record<string, FiveMinBucket[]>;
  events: AwarenessEvent[];
  notes: NoteEntry[];
  restlessnessThreshold: number;
  onExportData: () => void;
  onImportFile: (file: File) => void;
  onCopiedDigest: () => void;
}

const TIME_BLOCKS = [
  { id: 'early', label: '5–9a', name: 'Early morning', start: 5, end: 9 },
  { id: 'morning', label: '9a–1p', name: 'Late morning', start: 9, end: 13 },
  { id: 'afternoon', label: '1–5p', name: 'Afternoon', start: 13, end: 17 },
  { id: 'evening', label: '5–9p', name: 'Evening', start: 17, end: 21 },
  { id: 'late', label: '9p–1a', name: 'Late night', start: 21, end: 25 },
  { id: 'overnight', label: '1–5a', name: 'Overnight', start: 1, end: 5 },
] as const;

interface DayRow {
  dateKey: string;
  shortLabel: string;
  fullLabel: string;
  isToday: boolean;
  summary: DaySummary;
  redirectRate: number | null;
  standingPct: number | null;
  deltaCalmSec: number | null;
}

function formatDayLabel(dateKey: string, todayKey: string, yesterdayKey: string): string {
  if (dateKey === todayKey) return 'Today';
  if (dateKey === yesterdayKey) return 'Yesterday';
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function formatDeltaCalm(deltaSec: number): string {
  const abs = Math.abs(deltaSec);
  const sign = deltaSec > 0 ? '+' : '−';
  if (abs < 60) return `${sign}${abs}s`;
  return `${sign}${formatShortDuration(abs)}`;
}

export function PatternsView({
  days,
  buckets,
  events,
  notes,
  restlessnessThreshold,
  onExportData,
  onImportFile,
  onCopiedDigest,
}: PatternsViewProps) {
  const [metric, setMetric] = useState<MetricKey>('calm');
  const [previewSample, setPreviewSample] = useState(false);
  const [selectedHourIdx, setSelectedHourIdx] = useState<number>(0);
  const timelineCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const todayKey = getLocalDateKey();
  const yesterdayKey = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return getLocalDateKey(d.getTime());
  }, []);

  // Default inspected story day: Yesterday if it has data, else most recent prior day, else Today
  const defaultStoryDateKey = useMemo(() => {
    const yDay = days[yesterdayKey];
    if (yDay && (yDay.calmSeconds >= 60 || yDay.sittingSeconds + yDay.standingSeconds >= 60)) {
      return yesterdayKey;
    }
    const priorKeys = Object.keys(days)
      .filter((k) => k !== todayKey && (days[k].calmSeconds >= 60 || days[k].sittingSeconds + days[k].standingSeconds >= 60))
      .sort((a, b) => (a < b ? 1 : -1));
    if (priorKeys.length > 0) return priorKeys[0];
    return todayKey;
  }, [days, todayKey, yesterdayKey]);

  const [storyDateKey, setStoryDateKey] = useState<string>(defaultStoryDateKey);

  // Build 14-day window (oldest -> newest) for trend chart
  const last14Days = useMemo<DayRow[]>(() => {
    const now = new Date();
    const rows: DayRow[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const dateKey = getLocalDateKey(d.getTime());
      const summary = days[dateKey] ?? getEmptyDay(dateKey);
      const totalMoments = summary.urgesRedirected + summary.graceRecoveries;
      const redirectRate =
        totalMoments > 0 ? Math.round((summary.urgesRedirected / totalMoments) * 100) : null;
      const deskTotal = summary.sittingSeconds + summary.standingSeconds;
      const standingPct =
        deskTotal >= 60 ? Math.round((summary.standingSeconds / deskTotal) * 100) : null;

      const prevCalm = rows.length > 0 ? rows[rows.length - 1].summary.calmSeconds : null;
      const deltaCalmSec =
        prevCalm !== null && (summary.calmSeconds > 0 || prevCalm > 0)
          ? summary.calmSeconds - prevCalm
          : null;

      rows.push({
        dateKey,
        shortLabel: i === 0 ? 'Today' : d.toLocaleDateString(undefined, { day: 'numeric' }),
        fullLabel: formatDayLabel(dateKey, todayKey, yesterdayKey),
        isToday: i === 0,
        summary,
        redirectRate,
        standingPct,
        deltaCalmSec,
      });
    }
    return rows;
  }, [days, todayKey, yesterdayKey]);

  const [selectedTrendKey, setSelectedTrendKey] = useState<string>(todayKey);
  const selectedTrendDay =
    last14Days.find((d) => d.dateKey === selectedTrendKey) ?? last14Days[last14Days.length - 1];

  const realStory: DailyStoryReport = useMemo(() => {
    const summary = days[storyDateKey] ?? getEmptyDay(storyDateKey);
    const dayBuckets = buckets[storyDateKey] ?? [];
    return buildDailyStory(storyDateKey, summary, dayBuckets, restlessnessThreshold);
  }, [buckets, days, restlessnessThreshold, storyDateKey]);

  const sampleStory = useMemo(() => buildSampleDayStory(), []);
  const activeStory = previewSample ? sampleStory : realStory;

  // Keep selected hour valid when story changes
  useEffect(() => {
    if (activeStory.hourly.length > 0) {
      // Pick the peak restlessness hour by default so the inspector opens on the most interesting moment
      let bestIdx = 0;
      let bestScore = -1;
      activeStory.hourly.forEach((h, i) => {
        const s = h.avgRestlessness + h.browUrges * 18 + h.reliefMoves * 4;
        if (s > bestScore) {
          bestScore = s;
          bestIdx = i;
        }
      });
      setSelectedHourIdx(bestIdx);
    } else {
      setSelectedHourIdx(0);
    }
  }, [activeStory]);

  // Draw calm Warm Paper / Editorial Dark synchronized timeline canvas
  useEffect(() => {
    const canvas = timelineCanvasRef.current;
    if (!canvas || activeStory.hourly.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const styles = getComputedStyle(document.documentElement);
    const ink = styles.getPropertyValue('--ink').trim() || '#1F1E1C';
    const inkMuted = styles.getPropertyValue('--ink-muted').trim() || '#8A857C';
    const border = styles.getPropertyValue('--border-strong').trim() || 'rgba(31,30,28,0.14)';
    const accent = styles.getPropertyValue('--accent').trim() || '#C96442';
    const sage = styles.getPropertyValue('--sage').trim() || '#587B64';

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 620;
    const h = canvas.clientHeight || 200;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const padL = 34;
    const padR = 14;
    const padT = 16;
    const padB = 30;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const n = activeStory.hourly.length;
    const colW = plotW / Math.max(1, n);

    // Highlight selected hour column
    const selX = padL + Math.min(selectedHourIdx, n - 1) * colW;
    ctx.fillStyle = border;
    ctx.globalAlpha = 0.4;
    ctx.fillRect(selX, padT, colW, plotH);
    ctx.globalAlpha = 1;

    // Top ribbon: Standing (sage) vs Sitting (soft neutral)
    activeStory.hourly.forEach((pt, i) => {
      const x = padL + i * colW;
      ctx.fillStyle = pt.dominantPosture === 'standing' ? sage : border;
      ctx.globalAlpha = pt.dominantPosture === 'standing' ? 0.65 : 0.6;
      ctx.fillRect(x + 2, padT, Math.max(4, colW - 4), 8);
      ctx.globalAlpha = 1;
    });

    // Comfort threshold dashed line
    const waveTop = padT + 18;
    const waveH = plotH - 42;
    const thY = waveTop + (1 - restlessnessThreshold / 100) * waveH;
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = accent;
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(padL, thY);
    ctx.lineTo(w - padR, thY);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = inkMuted;
    ctx.font = '10px Inter, -apple-system, sans-serif';
    ctx.fillText(String(restlessnessThreshold), 6, thY + 3);
    ctx.fillText('100', 4, waveTop + 4);
    ctx.fillText('0', 14, waveTop + waveH);

    // Restlessness line
    ctx.beginPath();
    activeStory.hourly.forEach((pt, i) => {
      const x = padL + i * colW + colW / 2;
      const y = waveTop + (1 - pt.avgRestlessness / 100) * waveH;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2.25;
    ctx.stroke();

    // Points + quiet marker rail for neck adjustments (terracotta) & face touches (ink)
    activeStory.hourly.forEach((pt, i) => {
      const x = padL + i * colW + colW / 2;
      const y = waveTop + (1 - pt.avgRestlessness / 100) * waveH;

      ctx.beginPath();
      ctx.arc(x, y, i === selectedHourIdx ? 5 : 3.2, 0, Math.PI * 2);
      ctx.fillStyle = pt.avgRestlessness >= restlessnessThreshold ? accent : sage;
      ctx.fill();

      // Neck/shoulder adjustments dot
      if (pt.reliefMoves > 0) {
        const rRad = Math.min(7, 2.5 + pt.reliefMoves * 0.75);
        ctx.beginPath();
        ctx.arc(x - 7, padT + plotH - 9, rRad, 0, Math.PI * 2);
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.65;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Face touches dot
      if (pt.faceTouches > 0) {
        const tRad = Math.min(7, 2.5 + pt.faceTouches * 0.5);
        ctx.beginPath();
        ctx.arc(x + 7, padT + plotH - 9, tRad, 0, Math.PI * 2);
        ctx.fillStyle = inkMuted;
        ctx.globalAlpha = 0.65;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      ctx.fillStyle = i === selectedHourIdx ? ink : inkMuted;
      ctx.font =
        i === selectedHourIdx
          ? '600 11px Inter, -apple-system, sans-serif'
          : '400 11px Inter, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(pt.shortLabel, x, h - 8);
    });
    ctx.textAlign = 'start';
  }, [activeStory, restlessnessThreshold, selectedHourIdx]);

  const handleTimelineClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const padL = 34;
    const padR = 14;
    const n = activeStory.hourly.length;
    if (n === 0) return;
    const idx = Math.floor(((x - padL) / Math.max(1, rect.width - padL - padR)) * n);
    if (idx >= 0 && idx < n) {
      setSelectedHourIdx(idx);
    }
  };

  // Available recorded days for story switcher
  const storyDateOptions = useMemo(() => {
    const keys = Object.keys(days)
      .filter((k) => {
        const d = days[k];
        return d && (d.calmSeconds > 0 || d.sittingSeconds + d.standingSeconds > 0);
      })
      .sort((a, b) => (a < b ? 1 : -1));
    if (!keys.includes(todayKey)) keys.unshift(todayKey);
    return keys.slice(0, 14);
  }, [days, todayKey]);

  const inspectedHour = activeStory.hourly[selectedHourIdx] ?? null;

  // Chart scaling per selected 14-day metric
  const chartValues = useMemo(() => {
    const raw = last14Days.map((row) => {
      switch (metric) {
        case 'calm':
          return row.summary.calmSeconds;
        case 'standing':
          return row.summary.standingSeconds;
        case 'redirected':
          return row.summary.urgesRedirected;
        case 'touches':
          return totalFaceTouches(row.summary.faceTouches);
      }
    });
    const maxVal = Math.max(metric === 'calm' || metric === 'standing' ? 60 : 1, ...raw);
    return { raw, maxVal };
  }, [last14Days, metric]);

  // High-risk time-of-day heatmap & trigger context breakdown
  const heatmapData = useMemo(() => {
    const urgeEvents = events.filter(
      (e) =>
        e.kind === 'redirect-stage1' ||
        e.kind === 'redirect-stage2' ||
        e.kind === 'grace'
    );

    const blocks = TIME_BLOCKS.map((b) => ({
      ...b,
      count: 0,
      redirected: 0,
      grace: 0,
    }));

    for (const ev of urgeEvents) {
      const hr = new Date(ev.timestamp).getHours();
      const normHr = hr === 0 ? 24 : hr;
      const bucket = blocks.find((b) => normHr >= b.start && normHr < b.end);
      if (bucket) {
        bucket.count += 1;
        if (ev.kind === 'grace') bucket.grace += 1;
        else bucket.redirected += 1;
      }
    }

    const maxCount = Math.max(1, ...blocks.map((b) => b.count));
    const peak = [...blocks].sort((a, b) => b.count - a.count)[0];

    const tagCounts: Record<string, number> = {};
    for (const ev of events) {
      if (ev.tag) tagCounts[ev.tag] = (tagCounts[ev.tag] ?? 0) + 1;
    }
    for (const n of notes) {
      for (const t of n.tags) tagCounts[t] = (tagCounts[t] ?? 0) + 1;
    }
    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    return {
      blocks,
      maxCount,
      totalUrges: urgeEvents.length,
      peak: peak && peak.count > 0 ? peak : null,
      topTags,
    };
  }, [events, notes]);

  // All recorded days sorted newest first for Day-by-Day Log
  const historyRows = useMemo<DayRow[]>(() => {
    const keys = Object.keys(days)
      .filter((k) => {
        const d = days[k];
        return (
          d &&
          (d.calmSeconds > 0 ||
            d.urgesRedirected > 0 ||
            d.graceRecoveries > 0 ||
            d.sittingSeconds + d.standingSeconds > 0)
        );
      })
      .sort((a, b) => (a < b ? 1 : -1));

    if (!keys.includes(todayKey)) keys.unshift(todayKey);

    return keys.map((dateKey, idx) => {
      const summary = days[dateKey] ?? getEmptyDay(dateKey);
      const totalMoments = summary.urgesRedirected + summary.graceRecoveries;
      const redirectRate =
        totalMoments > 0 ? Math.round((summary.urgesRedirected / totalMoments) * 100) : null;
      const deskTotal = summary.sittingSeconds + summary.standingSeconds;
      const standingPct =
        deskTotal >= 60 ? Math.round((summary.standingSeconds / deskTotal) * 100) : null;
      const priorKey = keys[idx + 1];
      const prior = priorKey ? days[priorKey] : null;
      const deltaCalmSec = prior ? summary.calmSeconds - prior.calmSeconds : null;

      return {
        dateKey,
        shortLabel: dateKey.slice(5),
        fullLabel: formatDayLabel(dateKey, todayKey, yesterdayKey),
        isToday: dateKey === todayKey,
        summary,
        redirectRate,
        standingPct,
        deltaCalmSec,
      };
    });
  }, [days, todayKey, yesterdayKey]);

  const handleCopyDigest = async () => {
    try {
      await navigator.clipboard.writeText(activeStory.markdownDigest);
      onCopiedDigest();
    } catch {
      onCopiedDigest();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onImportFile(file);
    e.target.value = '';
  };

  const activeDaySummary = previewSample
    ? {
        shoulderRolls: 7,
        neckTilts: 4,
        backShifts: 5,
        neckRubs: 3,
        faceTouches: { chin: 15, cheek: 9, noseMouth: 7, forehead: 4 },
      }
    : days[storyDateKey] ?? getEmptyDay(storyDateKey);

  return (
    <div className="view-stack">
      <header className="page-intro">
        <h1 className="page-title">Patterns &amp; daily story</h1>
        <p className="page-lead">
          See how sitting length, leaning forward, shoulder adjustments, face touches, and
          restlessness come together across your day — in plain, everyday language.
        </p>
      </header>

      {/* Daily Story & Plain-English Pattern Summary */}
      <section className="editorial-section" aria-label="Daily pattern summary">
        <div className="section-head-row">
          <div className="story-picker-row">
            <h2 className="section-heading">
              {previewSample ? 'Sample day preview' : `${activeStory.titleLabel}'s story`}
            </h2>
            {!previewSample && storyDateOptions.length > 1 && (
              <select
                aria-label="Choose day to review"
                className="editorial-select editorial-select--compact"
                value={storyDateKey}
                onChange={(e) => setStoryDateKey(e.target.value)}
              >
                {storyDateOptions.map((k) => (
                  <option key={k} value={k}>
                    {formatDayLabel(k, todayKey, yesterdayKey)}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="settings-inline-actions">
            <button
              type="button"
              className="text-link-btn"
              onClick={() => setPreviewSample((p) => !p)}
            >
              {previewSample ? '← Back to my real data' : 'Preview sample day'}
            </button>
            <span className="meta-dot" aria-hidden="true">
              ·
            </span>
            <button type="button" className="text-link-btn" onClick={() => void handleCopyDigest()}>
              Copy summary
            </button>
          </div>
        </div>

        <div className="story-card">
          {!activeStory.hasEnoughData && !previewSample ? (
            <div className="empty-story-box">
              <p className="empty-story-title">Your first next-day summary starts tomorrow.</p>
              <p className="empty-story-copy">
                As you use Still Rhythm today, it quietly records sitting vs. standing time,
                restlessness, neck &amp; shoulder adjustments, and face touches every 5 minutes.
                Tomorrow morning, you&rsquo;ll see a plain-English story of which signals came
                together.
              </p>
              <button
                type="button"
                className="btn btn-subtle btn-sm"
                onClick={() => setPreviewSample(true)}
              >
                See an example daily story
              </button>
            </div>
          ) : (
            <>
              {/* Quick plain-English summary row */}
              <div className="story-metrics-row tabular">
                <div>
                  <span className="story-metric-label">Tracked</span>
                  <span className="story-metric-val">
                    {formatShortDuration(activeStory.totalTrackedSeconds)}
                  </span>
                </div>
                <div>
                  <span className="story-metric-label">Standing</span>
                  <span className="story-metric-val">
                    {activeStory.standingPct !== null ? `${activeStory.standingPct}%` : '—'}
                  </span>
                </div>
                <div>
                  <span className="story-metric-label">Comfort shifts</span>
                  <span className="story-metric-val">{activeStory.totalAdjustments}</span>
                </div>
                <div>
                  <span className="story-metric-label">Face touches</span>
                  <span className="story-metric-val">{activeStory.totalTouches}</span>
                </div>
              </div>

              {/* Synchronized Day Timeline Canvas */}
              {activeStory.hourly.length > 0 && (
                <div className="timeline-box">
                  <div className="timeline-legend">
                    <span>
                      <i className="legend-swatch legend-swatch--sage" /> Standing
                    </span>
                    <span>
                      <i className="legend-swatch legend-swatch--accent" /> Restlessness wave
                    </span>
                    <span>
                      <i className="legend-dot legend-dot--accent" /> Neck/shoulder shifts
                    </span>
                    <span>
                      <i className="legend-dot legend-dot--muted" /> Face touches
                    </span>
                  </div>

                  <canvas
                    ref={timelineCanvasRef}
                    className="timeline-canvas"
                    onClick={handleTimelineClick}
                    aria-label="Hourly timeline of standing, restlessness, comfort shifts, and face touches"
                  />

                  {inspectedHour && (
                    <div className="timeline-inspector">
                      <span className="timeline-inspector-hour">
                        {inspectedHour.rangeLabel} ·{' '}
                        {inspectedHour.dominantPosture === 'standing'
                          ? 'Mostly standing'
                          : inspectedHour.dominantPosture === 'mixed'
                            ? 'Mixed sitting & standing'
                            : 'Mostly sitting'}
                      </span>
                      <div className="timeline-inspector-stats tabular">
                        <span>Restlessness {inspectedHour.avgRestlessness}</span>
                        <span>·</span>
                        <span>{inspectedHour.reliefMoves} comfort shifts</span>
                        <span>·</span>
                        <span>{inspectedHour.faceTouches} face touches</span>
                        {inspectedHour.browUrges > 0 && (
                          <>
                            <span>·</span>
                            <span>{inspectedHour.browUrges} brow urges</span>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Plain-English "What Came Together" Insight List */}
              <div className="insights-stack">
                {activeStory.insights.map((ins) => (
                  <article key={ins.id} className="insight-row">
                    <span className="insight-category">{ins.category}</span>
                    <h3 className="insight-headline">{ins.headline}</h3>
                    <p className="insight-detail">{ins.detail}</p>
                  </article>
                ))}
              </div>

              {/* Silent Signal Breakdowns (Face touches + Neck comfort) */}
              <div className="breakdown-grid">
                <div className="breakdown-card">
                  <span className="breakdown-title">Where face touches happened</span>
                  <div className="breakdown-items tabular">
                    <span>Chin / jaw: <strong>{activeDaySummary.faceTouches.chin}</strong></span>
                    <span>Cheeks: <strong>{activeDaySummary.faceTouches.cheek}</strong></span>
                    <span>Nose / mouth: <strong>{activeDaySummary.faceTouches.noseMouth}</strong></span>
                    <span>Forehead: <strong>{activeDaySummary.faceTouches.forehead}</strong></span>
                  </div>
                </div>
                <div className="breakdown-card">
                  <span className="breakdown-title">Neck &amp; shoulder comfort shifts</span>
                  <div className="breakdown-items tabular">
                    <span>Shoulder rolls: <strong>{activeDaySummary.shoulderRolls}</strong></span>
                    <span>Neck tilts: <strong>{activeDaySummary.neckTilts}</strong></span>
                    <span>Back shifts: <strong>{activeDaySummary.backShifts}</strong></span>
                    <span>Neck rubs: <strong>{activeDaySummary.neckRubs}</strong></span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Interactive 14-day Trend Chart (Preserved & expanded from Still) */}
      <section className="editorial-section" aria-label="Fourteen-day trend">
        <div className="section-head-row">
          <h2 className="section-heading">Last 14 days</h2>
          <div className="segmented" role="group" aria-label="Select progress metric">
            <button
              type="button"
              className={`segmented-btn ${metric === 'calm' ? 'segmented-btn--active' : ''}`}
              onClick={() => setMetric('calm')}
            >
              Calm
            </button>
            <button
              type="button"
              className={`segmented-btn ${metric === 'standing' ? 'segmented-btn--active' : ''}`}
              onClick={() => setMetric('standing')}
            >
              Standing
            </button>
            <button
              type="button"
              className={`segmented-btn ${metric === 'redirected' ? 'segmented-btn--active' : ''}`}
              onClick={() => setMetric('redirected')}
            >
              Caught
            </button>
            <button
              type="button"
              className={`segmented-btn ${metric === 'touches' ? 'segmented-btn--active' : ''}`}
              onClick={() => setMetric('touches')}
            >
              Face touches
            </button>
          </div>
        </div>

        <div className="trend-card">
          <div className="trend-bars" role="list" aria-label="14 day bar chart">
            {last14Days.map((row, idx) => {
              const val = chartValues.raw[idx];
              const isEmpty = val === 0;
              const pct = isEmpty
                ? 5
                : Math.max(10, Math.round((val / chartValues.maxVal) * 100));
              const isSelected = row.dateKey === selectedTrendDay.dateKey;

              return (
                <button
                  key={row.dateKey}
                  type="button"
                  role="listitem"
                  className={`trend-col ${isSelected ? 'trend-col--selected' : ''}`}
                  aria-label={`${row.fullLabel}: ${formatDuration(row.summary.calmSeconds)} calm`}
                  onClick={() => setSelectedTrendKey(row.dateKey)}
                >
                  <span className="trend-bar-track">
                    <span
                      className={`trend-bar ${row.isToday ? 'trend-bar--today' : ''} ${
                        isEmpty ? 'trend-bar--empty' : ''
                      } ${metric === 'standing' && !isEmpty ? 'trend-bar--grace' : ''}`}
                      style={{ height: `${pct}%` }}
                    />
                  </span>
                  <span
                    className={`trend-day-label ${row.isToday ? 'trend-day-label--today' : ''}`}
                  >
                    {row.shortLabel}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="trend-detail-strip">
            <span className="trend-detail-date">{selectedTrendDay.fullLabel}</span>
            <div className="trend-detail-stats tabular">
              <span>{formatDuration(selectedTrendDay.summary.calmSeconds)} calm</span>
              {selectedTrendDay.standingPct !== null && (
                <>
                  <span>·</span>
                  <span>{selectedTrendDay.standingPct}% standing</span>
                </>
              )}
              <span>·</span>
              <span>{selectedTrendDay.summary.urgesRedirected} caught</span>
              <span>·</span>
              <span>{totalFaceTouches(selectedTrendDay.summary.faceTouches)} touches</span>
            </div>
          </div>
        </div>
      </section>

      {/* High-Risk Time-of-Day Heatmap */}
      <section className="editorial-section" aria-label="Time of day patterns">
        <div className="section-head-row">
          <h2 className="section-heading">When urges cluster</h2>
          <span className="section-meta">
            {heatmapData.totalUrges > 0
              ? `${heatmapData.totalUrges} noticed moments mapped`
              : 'Fills in as moments are noticed'}
          </span>
        </div>

        <div className="heatmap-card">
          <div className="heatmap-grid" role="list" aria-label="Time of day urge heatmap">
            {heatmapData.blocks.map((block) => {
              const intensity =
                block.count === 0 ? 0 : Math.max(0.18, block.count / heatmapData.maxCount);
              return (
                <div
                  key={block.id}
                  role="listitem"
                  className="heatmap-cell"
                  style={{
                    backgroundColor:
                      intensity === 0
                        ? undefined
                        : `rgba(201, 100, 66, ${(intensity * 0.42).toFixed(2)})`,
                  }}
                >
                  <span className="heatmap-count tabular">{block.count}</span>
                  <span className="heatmap-window">{block.label}</span>
                  <span className="heatmap-name">{block.name}</span>
                </div>
              );
            })}
          </div>

          {heatmapData.peak ? (
            <p className="heatmap-insight">
              Urges cluster most during <strong>{heatmapData.peak.name.toLowerCase()}</strong> (
              {heatmapData.peak.label}). Changing between sitting and standing or taking a 60-second
              breath right before that window helps break autopilot early.
            </p>
          ) : (
            <p className="heatmap-insight">
              As Still Rhythm catches urges or logs grace recoveries, this map highlights your
              toughest hours so you can plan small resets ahead of time.
            </p>
          )}

          {heatmapData.topTags.length > 0 && (
            <div className="trigger-tags-strip">
              <span className="trigger-tags-label">Common contexts</span>
              <div className="tag-row">
                {heatmapData.topTags.map(([tag, count]) => (
                  <span key={tag} className="trigger-pill">
                    {tag} <span className="tabular">· {count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Day-by-Day History Log */}
      <section className="editorial-section" aria-label="Day-by-day history">
        <div className="section-head-row">
          <h2 className="section-heading">Day-by-day log</h2>
          <span className="section-meta">{historyRows.length} days</span>
        </div>

        <div className="history-table">
          <div className="history-header-row" aria-hidden="true">
            <span>Day</span>
            <span>Calm</span>
            <span>Standing</span>
            <span>Shifts</span>
            <span>Touches</span>
          </div>

          {historyRows.map((row) => (
            <div
              key={row.dateKey}
              className={`history-row ${row.isToday ? 'history-row--today' : ''}`}
            >
              <div className="history-day-cell">
                <span className="history-day-name">{row.fullLabel}</span>
                {row.deltaCalmSec !== null && row.deltaCalmSec !== 0 && (
                  <span
                    className={`delta-badge ${
                      row.deltaCalmSec > 0 ? 'delta-badge--up' : 'delta-badge--down'
                    }`}
                  >
                    {formatDeltaCalm(row.deltaCalmSec)}
                  </span>
                )}
              </div>
              <span className="tabular">{formatShortDuration(row.summary.calmSeconds)}</span>
              <span className="tabular">
                {row.standingPct !== null ? `${row.standingPct}%` : '—'}
              </span>
              <span className="tabular">{totalReliefMoves(row.summary)}</span>
              <span className="tabular history-rate">
                {totalFaceTouches(row.summary.faceTouches)}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Portable Local Backup */}
      <section className="portable-sync-box" aria-label="Move history between computers">
        <div className="portable-sync-copy">
          <h3 className="portable-sync-title">Using Still Rhythm on another computer?</h3>
          <p className="portable-sync-desc">
            Everything stays 100% locally in your browser with zero cloud servers. Export a JSON
            backup anytime to keep a copy or merge your history across devices.
          </p>
        </div>
        <div className="portable-sync-actions">
          <button
            type="button"
            id="btn-progress-export"
            className="btn btn-subtle btn-sm"
            onClick={onExportData}
          >
            Export JSON
          </button>
          <button
            type="button"
            id="btn-progress-import"
            className="btn btn-ghost btn-sm"
            onClick={() => fileInputRef.current?.click()}
          >
            Import &amp; merge JSON
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={handleFileChange}
          />
        </div>
      </section>
    </div>
  );
}
