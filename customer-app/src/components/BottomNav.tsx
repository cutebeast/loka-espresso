'use client';

import { motion } from 'framer-motion';
import { Home, Coffee, Crown, ShoppingBag, Clock } from 'lucide-react';
import type { PageId } from '@/lib/api';
import { LOKA } from '@/lib/tokens';
import { useCartStore } from '@/stores/cartStore';

const navItems: { id: PageId; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'menu', label: 'Menu', icon: Coffee },
  { id: 'rewards', label: 'Rewards', icon: Crown },
  { id: 'cart', label: 'Cart', icon: ShoppingBag },
  { id: 'orders', label: 'Orders', icon: Clock },
];

function getActiveNavId(page: PageId): PageId {
  if (page === 'checkout') return 'cart';
  if (page === 'order-detail') return 'orders';
  if (page === 'wallet' || page === 'history') return 'home';
  if (page === 'profile') return 'home';
  if (page === 'promotions' || page === 'information') return 'home';
  if (page === 'my-rewards' || page === 'account-details' || page === 'payment-methods' || page === 'saved-addresses' || page === 'notifications' || page === 'help-support') return 'home';
  return page;
}

interface BottomNavProps {
  page: PageId;
  onNavigate: (id: PageId) => void;
}

export default function BottomNav({ page, onNavigate }: BottomNavProps) {
  const cartCount = useCartStore((s) => s.getItemCount)();
  const activeNavId = getActiveNavId(page);

  return (
    <nav
      className="safe-area-bottom"
      style={{
        background: '#FFFFFF',
        borderTop: `1px solid ${LOKA.border}`,
        boxShadow: '0 -4px 16px rgba(15,19,23,0.04)',
      }}
    >
      <div className="flex items-stretch justify-around" style={{ padding: '8px 8px 16px' }}>
        {navItems.map(({ id, label, icon: Icon }) => {
          const isActive = id === activeNavId;
          return (
            <motion.button
              key={id}
              onClick={() => onNavigate(id)}
              whileTap={{ scale: 0.92 }}
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                padding: '6px 4px',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: isActive ? LOKA.primary : '#8A9AAA',
                position: 'relative',
              }}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
            >
              <div
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 44,
                  height: 28,
                  borderRadius: 14,
                  background: isActive ? LOKA.copperSoft : 'transparent',
                  transition: 'background 0.2s ease',
                }}
              >
                <Icon size={20} strokeWidth={isActive ? 2.4 : 1.8} style={{ color: isActive ? LOKA.primary : '#8A9AAA' }} />
                {id === 'cart' && cartCount > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      top: -2,
                      right: 2,
                      minWidth: 16,
                      height: 16,
                      background: '#C75050',
                      color: '#FFFFFF',
                      fontSize: 10,
                      fontWeight: 700,
                      borderRadius: 999,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 4px',
                      border: '2px solid #FFFFFF',
                    }}
                  >
                    {cartCount > 99 ? '99+' : cartCount}
                  </span>
                )}
              </div>
              <span style={{ fontSize: 11, fontWeight: isActive ? 700 : 500, letterSpacing: '0.01em' }}>
                {label}
              </span>
            </motion.button>
          );
        })}
      </div>
    </nav>
  );
}
