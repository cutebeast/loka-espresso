'use client';

import { motion } from 'framer-motion';
import { useEffect } from 'react';
import { Coffee } from 'lucide-react';

interface SplashScreenProps {
  onFinish: () => void;
}

/**
 * Premium splash – dark espresso gradient, radial halo, gently
 * rising steam wisps, and a reveal of the LOKA wordmark.
 * Fully inline-styled so it renders identically in every build.
 */
export function SplashScreen({ onFinish }: SplashScreenProps) {
  useEffect(() => {
    const timer = setTimeout(onFinish, 2200);
    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="flex-1 flex flex-col items-center justify-center relative overflow-hidden safe-area-top safe-area-bottom"
      style={{
        background:
          'radial-gradient(120% 60% at 50% 20%, #2E3A14 0%, #1B2023 55%, #0F1317 100%)',
        color: '#FFFFFF',
      }}
    >
      {/* Copper halo behind the mark */}
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        style={{
          position: 'absolute',
          top: '28%',
          width: 260,
          height: 260,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(209,142,56,0.22) 0%, rgba(209,142,56,0.0) 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Logo block */}
      <motion.div
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.55, ease: 'easeOut' }}
        style={{ textAlign: 'center', position: 'relative' }}
      >
        {/* Steam wisps */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: -42,
            transform: 'translateX(-50%)',
            width: 72,
            height: 42,
            pointerEvents: 'none',
          }}
        >
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: [-2, -24], opacity: [0, 0.45, 0] }}
              transition={{
                duration: 2.4,
                delay: 0.3 + i * 0.35,
                repeat: Infinity,
                ease: 'easeOut',
              }}
              style={{
                position: 'absolute',
                left: 12 + i * 22,
                bottom: 0,
                width: 3,
                height: 24,
                borderRadius: 999,
                background:
                  'linear-gradient(180deg, rgba(255,255,255,0.6) 0%, rgba(255,255,255,0) 100%)',
              }}
            />
          ))}
        </div>

        {/* Coffee mark */}
        <motion.div
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 96,
            height: 96,
            borderRadius: 28,
            background:
              'linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)',
            border: '1px solid rgba(209,142,56,0.25)',
            boxShadow: '0 20px 40px -15px rgba(0,0,0,0.6)',
            marginBottom: 20,
          }}
        >
          <Coffee size={48} style={{ color: '#D18E38' }} strokeWidth={1.5} />
        </motion.div>

        <motion.h1
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.25, duration: 0.5 }}
          style={{
            fontSize: 40,
            fontWeight: 800,
            letterSpacing: '4px',
            color: '#FFFFFF',
            margin: 0,
          }}
        >
          LOKA
        </motion.h1>

        <motion.p
          initial={{ y: 12, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.5 }}
          style={{
            marginTop: 10,
            fontSize: 13,
            letterSpacing: '2px',
            textTransform: 'uppercase',
            color: '#D18E38',
            fontWeight: 600,
          }}
        >
          Espresso · Since 2026
        </motion.p>
      </motion.div>

      {/* Preparing spinner */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        style={{
          position: 'absolute',
          bottom: 40,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          color: '#8A9AAA',
          fontSize: 12,
          letterSpacing: '1px',
          textTransform: 'uppercase',
        }}
      >
        <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none">
          <circle
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
            strokeDasharray="50 20"
            strokeLinecap="round"
          />
        </svg>
        Brewing...
      </motion.div>
    </motion.div>
  );
}
