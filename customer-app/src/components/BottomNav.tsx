'use client';

import { Home, Coffee, Crown, Clock, User } from 'lucide-react';
import type { PageId } from '@/lib/api';

const navItems: { id: PageId; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'menu', label: 'Menu', icon: Coffee },
  { id: 'rewards', label: 'Rewards', icon: Crown },
  { id: 'orders', label: 'Orders', icon: Clock },
  { id: 'profile', label: 'Profile', icon: User },
];

function getActiveNavId(page: PageId): PageId {
  if (page === 'checkout') return 'menu';
  if (page === 'order-detail') return 'orders';
  if (page === 'cart') return 'menu';
  if (page === 'wallet' || page === 'history') return 'profile';
  if (page === 'promotions' || page === 'information') return 'home';
  if (page === 'my-rewards' || page === 'account-details' || page === 'payment-methods' || page === 'saved-addresses' || page === 'notifications' || page === 'help-support' || page === 'my-card' || page === 'settings' || page === 'legal') return 'profile';
  return page;
}

interface BottomNavProps {
  page: PageId;
  onNavigate: (id: PageId) => void;
}

export default function BottomNav({ page, onNavigate }: BottomNavProps) {
  const activeNavId = getActiveNavId(page);

  return (
    <nav className="bottom-nav">
      {navItems.map(({ id, label, icon: Icon }) => {
        const isActive = id === activeNavId;
        return (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={`nav-item ${isActive ? 'active' : ''}`}
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
          >
            <Icon size={22} strokeWidth={isActive ? 2.4 : 1.8} />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
