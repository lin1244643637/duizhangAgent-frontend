/// <reference lib="es2022.intl" />
import { useEffect, useRef, useState } from 'react';

const segmenter = typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null;

/** Display only: never delays source text, protocol events, or run completion. */
export function useTypewriter(text: string, enabled: boolean, streaming: boolean) {
  const [displayed, setDisplayed] = useState(text);
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const [hidden, setHidden] = useState(() => document.visibilityState === 'hidden');
  const hasStreamed = useRef(streaming);
  const displayedRef = useRef(text);
  const lastPaint = useRef(performance.now());
  // Very long answers render directly, keeping segmentation and repeated Markdown work bounded.
  const animate = enabled && !reducedMotion && !hidden && Boolean(segmenter)
    && text.length <= 20_000 && (streaming || hasStreamed.current);
  const compatible = text.startsWith(displayed);
  const isTyping = animate && compatible && displayed.length < text.length;

  useEffect(() => {
    if (!enabled) return;
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const onMotion = () => setReducedMotion(media?.matches ?? false);
    const onVisibility = () => setHidden(document.visibilityState === 'hidden');
    onMotion();
    onVisibility();
    media?.addEventListener?.('change', onMotion);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      media?.removeEventListener?.('change', onMotion);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled]);

  useEffect(() => {
    if (enabled && streaming) hasStreamed.current = true;
    const publish = (value: string) => {
      displayedRef.current = value;
      setDisplayed(value);
    };
    if (!animate || !text.startsWith(displayedRef.current)) {
      publish(text);
      lastPaint.current = performance.now();
      return;
    }
    if (displayedRef.current === text || !segmenter) return;
    const boundaries = Array.from(segmenter.segment(text), ({ index, segment }) => index + segment.length);
    let position = boundaries.findIndex((end) => end > displayedRef.current.length);
    const finishBy = streaming ? Infinity : performance.now() + 600;
    let frame: number;
    const tick = (now: number) => {
      const elapsed = now - lastPaint.current;
      if (elapsed >= 32 || now >= finishBy) {
        const remaining = boundaries.length - position;
        const count = now >= finishBy ? remaining
          : Math.max(1, Math.floor(Math.min(elapsed, 64) / 1000 * Math.max(80, remaining / 0.4)));
        position = Math.min(boundaries.length, position + count);
        publish(text.slice(0, boundaries[position - 1]));
        lastPaint.current = now;
      }
      if (position < boundaries.length) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text, animate, enabled, streaming]);

  return {
    text: animate && compatible ? displayed : text,
    isTyping,
  };
}
