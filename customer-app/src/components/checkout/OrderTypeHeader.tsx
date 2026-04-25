'use client';

interface OrderTypeHeaderProps {
  orderMode: 'pickup' | 'delivery' | 'dine_in';
  storeName: string;
  storeAddress?: string;
}

export default function OrderTypeHeader({ orderMode, storeName, storeAddress }: OrderTypeHeaderProps) {
  return (
    <div className="flex items-center gap-3 py-3 px-3.5 bg-surface rounded-2xl">
      <div className="flex items-center justify-center shrink-0 rounded-xl bg-copper-soft" style={{ width: 42, height: 42 }}>
        <span style={{ fontSize: 18 }}>🏪</span>
      </div>
      <div className="flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          {orderMode === 'pickup' ? 'Pickup at' : orderMode === 'delivery' ? 'Deliver from' : 'Order from'}
        </p>
        <p className="font-bold text-text-primary" style={{ fontSize: 15 }}>{storeName}</p>
        {storeAddress && <p className="text-xs text-text-muted">{storeAddress}</p>}
      </div>
    </div>
  );
}
