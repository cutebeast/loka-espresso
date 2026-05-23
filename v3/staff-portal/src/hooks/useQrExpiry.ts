"use client";

import { useState, useEffect } from "react";

export const QR_EXPIRY_SECONDS = 30 * 60; // 30 minutes

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export interface TableQrInfo {
  id: number;
  qr_code_url?: string | null;
  qr_code_token?: string | null;
  qr_generated_at?: string | null;
}

export function useQrExpiry(tables: TableQrInfo[]) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const id = setInterval(tick, 1000);
    let visId: ReturnType<typeof setInterval> | null = null;
    const onVisibilityChange = () => {
      if (document.hidden) {
        if (visId) { clearInterval(visId); visId = null; }
        clearInterval(id);
      } else {
        tick();
        visId = setInterval(tick, 1000);
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(id);
      if (visId) clearInterval(visId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);
  const result: Record<number, { remaining: number; expired: boolean }> = {};
  for (const t of tables) {
    if (!t.qr_generated_at) {
      result[t.id] = { remaining: 0, expired: true };
      continue;
    }
    const generatedAt = new Date(t.qr_generated_at).getTime();
    if (isNaN(generatedAt)) {
      result[t.id] = { remaining: 0, expired: true };
      continue;
    }
    const elapsed = Math.floor((now - generatedAt) / 1000);
    const remaining = QR_EXPIRY_SECONDS - elapsed;
    result[t.id] = { remaining: Math.max(0, remaining), expired: remaining <= 0 };
  }
  return result;
}
