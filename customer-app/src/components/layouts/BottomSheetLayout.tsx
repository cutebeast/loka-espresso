'use client';

import { ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface BottomSheetLayoutProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  showHandle?: boolean;
  maxHeight?: string;
  className?: string;
}

export function BottomSheetLayout({
  isOpen,
  onClose,
  children,
  title,
  showHandle = true,
  maxHeight = '85vh',
  className = '',
}: BottomSheetLayoutProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className={`fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl z-50 overflow-hidden ${className}`}
            style={{ maxHeight, paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Handle */}
            {showHandle && (
              <div className="w-12 h-1 bg-border rounded-full mx-auto mt-4 mb-4" />
            )}

            {/* Title */}
            {title && (
              <div className="px-6 pb-4">
                <h3 className="text-lg font-bold text-text-primary">{title}</h3>
              </div>
            )}

            {/* Content */}
            <div className="overflow-y-auto px-6 pb-6" style={{ maxHeight: `calc(${maxHeight} - ${showHandle ? 60 : 0}px - ${title ? 56 : 0}px)` }}>
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
