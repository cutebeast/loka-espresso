'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { apiFetch, formatRM } from '@/lib/merchant-api';
import { StoreSelector } from '@/components/ui';

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
  onViewOrder: (orderId: number) => void;
}


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
            const res = await apiFetch(`/admin/stores/${storeId}/tables/${t.id}/qr-image`);
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

export default function TablesPage({ tables, selectedStore, storeObj, token, onRefresh, stores, onStoreChange, onViewOrder }: TablesPageProps) {
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
        ? await apiFetch(`/admin/stores/${selectedStore}/tables/${editingTable.id}`, undefined, { method: 'PUT', body: JSON.stringify(payload) })
        : await apiFetch(`/admin/stores/${selectedStore}/tables`, undefined, { method: 'POST', body: JSON.stringify(payload) });
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
      const res = await apiFetch(`/admin/stores/${selectedStore}/tables/${table.id}`, undefined, {
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
      const res = await apiFetch(`/admin/stores/${selectedStore}/tables/${id}`, undefined, { method: 'DELETE' });
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
      const res = await apiFetch(`/admin/stores/${selectedStore}/tables/${table.id}/qr-image`);
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
      const res = await apiFetch(`/admin/stores/${selectedStore}/tables/${table.id}/generate-qr`, undefined, { method: 'POST' });
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
      <div className="tp-0">
        <div className="tp-1">
          <StoreSelector
            stores={physicalStores}
            selectedStore={selectedStore === 'all' ? '' : selectedStore}
            onChange={onStoreChange}
            showAllOption={false}
            placeholder="Select a store..."
          />
        </div>
        {selectedStore !== 'all' && (
          <button className="btn btn-primary tp-2" onClick={openCreate} >
            <i className="fas fa-plus"></i> Add Table
          </button>
        )}
      </div>

      {/* Show prompt when no store selected */}
      {selectedStore === 'all' && (
        <div className="card tp-3" >
          <span className="tp-4"><i className="fas fa-chair"></i></span>
          <p className="tp-5">Select a store to manage tables</p>
        </div>
      )}

      {/* Show content when store selected */}
      {selectedStore !== 'all' && (
        <>
          {error && !showForm && (
            <div className="tp-6">
              <i className="fas fa-exclamation-circle"></i> {error}
            </div>
          )}

          {/* QR Workflow Instructions */}
          <div className="tp-7">
            <div className="tp-8">
              <span className="tp-9"><i className="fas fa-info-circle"></i></span>
              Table QR Workflow — Read Before Use
            </div>
            <div  className="tables-workflow-grid tp-10">
              <div className="tp-11">
                <span className="tp-12">1</span>
                <div>
                  <div className="tp-13">Generate QR</div>
                  <div className="tp-14">QR codes expire 30 min after generation. Print and place on table.</div>
                </div>
              </div>
              <div className="tp-15">
                <span className="tp-16">2</span>
                <div>
                  <div className="tp-17">Bring QR to Table</div>
                  <div className="tp-18">Service crew places printed QR on table for customer to scan.</div>
                </div>
              </div>
              <div className="tp-19">
                <span className="tp-20">3</span>
                <div>
                  <div className="tp-21">Customer Scans</div>
                  <div className="tp-22">Customer scans QR to place dine-in order. <strong>No QR = dine-in not available.</strong></div>
                </div>
              </div>
            </div>
          </div>

          {/* Form */}
          {showForm && (
            <div className="card tp-23" >
              <div className="tp-24">
                <h4 className="tp-25">{editingTable ? `Edit Table ${editingTable.table_number}` : 'New Table'}</h4>
                <button className="btn btn-sm" onClick={closeForm}>
                  <i className="fas fa-times"></i>
                </button>
              </div>
              {error && (
                <div className="tp-26">
                  <i className="fas fa-exclamation-circle"></i> {error}
                </div>
              )}
              <form onSubmit={handleSubmit}>
                <div  className="tables-form-grid tp-27">
                  <div>
                    <label className="form-label">Table Number *</label>
                    <input
                      value={tableNumber}
                      onChange={e => setTableNumber(e.target.value)}
                      required
                      placeholder="e.g. A1, T12"
                    />
                    <div className="form-hint">Unique identifier for this table</div>
                  </div>
                  <div>
                    <label className="form-label">Capacity *</label>
                    <input
                      type="number"
                      min="1"
                      value={capacity}
                      onChange={e => setCapacity(e.target.value)}
                      required
                    />
                    <div className="form-hint">Number of seats</div>
                  </div>
                </div>
                <div  className="tables-form-actions tp-28">
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
            <div className="card tp-29" >
              <span className="tp-30"><i className="fas fa-chair"></i></span>
              <p>No tables yet for {storeObj?.name || 'this store'}</p>
              <button className="btn btn-primary tp-31" onClick={openCreate} >
                <i className="fas fa-plus"></i> Add First Table
              </button>
            </div>
          ) : (
            <div  className="tables-grid tp-32">
              {tables.map(table => (
                <div
                  key={table.id}
                  className={`card ${table.is_active ? 'tp-table-active' : 'tp-table-inactive'}`}
                >
                  <div className="tp-33">
                    <div>
                      <h4 className="tp-34">Table {table.table_number}</h4>
                      <p className="tp-35">
                        <i className="fas fa-users"></i> Capacity: {table.capacity}
                        {table.is_occupied && (
                          <span className="tp-36">
                            <span className="tp-37"><i className="fas fa-circle"></i></span> Occupied
                          </span>
                        )}
                      </p>
                      {/* Active Order Indicator */}
                      {table.active_order && (
                        <div
                          onClick={() => onViewOrder(table.active_order!.id)}
                          className={`tp-order-indicator ${table.active_order.payment_status === 'paid' ? 'tp-order-indicator-paid' : 'tp-order-indicator-unpaid'}`}
                          title="Click to view order details"
                        >
                          <div className="tp-38">
                            <div>
                              <span className="tp-39">
                                <span className="tp-40"><i className="fas fa-receipt"></i></span>
                                {table.active_order.order_number}
                              </span>
                              <span  className={`badge ${
                                table.active_order.status === 'pending' ? 'badge-yellow' :
                                table.active_order.status === 'preparing' ? 'badge-blue' :
                                table.active_order.status === 'ready' ? 'badge-green' :
                                table.active_order.status === 'confirmed' ? 'badge-blue' :
                                'badge-gray'
                              } tp-41`}>
                                {table.active_order.status}
                              </span>
                            </div>
                            <div className="tp-42">
                              {formatRM(table.active_order.total)}
                              {table.active_order.payment_status !== 'paid' && (
                                <span className="tp-43">
                                  <i className="fas fa-exclamation-circle"></i> Unpaid
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
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
                    <div className="tp-44">
                      <Image
                        src={qrImages[table.id]}
                        alt={`QR code for table ${table.table_number}`}
                        width={140}
                        height={140}
                        className="tp-45"
                      />
                      {/* Expiry countdown timer — only show when QR is active and not expired */}
                      {table.qr_code_url && !qrExpiry[table.id]?.expired ? (
                        <div className={`tp-timer ${qrExpiry[table.id]?.remaining < 300 ? 'tp-timer-urgent' : 'tp-timer-warn'}`}>
                          <i className="fas fa-clock"></i> Expires in {formatDuration(qrExpiry[table.id]?.remaining || 0)}
                        </div>
                      ) : table.qr_code_url && qrExpiry[table.id]?.expired ? (
                        <div className="tp-46">
                          <i className="fas fa-exclamation-triangle"></i> QR expired — regenerate
                        </div>
                      ) : null}
                    </div>
                  )}
                  {table.qr_code_url && !qrImages[table.id] && (
                    <div className="tp-47">
                      <span className="tp-48"><i className="fas fa-spinner fa-spin"></i></span>
                    </div>
                  )}

                  <div  className="tables-card-actions tp-49">
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
                        className={`fas ${table.is_active ? 'fa-toggle-on' : 'fa-toggle-off'} ${table.is_active ? 'text-success' : 'text-primary-light'}`}
                      ></i>
                    </button>
                    <button className="btn btn-sm" onClick={() => openEdit(table)} title="Edit">
                      <i className="fas fa-edit"></i>
                    </button>
                    {confirmDelete === table.id ? (
                      <>
                        <button
                          className="btn btn-sm tp-50"
                          
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
                        className="btn btn-sm tp-51"
                        
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
