'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Bell, CheckCheck, Package, Gift, Wallet, Star, Info } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { PageHeader } from '@/components/shared';
import api from '@/lib/api';

const LOKA = {
  primary: '#384B16',
  copper: '#D18E38',
  copperSoft: 'rgba(209,142,56,0.12)',
  textPrimary: '#1B2023',
  textSecondary: '#3A4A5A',
  textMuted: '#6A7A8A',
  border: '#D4DCE5',
  borderSubtle: '#E4EAEF',
  surface: '#F5F7FA',
  bg: '#E4EAEF',
  white: '#FFFFFF',
} as const;

interface Notification {
  id: number;
  title: string;
  body?: string;
  type?: string;
  is_read: boolean;
  created_at?: string;
}

const TYPE_ICON: Record<string, typeof Bell> = {
  order: Package,
  reward: Gift,
  wallet: Wallet,
  loyalty: Star,
  promo: Gift,
  info: Info,
};

const TYPE_COLOR: Record<string, string> = {
  order: '#E8EDE0',
  reward: LOKA.copperSoft,
  wallet: '#E8EDE0',
  loyalty: '#FFF8E1',
  promo: LOKA.copperSoft,
  info: LOKA.surface,
};

const TYPE_ICON_COLOR: Record<string, string> = {
  order: LOKA.primary,
  reward: LOKA.copper,
  wallet: LOKA.primary,
  loyalty: '#F5A623',
  promo: LOKA.copper,
  info: LOKA.textMuted,
};

function timeAgo(dateStr?: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });
}

export default function NotificationsPage() {
  const { setPage, showToast } = useUIStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = () => {
    api.get('/notifications')
      .then((res) => setNotifications(Array.isArray(res.data) ? res.data : []))
      .catch(() => setNotifications([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchNotifications(); }, []);

  const handleMarkAllRead = async () => {
    try {
      await api.put('/notifications/read-all');
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      showToast('All marked as read', 'success');
    } catch {
      showToast('Failed to update', 'error');
    }
  };

  const handleMarkRead = async (id: number) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
    } catch {}
  };

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%', background: LOKA.bg }}>
      <PageHeader title="Notifications" onBack={() => setPage('profile')} />

      <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, color: LOKA.textMuted }}>
          {unreadCount > 0 ? `${unreadCount} unread` : 'All caught up'}
        </span>
        {unreadCount > 0 && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleMarkAllRead}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: 'transparent',
              border: 'none',
              color: LOKA.primary,
              fontWeight: 600,
              fontSize: 13,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <CheckCheck size={14} /> Mark all read
          </motion.button>
        )}
      </div>

      <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ background: LOKA.white, borderRadius: 18, padding: 16, border: `1px solid ${LOKA.borderSubtle}`, height: 76 }} />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div
            style={{
              background: LOKA.white,
              borderRadius: 20,
              padding: 32,
              textAlign: 'center',
              border: `1px solid ${LOKA.borderSubtle}`,
            }}
          >
            <Bell size={36} color={LOKA.border} style={{ margin: '0 auto 10px' }} />
            <p style={{ fontSize: 14, fontWeight: 600, color: LOKA.textMuted }}>No notifications</p>
            <p style={{ fontSize: 12, color: LOKA.textSecondary, marginTop: 4 }}>We'll notify you about orders, rewards and promotions</p>
          </div>
        ) : (
          notifications.map((n) => {
            const Icon = TYPE_ICON[n.type || ''] || Bell;
            const bgColor = TYPE_COLOR[n.type || ''] || LOKA.surface;
            const iconColor = TYPE_ICON_COLOR[n.type || ''] || LOKA.textMuted;
            return (
              <motion.div
                key={n.id}
                whileTap={{ scale: 0.98 }}
                onClick={() => !n.is_read && handleMarkRead(n.id)}
                style={{
                  background: n.is_read ? LOKA.white : '#F0F6EC',
                  borderRadius: 18,
                  padding: 14,
                  border: `1px solid ${n.is_read ? LOKA.borderSubtle : 'rgba(56,75,22,0.15)'}`,
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 12,
                  cursor: n.is_read ? 'default' : 'pointer',
                }}
              >
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 14,
                    background: bgColor,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Icon size={18} color={iconColor} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: LOKA.textPrimary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {n.title}
                    </p>
                    {!n.is_read && (
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: LOKA.primary, flexShrink: 0 }} />
                    )}
                  </div>
                  {n.body && (
                    <p style={{ fontSize: 12, color: LOKA.textSecondary, marginTop: 3, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {n.body}
                    </p>
                  )}
                  <p style={{ fontSize: 11, color: LOKA.textMuted, marginTop: 4 }}>
                    {timeAgo(n.created_at)}
                  </p>
                </div>
              </motion.div>
            );
          })
        )}
      </div>
    </div>
  );
}
