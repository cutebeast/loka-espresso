"use client";

import { useEffect, useRef, useCallback } from "react";

interface UsePollingOptions {
  interval?: number;
  enabled?: boolean;
  onError?: (err: any) => void;
}

export function usePolling(
  fn: () => Promise<void>,
  deps: React.DependencyList,
  options: UsePollingOptions = {}
) {
  const { interval = 10000, enabled = true, onError } = options;
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const poll = useCallback(async () => {
    try {
      await fnRef.current();
    } catch (err) {
      try { onErrorRef.current?.(err); }
      catch (handlerErr) { console.error("Polling onError threw:", handlerErr); }
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    let active = true;

    const run = async () => {
      if (!active) return;
      await poll();
      if (active) {
        timeoutRef.current = setTimeout(run, interval);
      }
    };

    run();

    return () => {
      active = false;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interval, enabled, ...deps]);
}
