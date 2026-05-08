'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useEscClose } from '@/hooks/useEscClose';
import api from '@/lib/api';
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/hooks/useTranslation';
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
  const { t } = useTranslation();
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
      const res = await api.get('/content/information?content_type=popup_banner&limit=1');
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

  // Auto-close after 15 seconds
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (isOpen) {
      timerRef.current = setTimeout(() => {
        handleClose();
      }, 15000);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isOpen, handleClose]);

  if (popups.length === 0) return null;

  const popup = popups[currentIndex];
  const imageUrl = resolveAssetUrl(popup.image_url);
  const isVideo = popup.image_url && /\.(mp4|webm)($|\?)/i.test(popup.image_url);
  const visibleSections = (popup.sections || []).filter(s => s.visible !== false);

  // If no image/video, don't show anything
  if (!imageUrl) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="fixed inset-0 bg-black/90 z-[60]"
            onClick={handleClose}
            aria-hidden="true"
          />

          <motion.div
            ref={popupRef}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="fixed inset-0 z-[61] flex items-center justify-center p-5 pointer-events-none"
          >
            <div
              className="relative w-[90vw] max-w-sm aspect-[9/16] max-h-[88vh] pointer-events-auto overflow-hidden rounded-2xl"
              role="dialog"
              aria-modal="true"
            >
              <div className="relative w-full h-full flex items-center justify-center bg-black">
                {isVideo ? (
                  <video src={imageUrl} className="w-full h-full object-cover" autoPlay muted loop playsInline />
                ) : (
                  <img src={imageUrl} alt={popup.title || 'Promotion'} className="w-full h-full object-cover" loading="eager" />
                )}

                {/* Text overlay on top of image/video */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-16 pb-6 px-5">
                  {popup.title && (
                    <h2 className="text-white text-xl font-bold mb-2" style={{ fontFamily: 'var(--font-display, serif)' }}>{popup.title}</h2>
                  )}
                  {(popup.short_description || popup.long_description) && (
                    <p className="text-white/80 text-sm mb-4 leading-relaxed">{popup.long_description || popup.short_description}</p>
                  )}
                  {visibleSections.length > 0 && visibleSections.map((s, i) => (
                    <div key={i} style={{ marginBottom: i < visibleSections.length - 1 ? 12 : 0 }}>
                      {s.title && <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{s.title}</div>}
                      {s.body && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', margin: 0, lineHeight: 1.5 }}>{s.body}</p>}
                      {s.list && s.list.length > 0 && (
                        <ul style={{ margin: '4px 0 0 16px', padding: 0, fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
                          {s.list.map((item, j) => <li key={j} style={{ marginBottom: 2 }}>{item}</li>)}
                        </ul>
                      )}
                    </div>
                  ))}
                  {popup.action_url && popup.action_label && (
                    <a
                      href={popup.action_url}
                      className="inline-block mt-3 px-5 py-2.5 rounded-full text-white text-sm font-semibold"
                      style={{ background: 'var(--loka-accent-gold, #C9A84C)' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (popup.action_url?.startsWith('#')) {
                          e.preventDefault();
                          useUIStore.getState().setPage(popup.action_url.replace('#', '') as any);
                        }
                      }}
                    >
                      {popup.action_label}
                    </a>
                  )}
                </div>

                <button
                  onClick={handleClose}
                  className="absolute top-3 right-3 w-10 h-10 rounded-full bg-black/40 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/60 transition-colors"
                  aria-label={t('common.close')}
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
