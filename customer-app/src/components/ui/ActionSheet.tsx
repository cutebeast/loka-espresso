'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useEscClose } from '@/hooks/useEscClose';

interface ActionOption {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'danger';
}

interface ActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  options: ActionOption[];
}

export function ActionSheet({ isOpen, onClose, title, options }: ActionSheetProps) {
  useEscClose(isOpen, onClose);
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
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 bg-bg-light rounded-t-3xl z-50 pb-safe as-sheet"
          >
            <div className="w-12 h-1 bg-border rounded-full mx-auto mt-4 mb-4" />
            {title && (
              <p className="text-center text-sm font-semibold text-text-muted mb-2 px-6">{title}</p>
            )}
            <div className="mx-4 bg-white rounded-xl overflow-hidden mb-3">
              {options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => { onClose(); opt.onClick(); }}
                  className={`w-full py-4 text-base font-medium border-b border-border-subtle last:border-b-0 transition-colors active:bg-bg-light ${
                    opt.variant === 'danger' ? 'text-danger' : 'text-text-primary'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="mx-4 bg-white rounded-xl overflow-hidden">
              <button
                onClick={onClose}
                className="w-full py-4 text-base font-bold text-text-primary active:bg-bg-light transition-colors"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
