'use client';

import { MapPin, ChevronDown } from 'lucide-react';
import { motion } from 'framer-motion';
import type { Store } from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';

interface StorePillProps {
  store: Store | null;
  distance?: string;
  onClick: () => void;
}

export function StorePill({ store, distance, onClick }: StorePillProps) {
  const { t } = useTranslation();
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface border border-border-subtle text-text-secondary text-xs font-medium cursor-pointer max-w-[160px]"
      aria-label={t('storePicker.title')}
      title="Switch store"
    >
      <MapPin size={12} className="text-copper shrink-0" />
      <span className="truncate">
        {store?.name || 'Select store'}
      </span>
      {distance && (
        <span className="opacity-60 shrink-0">· {distance}</span>
      )}
      <ChevronDown size={12} className="shrink-0 opacity-60" />
    </motion.button>
  );
}
