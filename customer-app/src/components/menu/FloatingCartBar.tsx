'use client';

import { motion } from 'framer-motion';
import { ShoppingCart } from 'lucide-react';
import { useCartStore } from '@/stores/cartStore';
import { useUIStore } from '@/stores/uiStore';

const LOKA = {
  primary: '#384B16',
  white: '#FFFFFF',
} as const;

function formatPrice(val: number | string): string {
  return `RM ${Number(val).toFixed(2)}`;
}

export default function FloatingCartBar() {
  const items = useCartStore((s) => s.items);
  const getItemCount = useCartStore((s) => s.getItemCount);
  const getTotal = useCartStore((s) => s.getTotal);
  const { setPage } = useUIStore();

  const count = getItemCount();
  const total = getTotal();

  if (count === 0) return null;

  return (
    <motion.button
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      whileTap={{ scale: 0.97 }}
      onClick={() => setPage('cart')}
      style={{
        position: 'fixed',
        bottom: 80,
        left: 16,
        right: 16,
        maxWidth: 398,
        margin: '0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '14px 20px',
        borderRadius: 999,
        background: LOKA.primary,
        color: LOKA.white,
        fontSize: 14,
        fontWeight: 700,
        border: 'none',
        cursor: 'pointer',
        boxShadow: '0 12px 24px -8px rgba(56,75,22,0.4)',
        zIndex: 40,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ShoppingCart size={20} />
          <span
            style={{
              position: 'absolute',
              top: -6,
              right: -8,
              minWidth: 18,
              height: 18,
              background: '#C75050',
              color: '#FFFFFF',
              fontSize: 10,
              fontWeight: 700,
              borderRadius: 999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
            }}
          >
            {count > 99 ? '99+' : count}
          </span>
        </div>
        <span>
          {count} item{count !== 1 ? 's' : ''} · {formatPrice(total)}
        </span>
      </div>
      <span style={{ fontSize: 13, opacity: 0.9 }}>View cart →</span>
    </motion.button>
  );
}