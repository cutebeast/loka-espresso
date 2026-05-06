'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Zap, ZapOff, Camera, CameraOff, AlertTriangle } from 'lucide-react';
import { Html5Qrcode } from 'html5-qrcode';
import { haptic } from '@/lib/haptics';
import { LOKA } from '@/lib/tokens';
import { useTranslation } from '@/hooks/useTranslation';

interface QRScannerProps {
  isOpen: boolean;
  onClose: () => void;
  onScan: (result: string) => void;
}

export default function QRScanner({ isOpen, onClose, onScan }: QRScannerProps) {
  const { t } = useTranslation();
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
          haptic('success');
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
        <button className="qr-back-btn" onClick={onClose} aria-label={t('common.close')}>
          <ArrowLeft size={18} />
        </button>
        <span className="qr-title">{t('qr.title')}</span>
        <button
          className={`qr-flash-btn ${flashOn ? 'active' : ''}`}
          onClick={toggleFlash}
          aria-label={t('qr.toggleFlash')}
        >
          {flashOn ? <Zap size={18} /> : <ZapOff size={18} />}
        </button>
      </div>

      {/* Camera viewport */}
      <div className="qr-camera-area">
        <div id="qr-reader" className="w-full h-full" />

        {!hasPermission && !isLoading && (
          <div className="qr-permission">
            <div className="qr-permission-icon">
              {notSupported ? <AlertTriangle size={28} color="#C9A84C" /> : <CameraOff size={28} color="#4A2210" />}
            </div>
            <h2 className="qr-permission-title">{notSupported ? t('qr.browserUnsupported') : t('qr.cameraPermissionNeeded')}</h2>
            <p className="qr-permission-text">
              {notSupported
                ? t('qr.browserUnsupportedDesc')
                : t('qr.cameraPermissionDesc')}
            </p>
            {!notSupported && (
              <button className="qr-permission-btn" onClick={startScanner}>
                <Camera size={16} /> {t('qr.allowCamera')}
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
          <p className="qr-loading-text">{t('qr.startingCamera')}</p>
        </div>
      )}

      {hasPermission && (
        <div className="qr-prompt">
          <div className="qr-prompt-title">{t('qr.pointCamera')}</div>
          <div className="qr-prompt-sub">
            {t('qr.alignCode')}
          </div>
        </div>
      )}
    </div>
  );
}
