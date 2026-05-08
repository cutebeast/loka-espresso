'use client';

import { useRef, useEffect, useCallback } from 'react';

/**
 * Scales text down ONLY when it overflows its parent container.
 * Never scales up beyond the element's natural CSS font-size.
 *
 * @param ref     - ref to the text element
 * @param deps    - dependency array (triggers re-measure)
 * @param minSize - smallest font-size allowed (px). Default 10.
 * @param step    - decrement per iteration (px). Default 0.5.
 */
export function useFitText(
  ref: React.RefObject<HTMLElement | null>,
  deps: React.DependencyList = [],
  minSize = 10,
  step = 0.5,
) {
  const depsKey = useRef(JSON.stringify(deps));

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const parent = el.parentElement;
    if (!parent) return;

    // Clear inline style — CSS rule takes over
    el.style.fontSize = '';

    // Fits at natural CSS size — nothing to do
    if (parent.scrollWidth <= parent.clientWidth) return;

    // Overflows — read computed CSS size, step down from there
    const computed = parseFloat(getComputedStyle(el).fontSize);
    let size = isNaN(computed) ? minSize : computed;
    el.style.fontSize = size + 'px';

    while (parent.scrollWidth > parent.clientWidth && size > minSize) {
      size -= step;
      el.style.fontSize = size + 'px';
    }

    if (size < minSize) {
      el.style.fontSize = minSize + 'px';
    }
  }, [ref, minSize, step]);

  // Trigger when deps change
  useEffect(() => {
    const next = JSON.stringify(deps);
    if (depsKey.current !== next) {
      depsKey.current = next;
      resize();
    }
  }, [resize, deps]);

  // Recalculate on window resize
  useEffect(() => {
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [resize]);

  // Initial run
  useEffect(() => {
    resize();
  }, [resize]);
}
