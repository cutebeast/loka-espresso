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
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 56,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        background: THEME.bgCard,
        borderTop: `1px solid ${THEME.borderLight}`,
        zIndex: 140,
        paddingBottom: 'env(safe-area-inset-bottom, 0)',
        boxShadow: THEME.shadow.lg,
      }}
    >
      {navTabs.map(tab => {
        const isActive = page === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => setPage(tab.id)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: isActive ? THEME.primary : THEME.textMuted,
              fontSize: 11,
              fontWeight: isActive ? 600 : 500,
              gap: 4,
              padding: '4px 0',
              transition: 'color 0.15s',
              WebkitTapHighlightColor: 'transparent',
              minWidth: 44,
            }}
          >
            <i
              className={`fas ${tab.icon}`}
              style={{ fontSize: 20 }}
            />
            <span style={{ lineHeight: 1 }}>{tab.label}</span>
            {isActive && (
              <span
                style={{
                  position: 'absolute',
                  top: 0,
                  left: '50%',
                  transform: 'translateX(-50%)',
                  width: 24,
                  height: 3,
                  borderRadius: '0 0 3px 3px',
                  background: THEME.primary,
                }}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}
