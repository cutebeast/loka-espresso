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
  const [, setHasCamera] = useState(true);
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
          <div className="qr-loading">
            <div className="qr-spinner" />
            <p className="qr-loading-text">Starting camera…</p>
          </div>
        )}

        {error && (
          <div className="qr-error-overlay">
            <div className="qr-error-inner">
              <p className="qr-error-text">{error}</p>
              <button
                onClick={startScanner}
                className="btn btn-primary btn-pill qr-error-btn"
              >
                Try Again
              </button>
            </div>
          </div>
        )}

        <video
          ref={videoRef}
          className="qr-video"
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
      <div className="qr-safe-bottom" />
    </div>
  );
}
