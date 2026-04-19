'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import { StoreSelector } from '@/components/ui';
import { THEME } from '@/lib/theme';
import type { MerchantTableItem, MerchantStore } from '@/lib/merchant-types';

interface TablesPageProps {
  tables: MerchantTableItem[];
  selectedStore: string;
  storeObj: MerchantStore | undefined;
  token: string;
  onRefresh: () => void;
  stores: MerchantStore[];
  onStoreChange: (storeId: string) => void;
}

const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4, color: THEME.textPrimary };
const hintStyle: React.CSSProperties = { fontSize: 11, color: THEME.textMuted, marginTop: 2 };

export default function TablesPage({ tables, selectedStore, storeObj, token, onRefresh, stores, onStoreChange }: TablesPageProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingTable, setEditingTable] = useState<MerchantTableItem | null>(null);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  // Form fields
  const [tableNumber, setTableNumber] = useState('');
  const [capacity, setCapacity] = useState('4');
  const [saving, setSaving] = useState(false);

  const physicalStores = stores.filter(s => String(s.id) !== '0');

  function openCreate() {
    setEditingTable(null);
    setTableNumber('');
    setCapacity('4');
    setError('');
    setShowForm(true);
  }

  function openEdit(table: MerchantTableItem) {
    setEditingTable(table);
    setTableNumber(table.table_number);
    setCapacity(String(table.capacity));
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
      capacity: parseInt(capacity) || 4,
    };
    try {
      const res = editingTable
        ? await apiFetch(`/stores/${selectedStore}/tables/${editingTable.id}`, token, { method: 'PUT', body: JSON.stringify(payload) })
        : await apiFetch(`/stores/${selectedStore}/tables`, token, { method: 'POST', body: JSON.stringify(payload) });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.detail || `Failed (${res.status})`);
        return;
      }
      closeForm();
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(table: MerchantTableItem) {
    setError('');
    try {
      const res = await apiFetch(`/stores/${selectedStore}/tables/${table.id}/toggle`, token, { method: 'PATCH' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.detail || 'Toggle failed');
        return;
      }
      onRefresh();
    } catch (err: any) {
      setError(err.message || 'Network error');
    }
  }

  async function handleDelete(id: number) {
    try {
      const res = await apiFetch(`/stores/${selectedStore}/tables/${id}`, token, { method: 'DELETE' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.detail || 'Delete failed');
        return;
      }
      setConfirmDelete(null);
      onRefresh();
    } catch {
      setError('Network error');
    }
  }

  function downloadQR(table: MerchantTableItem) {
    if (table.qr_code_url) {
      const link = document.createElement('a');
      link.href = table.qr_code_url;
      link.download = `table-${table.table_number}-qr.png`;
      link.click();
    }
  }

  return (
    <div>
      {/* Header with StoreSelector always visible */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <StoreSelector
            stores={physicalStores}
            selectedStore={selectedStore === 'all' ? '' : selectedStore}
            onChange={onStoreChange}
            showAllOption={false}
            placeholder="Select a store..."
          />
        </div>
        {selectedStore !== 'all' && (
          <button className="btn btn-primary" onClick={openCreate}>
            <i className="fas fa-plus"></i> Add Table
          </button>
        )}
      </div>

      {/* Show prompt when no store selected */}
      {selectedStore === 'all' && (
        <div className="card" style={{ textAlign: 'center', padding: 60, color: THEME.textMuted, marginTop: 40 }}>
          <i className="fas fa-chair" style={{ fontSize: 48, marginBottom: 16 }}></i>
          <p style={{ fontSize: 16 }}>Select a store to manage tables</p>
        </div>
      )}

      {/* Show content when store selected */}
      {selectedStore !== 'all' && (
        <>
          {error && !showForm && (
            <div style={{ background: '#FEF2F2', color: '#991B1B', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
              <i className="fas fa-exclamation-circle"></i> {error}
            </div>
          )}

          {/* Form */}
          {showForm && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h4 style={{ margin: 0 }}>{editingTable ? `Edit Table ${editingTable.table_number}` : 'New Table'}</h4>
                <button className="btn btn-sm" onClick={closeForm}>
                  <i className="fas fa-times"></i>
                </button>
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
                    <input
                      value={tableNumber}
                      onChange={e => setTableNumber(e.target.value)}
                      required
                      placeholder="e.g. A1, T12"
                    />
                    <div style={hintStyle}>Unique identifier for this table</div>
                  </div>
                  <div>
                    <label style={labelStyle}>Capacity *</label>
                    <input
                      type="number"
                      min="1"
                      value={capacity}
                      onChange={e => setCapacity(e.target.value)}
                      required
                    />
                    <div style={hintStyle}>Number of seats</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? 'Saving...' : editingTable ? 'Update' : 'Create'}
                  </button>
                  <button type="button" className="btn" onClick={closeForm}>
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Tables Grid */}
          {tables.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 60, color: THEME.textMuted }}>
              <i className="fas fa-chair" style={{ fontSize: 40, marginBottom: 16 }}></i>
              <p>No tables yet for {storeObj?.name || 'this store'}</p>
              <button className="btn btn-primary" onClick={openCreate} style={{ marginTop: 12 }}>
                <i className="fas fa-plus"></i> Add First Table
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {tables.map(table => (
                <div
                  key={table.id}
                  className="card"
                  style={{
                    opacity: table.is_active ? 1 : 0.6,
                    border: table.is_active ? `1px solid ${THEME.border}` : `1px solid ${THEME.borderLight}`,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <h4 style={{ margin: 0, fontSize: 20 }}>Table {table.table_number}</h4>
                      <p style={{ margin: '4px 0 0 0', color: THEME.textMuted, fontSize: 13 }}>
                        <i className="fas fa-users"></i> Capacity: {table.capacity}
                      </p>
                    </div>
                    <span className={`badge ${table.is_active ? 'badge-green' : 'badge-gray'}`}>
                      {table.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  {table.qr_code_url && (
                    <div style={{ textAlign: 'center', marginBottom: 12 }}>
                      <img
                        src={table.qr_code_url}
                        alt={`QR code for table ${table.table_number}`}
                        style={{ width: 120, height: 120, borderRadius: 8 }}
                      />
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    {table.qr_code_url && (
                      <button className="btn btn-sm" onClick={() => downloadQR(table)} title="Download QR">
                        <i className="fas fa-download"></i>
                      </button>
                    )}
                    <button
                      className="btn btn-sm"
                      onClick={() => handleToggle(table)}
                      title={table.is_active ? 'Deactivate' : 'Activate'}
                    >
                      <i
                        className={`fas ${table.is_active ? 'fa-toggle-on' : 'fa-toggle-off'}`}
                        style={{ color: table.is_active ? THEME.success : THEME.primaryLight }}
                      ></i>
                    </button>
                    <button className="btn btn-sm" onClick={() => openEdit(table)} title="Edit">
                      <i className="fas fa-edit"></i>
                    </button>
                    {confirmDelete === table.id ? (
                      <>
                        <button
                          className="btn btn-sm"
                          style={{ background: '#EF4444', color: 'white' }}
                          onClick={() => handleDelete(table.id)}
                        >
                          Confirm
                        </button>
                        <button className="btn btn-sm" onClick={() => setConfirmDelete(null)}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        className="btn btn-sm"
                        style={{ color: '#EF4444' }}
                        onClick={() => setConfirmDelete(table.id)}
                        title="Delete"
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
