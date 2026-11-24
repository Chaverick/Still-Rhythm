import type { DailyStoryReport } from '../lib/patterns';
import { formatShortDuration } from '../lib/storage';

interface MorningSummaryCardProps {
  story: DailyStoryReport;
  userName: string;
  onOpenPatterns: () => void;
  onDismiss: () => void;
}

export function MorningSummaryCard({
  story,
  userName,
  onOpenPatterns,
  onDismiss,
}: MorningSummaryCardProps) {
  const cleanName = userName.trim();

  return (
    <section className="morning-summary-card" aria-label="Yesterday's summary">
      <div className="welcome-header">
        <span className="section-label">{story.titleLabel}&rsquo;s patterns</span>
        <button
          type="button"
          className="text-link-btn text-link-btn--muted"
          onClick={onDismiss}
        >
          Dismiss
        </button>
      </div>

      <h2 className="morning-summary-title">
        {cleanName
          ? `${cleanName}, here is what came together ${story.titleLabel.toLowerCase()}.`
          : `Here is what came together ${story.titleLabel.toLowerCase()}.`}
      </h2>

      <div className="morning-summary-chips tabular">
        <span>{formatShortDuration(story.totalTrackedSeconds)} tracked</span>
        {story.standingPct !== null && (
          <span>
            {story.standingPct}% standing ({formatShortDuration(story.standingSeconds)})
          </span>
        )}
        <span>{story.totalAdjustments} comfort shifts</span>
        <span>{story.totalTouches} face touches</span>
      </div>

      <ul className="morning-insights-list">
        {story.insights.slice(0, 3).map((ins) => (
          <li key={ins.id} className="morning-insight-item">
            <strong>{ins.headline}.</strong> {ins.detail}
          </li>
        ))}
      </ul>

      <div className="morning-summary-foot">
        <button type="button" className="text-link-btn" onClick={onOpenPatterns}>
          See full timeline &amp; patterns →
        </button>
      </div>
    </section>
  );
}
