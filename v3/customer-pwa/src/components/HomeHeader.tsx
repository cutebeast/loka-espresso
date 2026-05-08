'use client';

import { QrCode, Bell } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

function getGreeting(t: (key: string, options?: Record<string, string | number>) => string): string {
  const h = new Date().getHours();
  if (h < 12) return t('home.greetingMorning');
  if (h < 17) return t('home.greetingAfternoon');
  return t('home.greetingEvening');
}

interface HomeHeaderProps {
  userName?: string;
  unreadNotifications?: number;
  onNotificationClick: () => void;
  onQRScanClick: () => void;
}

export function HomeHeader({
  userName,
  unreadNotifications = 0,
  onNotificationClick,
  onQRScanClick,
}: HomeHeaderProps) {
  const { t } = useTranslation();
  return (
    <div className="home-header">
      <div>
        <div className="greeting-text">{getGreeting(t)}</div>
        <div className="user-name">{userName || t('home.guestName')}</div>
      </div>
      <div className="header-icons">
        <button className="icon-btn" onClick={onQRScanClick} aria-label={t('home.scanQR')}>
          <QrCode size={20} strokeWidth={2} />
        </button>
        <button className="icon-btn" onClick={onNotificationClick} aria-label={t('home.notifications')}>
          <Bell size={20} strokeWidth={2} />
          {unreadNotifications > 0 && <span className="notif-dot" />}
        </button>
      </div>
    </div>
  );
}
