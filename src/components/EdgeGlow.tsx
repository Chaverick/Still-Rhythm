interface EdgeGlowProps {
  intensity: 'none' | 'gentle' | 'prominent';
}

export function EdgeGlow({ intensity }: EdgeGlowProps) {
  return (
    <div
      className={`edge-glow ${
        intensity === 'prominent'
          ? 'edge-glow--prominent'
          : intensity === 'gentle'
            ? 'edge-glow--active'
            : ''
      }`}
      aria-hidden="true"
    />
  );
}
