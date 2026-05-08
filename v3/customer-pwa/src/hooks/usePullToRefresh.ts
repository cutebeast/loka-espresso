import { useRef, useCallback, useState, useEffect } from 'react';

interface UsePullToRefreshOptions {
  onRefresh: () => void;
  enabled?: boolean;
  threshold?: number;
}

export function usePullToRefresh({
  onRefresh,
  enabled = true,
  threshold = 80,
}: UsePullToRefreshOptions) {
  const startY = useRef(0);
  const currentY = useRef(0);
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggeredRef = useRef(false);

  const isAtTop = useCallback(() => {
    const el = containerRef.current;
    if (!el) return false;
    return el.scrollTop <= 0;
  }, []);

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (!enabled || !isAtTop()) return;
      startY.current = e.touches[0].clientY;
      currentY.current = startY.current;
      triggeredRef.current = false;
    },
    [enabled, isAtTop]
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!enabled || triggeredRef.current) return;
      currentY.current = e.touches[0].clientY;
      const diff = currentY.current - startY.current;
      if (diff > 0 && isAtTop()) {
        e.preventDefault();
        setPulling(true);
        setPullDistance(Math.min(diff * 0.5, threshold * 1.5));
        if (diff >= threshold) {
          triggeredRef.current = true;
          setPulling(false);
          setPullDistance(0);
          onRefresh();
        }
      }
    },
    [enabled, isAtTop, threshold, onRefresh]
  );

  const handleTouchEnd = useCallback(() => {
    setPulling(false);
    setPullDistance(0);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd);
    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { containerRef, pulling, pullDistance };
}
