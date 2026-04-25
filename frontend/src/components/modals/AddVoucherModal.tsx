'use client';

import { useState, FormEvent } from 'react';
import { apiFetch } from '@/lib/merchant-api';

export function AddVoucherForm({ token: _token, onClose }: { token: string; onClose: () => void }) {
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [discountType, setDiscountType] = useState('fixed');
  const [discountValue, setDiscountValue] = useState('');
  const [minSpend, setMinSpend] = useState('0');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/admin/vouchers', undefined, {
        method: 'POST',
        body: JSON.stringify({
          code: code.toUpperCase(), description,
          discount_type: discountType,
          discount_value: parseFloat(discountValue),
          min_order: parseFloat(minSpend),
          is_active: true,
        }),
      });
      onClose();
    } catch {} finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="avf-0">
        <label className="avf-1">Code</label>
        <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} required placeholder="e.g. SUMMER20" />
      </div>
      <div className="avf-2">
        <label className="avf-3">Description</label>
        <input value={description} onChange={e => setDescription(e.target.value)} />
      </div>
      <div className="avf-4">
        <div>
          <label className="avf-5">Type</label>
          <select value={discountType} onChange={e => setDiscountType(e.target.value)}>
            <option value="fixed">Fixed (RM)</option>
            <option value="percent">Percent (%)</option>
          </select>
        </div>
        <div>
          <label className="avf-6">Value</label>
          <input type="number" step="0.01" value={discountValue} onChange={e => setDiscountValue(e.target.value)} required />
        </div>
      </div>
      <div className="avf-7">
        <label className="avf-8">Min Spend (RM)</label>
        <input type="number" step="0.01" value={minSpend} onChange={e => setMinSpend(e.target.value)} />
      </div>
      <button type="submit" className="btn btn-primary avf-9"  disabled={saving}>
        {saving ? 'Creating...' : 'Create Voucher'}
      </button>
    </form>
  );
}
