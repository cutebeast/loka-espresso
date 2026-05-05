'use client';

import { MessageSquare } from 'lucide-react';
import { LOKA } from '@/lib/tokens';
import { useTranslation } from '@/hooks/useTranslation';

interface OrderNotesFieldProps {
  value: string;
  onChange: (notes: string) => void;
  orderMode: 'pickup' | 'delivery' | 'dine_in';
}

export default function OrderNotesField({ value, onChange, orderMode }: OrderNotesFieldProps) {
  const { t } = useTranslation();

  const PLACEHOLDERS: Record<string, string> = {
    pickup: t('checkout.notesPlaceholderPickup'),
    delivery: t('checkout.notesPlaceholderDelivery'),
    dine_in: t('checkout.notesPlaceholderDineIn'),
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare size={16} color={LOKA.copper} />
        <span className="font-bold text-text-primary onf-title">{t('checkout.orderNotes')}</span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={PLACEHOLDERS[orderMode]}
        rows={2}
        className="w-full py-3 px-3.5 rounded-[14px] border border-border-subtle bg-white text-sm text-text-primary resize-none outline-none onf-textarea"
      />
    </div>
  );
}
