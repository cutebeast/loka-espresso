'use client';

import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Coffee } from 'lucide-react';

interface SplashScreenProps {
  onFinish: () => void;
}

export function SplashScreen({ onFinish }: SplashScreenProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const duration = 2000; // 2 seconds total
    const interval = 20; // Update every 20ms
    const step = 100 / (duration / interval);
    
    const timer = setInterval(() => {
      setProgress((prev) => {
        const next = prev + step;
        if (next >= 100) {
          clearInterval(timer);
          setTimeout(onFinish, 300);
          return 100;
        }
        return next;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [onFinish]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="flex-1 flex flex-col items-center justify-center bg-primary safe-area-top safe-area-bottom px-6"
    >
      {/* Logo Animation */}
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="flex flex-col items-center"
      >
        {/* Animated Coffee Icon Container */}
        <motion.div
          animate={{ 
            rotate: [0, 10, -10, 0],
            scale: [1, 1.05, 1],
          }}
          transition={{ 
            duration: 2,
            repeat: Infinity,
            ease: 'easeInOut'
          }}
          className="w-28 h-28 bg-white/15 rounded-3xl flex items-center justify-center mb-8 backdrop-blur-sm"
        >
          <Coffee className="w-14 h-14 text-white" strokeWidth={2} />
        </motion.div>

        {/* Brand Name */}
        <motion.h1
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="text-5xl font-extrabold text-white tracking-wider mb-3"
        >
          LOKA
        </motion.h1>

        <motion.p
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="text-white/70 text-base tracking-widest uppercase"
        >
          Artisan Coffee
        </motion.p>
      </motion.div>

      {/* Progress Bar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="absolute bottom-24 left-8 right-8"
      >
        <div className="h-1 bg-white/20 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-white rounded-full"
            style={{ width: `${progress}%` }}
            transition={{ duration: 0.1 }}
          />
        </div>
        <p className="text-white/50 text-xs text-center mt-3">
          {progress < 100 ? 'Loading...' : 'Ready'}
        </p>
      </motion.div>

      {/* Version Tag */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6 }}
        className="absolute bottom-8"
      >
        <span className="text-white/40 text-xs">v1.0.0</span>
      </motion.div>
    </motion.div>
  );
}
