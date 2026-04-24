'use client';

import { motion } from 'framer-motion';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastProps {
  message: string;
  type: ToastType;
  onDismiss?: () => void;
}

const config: Record<ToastType, { bg: string; icon: typeof CheckCircle }> = {
  success: { bg: 'bg-success', icon: CheckCircle },
  error:   { bg: 'bg-danger',  icon: AlertCircle },
  info:    { bg: 'bg-info',    icon: Info },
};

export function Toast({ message, type, onDismiss }: ToastProps) {
  const { bg, icon: Icon } = config[type];

  return (
    <motion.div
      initial={{ opacity: 0, y: -60 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -60 }}
      className={`absolute top-0 left-0 right-0 z-50 px-4 pt-3 pb-3 safe-area-top ${bg}`}
      role="status"
      aria-live={type === 'error' ? 'assertive' : 'polite'}
      aria-atomic="true"
    >
      <div className="flex items-center justify-between text-white pt-2">
        <div className="flex items-center gap-2 flex-1">
          <Icon size={18} />
          <span className="text-sm font-medium">{message}</span>
        </div>
        {onDismiss && (
          <button onClick={onDismiss} className="ml-3 p-1 rounded-full hover:bg-white/20 touch-target">
            <X size={16} />
          </button>
        )}
      </div>
    </motion.div>
  );
}
