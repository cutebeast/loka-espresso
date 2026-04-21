'use client';

import { useState, useEffect, useRef } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import { StoreSelector } from '@/components/ui';
import { THEME } from '@/lib/theme';
import type { MerchantTableItem, MerchantStore } from '@/lib/merchant-types';

const QR_EXPIRY_SECONDS = 30 * 60; // 30 minutes

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

/** Format seconds as MM:SS */
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Hook to track QR expiry timers — updates every second. */
function useQrExpiry(tables: MerchantTableItem[]) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const result: Record<number, { remaining: number; expired: boolean }> = {};
  for (const t of tables) {
    if (!t.qr_generated_at) {
      result[t.id] = { remaining: QR_EXPIRY_SECONDS, expired: false };
      continue;
    }
    const elapsed = Math.floor((now - new Date(t.qr_generated_at).getTime()) / 1000);
    const remaining = QR_EXPIRY_SECONDS - elapsed;
    result[t.id] = { remaining: Math.max(0, remaining), expired: remaining <= 0 };
  }
  return result;
}

/** Hook to fetch QR image blobs with auth header and cache them. */
function useQrImages(tables: MerchantTableItem[], storeId: string, token: string) {
  const [qrUrls, setQrUrls] = useState<Record<number, string>>({});
  const prevKey = useRef('');

  useEffect(() => {
    const key = `${storeId}:${tables.map(t => t.id).join(',')}`;
    if (key === prevKey.current) return;
    prevKey.current = key;

    // Revoke old blob URLs
    Object.values(qrUrls).forEach(u => URL.revokeObjectURL(u));

    const newUrls: Record<number, string> = {};
    let cancelled = false;

    async function fetchAll() {
      await Promise.all(
        tables.filter(t => t.qr_code_url).map(async (t) => {
          try {
            const res = await apiFetch(`/admin/stores/${storeId}/tables/${t.id}/qr-image`, token);
            if (res.ok && !cancelled) {
              const blob = await res.blob();
              newUrls[t.id] = URL.createObjectURL(blob);
            }
          } catch { /* skip failed */ }
        })
      );
      if (!cancelled) setQrUrls(newUrls);
    }

    fetchAll();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, tables, token]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { Object.values(qrUrls).forEach(u => URL.revokeObjectURL(u)); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return qrUrls;
}

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

  // Fetch QR images with auth header
  const qrImages = useQrImages(tables, selectedStore, token);

  // QR expiry countdown timers (updates every second)
  const qrExpiry = useQrExpiry(tables);

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
        ? await apiFetch(`/admin/stores/${selectedStore}/tables/${editingTable.id}`, token, { method: 'PUT', body: JSON.stringify(payload) })
        : await apiFetch(`/admin/stores/${selectedStore}/tables`, token, { method: 'POST', body: JSON.stringify(payload) });
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
      const res = await apiFetch(`/admin/stores/${selectedStore}/tables/${table.id}`, token, {
        method: 'PUT',
        body: JSON.stringify({ is_active: !table.is_active }),
      });
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
      const res = await apiFetch(`/admin/stores/${selectedStore}/tables/${id}`, token, { method: 'DELETE' });
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

  async function downloadQR(table: MerchantTableItem) {
    try {
      const res = await apiFetch(`/admin/stores/${selectedStore}/tables/${table.id}/qr-image`, token);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `table-${table.table_number}-qr.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError('Failed to download QR code');
    }
  }

  async function generateQR(table: MerchantTableItem) {
    try {
      const res = await apiFetch(`/admin/stores/${selectedStore}/tables/${table.id}/generate-qr`, token, { method: 'POST' });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.detail || 'Failed to generate QR');
        return;
      }
      onRefresh();
    } catch {
      setError('Failed to generate QR code');
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

          {/* QR Workflow Instructions */}
          <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: 13 }}>
            <div style={{ fontWeight: 700, color: '#1E40AF', marginBottom: 8 }}>
              <i className="fas fa-info-circle" style={{ marginRight: 6 }}></i>
              Table QR Workflow — Read Before Use
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ background: '#DBEAFE', color: '#1E40AF', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>1</span>
                <div>
                  <div style={{ fontWeight: 600, color: '#1E3A5F' }}>Generate QR</div>
                  <div style={{ color: '#64748B' }}>QR codes expire 30 min after generation. Print and place on table.</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ background: '#DBEAFE', color: '#1E40AF', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>2</span>
                <div>
                  <div style={{ fontWeight: 600, color: '#1E3A5F' }}>Bring QR to Table</div>
                  <div style={{ color: '#64748B' }}>Service crew places printed QR on table for customer to scan.</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span style={{ background: '#DBEAFE', color: '#1E40AF', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>3</span>
                <div>
                  <div style={{ fontWeight: 600, color: '#1E3A5F' }}>Customer Scans</div>
                  <div style={{ color: '#64748B' }}>Customer scans QR to place dine-in order. <strong>No QR = dine-in not available.</strong></div>
                </div>
              </div>
            </div>
          </div>

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
                        {table.is_occupied && (
                          <span style={{ marginLeft: 8, color: '#DC2626', fontWeight: 600 }}>
                            <i className="fas fa-circle" style={{ fontSize: 8 }}></i> Occupied
                          </span>
                        )}
                      </p>
                    </div>
                    <span className={`badge ${
                      table.is_occupied ? 'badge-red' :
                      !table.qr_code_url ? 'badge-yellow' :
                      qrExpiry[table.id]?.expired ? 'badge-red' :
                      table.is_active ? 'badge-green' : 'badge-gray'
                    }`}>
                      {table.is_occupied ? 'In Use' :
                       !table.qr_code_url ? 'Pending' :
                       qrExpiry[table.id]?.expired ? 'Expired' :
                       table.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </div>

                  {/* QR Code Image — loaded via blob URL with auth */}
                  {table.qr_code_url && qrImages[table.id] && (
                    <div style={{ textAlign: 'center', marginBottom: 8 }}>
                      <img
                        src={qrImages[table.id]}
                        alt={`QR code for table ${table.table_number}`}
                        style={{ width: 140, height: 140, borderRadius: 8, border: `1px solid ${THEME.border}` }}
                      />
                      {/* Expiry countdown timer — only show when QR is active and not expired */}
                      {table.qr_code_url && !qrExpiry[table.id]?.expired ? (
                        <div style={{
                          marginTop: 6,
                          fontSize: 12,
                          fontWeight: 600,
                          color: qrExpiry[table.id]?.remaining < 300 ? '#DC2626' : '#F59E0B',
                        }}>
                          <i className="fas fa-clock"></i> Expires in {formatDuration(qrExpiry[table.id]?.remaining || 0)}
                        </div>
                      ) : table.qr_code_url && qrExpiry[table.id]?.expired ? (
                        <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: '#DC2626' }}>
                          <i className="fas fa-exclamation-triangle"></i> QR expired — regenerate
                        </div>
                      ) : null}
                    </div>
                  )}
                  {table.qr_code_url && !qrImages[table.id] && (
                    <div style={{ textAlign: 'center', marginBottom: 12, padding: '60px 0', color: THEME.textMuted }}>
                      <i className="fas fa-spinner fa-spin" style={{ fontSize: 24 }}></i>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    {!table.qr_code_url ? (
                      <button className="btn btn-sm btn-primary" onClick={() => generateQR(table)} title="Generate QR code for this table">
                        <i className="fas fa-qrcode"></i> Generate QR
                      </button>
                    ) : (
                      <>
                        <button className="btn btn-sm" onClick={() => downloadQR(table)} title="Download QR">
                          <i className="fas fa-download"></i>
                        </button>
                        <button className="btn btn-sm" onClick={() => generateQR(table)} title="Regenerate QR (invalidates old code)">
                          <i className="fas fa-sync-alt"></i>
                        </button>
                      </>
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
