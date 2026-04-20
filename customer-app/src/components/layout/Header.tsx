'use client';

import { motion } from 'framer-motion';
import { Bell, QrCode, ChevronDown, MapPin } from 'lucide-react';

interface HeaderProps {
  storeName: string;
  userName: string;
  greeting: string;
  onStoreSelect: () => void;
  onQRScanner: () => void;
  onNotifications: () => void;
}

export function Header({
  storeName,
  userName,
  greeting,
  onStoreSelect,
  onQRScanner,
  onNotifications,
}: HeaderProps) {
  return (
    <header className="bg-white px-4 pt-4 pb-3 border-b border-gray-100">
      <div className="flex items-center justify-between">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onStoreSelect}
          className="flex items-center gap-2 bg-primary/10 px-3 py-2 rounded-full hover:bg-primary/15 transition-colors"
        >
          <MapPin size={16} className="text-primary" />
          <span className="font-semibold text-sm text-primary max-w-[120px] truncate">
            {storeName || 'Select store'}
          </span>
          <ChevronDown size={14} className="text-primary/70" />
        </motion.button>

        <div className="flex items-center gap-3">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onNotifications}
            className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center hover:bg-gray-100 transition-colors"
          >
            <Bell size={20} className="text-gray-600" />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onQRScanner}
            className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center hover:bg-gray-100 transition-colors"
          >
            <QrCode size={20} className="text-gray-600" />
          </motion.button>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mt-4"
      >
        <h1 className="text-2xl font-bold text-gray-900">
          {greeting}, {userName ? userName.split(' ')[0] : 'there'} 👋
        </h1>
        <p className="text-gray-500 text-base mt-0.5">What&apos;s your coffee mood today?</p>
      </motion.div>
    </header>
  );
}