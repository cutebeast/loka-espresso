'use client';

import { Truck } from 'lucide-react';
import { LOKA, formatPrice } from '@/lib/tokens';

interface PaymentSummaryProps {
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
}

export default function PaymentSummary({ subtotal, deliveryFee, discount, total }: PaymentSummaryProps) {
  return (
    <div className="bg-white p-4 border border-border-subtle psummary-card">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-text-muted psummary-label">Subtotal</span>
        <span className="font-semibold text-text-primary psummary-value">{formatPrice(subtotal)}</span>
      </div>
      
      {deliveryFee > 0 && (
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-1.5">
            <Truck size={14} color={LOKA.textMuted} />
            <span className="text-text-muted psummary-label">Delivery fee</span>
          </div>
          <span className="font-semibold text-text-primary psummary-value">{formatPrice(deliveryFee)}</span>
        </div>
      )}
      
      {discount > 0 && (
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-success psummary-label">Discount</span>
          <span className="font-bold text-success psummary-value">-{formatPrice(discount)}</span>
        </div>
      )}
      
      <div className="flex items-center justify-between mt-3 pt-3 border-t border-border-subtle">
        <span className="font-extrabold text-base text-text-primary">Total</span>
        <span className="font-extrabold text-text-primary psummary-total">{formatPrice(total)}</span>
      </div>
    </div>
  );
}
