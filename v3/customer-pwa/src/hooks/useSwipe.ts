"use client";

import { useCallback, useRef } from 'react';

interface SwipeState {
  x: number;
  y: number;
  pointerId: number;
}

/**
 * Lightweight horizontal-swipe detector for touch surfaces (kiosk LCDs,
 * tablets, phones). Fires only for predominantly-horizontal gestures that
 * travel at least `threshold` px, so vertical scrolling is never hijacked.
 *
 * Pointer events are used deliberately: they cover touch, pen, and mouse
 * (drag) on the kiosk with one code path.
 *
 * Returns React pointer handlers to spread on the swipeable container, plus
 * an `onClickCapture` suppressor — after a swipe, browsers may still emit a
 * click on the element under the finger; the suppressor stops that click
 * from activating a card/button.
 */
export function useSwipe(
  onSwipeLeft: () => void,
  onSwipeRight: () => void,
  threshold = 60
) {
  const start = useRef<SwipeState | null>(null);
  const didSwipe = useRef(false);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    start.current = { x: e.clientX, y: e.clientY, pointerId: e.pointerId };
    didSwipe.current = false;
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const s = start.current;
      start.current = null;
      if (!s) return;
      const dx = e.clientX - s.x;
      const dy = e.clientY - s.y;
      if (Math.abs(dx) < threshold) return;
      // Vertical dominance = a scroll, not a swipe.
      if (Math.abs(dx) < Math.abs(dy) * 2) return;
      didSwipe.current = true;
      if (dx > 0) onSwipeRight();
      else onSwipeLeft();
    },
    [onSwipeLeft, onSwipeRight, threshold]
  );

  const onPointerCancel = useCallback(() => {
    start.current = null;
  }, []);

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (didSwipe.current) {
      didSwipe.current = false;
      e.stopPropagation();
      e.preventDefault();
    }
  }, []);

  return { onPointerDown, onPointerUp, onPointerCancel, onClickCapture };
}
