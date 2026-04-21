'use client';

import { Truck } from 'lucide-react';

const LOKA = {
  primary: '#384B16',
  copper: '#D18E38',
  success: '#85B085',
  textPrimary: '#1B2023',
  textMuted: '#6A7A8A',
  borderSubtle: '#E4EAEF',
  surface: '#F5F7FA',
  white: '#FFFFFF',
};

interface PaymentSummaryProps {
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
}

function formatPrice(val: number | string): string {
  return `RM ${Number(val).toFixed(2)}`;
}

export default function PaymentSummary({ subtotal, deliveryFee, discount, total }: PaymentSummaryProps) {
  return (
    <div style={{
      background: LOKA.white, borderRadius: 20, padding: 16,
      border: `1px solid ${LOKA.borderSubtle}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 13, color: LOKA.textMuted }}>Subtotal</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: LOKA.textPrimary }}>{formatPrice(subtotal)}</span>
      </div>
      
      {deliveryFee > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Truck size={14} color={LOKA.textMuted} />
            <span style={{ fontSize: 13, color: LOKA.textMuted }}>Delivery fee</span>
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: LOKA.textPrimary }}>{formatPrice(deliveryFee)}</span>
        </div>
      )}
      
      {discount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <span style={{ fontSize: 13, color: LOKA.success }}>Discount</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: LOKA.success }}>-{formatPrice(discount)}</span>
        </div>
      )}
      
      <div style={{ 
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginTop: 12, paddingTop: 12, borderTop: `1px solid ${LOKA.borderSubtle}`,
      }}>
        <span style={{ fontWeight: 800, fontSize: 16, color: LOKA.textPrimary }}>Total</span>
        <span style={{ fontWeight: 800, fontSize: 20, color: LOKA.primary }}>{formatPrice(total)}</span>
      </div>
    </div>
  );
}
