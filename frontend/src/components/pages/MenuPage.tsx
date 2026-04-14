'use client';

import { useState } from 'react';
import { apiFetch, formatRM } from '@/lib/merchant-api';
import { AddItemForm, AddCategoryForm } from '@/components/Modals';
import type { MerchantCategory, MerchantMenuItem, MerchantStore } from '@/lib/merchant-types';

interface MenuPageProps {
  categories: MerchantCategory[];
  menuItems: MerchantMenuItem[];
  selectedCategory: number | null;
  setSelectedCategory: (id: number | null) => void;
  selectedStore: string;
  storeObj: MerchantStore | undefined;
  token: string;
  onRefresh: () => void;
  onCustomizeItem: (item: MerchantMenuItem) => void;
}

export default function MenuPage({ categories, menuItems, selectedCategory, setSelectedCategory, selectedStore, storeObj, token, onRefresh, onCustomizeItem }: MenuPageProps) {
  const [showModal, setShowModal] = useState(false);
  const [showCatModal, setShowCatModal] = useState(false);

  const filteredItems = selectedCategory ? menuItems.filter(i => i.category_id === selectedCategory) : menuItems;

  async function toggleMenuItem(item: MerchantMenuItem) {
    try {
      await apiFetch(`/admin/stores/${item.store_id}/items/${item.id}`, token, {
        method: 'PUT',
        body: JSON.stringify({ ...item, is_available: !item.is_available }),
      });
      onRefresh();
    } catch {}
  }

  if (selectedStore === 'all') {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 60, color: '#64748B' }}>
        <i className="fas fa-store" style={{ fontSize: 40, marginBottom: 16 }}></i>
        <p>Select a specific store to manage its menu</p>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3>Menu &middot; {storeObj?.name}</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn" onClick={() => setShowCatModal(true)}><i className="fas fa-folder-plus"></i> Add Category</button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)}><i className="fas fa-plus"></i> New Item</button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 24 }}>
        <div className="card">
          <h4 style={{ marginBottom: 12 }}>Categories</h4>
          <ul style={{ listStyle: 'none' }}>
            {categories.map(c => (
              <li
                key={c.id}
                onClick={() => setSelectedCategory(c.id)}
                style={{
                  padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                  background: selectedCategory === c.id ? '#EFF6FF' : 'transparent',
                  fontWeight: selectedCategory === c.id ? 600 : 400, color: selectedCategory === c.id ? '#002F6C' : '#334155',
                  marginBottom: 4,
                }}
              >
                {c.name}
              </li>
            ))}
          </ul>
        </div>
        <div className="card">
          <h4 style={{ marginBottom: 16 }}>Items ({filteredItems.length})</h4>
          <div style={{ display: 'grid', gap: 12 }}>
            {filteredItems.map(item => (
              <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #EDF2F8' }}>
                <div style={{ flex: 1 }}>
                  <strong>{item.name}</strong>
                  <span style={{ marginLeft: 12, color: '#059669', fontWeight: 600 }}>{formatRM(item.base_price)}</span>
                  {item.description && <p style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>{item.description}</p>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <button className="btn btn-sm" onClick={() => onCustomizeItem(item)} title="Manage customizations (add-ons)">
                    <i className="fas fa-sliders-h"></i> Options
                  </button>
                  <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={item.is_available}
                      onChange={() => toggleMenuItem(item)}
                      style={{ opacity: 0, width: 0, height: 0 }}
                    />
                    <span style={{
                      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                      backgroundColor: item.is_available ? '#002F6C' : '#CBD5E1',
                      borderRadius: 34, transition: '.2s',
                    }}>
                      <span style={{
                        position: 'absolute', height: 18, width: 18, left: 3, bottom: 3,
                        backgroundColor: 'white', borderRadius: '50%',
                        transform: item.is_available ? 'translateX(20px)' : 'translateX(0)',
                        transition: '.2s',
                      }}></span>
                    </span>
                  </label>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3>Add Menu Item</h3>
              <button className="btn btn-sm" onClick={() => setShowModal(false)}><i className="fas fa-times"></i></button>
            </div>
            <AddItemForm storeId={Number(selectedStore)} categories={categories} token={token} onClose={() => { setShowModal(false); onRefresh(); }} />
          </div>
        </div>
      )}

      {showCatModal && (
        <div className="modal-overlay" onClick={() => setShowCatModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3>Add Category</h3>
              <button className="btn btn-sm" onClick={() => setShowCatModal(false)}><i className="fas fa-times"></i></button>
            </div>
            <AddCategoryForm storeId={Number(selectedStore)} token={token} onClose={() => { setShowCatModal(false); onRefresh(); }} />
          </div>
        </div>
      )}
    </>
  );
}
