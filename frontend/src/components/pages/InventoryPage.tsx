'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import type { MerchantInventoryItem, MerchantStore } from '@/lib/merchant-types';

interface InventoryPageProps {
  inventory: MerchantInventoryItem[];
  selectedStore: string;
  storeObj: MerchantStore | undefined;
  token: string;
  onRefresh: () => void;
  userRole: string;
}

const UNITS = ['kg', 'litre', 'pcs', 'g', 'ml'];
const MOVEMENT_TYPES = [
  { value: 'received', label: 'Received', icon: 'fa-arrow-down', color: '#059669' },
  { value: 'waste', label: 'Waste / Spillage', icon: 'fa-trash-can', color: '#EF4444' },
  { value: 'transfer_out', label: 'Transfer Out', icon: 'fa-arrow-right-from-bracket', color: '#F59E0B' },
  { value: 'transfer_in', label: 'Transfer In', icon: 'fa-arrow-right-to-bracket', color: '#3B82F6' },
  { value: 'cycle_count', label: 'Cycle Count', icon: 'fa-calculator', color: '#8B5CF6' },
  { value: 'adjustment', label: 'Adjustment', icon: 'fa-sliders', color: '#6B7280' },
];

const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4, color: '#334155' };
const hintStyle: React.CSSProperties = { fontSize: 11, color: '#94A3B8', marginTop: 2 };

const HQ_ROLES = ['admin', 'hq_personnel', 'store_owner'];

export default function InventoryPage({ inventory, selectedStore, storeObj, token, onRefresh, userRole }: InventoryPageProps) {
  const isHQ = HQ_ROLES.includes(userRole);

  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<MerchantInventoryItem | null>(null);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [adjustingItem, setAdjustingItem] = useState<MerchantInventoryItem | null>(null);

  // CRUD form fields
  const [name, setName] = useState('');
  const [stock, setStock] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [reorderLevel, setReorderLevel] = useState('');
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);

  // Adjust form fields
  const [adjType, setAdjType] = useState('received');
  const [adjQty, setAdjQty] = useState('');
  const [adjNote, setAdjNote] = useState('');
  const [adjFile, setAdjFile] = useState<File | null>(null);
  const [savingAdj, setSavingAdj] = useState(false);

  function openCreate() {
    setEditingItem(null);
    setName(''); setStock(''); setUnit('pcs'); setReorderLevel(''); setCategory('');
    setError(''); setShowForm(true);
  }

  function openEdit(item: MerchantInventoryItem) {
    setEditingItem(item);
    setName(item.name);
    setStock(String(item.current_stock));
    setUnit(item.unit);
    setReorderLevel(String(item.reorder_level));
    setCategory(item.category || '');
    setError(''); setShowForm(true);
  }

  function closeForm() { setShowForm(false); setEditingItem(null); setError(''); }

  function openAdjust(item: MerchantInventoryItem) {
    setAdjustingItem(item);
    setAdjType('received'); setAdjQty(''); setAdjNote(''); setAdjFile(null);
    setError('');
  }
  function closeAdjust() { setAdjustingItem(null); setError(''); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError('');
    const payload = {
      name, current_stock: parseFloat(stock) || 0, unit,
      reorder_level: parseFloat(reorderLevel) || 0,
      category: category || null,
    };
    try {
      const res = editingItem
        ? await apiFetch(`/stores/${selectedStore}/inventory/${editingItem.id}`, token, { method: 'PUT', body: JSON.stringify(payload) })
        : await apiFetch(`/stores/${selectedStore}/inventory`, token, { method: 'POST', body: JSON.stringify(payload) });
      if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.detail || `Failed (${res.status})`); return; }
      closeForm(); onRefresh();
    } catch (err: any) { setError(err.message || 'Network error'); }
    finally { setSaving(false); }
  }

  async function handleToggle(item: MerchantInventoryItem) {
    setError('');
    try {
      const res = await apiFetch(`/stores/${selectedStore}/inventory/${item.id}/toggle`, token, { method: 'PATCH' });
      if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.detail || 'Toggle failed'); return; }
      onRefresh();
    } catch (err: any) { setError(err.message || 'Network error'); }
  }

  async function handleDelete(id: number) {
    try {
      const res = await apiFetch(`/stores/${selectedStore}/inventory/${id}`, token, { method: 'DELETE' });
      if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.detail || 'Delete failed'); return; }
      setConfirmDelete(null); onRefresh();
    } catch { setError('Network error'); }
  }

  async function handleAdjust(e: React.FormEvent) {
    e.preventDefault();
    if (!adjustingItem) return;
    setSavingAdj(true); setError('');

    let attachmentPath: string | null = null;
    if (adjFile) {
      try {
        const formData = new FormData();
        formData.append('file', adjFile);
        const upRes = await fetch('/api/v1/upload/document', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` },
          body: formData,
        });
        if (upRes.ok) { const upData = await upRes.json(); attachmentPath = upData.url; }
      } catch {}
    }

    try {
      const res = await apiFetch(`/stores/${selectedStore}/inventory/${adjustingItem.id}/adjust`, token, {
        method: 'POST',
        body: JSON.stringify({ movement_type: adjType, quantity: parseFloat(adjQty), note: adjNote, attachment_path: attachmentPath }),
      });
      if (!res.ok) { const data = await res.json().catch(() => ({})); setError(data.detail || `Failed (${res.status})`); return; }
      closeAdjust(); onRefresh();
    } catch (err: any) { setError(err.message || 'Network error'); }
    finally { setSavingAdj(false); }
  }

  if (selectedStore === 'all') {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 60, color: '#64748B' }}>
        <i className="fas fa-boxes-stacked" style={{ fontSize: 40, marginBottom: 16 }}></i>
        <p>Select a specific store to view inventory</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ margin: 0 }}>Inventory &middot; {storeObj?.name}</h3>
        {isHQ && <button className="btn btn-primary" onClick={openCreate}><i className="fas fa-plus"></i> New Ingredient</button>}
      </div>

      {error && !showForm && !adjustingItem && (
        <div style={{ background: '#FEF2F2', color: '#991B1B', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          <i className="fas fa-exclamation-circle"></i> {error}
        </div>
      )}

      {/* HQ: CRUD Form */}
      {isHQ && showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h4 style={{ margin: 0 }}>{editingItem ? `Edit: ${editingItem.name}` : 'New Ingredient'}</h4>
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
                <label style={labelStyle}>Ingredient Name *</label>
                <input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Arabica Coffee Beans" />
                <div style={hintStyle}>Name of the ingredient or supply item</div>
              </div>
              <div>
                <label style={labelStyle}>Opening Stock *</label>
                <input type="number" step="0.01" value={stock} onChange={e => setStock(e.target.value)} required />
                <div style={hintStyle}>Starting quantity on hand</div>
              </div>
              <div>
                <label style={labelStyle}>Unit *</label>
                <select value={unit} onChange={e => setUnit(e.target.value)}>
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                <div style={hintStyle}>Measurement unit</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>Reorder Level <span style={{ fontWeight: 400, color: '#94A3B8' }}>(blank = never)</span></label>
                <input type="number" step="0.01" value={reorderLevel} onChange={e => setReorderLevel(e.target.value)} placeholder="e.g. 5" />
                <div style={hintStyle}>Alert when stock drops below this level</div>
              </div>
              <div>
                <label style={labelStyle}>Category <span style={{ fontWeight: 400, color: '#94A3B8' }}>(optional)</span></label>
                <input value={category} onChange={e => setCategory(e.target.value)} placeholder="e.g. Coffee Beans, Syrups, Packaging" />
                <div style={hintStyle}>Group ingredients for filtering</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16 }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : editingItem ? 'Update' : 'Create'}</button>
              <button type="button" className="btn" onClick={closeForm}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Adjust Inventory Form (manager/assistant + HQ) */}
      {adjustingItem && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h4 style={{ margin: 0 }}>Adjust: {adjustingItem.name}</h4>
            <button className="btn btn-sm" onClick={closeAdjust}><i className="fas fa-times"></i></button>
          </div>
          <div style={{ fontSize: 13, color: '#64748B', marginBottom: 12 }}>Current balance: <strong>{adjustingItem.current_stock} {adjustingItem.unit}</strong></div>
          {error && (
            <div style={{ background: '#FEF2F2', color: '#991B1B', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
              <i className="fas fa-exclamation-circle"></i> {error}
            </div>
          )}
          <form onSubmit={handleAdjust}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>Movement Type *</label>
                <select value={adjType} onChange={e => setAdjType(e.target.value)}>
                  {MOVEMENT_TYPES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                <div style={hintStyle}>
                  {['waste', 'transfer_out'].includes(adjType) ? '⚠ This will DEDUCT from current balance' : 'This will ADD to current balance'}
                </div>
              </div>
              <div>
                <label style={labelStyle}>Quantity *</label>
                <input type="number" step="0.01" value={adjQty} onChange={e => setAdjQty(e.target.value)} required placeholder="e.g. 5" min="0.01" />
                <div style={hintStyle}>Amount to add or deduct</div>
              </div>
              <div>
                <label style={labelStyle}>Note / Reason *</label>
                <input value={adjNote} onChange={e => setAdjNote(e.target.value)} required placeholder="e.g. Delivery from supplier" />
                <div style={hintStyle}>Required — explain why this adjustment</div>
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>Attachment <span style={{ fontWeight: 400, color: '#94A3B8' }}>(optional)</span></label>
              <input type="file" accept="image/*,.pdf,.csv,.xlsx" onChange={e => setAdjFile(e.target.files?.[0] || null)} style={{ fontSize: 13 }} />
              <div style={hintStyle}>Receipt, delivery note, or waste photo (max 10MB)</div>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
              <button type="submit" className="btn btn-primary" disabled={savingAdj}>{savingAdj ? 'Processing...' : 'Submit Adjustment'}</button>
              <button type="button" className="btn" onClick={closeAdjust}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Table */}
      <div style={{ overflowX: 'auto', borderRadius: 20, background: 'white', border: '1px solid #ECF1F7' }}>
        <table>
          <thead>
            <tr><th>Ingredient</th><th>Category</th><th>Balance</th><th>Unit</th><th>Reorder Level</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {inventory.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#94A3B8', padding: 40 }}>
                <i className="fas fa-boxes-stacked" style={{ fontSize: 40, display: 'block', marginBottom: 12 }}></i>
                No inventory items yet.
              </td></tr>
            ) : inventory.map(item => {
              const isLow = item.current_stock <= item.reorder_level && item.is_active;
              return (
                <tr key={item.id} style={{ opacity: item.is_active ? 1 : 0.5 }}>
                  <td style={{ fontWeight: 500 }}>
                    {item.name}
                    {!item.is_active && <span style={{ marginLeft: 8, fontSize: 11, color: '#EF4444', fontWeight: 500 }}>Inactive</span>}
                  </td>
                  <td style={{ fontSize: 13 }}>{item.category || '—'}</td>
                  <td><strong>{item.current_stock}</strong></td>
                  <td>{item.unit}</td>
                  <td>{item.reorder_level}</td>
                  <td><span className={`badge ${!item.is_active ? 'badge-gray' : isLow ? 'badge-yellow' : 'badge-green'}`}>{!item.is_active ? 'Inactive' : isLow ? 'Low' : 'OK'}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm" onClick={() => openAdjust(item)} title="Adjust qty"><i className="fas fa-right-left"></i></button>
                      {isHQ && (
                        <>
                          <button className="btn btn-sm" onClick={() => handleToggle(item)} title={item.is_active ? 'Deactivate' : 'Activate'}>
                            <i className={`fas ${item.is_active ? 'fa-toggle-on' : 'fa-toggle-off'}`} style={{ color: item.is_active ? '#059669' : '#94A3B8' }}></i>
                          </button>
                          <button className="btn btn-sm" onClick={() => openEdit(item)} title="Edit"><i className="fas fa-edit"></i></button>
                          {confirmDelete === item.id ? (
                            <>
                              <button className="btn btn-sm" style={{ background: '#EF4444', color: 'white' }} onClick={() => handleDelete(item.id)}>Confirm</button>
                              <button className="btn btn-sm" onClick={() => setConfirmDelete(null)}>Cancel</button>
                            </>
                          ) : (
                            <button className="btn btn-sm" style={{ color: '#EF4444' }} onClick={() => setConfirmDelete(item.id)} title="Delete"><i className="fas fa-trash"></i></button>
                          )}
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
