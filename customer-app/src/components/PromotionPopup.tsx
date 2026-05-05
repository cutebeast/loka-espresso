'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useEscClose } from '@/hooks/useEscClose';
import api from '@/lib/api';
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import type { InformationCard } from '@/lib/api';
import { idbStorage } from '@/lib/idbStorage';
import { resolveAssetUrl } from '@/lib/tokens';

const DISMISSED_KEY = 'loka-dismissed-popups';

async function getDismissedIds(): Promise<number[]> {
  try {
    const raw = await idbStorage.getItem(DISMISSED_KEY);
    if (raw) return JSON.parse(raw) as number[];
  } catch { /* ignore */ }
  return [];
}

async function dismissPopup(id: number) {
  try {
    const current = await getDismissedIds();
    if (!current.includes(id)) {
      await idbStorage.setItem(DISMISSED_KEY, JSON.stringify([...current, id]));
    }
  } catch { /* ignore */ }
}

interface PromotionPopupProps {
  /** If true, renders as a splash-screen overlay (full-screen image, no animation delay) */
  splashMode?: boolean;
}

export default function PromotionPopup({ splashMode = false }: PromotionPopupProps) {
  const page = useUIStore((s) => s.page);
  const [popups, setPopups] = useState<InformationCard[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const popupRef = useFocusTrap<HTMLDivElement>(isOpen);

  const checkPopup = useCallback(async () => {
    // Only show after auth flow completes (user either logged in or chose guest)
    const state = useAuthStore.getState();
    if (!state.authDone) return;
    try {
      const res = await api.get('/content/information?content_type=event&limit=1');
      const data = Array.isArray(res.data) ? res.data : [];
      if (data.length === 0) return;
      const card = data[0] as InformationCard;
      const dismissed = await getDismissedIds();
      if (!dismissed.includes(card.id)) {
        setPopups([card]);
        setCurrentIndex(0);
        setIsOpen(true);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (splashMode) {
      checkPopup();
      return;
    }
    // On homepage, show immediately (no delay)
    checkPopup();
  }, [checkPopup, splashMode]);

  const handleClose = async () => {
    if (popups.length === 0) return;
    const current = popups[currentIndex];
    await dismissPopup(current.id);
    if (currentIndex + 1 < popups.length) {
      setCurrentIndex(prev => prev + 1);
    } else {
      setIsOpen(false);
    }
  };

  useEscClose(isOpen, handleClose);

  if (popups.length === 0) return null;

  const popup = popups[currentIndex];
  const imageUrl = resolveAssetUrl(popup.image_url);

  // If no image, don't show anything — promotion popups are image-only
  if (!imageUrl) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 bg-black/70 z-[60]"
            onClick={handleClose}
            aria-hidden="true"
          />

          {/* Image popup */}
          <motion.div
            ref={popupRef}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="fixed inset-0 z-[61] flex items-center justify-center p-5 pointer-events-none"
          >
            <div
              className="relative w-[88vw] max-w-lg h-[85vh] pointer-events-auto overflow-hidden rounded-2xl"
              role="dialog"
              aria-modal="true"
            >
              {/* Centered image on transparent background */}
              <div className="relative w-full h-full flex items-center justify-center bg-transparent">
                <img
                  src={imageUrl}
                  alt={popup.title || 'Event'}
                  className="max-w-full max-h-full object-contain"
                  loading="eager"
                />

                {/* Close button — top right */}
                <button
                  onClick={handleClose}
                  className="absolute top-3 right-3 w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/60 transition-colors"
                  aria-label="Close"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
