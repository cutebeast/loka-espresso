'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

interface ActionLayoutProps {
  children: ReactNode;
  actionBar: ReactNode;
  title?: string;
  onBack?: () => void;
  showHeader?: boolean;
  className?: string;
}

export function ActionLayout({
  children,
  actionBar,
  title,
  onBack,
  showHeader = true,
  className = '',
}: ActionLayoutProps) {
  const { t } = useTranslation();
  return (
    <div className={`flex flex-col h-full bg-bg ${className}`}>
      {showHeader && (
        <div className="shrink-0 safe-area-top bg-white border-b border-border-subtle">
          <div className="flex items-center gap-3 px-5 py-4">
            {onBack && (
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={onBack}
                className="loka-back-btn"
                aria-label={t('common.back')}
              >
                <ArrowLeft size={20} className="text-primary" />
              </motion.button>
            )}
            {title && (
              <h1 className="flex-1 text-lg font-extrabold text-text-primary tracking-tight truncate">
                {title}
              </h1>
            )}
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto scroll-container">
        {children}
      </main>

      <div className="shrink-0 safe-area-bottom bg-white border-t border-border-subtle px-5 py-4 shadow-nav">
        {actionBar}
      </div>
    </div>
  );
}
