'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';

type QrScannerType = typeof import('qr-scanner');

interface QRScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (result: string) => void;
}

export default function QRScanner({ isOpen, onClose, onScan }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerRef = useRef<InstanceType<QrScannerType['default']> | null>(null);
  const [hasCamera, setHasCamera] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');

  const stopScanner = useCallback(() => {
    if (scannerRef.current) {
      scannerRef.current.stop();
      scannerRef.current.destroy();
      scannerRef.current = null;
    }
  }, []);

  const startScanner = useCallback(async () => {
    if (!videoRef.current || !isOpen) return;
    try {
      setIsLoading(true);
      setError('');
      const QrScanner = (await import('qr-scanner')).default;
      scannerRef.current = new QrScanner(
        videoRef.current,
        (result) => {
          if (result?.data) {
            onScan(result.data);
            stopScanner();
          }
        },
        {
          preferredCamera: 'environment',
          maxScansPerSecond: 10,
          highlightScanRegion: true,
          highlightCodeOutline: true,
          returnDetailedScanResult: true,
        }
      );
      await scannerRef.current.start();
      setIsLoading(false);
    } catch (err) {
      console.error('QR Scanner error:', err);
      setError('Unable to access camera. Please check permissions.');
      setHasCamera(false);
      setIsLoading(false);
    }
  }, [isOpen, onScan, stopScanner]);

  useEffect(() => {
    if (isOpen) {
      startScanner();
    } else {
      stopScanner();
    }
    return () => { stopScanner(); };
  }, [isOpen, startScanner, stopScanner]);

  if (!isOpen) return null;

  return (
    <div className="qr-screen">
      {/* Header */}
      <div className="qr-header">
        <h2 className="qr-title">Scan QR Code</h2>
        <button className="qr-close-btn" onClick={onClose} aria-label="Close">
          <X size={24} />
        </button>
      </div>

      {/* Scanner Area */}
      <div className="scanner-area">
        {isLoading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'white', zIndex: 5 }}>
            <div style={{ width: 36, height: 36, border: '3px solid rgba(255,255,255,0.2)', borderTopColor: 'var(--loka-primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            <p style={{ fontSize: 15 }}>Starting camera…</p>
          </div>
        )}

        {error && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 5, padding: 24 }}>
            <div style={{ textAlign: 'center', color: 'white', maxWidth: 280 }}>
              <p style={{ fontSize: 15, marginBottom: 20 }}>{error}</p>
              <button
                onClick={startScanner}
                className="btn btn-primary btn-pill"
                style={{ padding: '12px 24px' }}
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        <video
          ref={videoRef}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          playsInline
          muted
        />

        {!isLoading && !error && (
          <>
            <div className="viewfinder">
              <div className="border-frame" />
              <div className="corner corner-tl" />
              <div className="corner corner-tr" />
              <div className="corner corner-bl" />
              <div className="corner corner-br" />
            </div>
            <div className="qr-hint">Point camera at a Loka QR code</div>
          </>
        )}
      </div>

      {/* Bottom safe area */}
      <div style={{ height: 'var(--safe-bottom)', flexShrink: 0 }} />
    </div>
  );
}
