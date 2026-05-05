'use client';

import { useState, useEffect, useCallback } from 'react';
import { Bell, Package, Gift, Wallet, Star, Info, Calendar, X } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { useTranslation } from '@/hooks/useTranslation';
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
  { id: 'all' },
  { id: 'order' },
  { id: 'reward' },
  { id: 'wallet' },
  { id: 'loyalty' },
  { id: 'promo' },
  { id: 'info' },
];

function timeAgo(dateStr: string | undefined, t: (key: string, options?: Record<string, string | number>) => string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return t('notifications.timeAgo.justNow');
  if (mins < 60) return t('notifications.timeAgo.minutes', { minutes: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return t('notifications.timeAgo.hours', { hours: hrs });
  const days = Math.floor(hrs / 24);
  if (days < 7) return t('notifications.timeAgo.days', { days });
  return new Date(dateStr).toLocaleDateString('en-MY', { day: 'numeric', month: 'short' });
}

function getDateGroup(dateStr?: string): string {
  if (!dateStr) return 'earlier';
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'today';
  if (date.toDateString() === yesterday.toDateString()) return 'yesterday';
  return 'earlier';
}

export default function NotificationsPage() {
  const { setPage, showToast } = useUIStore();
  const { t } = useTranslation();
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
    } catch { console.error('[Notifications] Failed to mark read'); }
  };

  const [markingAll, setMarkingAll] = useState(false);
  const handleMarkAllRead = async () => {
    const unread = notifications.filter((n) => !n.is_read);
    if (unread.length === 0) return;
    setMarkingAll(true);
    try {
      // Sequential to avoid flooding the API; if one fails, stop and show error
      for (const n of unread) {
        await api.put(`/notifications/${n.id}/read`);
      }
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch { showToast(t('toast.notificationReadFailed'), 'error'); }
    finally { setMarkingAll(false); }
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

  const groupOrder = ['today', 'yesterday', 'earlier'];
  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="notif-screen">
      {/* Header */}
      <div className="notif-header">
        <h1 className="notif-title">{t('notifications.title')}</h1>
        <button className="notif-close-btn" onClick={() => setPage('profile')} aria-label={t('common.close')}>
          <X size={18} />
        </button>
      </div>

      {/* Mark all as read */}
      {unreadCount > 0 && (
        <button className="notif-mark-read" onClick={handleMarkAllRead} disabled={markingAll}>
          {markingAll ? t('notifications.markingAll') : t('notifications.markAllAsRead')}
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
            {t(`notifications.filters.${f.id}`)}
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
            <div className="notif-empty-title">{t('notifications.noNotifications')}</div>
            <p className="notif-empty-desc">
              {t('notifications.noNotificationsDesc')}
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
                <div className="notif-date-group">{t(`notifications.dateGroup.${group}`)}</div>
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
                        <div className="notif-time">{timeAgo(n.created_at, t)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
          {filtered.length > 0 && (
            <div className="notif-retention-note">
              {t('notifications.retentionNote', { days: retentionDays })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
