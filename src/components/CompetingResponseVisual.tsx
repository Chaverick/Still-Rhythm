interface CompetingResponseVisualProps {
  id: string;
  compact?: boolean;
}

/**
 * Ultra-lightweight (< 3 KB gzipped) pure inline SVG + CSS keyframe micro-guides
 * demonstrating each HRT competing response visually without videos, GIFs, or heavy runtimes.
 */
export function CompetingResponseVisual({
  id,
  compact = false,
}: CompetingResponseVisualProps) {
  const cls = `hrt-visual ${compact ? 'hrt-visual--compact' : ''}`;

  switch (id) {
    case 'palms-flat':
      return (
        <div className={cls} aria-hidden="true">
          <svg viewBox="0 0 120 76" fill="none">
            {/* Desk / lap surface */}
            <line
              x1="14"
              y1="56"
              x2="106"
              y2="56"
              stroke="currentColor"
              strokeOpacity="0.22"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            {/* Soft sage grounding ripples under palms */}
            <ellipse
              className="anim-ripple"
              cx="39"
              cy="56"
              rx="18"
              ry="4"
              stroke="var(--sage)"
              strokeWidth="1.4"
            />
            <ellipse
              className="anim-ripple anim-ripple--delay"
              cx="81"
              cy="56"
              rx="18"
              ry="4"
              stroke="var(--sage)"
              strokeWidth="1.4"
            />
            {/* Two minimalist palms lowering flat onto surface */}
            <g className="anim-palms-settle">
              <path
                d="M25 46 C25 41 29 38 35 38 L44 38 C49 38 52 41 52 46 L52 49 C52 51 50 52 48 52 L29 52 C27 52 25 51 25 49 Z"
                stroke="var(--accent)"
                strokeWidth="1.8"
                fill="var(--accent-soft)"
              />
              <line x1="31" y1="38" x2="31" y2="33" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="37" y1="38" x2="37" y2="31" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="43" y1="38" x2="43" y2="32" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="48" y1="39" x2="48" y2="35" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" />

              <path
                d="M68 46 C68 41 71 38 76 38 L85 38 C91 38 95 41 95 46 L95 49 C95 51 93 52 91 52 L72 52 C70 52 68 51 68 49 Z"
                stroke="var(--accent)"
                strokeWidth="1.8"
                fill="var(--accent-soft)"
              />
              <line x1="72" y1="39" x2="72" y2="35" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="77" y1="38" x2="77" y2="32" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="83" y1="38" x2="83" y2="31" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="89" y1="38" x2="89" y2="33" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" />
            </g>
          </svg>
        </div>
      );

    case 'thumb-index-press':
      return (
        <div className={cls} aria-hidden="true">
          <svg viewBox="0 0 120 76" fill="none">
            {/* Warm tactile contact halo at fingertip meeting point */}
            <circle
              className="anim-contact-halo"
              cx="60"
              cy="38"
              r="14"
              fill="var(--accent-soft)"
              stroke="var(--accent)"
              strokeWidth="1.2"
            />
            {/* Thumb curving up from bottom-left */}
            <path
              className="anim-finger-left"
              d="M20 56 C32 54 44 48 55 40"
              stroke="var(--ink)"
              strokeOpacity="0.72"
              strokeWidth="4"
              strokeLinecap="round"
            />
            {/* Index finger curving down from top-right */}
            <path
              className="anim-finger-right"
              d="M100 22 C86 24 74 30 65 36"
              stroke="var(--ink)"
              strokeOpacity="0.72"
              strokeWidth="4"
              strokeLinecap="round"
            />
            {/* Touch point */}
            <circle
              className="anim-contact-dot"
              cx="60"
              cy="38"
              r="4.5"
              fill="var(--accent)"
            />
          </svg>
        </div>
      );

    case 'clasp-and-breathe':
      return (
        <div className={cls} aria-hidden="true">
          <svg viewBox="0 0 120 76" fill="none">
            {/* Slow expanding/contracting breath circle */}
            <circle
              className="anim-breath-circle"
              cx="60"
              cy="38"
              r="22"
              stroke="var(--sage)"
              strokeWidth="1.6"
              fill="var(--sage-soft)"
            />
            {/* Loosely interlaced hands arcs */}
            <path
              d="M38 42 C44 31 54 31 60 38 C66 45 76 45 82 34"
              stroke="var(--accent)"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <path
              d="M38 34 C44 45 54 45 60 38 C66 31 76 31 82 42"
              stroke="var(--ink)"
              strokeOpacity="0.65"
              strokeWidth="2.2"
              strokeLinecap="round"
            />
          </svg>
        </div>
      );

    case 'smooth-brow-palm':
      return (
        <div className={cls} aria-hidden="true">
          <svg viewBox="0 0 120 76" fill="none">
            {/* Minimalist brow arc */}
            <path
              d="M34 30 Q60 20 86 30"
              stroke="var(--ink)"
              strokeOpacity="0.55"
              strokeWidth="2.4"
              strokeLinecap="round"
            />
            {/* Cool flat wrist gently pressing, then lowering down away */}
            <g className="anim-wrist-reset">
              <rect
                x="44"
                y="26"
                width="32"
                height="13"
                rx="6.5"
                fill="var(--sage-soft)"
                stroke="var(--sage)"
                strokeWidth="1.8"
              />
              <line
                x1="53"
                y1="32.5"
                x2="67"
                y2="32.5"
                stroke="var(--sage)"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </g>
            {/* Subtle downward arrow cue */}
            <path
              d="M60 47 L60 61 M55 56 L60 61 L65 56"
              stroke="var(--ink-muted)"
              strokeOpacity="0.45"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      );

    default:
      // five-min-walk ("Step away for water")
      return (
        <div className={cls} aria-hidden="true">
          <svg viewBox="0 0 120 76" fill="none">
            {/* Gentle walking path waves */}
            <path
              d="M18 54 Q40 46 60 54 T102 50"
              stroke="var(--sage)"
              strokeOpacity="0.45"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeDasharray="4 4"
            />
            {/* Alternating footsteps moving gently forward */}
            <ellipse
              className="anim-step-1"
              cx="36"
              cy="46"
              rx="6"
              ry="3.2"
              fill="var(--sage)"
            />
            <ellipse
              className="anim-step-2"
              cx="56"
              cy="39"
              rx="6"
              ry="3.2"
              fill="var(--sage)"
            />
            <ellipse
              className="anim-step-3"
              cx="76"
              cy="45"
              rx="6"
              ry="3.2"
              fill="var(--accent)"
            />
            {/* Minimalist water cup on right */}
            <path
              d="M88 22 L91 40 C91 42 93 43 96 43 C99 43 101 42 101 40 L104 22 Z"
              stroke="var(--accent)"
              strokeWidth="1.7"
              fill="var(--accent-soft)"
            />
          </svg>
        </div>
      );
  }
}
