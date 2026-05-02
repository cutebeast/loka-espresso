'use client';

import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

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
  success: <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>,
  error: <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  info: <svg viewBox="0 0 24 24"><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/><circle cx="12" cy="12" r="10"/></svg>,
  warning: <svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  reward: <svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>,
};

export default function Toast({ toast, onDismiss }: { toast: ToastData; onDismiss: () => void }) {
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
        <button className="toast-v2-close" onClick={onDismiss} aria-label="Close">
          <X size={12} />
        </button>
      </div>
      </motion.div>
    </AnimatePresence>
  );
}
