'use client';

import { motion } from 'framer-motion';
import { ShoppingCart } from 'lucide-react';
import { useCartStore } from '@/stores/cartStore';
import { useUIStore } from '@/stores/uiStore';

function formatPrice(val: number | string): string {
  return `RM ${Number(val).toFixed(2)}`;
}

export default function FloatingCartBar() {
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
      className="floating-cart-bar"
    >
      <div className="floating-cart-inner">
        <div className="floating-cart-icon-wrap">
          <ShoppingCart size={20} />
          <span className="floating-cart-badge">
            {count > 99 ? '99+' : count}
          </span>
        </div>
        <span>
          {count} item{count !== 1 ? 's' : ''} · {formatPrice(total)}
        </span>
      </div>
      <span className="floating-cart-arrow">View cart →</span>
    </motion.button>
  );
}
