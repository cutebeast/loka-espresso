import { useEffect, useRef, useCallback } from 'react';

const FOCUSABLE_SELECTORS = [
  'button',
  'a[href]',
  'input',
  'select',
  'textarea',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function useFocusTrap<T extends HTMLElement>(isActive: boolean) {
  const containerRef = useRef<T>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const firstElemRef = useRef<HTMLElement | null>(null);
  const lastElemRef = useRef<HTMLElement | null>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const first = firstElemRef.current;
    const last = lastElemRef.current;
    if (!first || !last) { e.preventDefault(); return; }
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }, []);

  useEffect(() => {
    if (!isActive) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement;
    const container = containerRef.current;
    if (!container) return;

    const focusable = Array.from(
      container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)
    ).filter((el) => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden'));

    firstElemRef.current = focusable[0] || null;
    lastElemRef.current = focusable[focusable.length - 1] || null;
    firstElemRef.current?.focus();

    container.addEventListener('keydown', handleKeyDown);
    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      previouslyFocusedRef.current?.focus();
    };
  }, [isActive, handleKeyDown]);

  return containerRef;
}
