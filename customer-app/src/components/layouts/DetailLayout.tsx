'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';

interface DetailLayoutProps {
  children: ReactNode;
  title?: string;
  onBack?: () => void;
  rightAction?: ReactNode;
  showHeader?: boolean;
  className?: string;
}

export function DetailLayout({
  children,
  title,
  onBack,
  rightAction,
  showHeader = true,
  className = '',
}: DetailLayoutProps) {
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
                aria-label="Go back"
              >
                <ArrowLeft size={20} className="text-primary" />
              </motion.button>
            )}
            {title && (
              <h1 className="flex-1 text-lg font-extrabold text-text-primary tracking-tight truncate">
                {title}
              </h1>
            )}
            {rightAction && <div className="shrink-0">{rightAction}</div>}
          </div>
        </div>
      )}

      <main className="flex-1 overflow-y-auto scroll-container">
        {children}
      </main>
    </div>
  );
}
