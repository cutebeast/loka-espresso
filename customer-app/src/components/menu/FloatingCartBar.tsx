'use client';

import { motion } from 'framer-motion';
import { ShoppingCart } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { useCartStore } from '@/stores/cartStore';
import { useUIStore } from '@/stores/uiStore';
import { formatPrice } from '@/lib/tokens';

export default function FloatingCartBar() {
  const { t } = useTranslation();
  const items = useCartStore((s) => s.items);
  const { setPage } = useUIStore();

  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

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
          {t('menu.cartItemCount', { count })} · {formatPrice(total)}
        </span>
      </div>
      <span className="floating-cart-arrow">{t('menu.viewCart')}</span>
    </motion.button>
  );
}
