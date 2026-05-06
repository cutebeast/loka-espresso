'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, X } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

interface ImmersiveLayoutProps {
  children: ReactNode;
  onClose?: () => void;
  showCloseButton?: boolean;
  closeButtonPosition?: 'top-left' | 'top-right';
  closeIcon?: 'back' | 'close';
  className?: string;
}

export function ImmersiveLayout({
  children,
  onClose,
  showCloseButton = true,
  closeButtonPosition = 'top-left',
  closeIcon = 'back',
  className = '',
}: ImmersiveLayoutProps) {
  const { t } = useTranslation();
  const CloseIcon = closeIcon === 'close' ? X : ArrowLeft;
  const positionClass = closeButtonPosition === 'top-left' ? 'left-4' : 'right-4';

  return (
    <div className={`relative w-full h-full overflow-hidden ${className}`}>
      {children}

      {showCloseButton && onClose && (
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onClose}
          className={`absolute top-4 ${positionClass} z-50 w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-md`}
          aria-label={closeIcon === 'close' ? t('common.close') : t('common.back')}
        >
          <CloseIcon size={20} className="text-primary" />
        </motion.button>
      )}
    </div>
  );
}
