'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import type { MerchantTableItem, MerchantStore } from '@/lib/merchant-types';

interface TablesPageProps {
  tables: MerchantTableItem[];
  selectedStore: string;
  storeObj: MerchantStore | undefined;
  token: string;
  onRefresh: () => void;
}

const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4, color: '#334155' };
const hintStyle: React.CSSProperties = { fontSize: 11, color: '#94A3B8', marginTop: 2 };

export default function TablesPage({ tables, selectedStore, storeObj, token, onRefresh }: TablesPageProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingTable, setEditingTable] = useState<MerchantTableItem | null>(null);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  // Form fields
  const [tableNumber, setTableNumber] = useState('');
  const [capacity, setCapacity] = useState('4');
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setEditingTable(null);
    setTableNumber('');
    setCapacity('4');
    setIsActive(true);
    setError('');
    setShowForm(true);
  }

  function openEdit(t: MerchantTableItem) {
    setEditingTable(t);
    setTableNumber(t.table_number);
    setCapacity(String(t.capacity));
    setIsActive(t.is_active);
    setError('');
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingTable(null);
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    const payload = {
      table_number: tableNumber,
      capacity: parseInt(capacity),
      ...(editingTable ? { is_active: isActive } : {}),
    };

    try {
      const res = editingTable
        ? await apiFetch(`/admin/stores/${selectedStore}/tables/${editingTable.id}`, token, { method: 'PUT', body: JSON.stringify(payload) })
        : await apiFetch(`/admin/stores/${selectedStore}/tables`, token, { method: 'POST', body: JSON.stringify(payload) });

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

  async function toggleActive(t: MerchantTableItem) {
    setError('');
    try {
      const res = await apiFetch(`/admin/stores/${selectedStore}/tables/${t.id}`, token, {
        method: 'PUT',
        body: JSON.stringify({ is_active: !t.is_active }),
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
      const res = await apiFetch(`/admin/stores/${selectedStore}/tables/${id}`, token, { method: 'DELETE' });
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
        <i className="fas fa-chair" style={{ fontSize: 40, marginBottom: 16 }}></i>
        <p>Select a specific store to manage tables</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ margin: 0 }}>Floor Plan &middot; {storeObj?.name}</h3>
        <button className="btn btn-primary" onClick={openCreate}><i className="fas fa-plus"></i> New Table</button>
      </div>

      {error && !showForm && (
        <div style={{ background: '#FEF2F2', color: '#991B1B', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          <i className="fas fa-exclamation-circle"></i> {error}
        </div>
      )}

      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h4 style={{ margin: 0 }}>{editingTable ? `Edit Table T${editingTable.table_number}` : 'New Table'}</h4>
            <button className="btn btn-sm" onClick={closeForm}><i className="fas fa-times"></i></button>
          </div>

          {error && (
            <div style={{ background: '#FEF2F2', color: '#991B1B', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
              <i className="fas fa-exclamation-circle"></i> {error}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>Table Number *</label>
                <input value={tableNumber} onChange={e => setTableNumber(e.target.value)} required placeholder="e.g. 11" />
                <div style={hintStyle}>Displayed on the table card and QR code</div>
              </div>
              <div>
                <label style={labelStyle}>Capacity (seats) *</label>
                <input type="number" value={capacity} onChange={e => setCapacity(e.target.value)} required min="1" />
                <div style={hintStyle}>Number of seats at this table</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16 }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving...' : editingTable ? 'Update' : 'Create'}
              </button>
              <button type="button" className="btn" onClick={closeForm}>Cancel</button>
              {editingTable && (
                <>
                  <div style={{ flex: 1 }} />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                    <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} style={{ width: 16, height: 16 }} />
                    Active
                  </label>
                </>
              )}
            </div>
          </form>
        </div>
      )}

      {tables.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 60, color: '#94A3B8' }}>
          <i className="fas fa-chair" style={{ fontSize: 40, display: 'block', marginBottom: 12 }}></i>
          No tables yet. Add your first table to set up the floor plan.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
          {tables.map(t => (
            <div key={t.id} className="card" style={{ textAlign: 'center', position: 'relative' }}>
              {confirmDelete === t.id ? (
                <>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: '#991B1B' }}>Delete T{t.table_number}?</div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                    <button className="btn btn-sm" style={{ background: '#EF4444', color: 'white' }} onClick={() => handleDelete(t.id)}>Delete</button>
                    <button className="btn btn-sm" onClick={() => setConfirmDelete(null)}>Cancel</button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>T{t.table_number}</div>
                  <div style={{ marginBottom: 8 }}>{t.capacity} seats</div>
                  <div style={{ marginBottom: 10 }}>
                    <button onClick={() => toggleActive(t)} style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}>
                      <span className={`badge ${t.is_active ? 'badge-green' : 'badge-gray'}`}>
                        {t.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
                    <button className="btn btn-sm" onClick={() => openEdit(t)}><i className="fas fa-edit"></i></button>
                    <button className="btn btn-sm" style={{ color: '#EF4444' }} onClick={() => setConfirmDelete(t.id)}><i className="fas fa-trash"></i></button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
