'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, CheckCircle } from 'lucide-react';

interface ConfirmDialogProps {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  variant?: 'destructive' | 'standard';
  confirmLabel?: string;
  cancelLabel?: string;
}

export function ConfirmDialog({
  isOpen,
  onCancel,
  onConfirm,
  title,
  message,
  variant = 'standard',
  confirmLabel,
  cancelLabel = 'Cancel',
}: ConfirmDialogProps) {
  const isDestructive = variant === 'destructive';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50"
            onClick={onCancel}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-2xl p-6 z-50 w-[85%] max-w-[320px]"
          >
            <div className="flex flex-col items-center text-center mb-5">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${isDestructive ? 'bg-danger-light text-danger' : 'bg-primary-100 text-primary'}`}>
                {isDestructive ? <AlertTriangle size={24} /> : <CheckCircle size={24} />}
              </div>
              <h3 className="loka-h4 mb-1">{title}</h3>
              <p className="loka-body-sm text-text-secondary">{message}</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="flex-1 py-3 rounded-xl bg-bg-light text-text-primary font-semibold text-sm hover:bg-border-subtle transition-colors"
              >
                {cancelLabel}
              </button>
              <button
                onClick={onConfirm}
                className={`flex-1 py-3 rounded-xl font-semibold text-sm text-white transition-colors active:scale-[0.97] ${
                  isDestructive ? 'bg-danger hover:bg-danger/90' : 'bg-primary hover:bg-primary-dark'
                }`}
              >
                {confirmLabel || (isDestructive ? 'Delete' : 'Confirm')}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
