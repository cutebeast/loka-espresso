'use client';

import { useState, useEffect } from 'react';
import {
  Crown,
  ArrowLeft,
  Gift,
  Ticket,
  CreditCard,
  MapPin,
  SlidersHorizontal,
  Headset,
  LogOut,
  ChevronRight,
  Pen,
  IdCard,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useWalletStore } from '@/stores/walletStore';
import { useUIStore } from '@/stores/uiStore';
import api from '@/lib/api';

interface OrderPreview {
  id: number;
  items: string;
  date: string;
  status: string;
}

export default function ProfilePage() {
  const { user, token, refreshToken, logout } = useAuthStore();
  const { points } = useWalletStore();
  const { setPage } = useUIStore();

  const [showLogout, setShowLogout] = useState(false);
  const [recentOrders, setRecentOrders] = useState<OrderPreview[]>([]);

  useEffect(() => {
    api.get('/orders?limit=2')
      .then((res) => {
        const data = Array.isArray(res.data) ? res.data : (res.data?.orders ?? []);
        setRecentOrders(data.slice(0, 2).map((o: { id: number; items?: { name?: string }[]; created_at?: string; status?: string }) => ({
          id: o.id,
          items: o.items?.map(i => i.name).filter(Boolean).join(', ') || 'Order #' + o.id,
          date: o.created_at ? new Date(o.created_at).toLocaleDateString('en-MY', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '',
          status: o.status || 'Completed',
        })));
      })
      .catch(() => setRecentOrders([]));
  }, []);

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
    } catch { /* ignore */ }
    logout();
    setShowLogout(false);
  };

  const initials = user?.name?.charAt(0)?.toUpperCase() || 'U';

  const menuItems = [
    { id: 'rewards', icon: Gift, label: 'My Rewards', iconClass: 'profile-icon-reward', onClick: () => setPage('my-rewards', { initialTab: 'rewards' }) },
    { id: 'vouchers', icon: Ticket, label: 'My Vouchers', iconClass: 'profile-icon-voucher', onClick: () => setPage('my-rewards', { initialTab: 'vouchers' }) },
    { id: 'payment', icon: CreditCard, label: 'Payment Methods', iconClass: 'profile-icon-payment', onClick: () => setPage('payment-methods') },
    { id: 'addresses', icon: MapPin, label: 'Saved Addresses', iconClass: 'profile-icon-address', onClick: () => setPage('saved-addresses') },
    { id: 'card', icon: IdCard, label: 'My Card', iconClass: 'profile-icon-card', onClick: () => setPage('my-card') },
  ];

  const menuItems2 = [
    { id: 'settings', icon: SlidersHorizontal, label: 'Settings', iconClass: 'profile-icon-settings', onClick: () => setPage('settings') },
    { id: 'help', icon: Headset, label: 'Help & Support', iconClass: 'profile-icon-help', onClick: () => setPage('help-support') },
  ];

  return (
    <div className="profile-screen">
      {/* Header */}
      <div className="sub-page-header">
        <div className="sub-header-left">
          <button className="sub-back-btn" onClick={() => setPage('home')} aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <h1 className="sub-page-title">Profile</h1>
        </div>
        <button className="sub-header-action" onClick={() => setPage('account-details')} aria-label="Edit profile">
          <Pen size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="profile-scroll">
        {/* User card */}
        <div className="profile-user-card">
          <div className="profile-avatar">{initials}</div>
          <div className="profile-user-info">
            <div className="profile-user-name">{user?.name || 'Guest'}</div>
            <div className="profile-user-phone">{user?.phone || 'No phone'}</div>
            <div className="profile-points-row">
              <Crown size={14} /> {points.toLocaleString()} points
            </div>
          </div>
        </div>

        {/* Recent orders */}
        <div>
          <div className="profile-section-title">Recent orders</div>
          <div className="profile-preview-card">
            {recentOrders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '12px 0', color: '#6A7A8A', fontSize: 14 }}>
                No orders yet
              </div>
            ) : (
              recentOrders.map((order) => (
                <div key={order.id} className="profile-order-item">
                  <div className="profile-order-info">
                    <div className="profile-order-name">{order.items}</div>
                    <div className="profile-order-date">{order.date}</div>
                  </div>
                  <span className="profile-order-status">{order.status}</span>
                </div>
              ))
            )}
            <button className="profile-view-all" onClick={() => setPage('orders')}>
              View all →
            </button>
          </div>
        </div>

        {/* Menu links */}
        <div className="profile-menu-card">
          {menuItems.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className="profile-menu-item" onClick={item.onClick}>
                <div className={`profile-menu-icon ${item.iconClass}`}>
                  <Icon size={18} />
                </div>
                <span className="profile-menu-label">{item.label}</span>
                <ChevronRight size={16} color="#C4CED8" />
              </button>
            );
          })}
        </div>

        <div className="profile-menu-card">
          {menuItems2.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className="profile-menu-item" onClick={item.onClick}>
                <div className={`profile-menu-icon ${item.iconClass}`}>
                  <Icon size={18} />
                </div>
                <span className="profile-menu-label">{item.label}</span>
                <ChevronRight size={16} color="#C4CED8" />
              </button>
            );
          })}
        </div>

        {/* Logout */}
        <div className="profile-menu-card">
          <button className="profile-menu-item" onClick={() => setShowLogout(true)}>
            <div className="profile-menu-icon profile-icon-logout">
              <LogOut size={18} />
            </div>
            <span className="profile-menu-label profile-menu-label-red">Log Out</span>
            <ChevronRight size={16} color="#C75050" />
          </button>
        </div>
      </div>

      {/* Logout modal */}
      <div className={`profile-modal-overlay ${showLogout ? 'show' : ''}`} onClick={(e) => { if (e.target === e.currentTarget) setShowLogout(false); }}>
        <div className="profile-modal-box">
          <h3>Log out</h3>
          <p>Are you sure you want to log out?</p>
          <div className="profile-modal-btns">
            <button className="profile-modal-btn profile-modal-btn-cancel" onClick={() => setShowLogout(false)}>Cancel</button>
            <button className="profile-modal-btn profile-modal-btn-confirm" onClick={handleLogout}>Log out</button>
          </div>
        </div>
      </div>
    </div>
  );
}
