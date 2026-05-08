'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Search, RotateCcw, QrCode, Settings2 } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
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

function getGreeting(t: (k: string) => string): string {
  const h = new Date().getHours();
  if (h < 12) return t('home.greetingMorning');
  if (h < 17) return t('home.greetingAfternoon');
  return t('home.greetingEvening');
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
  const { t } = useTranslation();
  const renderLeft = (): ReactNode => {
    switch (variant) {
      case 'home':
        return (
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-xs font-medium text-text-muted">
              {getGreeting(t)}
            </span>
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-lg font-extrabold text-copper tracking-tight truncate uppercase">
                {userName || t('profile.guest')}
              </span>
              <TierBadge tier={tier} />
            </div>
          </div>
        );
      case 'menu':
        return <h1 className="text-lg font-extrabold text-text-primary tracking-tight">{t('nav.menu')}</h1>;
      case 'rewards':
        return (
          <div className="flex flex-col gap-0.5">
            <h1 className="text-lg font-extrabold text-text-primary tracking-tight">{t('nav.rewards')}</h1>
            {points != null && (
              <span className="text-xs font-medium text-text-muted">{t('profile.pts', { points: points.toLocaleString() })}</span>
            )}
          </div>
        );
      case 'orders':
        return <h1 className="text-lg font-extrabold text-text-primary tracking-tight">{t('nav.orders')}</h1>;
      case 'profile':
        return <h1 className="text-lg font-extrabold text-text-primary tracking-tight">{t('nav.profile')}</h1>;
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
          className="w-11 h-11 rounded-xl bg-copper-10 flex items-center justify-center cursor-pointer border border-copper-30"
          aria-label={t('home.scanQR')}
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
          className="w-11 h-11 rounded-xl bg-surface flex items-center justify-center cursor-pointer border border-border-subtle"
          aria-label={t('menu.search')}
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
          className="w-11 h-11 rounded-xl bg-surface flex items-center justify-center cursor-pointer border border-border-subtle"
          aria-label={t('orders.tapToRefresh')}
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
          className="w-11 h-11 rounded-xl bg-surface flex items-center justify-center cursor-pointer border border-border-subtle"
          aria-label={t('settings.title')}
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
