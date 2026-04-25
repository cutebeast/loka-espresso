'use client';

import { MessageSquare } from 'lucide-react';
import { LOKA } from '@/lib/tokens';

interface OrderNotesFieldProps {
  value: string;
  onChange: (notes: string) => void;
  orderMode: 'pickup' | 'delivery' | 'dine_in';
}

const PLACEHOLDERS: Record<string, string> = {
  pickup: 'e.g. Call when ready',
  delivery: 'e.g. Ring doorbell twice',
  dine_in: 'e.g. Allergic to nuts',
};

export default function OrderNotesField({ value, onChange, orderMode }: OrderNotesFieldProps) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare size={16} color={LOKA.copper} />
        <span className="font-bold text-text-primary" style={{ fontSize: 13 }}>Order Notes</span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={PLACEHOLDERS[orderMode]}
        rows={2}
        className="w-full py-3 px-3.5 rounded-[14px] border border-border-subtle bg-white text-sm text-text-primary resize-none outline-none"
        style={{ fontFamily: 'inherit', boxSizing: 'border-box' }}
      />
    </div>
  );
}
