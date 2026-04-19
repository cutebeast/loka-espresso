'use client';

import { useState, useEffect } from 'react';
import { useApp } from '../lib/app-context';
import { PageId } from '../lib/api';
import HomePage from './HomePage';
import MenuPage from './MenuPage';
import RewardsPage from './RewardsPage';
import CartPage from './CartPage';
import OrdersPage from './OrdersPage';
import ProfilePage from './ProfilePage';
import HistoryPage from './HistoryPage';
import LoginModal from './LoginModal';
import StoreLocator from './StoreLocator';

export default function AppShell() {
  const {
    selectedStore, orderMode, setOrderMode, userName,
    page, setPage, getGreeting, showModal, setShowModal,
    modalContent, modalTitle, cart, setModalTitle, setModalContent,
  } = useApp();

  const [showSplash, setShowSplash] = useState(true);
  const [showStoreLocator, setShowStoreLocator] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 2000);
    return () => clearTimeout(t);
  }, []);

  if (showSplash) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div className="app-frame">
          <div className="splash-screen">
            <div style={{ fontSize: 40, fontWeight: 800, color: 'white', letterSpacing: 2, marginBottom: 24 }}>Loka</div>
            <div className="spinner"></div>
            <p style={{ color: 'rgba(255,255,255,0.8)', marginTop: 20 }}>Artisan Coffee · Community · Culture</p>
          </div>
        </div>
      </div>
    );
  }

  const navItems: Array<{ id: PageId; icon: string; label: string }> = [
    { id: 'home', icon: 'fa-home', label: 'Home' },
    { id: 'menu', icon: 'fa-mug-saucer', label: 'Menu' },
    { id: 'rewards', icon: 'fa-crown', label: 'Rewards' },
    { id: 'cart', icon: 'fa-shopping-bag', label: 'Cart' },
    { id: 'orders', icon: 'fa-receipt', label: 'Orders' },
    { id: 'profile', icon: 'fa-user', label: 'Profile' },
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div className="app-frame">
        <div className="app-header">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#F0F4F0', padding: '8px 14px', borderRadius: 40, cursor: 'pointer' }} onClick={() => setShowStoreLocator(true)}>
              <i className="fas fa-map-pin" style={{ color: '#384B16', fontSize: 14 }}></i>
              <span style={{ fontWeight: 600, fontSize: 15, color: '#384B16' }}>{selectedStore?.name || 'Select store'}</span>
              <i className="fas fa-chevron-down" style={{ fontSize: 12 }}></i>
            </div>
            <div style={{ display: 'flex', gap: 20 }}>
              <i className="far fa-bell" style={{ fontSize: 22, color: '#384B16', cursor: 'pointer' }}></i>
              <i className="fas fa-qrcode" style={{ fontSize: 22, color: '#384B16', cursor: 'pointer' }} onClick={() => {
                setModalTitle('Scan QR at table');
                setModalContent(<div style={{ textAlign: 'center' }}><div style={{ background: '#eee', height: 200, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '20px 0' }}><i className="fas fa-camera" style={{ fontSize: 48 }}></i></div><p>Point camera at table QR code for dine-in</p></div>);
                setShowModal(true);
              }}></i>
            </div>
          </div>
          <div style={{ marginTop: 14 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1B2023' }}>{getGreeting()}, {userName ? userName.split(' ')[0] : 'there'} 👋</h2>
            <p style={{ color: '#5E6873', fontSize: 15, marginTop: 4 }}>What&apos;s your coffee mood today?</p>
          </div>
          <div style={{ display: 'flex', marginTop: 14, background: '#F2F5F9', padding: 4, borderRadius: 50 }}>
            <div className={`toggle-option ${orderMode === 'pickup' ? 'active' : ''}`} onClick={() => setOrderMode('pickup')}>Pickup</div>
            <div className={`toggle-option ${orderMode === 'delivery' ? 'active' : ''}`} onClick={() => setOrderMode('delivery')}>Delivery</div>
          </div>
        </div>

        <div className="app-content">
          {page === 'home' && <HomePage />}
          {page === 'menu' && <MenuPage />}
          {page === 'rewards' && <RewardsPage />}
          {page === 'cart' && <CartPage />}
          {page === 'orders' && <OrdersPage />}
          {page === 'profile' && <ProfilePage />}
          {page === 'history' && <HistoryPage />}
        </div>

        <div className="bottom-nav">
          {navItems.map(n => (
            <div key={n.id} className={`nav-item ${page === n.id ? 'active' : ''}`} onClick={() => setPage(n.id)}>
              <i className={`fas ${n.icon}`}></i>
              <span>{n.label}</span>
              {n.id === 'cart' && cart.length > 0 && (
                <span style={{ position: 'absolute', top: -4, right: -4, background: '#EF4444', color: 'white', fontSize: 10, width: 16, height: 16, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{cart.reduce((s, c) => s + c.quantity, 0)}</span>
              )}
            </div>
          ))}
        </div>

        <LoginModal />
        <StoreLocator visible={showStoreLocator} onClose={() => setShowStoreLocator(false)} />

        {showModal && (
          <div className="modal-overlay" onClick={() => setShowModal(false)}>
            <div className="modal-sheet" onClick={e => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3>{modalTitle}</h3>
                <button style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer' }} onClick={() => setShowModal(false)}>✕</button>
              </div>
              {modalContent}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
