'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Search, RotateCcw, QrCode, Settings2 } from 'lucide-react';
import { NotificationBell } from './NotificationBell';
import { TierBadge } from './TierBadge';

export type HubHeaderVariant = 'home' | 'menu' | 'rewards' | 'orders' | 'profile';

interface HubHeaderProps {
  variant: HubHeaderVariant;
  userName?: string;
  tier?: string | null;
  points?: number;
  unreadNotifications?: number;
  onNotificationClick: () => void;
  onSearchClick?: () => void;
  onRefreshClick?: () => void;
  onQRScanClick?: () => void;
  onSettingsClick?: () => void;
  extraRight?: ReactNode;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export function HubHeader({
  variant,
  userName,
  tier,
  points,
  unreadNotifications = 0,
  onNotificationClick,
  onSearchClick,
  onRefreshClick,
  onQRScanClick,
  onSettingsClick,
  extraRight,
}: HubHeaderProps) {
  const renderLeft = (): ReactNode => {
    switch (variant) {
      case 'home':
        return (
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-xs font-medium text-text-muted">
              {getGreeting()}
            </span>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-lg font-extrabold text-copper tracking-tight truncate uppercase">
                {userName || 'Guest'}
              </span>
              <TierBadge tier={tier} />
            </div>
          </div>
        );
      case 'menu':
        return <h1 className="text-lg font-extrabold text-text-primary tracking-tight">Menu</h1>;
      case 'rewards':
        return (
          <div className="flex flex-col gap-0.5">
            <h1 className="text-lg font-extrabold text-text-primary tracking-tight">Rewards</h1>
            {points != null && (
              <span className="text-xs font-medium text-text-muted">{points.toLocaleString()} pts</span>
            )}
          </div>
        );
      case 'orders':
        return <h1 className="text-lg font-extrabold text-text-primary tracking-tight">Orders</h1>;
      case 'profile':
        return <h1 className="text-lg font-extrabold text-text-primary tracking-tight">Account</h1>;
      default:
        return null;
    }
  };

  const renderRight = (): ReactNode => {
    const actions: ReactNode[] = [];

    // Home: QR scanner for dine-in customers
    if (variant === 'home' && onQRScanClick) {
      actions.push(
        <motion.button
          key="qr"
          whileTap={{ scale: 0.9 }}
          onClick={onQRScanClick}
          className="w-9 h-9 rounded-xl bg-copper/10 flex items-center justify-center cursor-pointer border border-copper/30"
          aria-label="Scan table QR"
          title="Scan table QR"
        >
          <QrCode size={17} strokeWidth={2.2} className="text-copper" />
        </motion.button>
      );
    }

    // Menu: search
    if (variant === 'menu' && onSearchClick) {
      actions.push(
        <motion.button
          key="search"
          whileTap={{ scale: 0.9 }}
          onClick={onSearchClick}
          className="w-9 h-9 rounded-xl bg-surface flex items-center justify-center cursor-pointer border border-border-subtle"
          aria-label="Search menu"
        >
          <Search size={17} strokeWidth={1.8} className="text-text-primary" />
        </motion.button>
      );
    }

    // Orders: refresh
    if (variant === 'orders' && onRefreshClick) {
      actions.push(
        <motion.button
          key="refresh"
          whileTap={{ scale: 0.9 }}
          onClick={onRefreshClick}
          className="w-9 h-9 rounded-xl bg-surface flex items-center justify-center cursor-pointer border border-border-subtle"
          aria-label="Refresh orders"
        >
          <RotateCcw size={17} strokeWidth={1.8} className="text-text-primary" />
        </motion.button>
      );
    }

    // Profile: settings
    if (variant === 'profile' && onSettingsClick) {
      actions.push(
        <motion.button
          key="settings"
          whileTap={{ scale: 0.9 }}
          onClick={onSettingsClick}
          className="w-9 h-9 rounded-xl bg-surface flex items-center justify-center cursor-pointer border border-border-subtle"
          aria-label="Settings"
        >
          <Settings2 size={17} strokeWidth={1.8} className="text-text-primary" />
        </motion.button>
      );
    }

    if (extraRight) {
      actions.push(<div key="extra-right">{extraRight}</div>);
    }

    // Notification bell on all hub pages except profile
    // (profile has its own notification section inside the page)
    if (variant !== 'profile') {
      actions.push(
        <NotificationBell
          key="notifications"
          unreadCount={unreadNotifications}
          onClick={onNotificationClick}
        />
      );
    }

    return (
      <div className="flex items-center gap-2 shrink-0">
        {actions}
      </div>
    );
  };

  return (
    <div className="bg-white border-b border-border-subtle">
      <div className="flex items-center justify-between gap-3 px-4 py-3 safe-area-top">
        <div className="flex-1 min-w-0">
          {renderLeft()}
        </div>
        {renderRight()}
      </div>
    </div>
  );
}
