'use client';

import { motion } from 'framer-motion';
import { Home, Coffee, Crown, Clock, User } from 'lucide-react';
import { useCartStore } from '@/stores/cartStore';
import { useTranslation } from '@/hooks/useTranslation';
import type { PageId } from '@/lib/api';

function getActiveNavId(page: PageId): PageId {
  if (page === 'checkout') return 'menu';
  if (page === 'order-detail') return 'orders';
  if (page === 'cart') return 'menu';
  if (page === 'wallet' || page === 'history') return 'profile';
  if (page === 'promotions' || page === 'my-rewards' || page === 'information') return 'rewards';
  if (page === 'account-details' || page === 'payment-methods' || page === 'saved-addresses' || page === 'notifications' || page === 'help-support' || page === 'my-card' || page === 'settings' || page === 'legal') return 'profile';
  return page;
}

interface BottomNavProps {
  page: PageId;
  onNavigate: (id: PageId) => void;
}

export default function BottomNav({ page, onNavigate }: BottomNavProps) {
  const { t } = useTranslation();
  const activeNavId = getActiveNavId(page);
  const cartCount = useCartStore((s) => s.items?.length ?? 0);

  const allNavItems: { id: PageId; label: string; icon: typeof Home; badgeKey?: string }[] = [
    { id: 'home', label: t('nav.home'), icon: Home },
    { id: 'menu', label: t('nav.menu'), icon: Coffee, badgeKey: 'cart' },
    { id: 'rewards', label: t('nav.rewards'), icon: Crown },
    { id: 'orders', label: t('nav.orders'), icon: Clock },
    { id: 'profile', label: t('nav.profile'), icon: User },
  ];

  return (
    <nav className="bottom-nav">
      {allNavItems.map(({ id, label, icon: Icon, badgeKey }) => {
        const isActive = id === activeNavId;
        const badgeCount = badgeKey === 'cart' ? cartCount : 0;
        return (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={`nav-item${isActive ? ' active' : ''}`}
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
          >
            {isActive && (
              <motion.div
                layoutId="active-pill"
                className="nav-active-pill"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
            <span className="nav-icon-wrap">
              <Icon size={22} strokeWidth={isActive ? 2.4 : 1.8} />
              {badgeCount > 0 && (
                <span className={`nav-badge${badgeCount > 0 ? ' pulse' : ''}`}>
                  {badgeCount > 9 ? '9+' : badgeCount}
                </span>
              )}
            </span>
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
