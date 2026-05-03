'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/merchant-api';

interface CustomerResult {
  id: number;
  name: string | null;
  phone: string | null;
}

interface ScannedItem {
  type: 'reward' | 'voucher';
  code: string;
  name: string;
  customer_id: number;
  detail: any;
}

interface QRScannerProps {
  onCustomerFound: (customer: CustomerResult) => void;
  onResult: (result: { success: boolean; message: string } | null) => void;
  onApplied: () => void;
}

export default function QRScanner({ onCustomerFound, onResult, onApplied }: QRScannerProps) {
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scannedItem, setScannedItem] = useState<ScannedItem | null>(null);
  const [confirmingScan, setConfirmingScan] = useState(false);
  const scannerRef = useRef<any>(null);
  const videoRef = useRef<HTMLDivElement>(null);

  const stopScanner = useCallback(async () => {
    try {
      if (scannerRef.current) {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
        scannerRef.current = null;
      }
    } catch {
      // Ignore
    }
    setScanning(false);
  }, []);

  const validateScannedCode = useCallback(async (code: string) => {
    setConfirmingScan(true);
    onResult(null);

    // Customer membership card scan (loka:customer:{id})
    if (code.startsWith('loka:customer:')) {
      try {
        const res = await apiFetch('/admin/scan/customer', undefined, {
          method: 'POST',
          body: JSON.stringify({ code }),
        });
        if (res.ok) {
          const data = await res.json();
          onCustomerFound({
            id: data.customer_id,
            name: data.customer_name,
            phone: data.customer_phone,
          });
          onResult({ success: true, message: `Found: ${data.customer_name || 'Customer'} (Balance: RM ${data.wallet_balance?.toFixed(2) || '0.00'})` });
          setConfirmingScan(false);
          return;
        }
        const err = await res.json().catch(() => ({}));
        onResult({ success: false, message: err.detail || 'Customer not found' });
      } catch {
        onResult({ success: false, message: 'Network error' });
      }
      setConfirmingScan(false);
      return;
    }

    try {
      let res = await apiFetch(`/admin/scan/reward/${encodeURIComponent(code)}`, undefined, {
        method: 'POST',
        body: JSON.stringify({ store_id: null }),
      });
      if (res.ok) {
        const data = await res.json();
        setScannedItem({
          type: 'reward',
          code,
          name: data.reward_name || 'Unknown Reward',
          customer_id: data.customer_id,
          detail: data,
        });
        if (data.customer_id) {
          const cRes = await apiFetch(`/admin/customers/${data.customer_id}`);
          if (cRes.ok) {
            const c = await cRes.json();
            onCustomerFound({ id: c.id, name: c.name, phone: c.phone });
          }
        }
        setConfirmingScan(false);
        return;
      }

      res = await apiFetch(`/admin/scan/voucher/${encodeURIComponent(code)}`, undefined, {
        method: 'POST',
        body: JSON.stringify({ store_id: null }),
      });
      if (res.ok) {
        const data = await res.json();
        setScannedItem({
          type: 'voucher',
          code,
          name: data.reward_name || code,
          customer_id: data.customer_id,
          detail: data,
        });
        if (data.customer_id) {
          const cRes = await apiFetch(`/admin/customers/${data.customer_id}`);
          if (cRes.ok) {
            const c = await cRes.json();
            onCustomerFound({ id: c.id, name: c.name, phone: c.phone });
          }
        }
        setConfirmingScan(false);
        return;
      }

      const errData = await res.json().catch(() => ({}));
      onResult({ success: false, message: errData.detail || 'Code not found or already used' });
      setConfirmingScan(false);
    } catch {
      onResult({ success: false, message: 'Network error validating code' });
      setConfirmingScan(false);
    }
  }, [onCustomerFound, onResult]);

  const startScanner = useCallback(async () => {
    setScanning(true);
    setScanError('');
    setScannedItem(null);
    onResult(null);

    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      if (!videoRef.current) return;

      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText: string) => {
          await stopScanner();
          await validateScannedCode(decodedText.trim());
        },
        () => {
        }
      );
    } catch (err: any) {
      setScanError(err.message || 'Unable to start camera. Please check permissions.');
      setScanning(false);
    }
  }, [stopScanner, validateScannedCode, onResult]);

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  async function confirmScannedUse() {
    if (!scannedItem) return;
    setConfirmingScan(true);
    try {
      const endpoint = scannedItem.type === 'reward'
        ? `/admin/scan/reward/${encodeURIComponent(scannedItem.code)}`
        : `/admin/scan/voucher/${encodeURIComponent(scannedItem.code)}`;
      const res = await apiFetch(endpoint, undefined, {
        method: 'POST',
        body: JSON.stringify({ store_id: null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onResult({ success: false, message: data.detail || 'Failed to apply' });
        return;
      }
      onResult({ success: true, message: data.message || `${scannedItem.type === 'reward' ? 'Reward' : 'Voucher'} applied!` });
      setScannedItem(null);
      onApplied();
    } catch {
      onResult({ success: false, message: 'Network error' });
    } finally {
      setConfirmingScan(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn ptp-10"
        onClick={startScanner}
        disabled={scanning}
      >
        <span className="ptp-11"><i className="fas fa-camera"></i></span>
        {scanning ? 'Opening...' : 'Scan QR'}
      </button>

      {scanning && (
        <div className="ptp-18">
          <div className="ptp-19">
            <div className="ptp-20">
              <span className="ptp-21">Scan Customer QR Code</span>
              <button
                className="btn btn-sm ptp-22"
                onClick={stopScanner}
              >
                <i className="fas fa-times"></i> Cancel
              </button>
            </div>
            <div
              id="qr-reader"
              ref={videoRef}
              className="ptp-23"
            />
            {scanError && (
              <div className="ptp-24">{scanError}</div>
            )}
            <p className="ptp-25">
              Point camera at the customer&apos;s reward or voucher QR code
            </p>
          </div>
        </div>
      )}

      {scannedItem && (
        <div className="card ptp-26">
          <div className="ptp-27">
            <span className="ptp-28"><i className="fas fa-check-circle"></i></span>
            <div>
              <div className="ptp-29">
                {scannedItem.type === 'reward' ? 'Reward' : 'Voucher'} Found
              </div>
              <div className="ptp-30">{scannedItem.name}</div>
            </div>
          </div>
          <div className="pos-scan-actions ptp-31">
            <button
              className="btn btn-primary ptp-32"
              onClick={confirmScannedUse}
              disabled={confirmingScan}
            >
              {confirmingScan ? 'Applying...' : `Confirm & Mark as Used`}
            </button>
            <button
              className="btn ptp-33"
              onClick={() => setScannedItem(null)}
              disabled={confirmingScan}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
