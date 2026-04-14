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
}

const UNITS = ['kg', 'litre', 'pcs', 'g', 'ml'];

const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4, color: '#334155' };
const hintStyle: React.CSSProperties = { fontSize: 11, color: '#94A3B8', marginTop: 2 };

export default function InventoryPage({ inventory, selectedStore, storeObj, token, onRefresh }: InventoryPageProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<MerchantInventoryItem | null>(null);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [stock, setStock] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [reorderLevel, setReorderLevel] = useState('');
  const [costPerUnit, setCostPerUnit] = useState('');
  const [saving, setSaving] = useState(false);

  function openCreate() {
    setEditingItem(null);
    setName('');
    setStock('');
    setUnit('pcs');
    setReorderLevel('');
    setCostPerUnit('');
    setError('');
    setShowForm(true);
  }

  function openEdit(item: MerchantInventoryItem) {
    setEditingItem(item);
    setName(item.name);
    setStock(String(item.current_stock));
    setUnit(item.unit);
    setReorderLevel(String(item.reorder_level));
    setCostPerUnit(item.cost_per_unit != null ? String(item.cost_per_unit) : '');
    setError('');
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingItem(null);
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');

    const payload = {
      name,
      current_stock: parseFloat(stock) || 0,
      unit,
      reorder_level: parseFloat(reorderLevel) || 0,
      cost_per_unit: costPerUnit ? parseFloat(costPerUnit) : null,
    };

    try {
      const res = editingItem
        ? await apiFetch(`/stores/${selectedStore}/inventory/${editingItem.id}`, token, { method: 'PUT', body: JSON.stringify(payload) })
        : await apiFetch(`/stores/${selectedStore}/inventory`, token, { method: 'POST', body: JSON.stringify(payload) });

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

  async function handleDelete(id: number) {
    try {
      const res = await apiFetch(`/stores/${selectedStore}/inventory/${id}`, token, { method: 'DELETE' });
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
        <i className="fas fa-boxes-stacked" style={{ fontSize: 40, marginBottom: 16 }}></i>
        <p>Select a specific store to manage inventory</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ margin: 0 }}>Inventory &middot; {storeObj?.name}</h3>
        <button className="btn btn-primary" onClick={openCreate}><i className="fas fa-plus"></i> New Ingredient</button>
      </div>

      {error && !showForm && (
        <div style={{ background: '#FEF2F2', color: '#991B1B', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          <i className="fas fa-exclamation-circle"></i> {error}
        </div>
      )}

      {showForm && (
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
                <label style={labelStyle}>Current Stock *</label>
                <input type="number" step="0.01" value={stock} onChange={e => setStock(e.target.value)} required />
                <div style={hintStyle}>Current quantity on hand</div>
              </div>
              <div>
                <label style={labelStyle}>Unit *</label>
                <select value={unit} onChange={e => setUnit(e.target.value)}>
                  {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                <div style={hintStyle}>Measurement unit for this ingredient</div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={labelStyle}>Reorder Level <span style={{ fontWeight: 400, color: '#94A3B8' }}>(blank = never)</span></label>
                <input type="number" step="0.01" value={reorderLevel} onChange={e => setReorderLevel(e.target.value)} placeholder="e.g. 5" />
                <div style={hintStyle}>Alert when stock drops below this level</div>
              </div>
              <div>
                <label style={labelStyle}>Cost per Unit (RM) <span style={{ fontWeight: 400, color: '#94A3B8' }}>(optional)</span></label>
                <input type="number" step="0.01" value={costPerUnit} onChange={e => setCostPerUnit(e.target.value)} placeholder="e.g. 12.50" />
                <div style={hintStyle}>Used for cost tracking and reporting</div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16 }}>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving...' : editingItem ? 'Update' : 'Create'}
              </button>
              <button type="button" className="btn" onClick={closeForm}>Cancel</button>
            </div>
          </form>
        </div>
      )}

      <div style={{ overflowX: 'auto', borderRadius: 20, background: 'white', border: '1px solid #ECF1F7' }}>
        <table>
          <thead>
            <tr><th>Ingredient</th><th>Stock</th><th>Unit</th><th>Reorder Level</th><th>Cost/Unit</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {inventory.length === 0 ? (
              <tr><td colSpan={7} style={{ textAlign: 'center', color: '#94A3B8', padding: 40 }}>
                <i className="fas fa-boxes-stacked" style={{ fontSize: 40, display: 'block', marginBottom: 12 }}></i>
                No inventory items yet. Add your first ingredient.
              </td></tr>
            ) : inventory.map(item => {
              const isLow = item.current_stock <= item.reorder_level;
              return (
                <tr key={item.id}>
                  <td style={{ fontWeight: 500 }}>{item.name}</td>
                  <td>{item.current_stock}</td>
                  <td>{item.unit}</td>
                  <td>{item.reorder_level}</td>
                  <td>{item.cost_per_unit != null ? `RM ${item.cost_per_unit}` : '—'}</td>
                  <td><span className={`badge ${isLow ? 'badge-yellow' : 'badge-green'}`}>{isLow ? 'Low' : 'OK'}</span></td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm" onClick={() => openEdit(item)}><i className="fas fa-edit"></i></button>
                      {confirmDelete === item.id ? (
                        <>
                          <button className="btn btn-sm" style={{ background: '#EF4444', color: 'white' }} onClick={() => handleDelete(item.id)}>Confirm</button>
                          <button className="btn btn-sm" onClick={() => setConfirmDelete(null)}>Cancel</button>
                        </>
                      ) : (
                        <button className="btn btn-sm" style={{ color: '#EF4444' }} onClick={() => setConfirmDelete(item.id)}><i className="fas fa-trash"></i></button>
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
