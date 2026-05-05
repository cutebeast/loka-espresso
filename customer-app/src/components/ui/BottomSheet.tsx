'use client';

import { ReactNode, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/* ============================================
   PHASE 1 — UI/UX v2: BottomSheet
   Supports swipe-to-dismiss via drag on handle
   Used by: country picker, terms, policies
   ============================================ */

export function BottomSheet({ isOpen, onClose, title, children, footer }: BottomSheetProps) {
  const sheetRef = useFocusTrap<HTMLDivElement>(isOpen);
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
          className="bs-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            ref={sheetRef}
            drag="y"
            dragConstraints={{ top: 0 }}
            dragElastic={0.15}
            onDragEnd={(_e, info) => {
              if (info.offset.y > 100) onClose();
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
            className="sheet-content"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle — drags the sheet */}
            <div className="sheet-handle" />

            {/* Header */}
            {title && (
              <div className="sheet-header">
                <h3>{title}</h3>
                <button onClick={onClose} aria-label="Close" className="sheet-close">
                  <X size={16} />
                </button>
              </div>
            )}

            {/* Body */}
            {children}

            {/* Footer */}
            {footer && (
              <div className="sheet-footer">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
