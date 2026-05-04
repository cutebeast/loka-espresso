'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';
import QRCode from 'qrcode';
import type { MerchantTableItem } from '@/lib/merchant-types';

export const QR_EXPIRY_SECONDS = 30 * 60;

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function useQrExpiry(tables: MerchantTableItem[]) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const result: Record<number, { remaining: number; expired: boolean }> = {};
  for (const t of tables) {
    if (!t.qr_generated_at) {
      result[t.id] = { remaining: 0, expired: true };
      continue;
    }
    const elapsed = Math.floor((now - new Date(t.qr_generated_at).getTime()) / 1000);
    const remaining = QR_EXPIRY_SECONDS - elapsed;
    result[t.id] = { remaining: Math.max(0, remaining), expired: remaining <= 0 };
  }
  return result;
}

export function useQrImages(tables: MerchantTableItem[], storeId: string) {
  const [qrUrls, setQrUrls] = useState<Record<number, string>>({});
  const prevKey = useRef('');
  const generating = useRef(false);
  const blobUrlsRef = useRef<string[]>([]);

  const generateAll = useCallback(
    async (tableList: MerchantTableItem[], now: number, signal: AbortSignal | null): Promise<Record<number, string>> => {
      generating.current = true;
      const newUrls: Record<number, string> = {};
      const valid = tableList.filter(t => {
        if (!t.qr_code_url || !t.qr_generated_at) return false;
        return (now - new Date(t.qr_generated_at).getTime()) / 1000 <= QR_EXPIRY_SECONDS;
      });

      await Promise.all(
        valid.map(async (t) => {
          if (signal?.aborted) return;
          try {
            const dataUrl = await QRCode.toDataURL(t.qr_code_url!, {
              width: 280, margin: 2,
              color: { dark: '#2C1E16', light: '#FFFFFF' },
            });
            if (!signal?.aborted) newUrls[t.id] = dataUrl;
          } catch (err) {
            console.error(`QR generation failed for table ${t.table_number}:`, err);
          }
        })
      );

      generating.current = false;
      return newUrls;
    },
    []
  );

  useEffect(() => {
    if (!storeId || !tables.length) {
      blobUrlsRef.current.forEach(u => URL.revokeObjectURL(u));
      blobUrlsRef.current = [];
      return;
    }

    const key = `${storeId}:${tables.map(t => `${t.id}:${t.qr_generated_at || 'none'}`).join(',')}`;
    if (key === prevKey.current) return;
    prevKey.current = key;

    blobUrlsRef.current.forEach(u => URL.revokeObjectURL(u));
    blobUrlsRef.current = [];

    const abortCtrl = new AbortController();
    generateAll(tables, Date.now(), abortCtrl.signal).then(urls => {
      blobUrlsRef.current = Object.values(urls).filter(u => u.startsWith('blob:'));
      setQrUrls(urls);
    });
    return () => abortCtrl.abort();
  }, [storeId, tables, generateAll]);

  return qrUrls;
}

function QRPlaceholder() {
  return (
    <div className="tp-qr-placeholder">
      <div className="tp-qr-placeholder-icon">
        <i className="fas fa-qrcode"></i>
      </div>
      <div className="tp-qr-placeholder-text">No QR Code</div>
    </div>
  );
}

interface QRCodeDisplayProps {
  table: MerchantTableItem;
  qrImageUrl: string | undefined;
  expiry: { remaining: number; expired: boolean } | undefined;
}

export function QRCodeDisplay({ table, qrImageUrl, expiry }: QRCodeDisplayProps) {
  if (!table.qr_code_url || expiry?.expired) {
    return <QRPlaceholder />;
  }

  if (!qrImageUrl) {
    return (
      <div className="tp-47">
        <span className="tp-48"><i className="fas fa-spinner fa-spin"></i></span>
      </div>
    );
  }

  return (
    <div className="tp-44">
      <Image
        src={qrImageUrl}
        alt={`QR code for table ${table.table_number}`}
        width={140}
        height={140}
        className="tp-45"
      />
      <div className={`tp-timer ${(expiry?.remaining ?? 0) < 300 ? 'tp-timer-urgent' : 'tp-timer-warn'}`}>
        <i className="fas fa-clock"></i> Expires in {formatDuration(expiry?.remaining || 0)}
      </div>
    </div>
  );
}
