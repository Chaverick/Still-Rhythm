import type { VoiceComfortStatus } from '../types';

interface VoiceWaveMeterProps {
  active: boolean;
  historyDb: number[];
  liveDb: number;
  leqDb: number;
  noiseFloorDb: number;
  comfortMinDb: number;
  comfortMaxDb: number;
  status: VoiceComfortStatus;
}

const DB_MIN = 26;
const DB_MAX = 88;
const W = 360;
const H = 70;
const PAD_Y = 5;

function dbToY(db: number): number {
  const clamped = Math.max(DB_MIN, Math.min(DB_MAX, db));
  const t = (clamped - DB_MIN) / (DB_MAX - DB_MIN);
  return H - PAD_Y - t * (H - PAD_Y * 2);
}

/**
 * Calm, zero-dependency live scrolling dBA wave inspired by leading acoustic meters
 * (NIOSH SLM, Decibel X, Youlean, Sound Meter), styled in Still Rhythm's warm paper palette.
 */
export function VoiceWaveMeter({
  active,
  historyDb,
  liveDb,
  leqDb,
  noiseFloorDb,
  comfortMinDb,
  comfortMaxDb,
  status,
}: VoiceWaveMeterProps) {
  const comfortTopY = dbToY(comfortMaxDb);
  const comfortBotY = dbToY(comfortMinDb);
  const comfortHeight = Math.max(6, comfortBotY - comfortTopY);
  const floorY = dbToY(noiseFloorDb);
  const leqY = dbToY(leqDb);

  const pts =
    active && historyDb.length >= 2
      ? historyDb
      : [noiseFloorDb, noiseFloorDb, noiseFloorDb];

  const stepX = (W - 10) / Math.max(1, pts.length - 1);
  const coords = pts.map((v, i) => ({
    x: 4 + i * stepX,
    y: dbToY(v),
  }));

  // Smooth quadratic Bezier curve across rolling points
  let linePath = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
  for (let i = 1; i < coords.length - 1; i++) {
    const midX = (coords[i].x + coords[i + 1].x) / 2;
    const midY = (coords[i].y + coords[i + 1].y) / 2;
    linePath += ` Q ${coords[i].x.toFixed(1)} ${coords[i].y.toFixed(1)} ${midX.toFixed(1)} ${midY.toFixed(1)}`;
  }
  const last = coords[coords.length - 1];
  if (coords.length > 1) {
    linePath += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
  }

  const areaPath = `${linePath} L ${last.x.toFixed(1)} ${H} L ${coords[0].x.toFixed(1)} ${H} Z`;

  const strokeClass =
    !active
      ? 'voice-wave-line--idle'
      : status === 'loud'
        ? 'voice-wave-line--loud'
        : status === 'comfortable'
          ? 'voice-wave-line--ok'
          : 'voice-wave-line--quiet';

  const fillClass =
    !active
      ? 'voice-wave-area--idle'
      : status === 'loud'
        ? 'voice-wave-area--loud'
        : status === 'comfortable'
          ? 'voice-wave-area--ok'
          : 'voice-wave-area--quiet';

  return (
    <div
      className={`voice-wave-box ${status === 'loud' && active ? 'voice-wave-box--loud' : ''}`}
      role="img"
      aria-label={
        active
          ? `Live voice loudness ${liveDb} dBA, 3-second average ${leqDb} dBA`
          : 'Voice loudness meter ready'
      }
    >
      <svg
        className="voice-wave-svg"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {/* Subtle amber zone above comfort ceiling */}
        <rect
          x="0"
          y="0"
          width={W}
          height={Math.max(2, comfortTopY)}
          className="voice-wave-zone-loud"
        />

        {/* Shaded sage-green comfortable speaking zone */}
        <rect
          x="0"
          y={comfortTopY}
          width={W}
          height={comfortHeight}
          className="voice-wave-zone-comfort"
        />
        <line
          x1="0"
          y1={comfortTopY}
          x2={W}
          y2={comfortTopY}
          className="voice-wave-guide voice-wave-guide--ceiling"
        />
        <line
          x1="0"
          y1={comfortBotY}
          x2={W}
          y2={comfortBotY}
          className="voice-wave-guide"
        />

        {/* Dashed ambient room noise floor */}
        {active && (
          <line
            x1="0"
            y1={floorY}
            x2={W}
            y2={floorY}
            className="voice-wave-floor"
          />
        )}

        {/* Area wash + smooth live dBA curve */}
        <path d={areaPath} className={`voice-wave-area ${fillClass}`} />
        <path d={linePath} className={`voice-wave-line ${strokeClass}`} />

        {/* Subtle 3s LAeq average tick on right edge */}
        {active && leqDb > 0 && (
          <line
            x1={W - 14}
            y1={leqY}
            x2={W - 2}
            y2={leqY}
            className="voice-wave-leq-tick"
          />
        )}

        {/* Live syllable tip dot */}
        {active && (
          <circle
            cx={last.x}
            cy={last.y}
            r="3.2"
            className={`voice-wave-dot ${strokeClass}`}
          />
        )}
      </svg>
    </div>
  );
}
