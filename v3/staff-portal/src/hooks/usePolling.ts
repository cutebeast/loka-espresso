"use client";

import { useEffect, useRef, useCallback } from "react";

interface UsePollingOptions {
  interval?: number;
  enabled?: boolean;
  onError?: (err: unknown) => void;
}

export function usePolling(
  fn: () => Promise<void>,
  deps: React.DependencyList,
  options: UsePollingOptions = {}
) {
  const { interval = 10000, enabled = true, onError } = options;
  const fnRef = useRef(fn);
  const onErrorRef = useRef(onError);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep refs in sync without triggering re-renders
  useEffect(() => {
    fnRef.current = fn;
  });
  useEffect(() => {
    onErrorRef.current = onError;
  });

  const poll = useCallback(async () => {
    try {
      await fnRef.current();
    } catch (err) {
      console.error("Polling error:", err);
      try { onErrorRef.current?.(err); }
      catch (handlerErr) { console.error("Polling onError threw:", handlerErr); }
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let active = true;
    let hidden = false;

    const onVisibilityChange = () => {
      hidden = document.hidden;
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    const run = async () => {
      if (!active || hidden) {
        if (active) timeoutRef.current = setTimeout(run, 1000);
        return;
      }
      await poll();
      if (active) {
        timeoutRef.current = setTimeout(run, interval);
      }
    };

    run();

    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interval, enabled, ...deps]);
}
