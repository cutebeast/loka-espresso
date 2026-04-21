'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Flashlight, RefreshCw } from 'lucide-react';

// qr-scanner is a popular library for QR code scanning
// We'll use a dynamic import to avoid SSR issues
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
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [flashOn, setFlashOn] = useState(false);

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

      // Dynamically import qr-scanner
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
          preferredCamera: facingMode,
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
  }, [isOpen, onScan, facingMode, stopScanner]);

  useEffect(() => {
    if (isOpen) {
      startScanner();
    } else {
      stopScanner();
    }

    return () => {
      stopScanner();
    };
  }, [isOpen, startScanner, stopScanner]);

  const toggleFlash = async () => {
    if (!scannerRef.current) return;
    try {
      await scannerRef.current.toggleFlash();
      setFlashOn(!flashOn);
    } catch {
      // Flash not supported on this device
    }
  };

  const toggleCamera = () => {
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
    stopScanner();
    setTimeout(startScanner, 100);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-black"
      >
        {/* Header */}
        <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between p-4 bg-gradient-to-b from-black/70 to-transparent">
          <span className="text-white font-semibold text-lg">Scan Table QR</span>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white/20 backdrop-blur"
          >
            <X size={24} color="white" />
          </button>
        </div>

        {/* Camera View */}
        <div className="relative w-full h-full flex items-center justify-center">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black">
              <div className="text-white text-center">
                <div className="w-12 h-12 border-3 border-white border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p>Starting camera...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/90 p-6">
              <div className="text-white text-center max-w-sm">
                <p className="text-lg mb-4">{error}</p>
                <button
                  onClick={startScanner}
                  className="px-6 py-3 bg-[#384B16] rounded-full font-semibold"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}

          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
          />

          {/* Scan Frame Overlay */}
          {!isLoading && !error && (
            <>
              <div className="absolute inset-0 pointer-events-none">
                {/* Dark overlay with cutout */}
                <svg className="w-full h-full">
                  <defs>
                    <mask id="scan-mask">
                      <rect width="100%" height="100%" fill="white" />
                      <rect
                        x="15%"
                        y="30%"
                        width="70%"
                        height="40%"
                        rx="20"
                        fill="black"
                      />
                    </mask>
                  </defs>
                  <rect
                    width="100%"
                    height="100%"
                    fill="rgba(0,0,0,0.5)"
                    mask="url(#scan-mask)"
                  />
                </svg>

                {/* Corner markers */}
                <div
                  className="absolute border-2 border-[#D18E38]"
                  style={{
                    left: '15%',
                    top: '30%',
                    width: '40px',
                    height: '40px',
                    borderRight: 'none',
                    borderBottom: 'none',
                    borderTopLeftRadius: '20px',
                  }}
                />
                <div
                  className="absolute border-2 border-[#D18E38]"
                  style={{
                    right: '15%',
                    top: '30%',
                    width: '40px',
                    height: '40px',
                    borderLeft: 'none',
                    borderBottom: 'none',
                    borderTopRightRadius: '20px',
                  }}
                />
                <div
                  className="absolute border-2 border-[#D18E38]"
                  style={{
                    left: '15%',
                    bottom: '30%',
                    width: '40px',
                    height: '40px',
                    borderRight: 'none',
                    borderTop: 'none',
                    borderBottomLeftRadius: '20px',
                  }}
                />
                <div
                  className="absolute border-2 border-[#D18E38]"
                  style={{
                    right: '15%',
                    bottom: '30%',
                    width: '40px',
                    height: '40px',
                    borderLeft: 'none',
                    borderTop: 'none',
                    borderBottomRightRadius: '20px',
                  }}
                />

                {/* Scan line animation */}
                <motion.div
                  className="absolute left-[15%] right-[15%] h-[2px] bg-[#D18E38] shadow-lg"
                  style={{ top: '30%' }}
                  animate={{
                    top: ['30%', '70%', '30%'],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                />
              </div>

              {/* Instructions */}
              <div className="absolute bottom-32 left-0 right-0 text-center">
                <p className="text-white/80 text-sm">
                  Point camera at the QR code on your table
                </p>
              </div>

              {/* Controls */}
              <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-6">
                <button
                  onClick={toggleFlash}
                  className={`w-14 h-14 rounded-full flex items-center justify-center backdrop-blur ${
                    flashOn ? 'bg-[#D18E38]' : 'bg-white/20'
                  }`}
                >
                  <Flashlight size={24} color="white" />
                </button>
                <button
                  onClick={toggleCamera}
                  className="w-14 h-14 rounded-full bg-white/20 backdrop-blur flex items-center justify-center"
                >
                  <RefreshCw size={24} color="white" />
                </button>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
