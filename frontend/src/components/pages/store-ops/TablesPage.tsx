'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import { StoreSelector } from '@/components/ui';
import { useQrExpiry, useQrImages, TableCard } from './tables';

import type { MerchantTableItem, MerchantStore } from '@/lib/merchant-types';

interface TablesPageProps {
  tables: MerchantTableItem[];
  selectedStore: string;
  storeObj: MerchantStore | undefined;
  onRefresh: () => void;
  stores: MerchantStore[];
  onStoreChange: (storeId: string) => void;
  onViewOrder: (orderId: number) => void;
}

export default function TablesPage({ tables, selectedStore, storeObj, onRefresh, stores, onStoreChange, onViewOrder }: TablesPageProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingTable, setEditingTable] = useState<MerchantTableItem | null>(null);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  const [tableNumber, setTableNumber] = useState('');
  const [capacity, setCapacity] = useState('4');
  const [saving, setSaving] = useState(false);

  const physicalStores = stores.filter(s => String(s.id) !== '0');
  const activeStoreId = selectedStore !== 'all' && selectedStore ? selectedStore : '';

  const qrImages = useQrImages(tables, activeStoreId);
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

  async function handleSubmit() {
    setSaving(true);
    setError('');
    const payload = {
      table_number: tableNumber,
      capacity: parseInt(capacity) || 4,
    };
    try {
      const res = editingTable
        ? await apiFetch(`/admin/stores/${activeStoreId}/tables/${editingTable.id}`, undefined, { method: 'PUT', body: JSON.stringify(payload) })
        : await apiFetch(`/admin/stores/${activeStoreId}/tables`, undefined, { method: 'POST', body: JSON.stringify(payload) });
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
      const res = await apiFetch(`/admin/stores/${activeStoreId}/tables/${table.id}`, undefined, {
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
      const res = await apiFetch(`/admin/stores/${activeStoreId}/tables/${id}`, undefined, { method: 'DELETE' });
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
      <div className="tp-0">
        <div className="tp-1">
          <StoreSelector
            stores={physicalStores}
            selectedStore={activeStoreId}
            onChange={onStoreChange}
            showAllOption={false}
            placeholder="Select a store..."
          />
        </div>
        {activeStoreId && (
          <button className="btn btn-primary tp-2" onClick={openCreate} >
            <i className="fas fa-plus"></i> Add Table
          </button>
        )}
      </div>

      {!activeStoreId && (
        <div className="card tp-3" >
          <span className="tp-4"><i className="fas fa-chair"></i></span>
          <p className="tp-5">Select a store to manage tables</p>
        </div>
      )}

      {activeStoreId && (
        <>
          {error && !showForm && (
            <div className="tp-6">
              <i className="fas fa-exclamation-circle"></i> {error}
            </div>
          )}

          {/* How it works — collapsible guide */}
          <div className="card tp-guide-card">
            <div onClick={() => setShowGuide(v => !v)} className="tp-guide-header">
              <span><span className="tp-guide-icon"><i className="fas fa-circle-info"></i></span>Table QR Workflow — Read Before Use</span>
              <i className={`fas fa-chevron-${showGuide ? 'up' : 'down'}`}></i>
            </div>
            {showGuide && (
            <div className="tp-guide-content">
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
            )}
          </div>

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
              <div>
                <div className="tables-form-grid tp-27">
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
                <div className="tables-form-actions tp-28">
                  <button onClick={handleSubmit} className="btn btn-primary" disabled={saving}>
                    {saving ? 'Saving...' : editingTable ? 'Update' : 'Create'}
                  </button>
                  <button className="btn" onClick={closeForm}>
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {tables.length === 0 ? (
            <div className="card tp-29" >
              <span className="tp-30"><i className="fas fa-chair"></i></span>
              <p>No tables yet for {storeObj?.name || 'this store'}</p>
              <button className="btn btn-primary tp-31" onClick={openCreate} >
                <i className="fas fa-plus"></i> Add First Table
              </button>
            </div>
          ) : (
            <div className="tables-grid tp-32">
              {tables.map(table => (
                <TableCard
                  key={table.id}
                  table={table}
                  qrImageUrl={qrImages[table.id]}
                  expiry={qrExpiry[table.id]}
                  confirmDelete={confirmDelete}
                  onGenerateQR={generateQR}
                  onDownloadQR={downloadQR}
                  onToggle={handleToggle}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onSetConfirmDelete={setConfirmDelete}
                  onViewOrder={onViewOrder}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
