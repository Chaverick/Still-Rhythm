import type { WelcomeBackPrompt } from '../types';

interface WelcomeBackCardProps {
  prompt: WelcomeBackPrompt;
  userName?: string;
  onCalmReturn: (addAwayMinutes: boolean) => void;
  onRedirectedWhileAway: () => void;
  onGraceReturn: () => void;
  onDismiss: () => void;
}

export function WelcomeBackCard({
  prompt,
  userName = '',
  onCalmReturn,
  onRedirectedWhileAway,
  onGraceReturn,
  onDismiss,
}: WelcomeBackCardProps) {
  const cleanName = userName.trim();

  return (
    <section className="welcome-card" aria-label="Welcome back check-in">
      <div className="welcome-header">
        <span className="section-label">
          {cleanName ? `Welcome back, ${cleanName}` : 'Welcome back'}
        </span>
        <button type="button" className="text-link-btn" onClick={onDismiss}>
          Just resume
        </button>
      </div>
      <h2 className="welcome-title">
        You stepped away for about {prompt.awayMinutes}{' '}
        {prompt.awayMinutes === 1 ? 'minute' : 'minutes'}.
      </h2>
      <p className="welcome-copy">How did your hands feel during the break?</p>
      <div className="welcome-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => onCalmReturn(true)}
        >
          Calm &amp; hands-free (+{prompt.awayMinutes}m calm)
        </button>
        <button
          type="button"
          className="btn btn-subtle btn-sm"
          onClick={onRedirectedWhileAway}
        >
          Caught an urge away
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onGraceReturn}
        >
          Grace recovery
        </button>
      </div>
    </section>
  );
}
