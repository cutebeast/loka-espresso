'use client';

import { useState, FormEvent } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import type { MerchantCategory } from '@/lib/merchant-types';

export function AddItemForm({ storeId: _storeId, categories, token: _token, onClose }: { storeId: number; categories: MerchantCategory[]; token: string; onClose: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id || 0);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch(`/admin/items`, undefined, {
        method: 'POST',
        body: JSON.stringify({
          name, description, base_price: parseFloat(price),
          category_id: categoryId, is_available: true, display_order: 0,
        }),
      });
      onClose();
    } catch {} finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Name</label>
        <input value={name} onChange={e => setName(e.target.value)} required />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Description</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{ outline: 'none', border: '1px solid #DDE3E9', borderRadius: 12, padding: '8px 14px', fontSize: 14, width: '100%' }} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Price (RM)</label>
        <input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} required />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Category</label>
        <select value={categoryId} onChange={e => setCategoryId(Number(e.target.value))}>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={saving}>
        {saving ? 'Saving...' : 'Create Item'}
      </button>
    </form>
  );
}
