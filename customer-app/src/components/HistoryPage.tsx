'use client';

import { useApp } from '../lib/app-context';

export default function HistoryPage() {
  const { setPage, loyaltyHistory, walletHistory } = useApp();

  return (
    <div className="page-enter">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0' }}>
        <button onClick={() => setPage('profile')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#002F6C' }}><i className="fas fa-arrow-left"></i></button>
        <h3>Transaction History</h3>
      </div>

      <div style={{ background: 'white', borderRadius: 20, padding: 16, marginBottom: 16, border: '1px solid #ECF1F7' }}>
        <h4 style={{ marginBottom: 12, color: '#002F6C' }}>⭐ Loyalty Points</h4>
        {loyaltyHistory.length === 0 ? (
          <p style={{ color: '#94A3B8', textAlign: 'center', padding: 20 }}>No loyalty history yet</p>
        ) : loyaltyHistory.map(t => (
          <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #F0F3F8' }}>
            <div>
              <p style={{ fontWeight: 600, textTransform: 'capitalize' }}>{t.type}</p>
              <p style={{ fontSize: 12, color: '#94A3B8' }}>{new Date(t.created_at).toLocaleDateString()}</p>
            </div>
            <span style={{ fontWeight: 700, color: t.points > 0 ? '#10B981' : '#EF4444' }}>
              {t.points > 0 ? '+' : ''}{t.points} pts
            </span>
          </div>
        ))}
      </div>

      <div style={{ background: 'white', borderRadius: 20, padding: 16, marginBottom: 16, border: '1px solid #ECF1F7' }}>
        <h4 style={{ marginBottom: 12, color: '#002F6C' }}>💰 Wallet Transactions</h4>
        {walletHistory.length === 0 ? (
          <p style={{ color: '#94A3B8', textAlign: 'center', padding: 20 }}>No wallet transactions yet</p>
        ) : walletHistory.map(t => (
          <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #F0F3F8' }}>
            <div>
              <p style={{ fontWeight: 600 }}>{t.description || t.type}</p>
              <p style={{ fontSize: 12, color: '#94A3B8' }}>{new Date(t.created_at).toLocaleDateString()}</p>
            </div>
            <span style={{ fontWeight: 700, color: t.amount > 0 ? '#10B981' : '#EF4444' }}>
              {t.amount > 0 ? '+' : ''}RM {Math.abs(t.amount).toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
