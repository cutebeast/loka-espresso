'use client';

import { QrCode, Utensils } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

interface DineInTableCardProps {
  tableNumber: string;
  storeName: string;
  onScanDifferent: () => void;
}

export default function DineInTableCard({ tableNumber, storeName, onScanDifferent }: DineInTableCardProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-copper-soft ditc-card">
      <div className="w-12 h-12 rounded-[14px] bg-copper flex items-center justify-center shrink-0">
        <span className="ditc-emoji"><Utensils color="#4A2210" size={24} /></span>
      </div>
      <div className="flex-1">
        <p className="text-base font-bold text-brown">
          {t('checkout.dineInTableTitle', { table: tableNumber, store: storeName })}
        </p>
        <p className="text-xs text-text-muted">{t('checkout.dineInOrder')}</p>
      </div>
      <button
        onClick={onScanDifferent}
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-transparent border-none cursor-pointer text-copper text-xs font-semibold"
      >
        <QrCode size={14} />
        {t('checkout.changeTable')}
      </button>
    </div>
  );
}
