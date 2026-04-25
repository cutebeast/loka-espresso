'use client';

import { useState, FormEvent } from 'react';
import { apiFetch } from '@/lib/merchant-api';

export function AddStaffForm({ storeId, token: _token, onClose }: { storeId: number; token: string; onClose: () => void }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('staff');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch(`/admin/stores/${storeId}/staff`, undefined, {
        method: 'POST',
        body: JSON.stringify({ name, role, phone, is_active: true }),
      });
      onClose();
    } catch {} finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="asf-0">
        <label className="asf-1">Name</label>
        <input value={name} onChange={e => setName(e.target.value)} required />
      </div>
      <div className="asf-2">
        <label className="asf-3">Role</label>
        <select value={role} onChange={e => setRole(e.target.value)}>
          <option value="staff">Staff</option>
          <option value="manager">Manager</option>
          <option value="cashier">Cashier</option>
          <option value="kitchen">Kitchen</option>
        </select>
      </div>
      <div className="asf-4">
        <label className="asf-5">Phone</label>
        <input value={phone} onChange={e => setPhone(e.target.value)} required placeholder="e.g. +60 12-345 6789" />
      </div>
      <button type="submit" className="btn btn-primary asf-6"  disabled={saving}>
        {saving ? 'Adding...' : 'Add Staff'}
      </button>
    </form>
  );
}
