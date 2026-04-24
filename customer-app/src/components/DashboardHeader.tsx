'use client';

/**
 * DEPRECATED: Use `HubHeader` with `variant="home"` instead.
 * This component is kept for backwards compatibility during migration.
 */

import { HubHeader } from '@/components/ui';

interface DashboardHeaderProps {
  userName?: string;
  tier?: string | null;
  unreadNotifications?: number;
  onShowNotifications: () => void;
  onShowQRScanner: () => void;
}

export default function DashboardHeader({
  userName,
  tier,
  unreadNotifications = 0,
  onShowNotifications,
  onShowQRScanner,
}: DashboardHeaderProps) {
  return (
    <HubHeader
      variant="home"
      userName={userName}
      tier={tier}
      unreadNotifications={unreadNotifications}
      onNotificationClick={onShowNotifications}
      onQRScanClick={onShowQRScanner}
    />
  );
}
