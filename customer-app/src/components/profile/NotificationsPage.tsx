'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bell, Package, Gift, Wallet, Star, Info, Calendar, X, BookOpen } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import api from '@/lib/api';

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
  event: Calendar,
};

const TYPE_CLASS: Record<string, string> = {
  order: 'notif-icon-order',
  reward: 'notif-icon-reward',
  wallet: 'notif-icon-wallet',
  loyalty: 'notif-icon-loyalty',
  promo: 'notif-icon-reward',
  info: 'notif-icon-info',
  event: 'notif-icon-event',
};

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'order', label: 'Orders' },
  { id: 'reward', label: 'Rewards' },
  { id: 'wallet', label: 'Wallet' },
  { id: 'loyalty', label: 'Loyalty' },
  { id: 'promo', label: 'Promos' },
  { id: 'info', label: 'Info' },
];

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

function getDateGroup(dateStr?: string): string {
  if (!dateStr) return 'Earlier';
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return 'Earlier';
}

export default function NotificationsPage() {
  const { setPage } = useUIStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  const [retentionDays, setRetentionDays] = useState(30);

  useEffect(() => {
    api.get('/config').then((res) => {
      const v = parseInt(res.data?.notification_retention_days, 10);
      if (!isNaN(v) && v > 0) setRetentionDays(v);
    }).catch(() => {});
  }, []);

  const fetchNotifications = useCallback(() => {
    api.get('/notifications')
      .then((res) => setNotifications(Array.isArray(res.data) ? res.data : []))
      .catch(() => setNotifications([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const handleMarkRead = async (id: number) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
    } catch {}
  };

  const handleMarkAllRead = async () => {
    const unread = notifications.filter((n) => !n.is_read);
    if (unread.length === 0) return;
    try {
      await Promise.all(unread.map((n) => api.put(`/notifications/${n.id}/read`)));
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch {}
  };

  /* Filter */
  const filtered = activeFilter === 'all'
    ? notifications
    : notifications.filter((n) => n.type === activeFilter);

  /* Group by date */
  const groups: Record<string, Notification[]> = {};
  filtered.forEach((n) => {
    const group = getDateGroup(n.created_at);
    if (!groups[group]) groups[group] = [];
    groups[group].push(n);
  });

  const groupOrder = ['Today', 'Yesterday', 'Earlier'];
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="notif-screen">
      {/* Header */}
      <div className="notif-header">
        <h1 className="notif-title">Notifications</h1>
        <button className="notif-close-btn" onClick={() => setPage('profile')} aria-label="Close">
          <X size={18} />
        </button>
      </div>

      {/* Mark all as read */}
      {unreadCount > 0 && (
        <button className="notif-mark-read" onClick={handleMarkAllRead}>
          ✓ Mark all as read
        </button>
      )}

      {/* Filter chips */}
      <div className="notif-filters">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={`notif-filter-chip ${activeFilter === f.id ? 'active' : ''}`}
            onClick={() => setActiveFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="notif-content">
          <div className="np-skeleton-list">
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton np-skeleton-item" />
            ))}
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="notif-content">
          <div className="notif-empty">
            <Bell size={48} strokeWidth={1.2} className="notif-empty-icon" />
            <div className="notif-empty-title">No notifications</div>
            <p className="notif-empty-desc">
              We&apos;ll let you know about orders, rewards, and special events.
            </p>
          </div>
        </div>
      ) : (
        <div className="notif-list">
          {groupOrder.map((group) => {
            const items = groups[group];
            if (!items || items.length === 0) return null;
            return (
              <div key={group}>
                <div className="notif-date-group">{group}</div>
                {items.map((n) => {
                  const Icon = TYPE_ICON[n.type || ''] || Bell;
                  const iconClass = TYPE_CLASS[n.type || ''] || 'notif-icon-info';
                  return (
                    <div
                      key={n.id}
                      className={`notif-card ${n.is_read ? 'read' : 'unread'}`}
                      onClick={() => !n.is_read && handleMarkRead(n.id)}
                    >
                      <div className={`notif-icon ${iconClass}`}>
                        <Icon size={20} />
                      </div>
                      <div className="notif-body">
                        <div className="notif-title-row">
                          <span className="notif-heading">{n.title}</span>
                          {!n.is_read && <span className="notif-unread-dot" />}
                        </div>
                        {n.body && <div className="notif-desc">{n.body}</div>}
                        <div className="notif-time">{timeAgo(n.created_at)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
          {filtered.length > 0 && (
            <div className="notif-retention-note">
              Notifications are automatically cleared after {retentionDays} days.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
