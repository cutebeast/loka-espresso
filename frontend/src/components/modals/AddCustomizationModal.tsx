'use client';

import { useState, FormEvent } from 'react';
import { apiFetch } from '@/lib/merchant-api';

export function AddCustomizationForm({ storeId: _storeId, itemId, token: _token, onClose }: { storeId: number; itemId: number; token: string; onClose: () => void }) {
  const [name, setName] = useState('');
  const [optionType, setOptionType] = useState('');
  const [priceAdj, setPriceAdj] = useState('0');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const priceAdjustment = parseFloat(priceAdj);
      if (isNaN(priceAdjustment)) { setSaving(false); return; }
      await apiFetch(`/admin/items/${itemId}/customizations`, undefined, {
        method: 'POST',
        body: JSON.stringify({ name, option_type: optionType.trim() || 'addon', price_adjustment: priceAdjustment, is_active: true, display_order: 0 }),
      });
      onClose();
    } catch { console.error('Modal save operation failed'); } finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="acf-0">
        <label className="acf-1">Option Name</label>
        <input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Less Ice, Extra Sugar, Oat Milk" />
      </div>
      <div className="acf-2">
        <label className="acf-3">Option Type</label>
        <select value={optionType} onChange={e => setOptionType(e.target.value)} className="acf-3">
          <option value="">General</option>
          <option value="size">Size</option>
          <option value="milk">Milk</option>
          <option value="sweetness">Sweetness</option>
          <option value="addon">Add-on</option>
          <option value="temperature">Temperature</option>
        </select>
      </div>
      <div className="acf-2">
        <label className="acf-3">Price Adjustment (RM)</label>
        <input type="number" step="0.01" value={priceAdj} onChange={e => setPriceAdj(e.target.value)} />
      </div>
      <button type="submit" className="btn btn-primary acf-4"  disabled={saving}>
        {saving ? 'Saving...' : 'Add Option'}
      </button>
    </form>
  );
}
