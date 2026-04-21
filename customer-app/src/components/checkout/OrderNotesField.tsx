'use client';

import { MessageSquare } from 'lucide-react';

const LOKA = {
  primary: '#384B16',
  copper: '#D18E38',
  textPrimary: '#1B2023',
  textMuted: '#6A7A8A',
  borderSubtle: '#E4EAEF',
  surface: '#F5F7FA',
  white: '#FFFFFF',
};

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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <MessageSquare size={16} color={LOKA.copper} />
        <span style={{ fontSize: 13, fontWeight: 700, color: LOKA.textPrimary }}>Order Notes</span>
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={PLACEHOLDERS[orderMode]}
        rows={2}
        style={{
          width: '100%', padding: '12px 14px', borderRadius: 14,
          border: `1px solid ${LOKA.borderSubtle}`,
          background: LOKA.white, fontSize: 14, color: LOKA.textPrimary,
          resize: 'none', outline: 'none', fontFamily: 'inherit',
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}
