'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Info, X } from 'lucide-react';

interface InfoPopupProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  buttonLabel?: string;
}

export function InfoPopup({ isOpen, onClose, title, message, buttonLabel = 'Got it' }: InfoPopupProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl p-6 z-50 w-[85%] max-w-[320px]"
          >
            <div className="flex flex-col items-center text-center mb-5">
              <div className="w-12 h-12 rounded-full bg-info-light text-info flex items-center justify-center mb-3">
                <Info size={24} />
              </div>
              <h3 className="loka-h4 mb-1">{title}</h3>
              <p className="loka-body-sm text-text-secondary">{message}</p>
            </div>
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary-dark transition-colors active:scale-[0.97]"
            >
              {buttonLabel}
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
