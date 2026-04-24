'use client';

import { Bell } from 'lucide-react';
import { motion } from 'framer-motion';

interface NotificationBellProps {
  unreadCount?: number;
  onClick: () => void;
}

export function NotificationBell({ unreadCount = 0, onClick }: NotificationBellProps) {
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      className="relative w-9 h-9 rounded-xl bg-surface flex items-center justify-center cursor-pointer border border-border-subtle"
      aria-label="Notifications"
      title="Notifications"
    >
      <Bell size={17} strokeWidth={1.8} className="text-text-primary" />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-danger text-white text-[10px] font-bold rounded-full flex items-center justify-center border-2 border-white">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </motion.button>
  );
}
