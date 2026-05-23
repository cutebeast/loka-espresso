"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import QRCode from "qrcode";
import { TableQrInfo, QR_EXPIRY_SECONDS } from "./useQrExpiry";

export function useQrImages(tables: TableQrInfo[], storeId: number | string) {
  const [qrUrls, setQrUrls] = useState<Record<number, string>>({});
  const prevKey = useRef("");
  const generationIdRef = useRef(0);

  const generateAll = useCallback(
    async (tableList: TableQrInfo[], now: number, signal: AbortSignal | null): Promise<Record<number, string>> => {
      const newUrls: Record<number, string> = {};
      const valid = tableList.filter((t) => {
        const hasPayload = !!(t.qr_code_url || t.qr_code_token);
        if (!hasPayload || !t.qr_generated_at) return false;
        return (now - new Date(t.qr_generated_at).getTime()) / 1000 <= QR_EXPIRY_SECONDS;
      });

      await Promise.all(
        valid.map(async (t) => {
          if (signal?.aborted) return;
          try {
            const payload = t.qr_code_url || `loka:table:${t.qr_code_token}`;
            const dataUrl = await QRCode.toDataURL(payload, {
              width: 280,
              margin: 2,
              color: { dark: "#2C1E16", light: "#FFFFFF" },
            });
            if (!signal?.aborted) newUrls[t.id] = dataUrl;
          } catch (err) {
            console.error(`QR generation failed for table ${t.id}:`, err);
          }
        })
      );
      return newUrls;
    },
    []
  );

  useEffect(() => {
    const storeKey = String(storeId);
    if (!storeKey || !tables.length) {
      setQrUrls({});
      return;
    }

    // Key includes qr_generated_at so any timestamp update triggers regeneration
    // (intentional: ensures QR data matches the current backend state)
    const key = `${storeKey}:${tables.map((t) => `${t.id}:${t.qr_generated_at || "none"}`).join(",")}`;
    if (key === prevKey.current) return;
    prevKey.current = key;

    const abortCtrl = new AbortController();
    const genId = ++generationIdRef.current;
    generateAll(tables, Date.now(), abortCtrl.signal).then((urls) => {
      if (abortCtrl.signal.aborted) return;
      if (genId !== generationIdRef.current) return;
      setQrUrls(urls);
    });
    return () => abortCtrl.abort();
  }, [storeId, tables, generateAll]);

  return qrUrls;
}
