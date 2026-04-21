'use client';

import { QrCode } from 'lucide-react';

const LOKA = {
  primary: '#384B16',
  copper: '#D18E38',
  copperSoft: 'rgba(209,142,56,0.12)',
  brown: '#57280D',
  textPrimary: '#1B2023',
  textMuted: '#6A7A8A',
  borderSubtle: '#E4EAEF',
  surface: '#F5F7FA',
  white: '#FFFFFF',
};

interface DineInTableCardProps {
  tableNumber: string;
  storeName: string;
  onScanDifferent: () => void;
}

export default function DineInTableCard({ tableNumber, storeName, onScanDifferent }: DineInTableCardProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '14px 16px', background: LOKA.copperSoft, borderRadius: 16,
      border: `1px solid rgba(209,142,56,0.2)`,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 14,
        background: LOKA.copper, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <span style={{ fontSize: 22 }}>🍽️</span>
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 16, fontWeight: 700, color: LOKA.brown }}>
          Table {tableNumber} · {storeName}
        </p>
        <p style={{ fontSize: 12, color: LOKA.textMuted }}>Dine-in order</p>
      </div>
      <button
        onClick={onScanDifferent}
        style={{
          display: 'flex', alignItems: 'center', gap: 4,
          padding: '6px 10px', borderRadius: 8,
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: LOKA.copper, fontSize: 12, fontWeight: 600,
        }}
      >
        <QrCode size={14} />
        Change
      </button>
    </div>
  );
}
