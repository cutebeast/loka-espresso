'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Sparkles } from 'lucide-react';
import api from '@/lib/api';
import type { InformationCard } from '@/lib/api';
import { idbStorage } from '@/lib/idbStorage';

const DISMISSED_KEY = 'loka-dismissed-popups';

import { resolveAssetUrl } from '@/lib/tokens';

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

export default function PromotionPopup() {
  const [popup, setPopup] = useState<InformationCard | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const checkPopup = useCallback(async () => {
    try {
      const res = await api.get('/content/information?content_type=promotion&limit=1');
      const data = Array.isArray(res.data) ? res.data : [];
      if (data.length === 0) return;
      const card = data[0] as InformationCard;
      const dismissed = await getDismissedIds();
      if (!dismissed.includes(card.id)) {
        setPopup(card);
        setIsOpen(true);
      }
    } catch {
      // silently fail — popup is non-critical
    }
  }, []);

  useEffect(() => {
    // Delay slightly so it doesn't clash with splash/auth screens
    const timer = setTimeout(() => {
      checkPopup();
    }, 3000);
    return () => clearTimeout(timer);
  }, [checkPopup]);

  const handleClose = async () => {
    setIsOpen(false);
    if (popup) {
      await dismissPopup(popup.id);
    }
  };

  if (!popup) return null;

  const imageUrl = resolveAssetUrl(popup.image_url);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/60 z-[60]"
            onClick={handleClose}
            aria-hidden="true"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="fixed inset-0 z-[61] flex items-center justify-center p-6 pointer-events-none"
          >
            <div
              className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden pointer-events-auto"
              role="dialog"
              aria-modal="true"
              aria-labelledby="popup-title"
            >
              {/* Header image */}
              {imageUrl && (
                <div className="relative w-full h-40 bg-gray-100">
                  <img
                    src={imageUrl}
                    alt={popup.title}
                    className="w-full h-full object-cover"
                    loading="eager"
                  />
                  <div className="absolute top-3 left-3">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#384B16] text-white">
                      <Sparkles size={12} />
                      Promotion
                    </span>
                  </div>
                  <button
                    onClick={handleClose}
                    className="absolute top-3 right-3 w-11 h-11 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/50 transition-colors"
                    aria-label="Close"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}

              {/* No image header */}
              {!imageUrl && (
                <div className="relative px-5 pt-5 pb-2">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles size={18} className="text-[#384B16]" />
                    <span className="text-xs font-bold text-[#384B16] uppercase tracking-wider">Promotion</span>
                  </div>
                  <button
                    onClick={handleClose}
                    className="absolute top-4 right-4 w-11 h-11 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
                    aria-label="Close"
                  >
                    <X size={16} />
                  </button>
                </div>
              )}

              {/* Content */}
              <div className="px-5 pb-5 pt-3">
                <h2 id="popup-title" className="text-lg font-bold text-[#1B2023] mb-2">
                  {popup.title}
                </h2>
                <p className="text-sm text-[#6A7A8A] leading-relaxed whitespace-pre-line">
                  {popup.long_description || popup.short_description}
                </p>

                {/* Action button if URL provided */}
                {popup.action_url && (
                  <a
                    href={popup.action_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 block w-full text-center bg-[#384B16] text-white font-semibold py-3 rounded-xl text-sm"
                    onClick={handleClose}
                  >
                    {popup.action_label || popup.action_type || 'Learn More'}
                  </a>
                )}

                {/* Dismiss button */}
                {!popup.action_url && (
                  <button
                    onClick={handleClose}
                    className="mt-4 w-full text-center bg-[#F5F7FA] text-[#384B16] font-semibold py-3 rounded-xl text-sm hover:bg-[#E4EAEF] transition-colors"
                  >
                    Got it
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
