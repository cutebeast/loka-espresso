'use client';

import { useState, useEffect } from 'react';
import { Bell, Package, Gift, Wallet, Star, Info, Calendar, X } from 'lucide-react';
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
  wallet: 'notif-icon-order',
  loyalty: 'notif-icon-reward',
  promo: 'notif-icon-reward',
  info: 'notif-icon-info',
  event: 'notif-icon-event',
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
  const { setPage } = useUIStore();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifications = () => {
    api.get('/notifications')
      .then((res) => setNotifications(Array.isArray(res.data) ? res.data : []))
      .catch(() => setNotifications([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchNotifications(); }, []);

  const handleMarkRead = async (id: number) => {
    try {
      await api.put(`/notifications/${id}/read`);
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, is_read: true } : n));
    } catch {}
  };

  return (
    <div className="notif-screen">
      {/* Header */}
      <div className="notif-header">
        <h2 className="notif-title">Notifications</h2>
        <button className="notif-close-btn" onClick={() => setPage('profile')} aria-label="Close">
          <X size={24} />
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="notif-content">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 360 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ height: 80, borderRadius: 20 }} />
            ))}
          </div>
        </div>
      ) : notifications.length === 0 ? (
        <div className="notif-content">
          <div className="notif-empty">
            <Bell size={64} strokeWidth={1.2} style={{ color: '#D4DCE5', margin: '0 auto 20px' }} />
            <div className="notif-empty-title">No new notifications</div>
            <p className="notif-empty-desc">
              We&apos;ll let you know about orders, rewards, and special events.
            </p>
          </div>
        </div>
      ) : (
        <div className="notif-list">
          {notifications.map((n) => {
            const Icon = TYPE_ICON[n.type || ''] || Bell;
            const iconClass = TYPE_CLASS[n.type || ''] || 'notif-icon-info';
            return (
              <div
                key={n.id}
                className="notif-card"
                onClick={() => !n.is_read && handleMarkRead(n.id)}
              >
                <div className={`notif-icon ${iconClass}`}>
                  <Icon size={20} />
                </div>
                <div className="notif-body">
                  <div className="notif-heading">{n.title}</div>
                  {n.body && <div className="notif-desc">{n.body}</div>}
                  <div className="notif-time">{timeAgo(n.created_at)}</div>
                </div>
                {!n.is_read && <div className="notif-unread-dot" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
