'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Crown,
  Star,
  Wallet,
  History,
  MapPin,
  CreditCard,
  Bell,
  Info,
  LogOut,
  ChevronRight,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useWalletStore } from '@/stores/walletStore';
import { useCartStore } from '@/stores/cartStore';
import { useUIStore } from '@/stores/uiStore';
import { Button, Modal } from '@/components/ui';
import api from '@/lib/api';

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const staggerItem = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

function formatPrice(val: number): string {
  return `RM ${val.toFixed(2)}`;
}

function getNextTier(tier: string): string | null {
  const tiers = ['Bronze', 'Silver', 'Gold', 'Platinum'];
  const idx = tiers.indexOf(tier);
  if (idx < 0 || idx >= tiers.length - 1) return null;
  return tiers[idx + 1];
}

function getTierProgress(tier: string, points: number): number {
  const thresholds: Record<string, number> = { Bronze: 0, Silver: 500, Gold: 1000, Platinum: 1500 };
  const current = thresholds[tier] ?? 0;
  const nextTier = getNextTier(tier);
  if (!nextTier) return 100;
  const next = thresholds[nextTier] ?? current + 500;
  const range = next - current;
  return Math.min(100, Math.max(0, ((points - current) / range) * 100));
}

const MENU_ITEMS = [
  { id: 'history', icon: History, label: 'Transaction History' },
  { id: 'addresses', icon: MapPin, label: 'Delivery Addresses' },
  { id: 'payments', icon: CreditCard, label: 'Payment Methods' },
  { id: 'notifications', icon: Bell, label: 'Notifications', toggle: true },
  { id: 'about', icon: Info, label: 'About Loka' },
];

export default function ProfilePage() {
  const { user, setUser, logout } = useAuthStore();
  const { balance, points, tier, setBalance, setPoints, setTier } = useWalletStore();
  const { setPage, showToast } = useUIStore();
  const clearCart = useCartStore((s) => s.clearCart);

  const [showLogout, setShowLogout] = useState(false);
  const [notifications, setNotifications] = useState(true);

  const loadProfile = useCallback(async () => {
    try {
      const [userRes, walletRes, loyaltyRes] = await Promise.all([
        api.get('/users/me'),
        api.get('/wallet'),
        api.get('/loyalty/balance'),
      ]);
      setUser(userRes.data);
      setBalance(walletRes.data?.balance ?? balance);
      setPoints(loyaltyRes.data?.points_balance ?? loyaltyRes.data?.points ?? points);
      setTier(loyaltyRes.data?.tier ?? tier);
    } catch {
      // keep existing store values
    }
  }, [balance, points, tier, setBalance, setPoints, setTier, setUser]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleMenuClick = (id: string) => {
    switch (id) {
      case 'history':
        setPage('history');
        break;
      case 'addresses':
      case 'payments':
        showToast('Coming soon', 'info');
        break;
      case 'notifications':
        setNotifications((prev) => !prev);
        break;
      case 'about':
        showToast('Loka Espresso v1.0', 'info');
        break;
    }
  };

  const handleLogout = () => {
    logout();
    clearCart();
    setShowLogout(false);
  };

  const initials = user?.name?.charAt(0)?.toUpperCase() || 'U';
  const nextTier = getNextTier(tier);
  const progress = getTierProgress(tier, points);

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="px-4 pt-4 pb-6">
      <motion.div variants={staggerItem} className="mb-6">
        <div className="flex flex-col items-center text-center">
          <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center mb-3">
            <span className="text-2xl font-bold text-white">{initials}</span>
          </div>
          <h2 className="text-lg font-bold text-gray-900">{user?.name || 'Guest'}</h2>
          <p className="text-sm text-gray-500">{user?.email || ''}</p>
        </div>
      </motion.div>

      <motion.div variants={staggerItem} className="mb-4">
        <div className="bg-gradient-to-r from-[#384B16] to-[#6b8f3a] rounded-2xl p-4 text-white shadow-lg">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Crown size={16} className="opacity-90" />
              <span className="text-sm font-semibold">{tier} Member</span>
            </div>
            <div className="flex items-center gap-1">
              <Star size={14} className="text-yellow-300" />
              <span className="text-sm font-bold">{points} pts</span>
            </div>
          </div>
          {nextTier && (
            <div>
              <div className="flex justify-between text-xs opacity-70 mb-1">
                <span>{tier}</span>
                <span>{nextTier}</span>
              </div>
              <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  className="h-full bg-yellow-300 rounded-full"
                />
              </div>
            </div>
          )}
        </div>
      </motion.div>

      <motion.div variants={staggerItem} className="mb-4">
        <button
          onClick={() => setPage('wallet')}
          className="w-full bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-3 text-left"
        >
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
            <Wallet size={18} className="text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-xs text-gray-500">Wallet Balance</p>
            <p className="text-lg font-bold text-gray-900">{formatPrice(balance)}</p>
          </div>
          <span className="text-xs font-semibold text-primary">View Wallet</span>
          <ChevronRight size={16} className="text-gray-400" />
        </button>
      </motion.div>

      <motion.div variants={staggerItem} className="mb-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {MENU_ITEMS.map((item, i) => {
            const Icon = item.icon;
            const isLast = i === MENU_ITEMS.length - 1;
            return (
              <button
                key={item.id}
                onClick={() => handleMenuClick(item.id)}
                className={`w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 transition-colors ${
                  !isLast ? 'border-b border-gray-100' : ''
                }`}
              >
                <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center">
                  <Icon size={16} className="text-gray-600" />
                </div>
                <span className="flex-1 text-sm font-medium text-gray-900">{item.label}</span>
                {item.toggle ? (
                  <div
                    className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${
                      notifications ? 'bg-primary justify-end' : 'bg-gray-300 justify-start'
                    }`}
                  >
                    <div className="w-5 h-5 bg-white rounded-full shadow-sm" />
                  </div>
                ) : (
                  <ChevronRight size={16} className="text-gray-400" />
                )}
              </button>
            );
          })}
        </div>
      </motion.div>

      <motion.div variants={staggerItem}>
        <Button
          variant="outline"
          size="lg"
          className="w-full text-red-500 border-red-200 hover:bg-red-50 hover:text-red-600"
          onClick={() => setShowLogout(true)}
          leftIcon={<LogOut size={18} />}
        >
          Sign Out
        </Button>
      </motion.div>

      <Modal
        isOpen={showLogout}
        onClose={() => setShowLogout(false)}
        title="Sign Out"
        variant="center"
      >
        <p className="text-sm text-gray-500 mb-5">
          Are you sure you want to sign out?
        </p>
        <div className="flex gap-3">
          <Button variant="ghost" className="flex-1" onClick={() => setShowLogout(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            className="flex-1 bg-red-500 hover:bg-red-600"
            onClick={handleLogout}
          >
            Sign Out
          </Button>
        </div>
      </Modal>
    </motion.div>
  );
}
