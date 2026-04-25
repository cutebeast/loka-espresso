'use client';

import { useIsMobile } from '@/hooks/useMediaQuery';
import { PageId } from '@/lib/merchant-types';
import { THEME } from '@/lib/theme';

interface NavTab {
  id: PageId;
  label: string;
  icon: string;
}

const navTabs: NavTab[] = [
  { id: 'orders', label: 'Orders', icon: 'fa-clipboard-list' },
  { id: 'kitchen', label: 'Order Station', icon: 'fa-fire-burner' },
  { id: 'walletTopup', label: 'Wallet', icon: 'fa-wallet' },
  { id: 'posterminal', label: 'POS', icon: 'fa-cash-register' },
];

interface MobileBottomNavProps {
  page: PageId;
  setPage: (page: PageId) => void;
}

export default function MobileBottomNav({ page, setPage }: MobileBottomNavProps) {
  const isMobile = useIsMobile();

  if (!isMobile) return null;

  return (
    <nav
      className="mbn-0"
    >
      {navTabs.map(tab => {
        const isActive = page === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setPage(tab.id)}
            className="mbn-btn"
            style={{
              color: isActive ? THEME.primary : THEME.textMuted,
              fontWeight: isActive ? 600 : 500,
            }}
          >
            <span className="mbn-1"><i className={`fas ${tab.icon}`} /></span>
            <span className="mbn-2">{tab.label}</span>
            {isActive && (
              <span
                className="mbn-3"
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
