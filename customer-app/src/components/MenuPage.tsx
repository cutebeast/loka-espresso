'use client';

import { useApp } from '../lib/app-context';

export default function MenuPage() {
  const { categories, selectedCategory, setSelectedCategory, filteredItems, addToCart, openCustomize } = useApp();

  return (
    <div className="page-enter">
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '4px 0 12px', whiteSpace: 'nowrap' as const }}>
        <span className={`chip ${selectedCategory === null ? 'active' : ''}`} onClick={() => setSelectedCategory(null)}>All</span>
        {categories.map(c => (
          <span key={c.id} className={`chip ${selectedCategory === c.id ? 'active' : ''}`} onClick={() => setSelectedCategory(c.id)}>{c.name}</span>
        ))}
      </div>
      {filteredItems.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#94A3B8' }}>No items found. Select a store first.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {filteredItems.filter(i => i.is_available).map(item => (
            <div key={item.id} className="product-card" onClick={() => openCustomize(item)}>
              <div className="img-placeholder"><i className="fas fa-mug-hot" style={{ fontSize: 32, color: '#384B16' }}></i></div>
              <h4 style={{ fontSize: 15, fontWeight: 700 }}>{item.name}</h4>
              <div style={{ fontSize: 13, color: '#65768A', marginBottom: 8 }}>{item.description}</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontWeight: 700, color: '#384B16' }}>RM {item.base_price.toFixed(2)}</span>
                <button className="add-btn" onClick={e => { e.stopPropagation(); addToCart(item); }}><i className="fas fa-plus"></i></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
