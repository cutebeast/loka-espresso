'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, Wifi } from 'lucide-react';

function getInitialOnline() {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
}

export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState<boolean>(getInitialOnline);
  const [showBanner, setShowBanner] = useState<boolean>(() => !getInitialOnline());

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setTimeout(() => setShowBanner(false), 2000);
    };
    const handleOffline = () => {
      setIsOnline(false);
      setShowBanner(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-x-0 top-0 flex items-center justify-center gap-2 py-2.5 px-4 text-white font-semibold"
          style={{
            zIndex: 9999,
            fontSize: 13,
            background: isOnline ? '#059669' : '#B91C1C',
          }}
          role="status"
          aria-live="polite"
        >
          {isOnline ? (
            <>
              <Wifi size={16} />
              <span>Back online</span>
            </>
          ) : (
            <>
              <WifiOff size={16} />
              <span>You are offline. Some features may be unavailable.</span>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
