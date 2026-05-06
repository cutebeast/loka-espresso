'use client';

import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { LOKA } from '@/lib/tokens';
import { useTranslation } from '@/hooks/useTranslation';

interface PageHeaderProps {
  title: string;
  onBack?: () => void;
}

export default function PageHeader({ title, onBack }: PageHeaderProps) {
  const { t } = useTranslation();
  return (
    <div className="loka-page-header">
      {onBack && (
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={onBack}
          className="loka-back-btn"
          aria-label={t('common.back')}
        >
          <ArrowLeft size={20} color={LOKA.primary} />
        </motion.button>
      )}
      <h1 className="flex-1 text-lg font-extrabold text-text-primary tracking-tight truncate">
        {title}
      </h1>
    </div>
  );
}
