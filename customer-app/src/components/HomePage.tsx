'use client';

import { useApp } from '../lib/app-context';

export default function HomePage() {
  const { menuItems, loyaltyTier, loyaltyPoints, setPage, addToCart, openCustomize } = useApp();

  return (
    <div className="page-enter">
      <div className="promo-card">
        <div style={{ background: 'rgba(255,255,255,0.18)', padding: '6px 14px', borderRadius: 30, fontSize: 13, fontWeight: 600, display: 'inline-block', marginBottom: 14 }}>⚡ LIMITED OFFER</div>
        <h4 style={{ fontSize: 20, fontWeight: 700 }}>RM 2.99 First Coffee</h4>
        <p style={{ fontSize: 14, opacity: 0.9, marginTop: 4 }}>New users get any handcrafted drink for RM2.99</p>
        <button className="btn-outline-light" style={{ marginTop: 14 }} onClick={() => setPage('menu')}>Order now →</button>
      </div>

      <div style={{ background: 'white', borderRadius: 24, padding: 18, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
          <span>⭐ {loyaltyTier}</span>
          <span>{loyaltyPoints} pts</span>
        </div>
        <div style={{ background: '#E2E8F0', height: 10, borderRadius: 20, margin: '14px 0' }}>
          <div style={{ background: '#002F6C', width: `${Math.min((loyaltyPoints / 400) * 100, 100)}%`, height: 10, borderRadius: 20 }}></div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '20px 0 12px' }}>
        <h3 style={{ fontSize: 20, fontWeight: 700 }}>Popular</h3>
        <span style={{ color: '#002F6C', fontWeight: 600, fontSize: 14, cursor: 'pointer' }} onClick={() => setPage('menu')}>See all →</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {menuItems.filter(i => i.is_available).slice(0, 4).map(item => (
          <div key={item.id} className="product-card" onClick={() => openCustomize(item)}>
            <div className="img-placeholder"><i className="fas fa-mug-hot" style={{ fontSize: 32, color: '#002F6C' }}></i></div>
            <h4 style={{ fontSize: 15, fontWeight: 700 }}>{item.name}</h4>
            <div style={{ fontSize: 13, color: '#65768A', marginBottom: 8 }}>{item.description}</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 700, color: '#002F6C' }}>RM {item.base_price.toFixed(2)}</span>
              <button className="add-btn" onClick={e => { e.stopPropagation(); addToCart(item); }}><i className="fas fa-plus"></i></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
