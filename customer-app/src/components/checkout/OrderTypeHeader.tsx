'use client';

import { Store } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

interface OrderTypeHeaderProps {
  orderMode: 'pickup' | 'delivery' | 'dine_in';
  storeName: string;
  storeAddress?: string;
}

export default function OrderTypeHeader({ orderMode, storeName, storeAddress }: OrderTypeHeaderProps) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-3 py-3 px-3.5 bg-surface rounded-2xl">
      <div className="flex items-center justify-center shrink-0 rounded-xl bg-copper-soft oth-icon-wrap">
        <span className="oth-emoji"><Store color="#3B4A1A" size={18} /></span>
      </div>
      <div className="flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          {orderMode === 'pickup' ? t('checkout.pickupAt') : orderMode === 'delivery' ? t('checkout.deliverFrom') : t('checkout.orderFrom')}
        </p>
        <p className="font-bold text-text-primary oth-store">{storeName}</p>
        {storeAddress && <p className="text-xs text-text-muted">{storeAddress}</p>}
      </div>
    </div>
  );
}
