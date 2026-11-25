interface EdgeGlowProps {
  intensity: 'none' | 'gentle' | 'prominent';
  /** Smooth 0..1 ramp as hand dwells in zone, capping cleanly without a jarring hard outline */
  progress?: number;
}

export function EdgeGlow({ intensity, progress = 0 }: EdgeGlowProps) {
  const clamped = Math.max(0, Math.min(1, progress));
  // Smooth progressive ramp: starts whisper-soft as hand enters and builds gently up to a calm cap
  const effectiveLevel =
    intensity === 'prominent'
      ? 1
      : intensity === 'gentle'
        ? Math.max(0.45, Math.min(0.88, clamped))
        : clamped > 0.04
          ? clamped * 0.65
          : 0;

  const isActive = effectiveLevel > 0.02;
  const innerAlpha = (0.08 + effectiveLevel * 0.34).toFixed(3);
  const outerAlpha = (0.04 + effectiveLevel * 0.22).toFixed(3);
  const innerBlur = Math.round(48 + effectiveLevel * 62);
  const innerSpread = Math.round(10 + effectiveLevel * 22);
  const outerBlur = Math.round(100 + effectiveLevel * 90);
  const outerSpread = Math.round(20 + effectiveLevel * 32);

  return (
    <div
      className={`edge-glow ${
        intensity === 'prominent'
          ? 'edge-glow--prominent'
          : isActive
            ? 'edge-glow--active'
            : ''
      }`}
      style={
        isActive
          ? {
              opacity: Math.min(1, 0.25 + effectiveLevel * 0.75),
              boxShadow: `inset 0 0 ${innerBlur}px ${innerSpread}px rgba(214, 126, 76, ${innerAlpha}), inset 0 0 ${outerBlur}px ${outerSpread}px rgba(196, 108, 66, ${outerAlpha})`,
            }
          : undefined
      }
      aria-hidden="true"
    />
  );
}
