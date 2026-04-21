'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Crown,
  Star,
  User,
  CreditCard,
  MapPin,
  Bell,
  Headset,
  ChevronRight,
  LogOut,
  Wallet,
  Mail,
  History,
  Gift,
  Ticket,
  Clock,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useWalletStore } from '@/stores/walletStore';
import { useUIStore } from '@/stores/uiStore';
import { Modal } from '@/components/ui';
import api from '@/lib/api';

const LOKA = {
  primary: '#384B16',
  primaryDark: '#2A3910',
  copper: '#D18E38',
  copperLight: '#E5A559',
  copperSoft: 'rgba(209,142,56,0.12)',
  cream: '#F3EEE5',
  brown: '#57280D',
  textPrimary: '#1B2023',
  textSecondary: '#3A4A5A',
  textMuted: '#6A7A8A',
  border: '#D4DCE5',
  borderSubtle: '#E4EAEF',
  surface: '#F5F7FA',
  bg: '#E4EAEF',
  white: '#FFFFFF',
} as const;

function formatPrice(val: number | string): string {
  const n = Number(val);
  if (!Number.isFinite(n)) return 'RM 0.00';
  return `RM ${n.toFixed(2)}`;
}

const MENU_ITEMS = [
  { id: 'rewards-vouchers', icon: Gift, label: 'My Rewards & Vouchers' },
  { id: 'account', icon: User, label: 'Account details' },
  { id: 'payments', icon: CreditCard, label: 'Payment methods' },
  { id: 'addresses', icon: MapPin, label: 'Saved addresses' },
  { id: 'notifications', icon: Bell, label: 'Notifications' },
  { id: 'support', icon: Headset, label: 'Help & Support' },
];

export default function ProfilePage() {
  const { user, token, refreshToken, logout } = useAuthStore();
  const { balance, points, tier, rewards, vouchers, refreshWallet } = useWalletStore();
  const { setPage } = useUIStore();

  const [showLogout, setShowLogout] = useState(false);

  useEffect(() => {
    refreshWallet();
  }, [refreshWallet]);

  const handleMenuClick = (id: string) => {
    switch (id) {
      case 'rewards-vouchers':
        setPage('my-rewards');
        break;
      case 'account':
        setPage('account-details');
        break;
      case 'payments':
        setPage('payment-methods');
        break;
      case 'addresses':
        setPage('saved-addresses');
        break;
      case 'notifications':
        setPage('notifications');
        break;
      case 'support':
        setPage('help-support');
        break;
    }
  };

  const handleLogout = async () => {
    try {
      if (token) {
        await api.post('/auth/logout', {}, {
          headers: {
            Authorization: `Bearer ${token}`,
            ...(refreshToken ? { 'X-Refresh-Token': refreshToken } : {}),
          },
        });
      }
    } catch {
      // Local logout still proceeds if server revocation fails.
    }
    logout();
    setShowLogout(false);
  };

  const initials = user?.name?.charAt(0)?.toUpperCase() || 'U';

  const availableVouchers = vouchers.filter((v) => v.status === 'available');
  const availableRewards = rewards.filter((r) => r.status === 'available');
  const totalActive = availableVouchers.length + availableRewards.length;

  return (
    <div style={{ padding: '16px 18px 24px', display: 'flex', flexDirection: 'column', gap: 0, background: LOKA.bg }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 999,
            background: LOKA.primary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: LOKA.white,
            fontSize: 28,
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          {initials}
        </div>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ fontSize: 18, fontWeight: 800, color: LOKA.textPrimary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {user?.name || 'Guest'}
          </h3>
          <p style={{ fontSize: 13, color: LOKA.textMuted, display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <Mail size={12} />
            {user?.email || 'No email'}
          </p>
        </div>
      </div>

      <div
        style={{
          background: `linear-gradient(135deg, ${LOKA.primaryDark} 0%, ${LOKA.primary} 100%)`,
          borderRadius: 24,
          padding: 20,
          color: LOKA.white,
          marginBottom: 24,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <Star size={16} color={LOKA.copperLight} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>Loka Points: {points.toLocaleString()}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Crown size={16} style={{ opacity: 0.9 }} />
          <span style={{ fontSize: 14, fontWeight: 600 }}>{tier} Member</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => setPage('wallet')}
          style={{
            flex: 1,
            background: '#E8EDE0',
            borderRadius: 18,
            padding: '14px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <Wallet size={16} color={LOKA.primary} />
          <span style={{ fontSize: 13, fontWeight: 700, color: LOKA.primary }}>{formatPrice(balance)}</span>
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => setPage('rewards')}
          style={{
            flex: 1,
            background: '#E8EDE0',
            borderRadius: 18,
            padding: '14px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <Gift size={16} color={LOKA.primary} />
          <span style={{ fontSize: 13, fontWeight: 700, color: LOKA.primary }}>Rewards</span>
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => setPage('history')}
          style={{
            flex: 1,
            background: '#E8EDE0',
            borderRadius: 18,
            padding: '14px 12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            border: 'none',
            cursor: 'pointer',
          }}
        >
          <History size={16} color={LOKA.primary} />
          <span style={{ fontSize: 13, fontWeight: 700, color: LOKA.primary }}>History</span>
        </motion.button>
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ fontSize: 16, fontWeight: 800, color: LOKA.textPrimary }}>My Rewards & Vouchers</h3>
          <span style={{ fontSize: 12, color: LOKA.textMuted }}>
            {totalActive} active
          </span>
        </div>
        {totalActive === 0 ? (
          <div
            style={{
              background: LOKA.white,
              borderRadius: 20,
              padding: 24,
              textAlign: 'center',
              border: `1px solid ${LOKA.borderSubtle}`,
            }}
          >
            <Ticket size={32} color={LOKA.border} style={{ margin: '0 auto 8px' }} />
            <p style={{ fontSize: 14, color: LOKA.textMuted }}>No vouchers yet</p>
            <p style={{ fontSize: 12, color: LOKA.textSecondary, marginTop: 4 }}>Redeem rewards to earn vouchers</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[...availableRewards.slice(0, 2).map((r) => ({
              id: `r-${r.id}`,
              code: r.redemption_code,
              label: r.reward_name,
              type: 'reward' as const,
              expiresAt: r.expires_at,
            })), ...availableVouchers.slice(0, 3).map((v) => ({
              id: `v-${v.id}`,
              code: v.code,
              label: v.discount_type === 'percentage' ? `${v.discount_value}% off` : `RM ${Number(v.discount_value).toFixed(2)} off`,
              type: 'voucher' as const,
              expiresAt: v.expires_at,
            }))]
              .slice(0, 3)
              .map((item) => (
                <div
                  key={item.id}
                  style={{
                    background: LOKA.white,
                    borderRadius: 20,
                    padding: 14,
                    border: `1px solid ${LOKA.borderSubtle}`,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 14,
                      background: item.type === 'reward' ? LOKA.copperSoft : '#E8F5E9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {item.type === 'reward' ? (
                      <Gift size={20} color={LOKA.copper} />
                    ) : (
                      <Ticket size={20} color="#388E3C" />
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: LOKA.textPrimary, fontFamily: 'ui-monospace, monospace' }}>
                      {item.code}
                    </p>
                    <p style={{ fontSize: 12, color: LOKA.textSecondary }}>{item.label}</p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                      <Clock size={10} color={LOKA.textMuted} />
                      <p style={{ fontSize: 11, color: LOKA.textMuted }}>
                        Expires {new Date(item.expiresAt).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                  </div>
                  <span
                    style={{
                      background: item.type === 'reward' ? LOKA.copperSoft : '#E8F5E9',
                      color: item.type === 'reward' ? LOKA.copper : '#388E3C',
                      padding: '2px 8px',
                      borderRadius: 999,
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                  >
                    Active
                  </span>
                </div>
              ))}
            {totalActive > 3 && (
              <button
                onClick={() => setPage('my-rewards')}
                style={{
                  width: '100%',
                  textAlign: 'center',
                  fontSize: 13,
                  color: LOKA.primary,
                  fontWeight: 700,
                  padding: '8px 0',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                View all vouchers
              </button>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {MENU_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => handleMenuClick(item.id)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                padding: '14px 0',
                borderBottom: `1px solid ${LOKA.borderSubtle}`,
                background: 'transparent',
                borderLeft: 'none',
                borderRight: 'none',
                borderTop: 'none',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 999,
                  background: '#E8EDE0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginRight: 14,
                  flexShrink: 0,
                }}
              >
                <Icon size={20} color={LOKA.primary} />
              </div>
              <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: LOKA.textPrimary }}>{item.label}</span>
              <ChevronRight size={16} color={LOKA.textMuted} />
            </button>
          );
        })}
      </div>

      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={() => setShowLogout(true)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '14px 0',
          marginTop: 24,
          color: '#C75050',
          fontWeight: 700,
          fontSize: 14,
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
        }}
      >
        <LogOut size={18} />
        Sign Out
      </motion.button>

      <Modal
        isOpen={showLogout}
        onClose={() => setShowLogout(false)}
        title="Sign Out"
        variant="center"
      >
        <p style={{ fontSize: 14, color: LOKA.textMuted, marginBottom: 20 }}>
          Are you sure you want to sign out?
        </p>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            onClick={() => setShowLogout(false)}
            style={{
              flex: 1,
              padding: '12px 0',
              borderRadius: 999,
              border: `2px solid ${LOKA.border}`,
              color: LOKA.textPrimary,
              fontWeight: 700,
              fontSize: 14,
              background: 'transparent',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
                  onClick={() => { void handleLogout(); }}
            style={{
              flex: 1,
              padding: '12px 0',
              borderRadius: 999,
              background: '#C75050',
              color: LOKA.white,
              fontWeight: 700,
              fontSize: 14,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Sign Out
          </button>
        </div>
      </Modal>
    </div>
  );
}
