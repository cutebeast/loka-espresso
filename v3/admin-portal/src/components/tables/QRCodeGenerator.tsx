"use client";

import { useTranslation } from "@/lib/i18n";
import { useState, useEffect, useRef, useCallback } from "react";
import QRCode from "qrcode";
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
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const result: Record<number, {
    remaining: number;
    expired: boolean;
  }> = {};
  for (const t of tables) {
    if (!t.qr_generated_at) {
      result[t.id] = {
        remaining: 0,
        expired: true
      };
      continue;
    }
    const elapsed = Math.floor((now - new Date(t.qr_generated_at).getTime()) / 1000);
    const remaining = QR_EXPIRY_SECONDS - elapsed;
    result[t.id] = {
      remaining: Math.max(0, remaining),
      expired: remaining <= 0
    };
  }
  return result;
}
export function useQrImages(tables: TableQrInfo[], storeId: number | string) {
  const [qrUrls, setQrUrls] = useState<Record<number, string>>({});
  const prevKey = useRef("");
  const blobUrlsRef = useRef<string[]>([]);
  const generateAll = useCallback(async (tableList: TableQrInfo[], signal: AbortSignal | null): Promise<Record<number, string>> => {
    const newUrls: Record<number, string> = {};
    const valid = tableList.filter(t => {
      // QR payloads are permanent until the admin regenerates the token —
      // the backend validates only the token, no expiry — so always render.
      return !!(t.qr_code_url || t.qr_code_token);
    });
    await Promise.all(valid.map(async t => {
      if (signal?.aborted) return;
      try {
        const payload = t.qr_code_url || `loka:table:${t.qr_code_token}`;
        const dataUrl = await QRCode.toDataURL(payload, {
          width: 280,
          margin: 2,
          color: {
            dark: "#2C1E16",
            light: "#FFFFFF"
          }
        });
        if (!signal?.aborted) newUrls[t.id] = dataUrl;
      } catch (err) {
        console.error(`QR generation failed for table ${t.id}:`, err);
      }
    }));
    return newUrls;
  }, []);
  useEffect(() => {
    const storeKey = String(storeId);
    if (!storeKey || !tables.length) {
      blobUrlsRef.current.forEach(u => URL.revokeObjectURL(u));
      blobUrlsRef.current = [];
      return;
    }
    const key = `${storeKey}:${tables.map(t => `${t.id}:${t.qr_generated_at || "none"}`).join(",")}`;
    if (key === prevKey.current) return;
    prevKey.current = key;
    blobUrlsRef.current.forEach(u => URL.revokeObjectURL(u));
    blobUrlsRef.current = [];
    const abortCtrl = new AbortController();
    generateAll(tables, abortCtrl.signal).then(urls => {
      blobUrlsRef.current = Object.values(urls).filter(u => u.startsWith("blob:"));
      setQrUrls(urls);
    });
    return () => abortCtrl.abort();
  }, [storeId, tables, generateAll]);
  return qrUrls;
}

/* ── QR Code Display Component ── */

interface QRCodeDisplayProps {
  table: TableQrInfo;
  tableNumber: string;
  qrImageUrl: string | undefined;
}
export function QRCodeDisplay({
  table,
  tableNumber,
  qrImageUrl
}: QRCodeDisplayProps) {
  const {
    t
  } = useTranslation();
  const hasPayload = !!(table.qr_code_url || table.qr_code_token);
  if (!hasPayload) {
    return <div className="tp-qr-placeholder">
        <div className="tp-qr-placeholder-icon">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
            <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
          </svg>
        </div>
        <div className="tp-qr-placeholder-text">{t("common.tables_qrcode_generator.no_qr_code")}</div>
      </div>;
  }
  if (!qrImageUrl) {
    return <div className="tp-47">
        <div className="tp-48">
          <svg className="tp-spinner" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </div>
      </div>;
  }
  return <div className="tp-44">
      <img src={qrImageUrl} alt={`QR code for table ${tableNumber}`} className="tp-45" />
    </div>;
}