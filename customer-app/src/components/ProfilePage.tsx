'use client';

import { useApp } from '../lib/app-context';

export default function ProfilePage() {
  const {
    userName, userEmail, userPhone, loyaltyTier, loyaltyPoints,
    walletBalance, setPage, setModalTitle, setModalContent, setShowModal,
    setToken, setShowLogin,
  } = useApp();

  return (
    <div className="page-enter">
      <div style={{ display: 'flex', gap: 16, margin: '16px 0' }}>
        <div style={{ width: 64, height: 64, background: '#002F6C', borderRadius: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 28, fontWeight: 700, flexShrink: 0 }}>
          {userName ? userName[0].toUpperCase() : '?'}
        </div>
        <div><h3>{userName || 'Guest'}</h3><p style={{ color: '#64748B' }}>{userEmail || userPhone}</p></div>
      </div>

      <div style={{ background: 'linear-gradient(135deg, #002F6C, #1E4A7A)', borderRadius: 20, padding: 20, marginBottom: 16, color: 'white' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <span style={{ fontSize: 14, opacity: 0.8 }}>⭐ {loyaltyTier}</span>
          <span style={{ fontSize: 24, fontWeight: 700 }}>{loyaltyPoints} pts</span>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 10, height: 6 }}>
          <div style={{ background: 'white', width: `${Math.min((loyaltyPoints / 400) * 100, 100)}%`, height: 6, borderRadius: 10 }}></div>
        </div>
        <p style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>{Math.max(0, 400 - loyaltyPoints)} pts to next tier</p>
      </div>

      <div style={{ background: 'white', borderRadius: 20, padding: 20, marginBottom: 16, border: '1px solid #ECF1F7' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <p style={{ fontSize: 13, color: '#64748B' }}>Wallet Balance</p>
            <p style={{ fontSize: 28, fontWeight: 700, color: '#002F6C' }}>RM {walletBalance.toFixed(2)}</p>
          </div>
          <i className="fas fa-wallet" style={{ fontSize: 32, color: '#002F6C', opacity: 0.3 }}></i>
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: 24, padding: '8px 0' }}>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid #F0F3F8', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onClick={() => setPage('history')}>
          <span><i className="fas fa-clock-rotate-left" style={{ marginRight: 14, color: '#002F6C' }}></i> Transaction History</span>
          <i className="fas fa-chevron-right" style={{ color: '#94A3B8', fontSize: 12 }}></i>
        </div>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid #F0F3F8', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onClick={() => {
          setModalTitle('Delivery Addresses');
          setModalContent(<p style={{ color: '#64748B' }}>Manage your delivery addresses here.</p>);
          setShowModal(true);
        }}>
          <span><i className="fas fa-map-marker-alt" style={{ marginRight: 14, color: '#002F6C' }}></i> Addresses</span>
          <i className="fas fa-chevron-right" style={{ color: '#94A3B8', fontSize: 12 }}></i>
        </div>
        <div style={{ padding: '18px 20px', borderBottom: '1px solid #F0F3F8', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} onClick={() => {
          setModalTitle('Payment Methods');
          setModalContent(<p style={{ color: '#64748B' }}>Manage your payment methods here.</p>);
          setShowModal(true);
        }}>
          <span><i className="fas fa-credit-card" style={{ marginRight: 14, color: '#002F6C' }}></i> Payment methods</span>
          <i className="fas fa-chevron-right" style={{ color: '#94A3B8', fontSize: 12 }}></i>
        </div>
        <div style={{ padding: '18px 20px', cursor: 'pointer' }}>
          <span><i className="fas fa-bell" style={{ marginRight: 14, color: '#002F6C' }}></i> Push notifications</span>
          <span style={{ float: 'right', color: '#10B981', fontWeight: 600 }}>ON</span>
        </div>
      </div>
      <button style={{ marginTop: 20, width: '100%', padding: 16, borderRadius: 40, border: '1px solid #DDE3E9', background: 'white', fontWeight: 600, cursor: 'pointer', fontSize: 16 }} onClick={() => { setToken(''); localStorage.removeItem('fnb_customer_token'); setShowLogin(true); }}>Sign out</button>
    </div>
  );
}
