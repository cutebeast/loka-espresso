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
    } catch {} finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Table Number</label>
        <input value={number} onChange={e => setNumber(e.target.value)} required placeholder="e.g. 11" />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Capacity</label>
        <input type="number" value={capacity} onChange={e => setCapacity(e.target.value)} required />
      </div>
      <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={saving}>
        {saving ? 'Saving...' : 'Add Table'}
      </button>
    </form>
  );
}
