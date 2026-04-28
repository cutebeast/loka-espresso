'use client';

import { useState, FormEvent } from 'react';
import { apiFetch } from '@/lib/merchant-api';

export function AddTableForm({ storeId, token: _token, onClose }: { storeId: number; token: string; onClose: () => void }) {
  const [number, setNumber] = useState('');
  const [capacity, setCapacity] = useState('4');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch(`/admin/stores/${storeId}/tables`, undefined, {
        method: 'POST',
        body: JSON.stringify({ table_number: number, capacity: parseInt(capacity) }),
      });
      onClose();
    } catch { console.error('Modal save operation failed'); } finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="atf-0">
        <label className="atf-1">Table Number</label>
        <input value={number} onChange={e => setNumber(e.target.value)} required placeholder="e.g. 11" />
      </div>
      <div className="atf-2">
        <label className="atf-3">Capacity</label>
        <input type="number" value={capacity} onChange={e => setCapacity(e.target.value)} required />
      </div>
      <button type="submit" className="btn btn-primary atf-4"  disabled={saving}>
        {saving ? 'Saving...' : 'Add Table'}
      </button>
    </form>
  );
}
