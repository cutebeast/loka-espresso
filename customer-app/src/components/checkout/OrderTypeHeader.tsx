'use client';

const LOKA = {
  primary: '#384B16',
  copper: '#D18E38',
  copperSoft: 'rgba(209,142,56,0.12)',
  textPrimary: '#1B2023',
  textMuted: '#6A7A8A',
  borderSubtle: '#E4EAEF',
  surface: '#F5F7FA',
};

interface OrderTypeHeaderProps {
  orderMode: 'pickup' | 'delivery' | 'dine_in';
  storeName: string;
  storeAddress?: string;
}

export default function OrderTypeHeader({ orderMode, storeName, storeAddress }: OrderTypeHeaderProps) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 14px', background: LOKA.surface, borderRadius: 16,
    }}>
      <div style={{
        width: 42, height: 42, borderRadius: 12,
        background: LOKA.copperSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <span style={{ fontSize: 18 }}>🏪</span>
      </div>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 11, color: LOKA.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {orderMode === 'pickup' ? 'Pickup at' : orderMode === 'delivery' ? 'Deliver from' : 'Order from'}
        </p>
        <p style={{ fontSize: 15, fontWeight: 700, color: LOKA.textPrimary }}>{storeName}</p>
        {storeAddress && <p style={{ fontSize: 12, color: LOKA.textMuted }}>{storeAddress}</p>}
      </div>
    </div>
  );
}
