'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Zap, ZapOff, Camera, CameraOff, AlertTriangle } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { LOKA } from '@/lib/tokens';

interface QRScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (result: string) => void;
}

export default function QRScanner({ isOpen, onClose, onScan }: QRScannerProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasPermission, setHasPermission] = useState(false);
  const [notSupported, setNotSupported] = useState(false);
  const [flashOn, setFlashOn] = useState(false);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try { await scannerRef.current.stop(); } catch { /* camera cleanup — ignore */ }
      scannerRef.current = null;
    }
  }, []);

  const startScanner = useCallback(async () => {
    if (!isOpen) return;
    try {
      setIsLoading(true);
      if (!navigator.mediaDevices?.getUserMedia) {
        setIsLoading(false);
        setNotSupported(true);
        return;
      }
      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          onScan(decodedText);
          stopScanner();
        },
        () => { /* ignore scan errors */ }
      );
      setHasPermission(true);
      setIsLoading(false);
    } catch {
      setHasPermission(false);
      setIsLoading(false);
    }
  }, [isOpen, onScan, stopScanner]);

  const toggleFlash = useCallback(async () => {
    try {
      if (!scannerRef.current) return;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: !flashOn } as any],
      } as any);
      setFlashOn(!flashOn);
    } catch { /* unsupported */ }
  }, [flashOn]);

  useEffect(() => {
    if (isOpen) startScanner();
    else { stopScanner(); }
    return () => { stopScanner(); };
  }, [isOpen, startScanner, stopScanner]);

  if (!isOpen) return null;

  return (
    <div className="qr-screen">
      {/* Header over camera */}
      <div className="qr-header">
        <button className="qr-back-btn" onClick={onClose} aria-label="Close">
          <ArrowLeft size={18} />
        </button>
        <span className="qr-title">Scan QR Code</span>
        <button
          className={`qr-flash-btn ${flashOn ? 'active' : ''}`}
          onClick={toggleFlash}
          aria-label="Toggle flash"
        >
          {flashOn ? <Zap size={18} /> : <ZapOff size={18} />}
        </button>
      </div>

      {/* Camera viewport */}
      <div className="qr-camera-area">
        <div id="qr-reader" style={{ width: '100%', height: '100%' }} />

        {!hasPermission && !isLoading && (
          <div className="qr-permission">
            <div className="qr-permission-icon">
              {notSupported ? <AlertTriangle size={28} color="#C9A84C" /> : <CameraOff size={28} color="#4A2210" />}
            </div>
            <h2 className="qr-permission-title">{notSupported ? 'Browser Not Supported' : 'Camera Access Needed'}</h2>
            <p className="qr-permission-text">
              {notSupported
                ? 'Your browser does not support camera access. Please use a QR code link or ask staff for assistance.'
                : 'Allow camera access to scan QR codes for loyalty points, rewards, and in-store ordering.'}
            </p>
            {!notSupported && (
              <button className="qr-permission-btn" onClick={startScanner}>
                <Camera size={16} /> Allow Camera
              </button>
            )}
          </div>
        )}

        {hasPermission && (
          <>
            <div className="qr-viewfinder-overlay" />
            <div className="qr-viewfinder">
              <div className="qr-corner tl" />
              <div className="qr-corner tr" />
              <div className="qr-corner bl" />
              <div className="qr-corner br" />
              <div className="qr-scan-line" />
            </div>
          </>
        )}
      </div>

      {isLoading && (
        <div className="qr-loading">
          <div className="qr-spinner" />
          <p className="qr-loading-text">Starting camera…</p>
        </div>
      )}

      {hasPermission && (
        <div className="qr-prompt">
          <div className="qr-prompt-title">Point camera at QR code</div>
          <div className="qr-prompt-sub">
            Align the code within the frame to scan automatically
          </div>
        </div>
      )}
    </div>
  );
}
