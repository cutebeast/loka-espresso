'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';

interface AuthStepLayoutProps {
  children: ReactNode;
  footer?: ReactNode;
  onBack?: () => void;
}

export function AuthStepLayout({ children, footer, onBack }: AuthStepLayoutProps) {
  return (
    <div className="auth-page">
      {onBack && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          whileTap={{ scale: 0.92 }}
          onClick={onBack}
          className="auth-back-btn"
          aria-label="Go back"
        >
          <ArrowLeft size={20} color="#1B2023" />
        </motion.button>
      )}

      {children}

      {footer && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="auth-footer"
        >
          {footer}
        </motion.div>
      )}
    </div>
  );
}
