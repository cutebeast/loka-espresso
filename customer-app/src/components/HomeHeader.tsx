'use client';

import { QrCode, Bell } from 'lucide-react';

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
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
  return (
    <div className="home-header">
      <div>
        <div className="greeting-text">{getGreeting()}</div>
        <div className="user-name">{userName || 'Coffee Lover'}</div>
      </div>
      <div className="header-icons">
        <button className="icon-btn" onClick={onQRScanClick} aria-label="Scan QR">
          <QrCode size={20} strokeWidth={2} />
        </button>
        <button className="icon-btn" onClick={onNotificationClick} aria-label="Notifications">
          <Bell size={20} strokeWidth={2} />
          {unreadNotifications > 0 && <span className="notif-dot" />}
        </button>
      </div>
    </div>
  );
}
