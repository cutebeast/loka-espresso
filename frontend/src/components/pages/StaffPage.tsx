'use client';

import { useState, useCallback } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import type { MerchantStaffMember, MerchantStore } from '@/lib/merchant-types';

interface StaffPageProps {
  staff: MerchantStaffMember[];
  selectedStore: string;
  storeObj: MerchantStore | undefined;
  token: string;
  onRefresh: () => void;
}

const ROLES = [
  { value: 'manager', label: 'Manager' },
  { value: 'assistant_manager', label: 'Assistant Manager' },
  { value: 'barista', label: 'Barista' },
  { value: 'cashier', label: 'Cashier' },
  { value: 'delivery', label: 'Delivery' },
];

const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4, color: '#334155' };
const hintStyle: React.CSSProperties = { fontSize: 11, color: '#94A3B8', marginTop: 2 };

export default function StaffPage({ staff, selectedStore, storeObj, token, onRefresh }: StaffPageProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingStaff, setEditingStaff] = useState<MerchantStaffMember | null>(null);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [role, setRole] = useState('barista');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [pinCode, setPinCode] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setEditingStaff(null);
    setName('');
    setRole('barista');
    setPhone('');
    setEmail('');
    setPinCode('');
    setIsActive(true);
    setError('');
    setShowForm(true);
  }

  function openEdit(s: MerchantStaffMember) {
    setEditingStaff(s);
    setName(s.name);
    setRole(s.role);
    setPhone(s.phone || '');
    setEmail((s as any).email || '');
    setPinCode('');
    setIsActive(s.is_active);
    setError('');
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingStaff(null);
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    const payload: any = { name, role, phone, is_active: isActive };
    if (email) payload.email = email;
    if (pinCode) payload.pin_code = pinCode;

    try {
      const res = editingStaff
        ? await apiFetch(`/admin/staff/${editingStaff.id}`, token, { method: 'PUT', body: JSON.stringify(payload) })
        : await apiFetch(`/admin/stores/${selectedStore}/staff`, token, { method: 'POST', body: JSON.stringify(payload) });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || `Failed (${res.status})`);
        return;
      }
      closeForm();
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally { setSaving(false); }
  }

  async function toggleActive(s: MerchantStaffMember) {
    setError('');
    try {
      const res = await apiFetch(`/admin/staff/${s.id}`, token, {
        method: 'PUT',
        body: JSON.stringify({ is_active: !s.is_active }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || 'Failed to toggle');
        return;
      }
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Network error');
    }
  }

  async function handleDelete(id: number) {
    try {
      const res = await apiFetch(`/admin/staff/${id}`, token, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || 'Delete failed');
        return;
      }
      setConfirmDelete(null);
      onRefresh();
    } catch { setError('Network error'); }
  }

  if (selectedStore === 'all') {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 60, color: '#64748B' }}>
        <i className="fas fa-user-tie" style={{ fontSize: 40, marginBottom: 16 }}></i>
        <p>Select a specific store to manage staff</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ margin: 0 }}>Staff &middot; {storeObj?.name}</h3>
        <button className="btn btn-primary" onClick={openCreate}><i className="fas fa-plus"></i> New Staff</button>
      </div>

      {error && !showForm && (
        <div style={{ background: '#FEF2F2', color: '#991B1B', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          <i className="fas fa-exclamation-circle"></i> {error}
        </div>
      )}

      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h4 style={{ margin: 0 }}>{editingStaff ? 'Edit Staff' : 'New Staff'}</h4>
            <button className="btn btn-sm" onClick={closeForm}><i className="fas fa-times"></i></button>
          </div>

          {error && (
            <div style={{ background: '#FEF2F2', color: '#991B1B', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
              <i className="fas fa-exclamation-circle"></i> {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>Name *</label>
                <input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Ahmad bin Ali" />
                <div style={hintStyle}>Full name of the staff member</div>
              </div>
              <div>
                <label style={labelStyle}>Role *</label>
                <select value={role} onChange={e => setRole(e.target.value)}>
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <div style={hintStyle}>Determines access level and permissions</div>
              </div>
              <div>
                <label style={labelStyle}>Phone *</label>
                <input value={phone} onChange={e => setPhone(e.target.value)} required placeholder="e.g. +60 12-345 6789" />
                <div style={hintStyle}>Contact number for this staff member</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>Email <span style={{ fontWeight: 400, color: '#94A3B8' }}>(optional)</span></label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="e.g. ahmad@zus.com" />
                <div style={hintStyle}>Used for login if linked to a user account</div>
              </div>
              <div>
                <label style={labelStyle}>PIN Code <span style={{ fontWeight: 400, color: '#94A3B8' }}>(optional)</span></label>
                <input value={pinCode} onChange={e => setPinCode(e.target.value)} placeholder="4-6 digit PIN" maxLength={6} />
                <div style={hintStyle}>{editingStaff ? 'Leave blank to keep current PIN' : 'Used for clock-in at POS terminal'}</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16 }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving...' : editingStaff ? 'Update' : 'Create'}
              </button>
              <button type="button" className="btn" onClick={closeForm}>Cancel</button>
              <div style={{ flex: 1 }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} style={{ width: 16, height: 16 }} />
                Active
              </label>
            </div>
          </form>
        </div>
      )}

      <div style={{ overflowX: 'auto', borderRadius: 20, background: 'white', border: '1px solid #ECF1F7' }}>
        <table>
          <thead>
            <tr><th>Name</th><th>Role</th><th>Phone</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {staff.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: '#94A3B8', padding: 40 }}>
                <i className="fas fa-user-tie" style={{ fontSize: 40, display: 'block', marginBottom: 12 }}></i>
                No staff members yet. Add your first team member.
              </td></tr>
            ) : staff.map(s => (
              <tr key={s.id}>
                <td style={{ fontWeight: 500 }}>{s.name}</td>
                <td>
                  <span className="badge badge-blue">
                    {ROLES.find(r => r.value === s.role)?.label || s.role}
                  </span>
                </td>
                <td>{s.phone || '—'}</td>
                <td>
                  <button onClick={() => toggleActive(s)} style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}>
                    <span className={`badge ${s.is_active ? 'badge-green' : 'badge-gray'}`}>
                      {s.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </button>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-sm" onClick={() => openEdit(s)}><i className="fas fa-edit"></i></button>
                    {confirmDelete === s.id ? (
                      <>
                        <button className="btn btn-sm" style={{ background: '#EF4444', color: 'white' }} onClick={() => handleDelete(s.id)}>Confirm</button>
                        <button className="btn btn-sm" onClick={() => setConfirmDelete(null)}>Cancel</button>
                      </>
                    ) : (
                      <button className="btn btn-sm" style={{ color: '#EF4444' }} onClick={() => setConfirmDelete(s.id)}><i className="fas fa-trash"></i></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
