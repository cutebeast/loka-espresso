"use client";

import { useEffect, useState } from "react";

interface TimerProps {
  startTime: string;
  className?: string;
}

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const hrs = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  const remainingSecs = seconds % 60;
  if (hrs > 0) return `${hrs}h ${remainingMins}m`;
  if (mins > 0) return `${mins}m ${remainingSecs}s`;
  return `${remainingSecs}s`;
}

export default function Timer({ startTime, className = "" }: TimerProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const startMs = new Date(startTime).getTime();
    if (isNaN(startMs)) {
      setElapsed(0);
      return;
    }
    const update = () => {
      const now = Date.now();
      setElapsed(Math.max(0, Math.floor((now - startMs) / 1000)));
    };
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  return <span className={className}>{formatDuration(elapsed)}</span>;
}
