import { useEffect, useRef, useState } from 'react';

interface TypewriterHeadlineProps {
  text: string;
  className?: string;
}

/**
 * Gently types out top-level headline transitions (Claude-like unhurried editorial cadence)
 * without causing layout shift or animation jank. Respects prefers-reduced-motion.
 */
export function TypewriterHeadline({ text, className = 'hero-headline' }: TypewriterHeadlineProps) {
  const [displayed, setDisplayed] = useState(text);
  const [typing, setTyping] = useState(false);
  const prevTargetRef = useRef(text);

  useEffect(() => {
    if (prevTargetRef.current === text) return;
    prevTargetRef.current = text;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      setDisplayed(text);
      setTyping(false);
      return;
    }

    let index = 0;
    let timerId: number | null = null;
    setTyping(true);
    setDisplayed('');

    const step = () => {
      index += 1;
      setDisplayed(text.slice(0, index));
      if (index < text.length) {
        const ch = text[index - 1];
        // Gentle natural pause on punctuation, smooth brisk flow on letters
        const delay = ch === '.' || ch === '—' ? 110 : ch === ',' ? 65 : 22;
        timerId = window.setTimeout(step, delay);
      } else {
        timerId = window.setTimeout(() => {
          setTyping(false);
        }, 650);
      }
    };

    timerId = window.setTimeout(step, 35);

    return () => {
      if (timerId !== null) window.clearTimeout(timerId);
    };
  }, [text]);

  return (
    <h1 className={className} aria-label={text}>
      <span aria-hidden="true">
        {displayed}
        <span
          className={`type-caret ${typing ? 'type-caret--active' : ''}`}
          aria-hidden="true"
        />
      </span>
    </h1>
  );
}
