'use client';

import React, { useEffect } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { motion, AnimatePresence } from 'framer-motion';
import { X, CheckCircle2, XCircle, Info, AlertTriangle, Star } from 'lucide-react';

interface ToastData {
  message: string;
  type: 'success' | 'error' | 'info' | 'warning' | 'reward';
  title?: string;
  primaryAction?: string;
  secondaryAction?: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
}

const ICONS: Record<string, React.ReactNode> = {
  success: <CheckCircle2 size={20} color="var(--color-success)" />,
  error: <XCircle size={20} color="var(--color-danger)" />,
  info: <Info size={20} color="var(--color-primary)" />,
  warning: <AlertTriangle size={20} color="var(--color-gold)" />,
  reward: <Star size={20} color="var(--color-gold)" />,
};

export default function Toast({ toast, onDismiss }: { toast: ToastData; onDismiss: () => void }) {
  const { t } = useTranslation();
  useEffect(() => {
    const timer = setTimeout(onDismiss, toast.primaryAction ? 6000 : 5000);
    return () => clearTimeout(timer);
  }, [onDismiss, toast.primaryAction]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="toast-container-v2"
      >
        <div className={`toast-v2 toast-v2-${toast.type}`}>
        <div className="toast-v2-icon">{ICONS[toast.type]}</div>
        <div className="toast-v2-body">
          {toast.title && <div className="toast-v2-title">{toast.title}</div>}
          <div className="toast-v2-message">{toast.message}</div>
          {(toast.primaryAction || toast.secondaryAction) && (
            <div className="toast-v2-actions">
              {toast.primaryAction && (
                <button className="toast-v2-action-btn primary" onClick={() => { toast.onPrimary?.(); onDismiss(); }}>
                  {toast.primaryAction}
                </button>
              )}
              {toast.secondaryAction && (
                <button className="toast-v2-action-btn secondary" onClick={() => { toast.onSecondary?.(); onDismiss(); }}>
                  {toast.secondaryAction}
                </button>
              )}
            </div>
          )}
        </div>
        <button className="toast-v2-close" onClick={onDismiss} aria-label={t('common.close')}>
          <X size={12} />
        </button>
      </div>
      </motion.div>
    </AnimatePresence>
  );
}
