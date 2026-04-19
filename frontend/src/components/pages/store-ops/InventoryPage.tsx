'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import { StoreSelector, Select, FilterSelect, DateFilter, Pagination } from '@/components/ui';
import { THEME } from '@/lib/theme';
import type { MerchantInventoryItem, MerchantInventoryCategory, MerchantStore } from '@/lib/merchant-types';
import InventoryLedgerPage from '@/components/pages/store-ops/InventoryLedgerPage';

interface InventoryPageProps {
  inventory: MerchantInventoryItem[];
  selectedStore: string;
  storeObj: MerchantStore | undefined;
  token: string;
  onRefresh: () => void;
  userRole: string;
  userType?: number;
  stores: MerchantStore[];
  onStoreChange: (storeId: string) => void;
}

const UNITS = ['kg', 'litre', 'pcs', 'g', 'ml'];
const MOVEMENT_TYPES = [
  { value: 'received', label: 'Received', icon: 'fa-arrow-down', color: THEME.success },
  { value: 'waste', label: 'Waste / Spillage', icon: 'fa-trash-can', color: '#EF4444' },
  { value: 'transfer_out', label: 'Transfer Out', icon: 'fa-arrow-right-from-bracket', color: '#F59E0B' },
  { value: 'transfer_in', label: 'Transfer In', icon: 'fa-arrow-right-to-bracket', color: '#3B82F6' },
  { value: 'cycle_count', label: 'Cycle Count', icon: 'fa-calculator', color: '#8B5CF6' },
  { value: 'adjustment', label: 'Adjustment', icon: 'fa-sliders', color: THEME.primaryLight },
];

const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4, color: THEME.textPrimary };
const hintStyle: React.CSSProperties = { fontSize: 11, color: THEME.textMuted, marginTop: 2 };

export default function InventoryPage({ inventory, selectedStore, storeObj, token, onRefresh, userRole, userType, stores, onStoreChange }: InventoryPageProps) {
  const isHQ = userType === 1;

  const [categories, setCategories] = useState<MerchantInventoryCategory[]>([]);
  const [selectedCat, setSelectedCat] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'stock' | 'ledger'>('stock');

  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<MerchantInventoryItem | null>(null);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [adjustingItem, setAdjustingItem] = useState<MerchantInventoryItem | null>(null);

  // Category form
  const [showCatForm, setShowCatForm] = useState(false);
  const [editingCat, setEditingCat] = useState<MerchantInventoryCategory | null>(null);
  const [catName, setCatName] = useState('');
  const [catSaving, setCatSaving] = useState(false);
  const [catError, setCatError] = useState('');

  // Item form fields
  const [name, setName] = useState('');
  const [stock, setStock] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [reorderLevel, setReorderLevel] = useState('');
  const [catId, setCatId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Adjust form fields
  const [adjType, setAdjType] = useState('received');
  const [adjQty, setAdjQty] = useState('');
  const [adjNote, setAdjNote] = useState('');
  const [adjFile, setAdjFile] = useState<File | null>(null);
  const [savingAdj, setSavingAdj] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Fetch categories
  useEffect(() => {
    if (selectedStore === 'all') return;
    apiFetch(`/stores/${selectedStore}/inventory-categories`, token)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const cats = Array.isArray(data) ? data : [];
        setCategories(cats);
      })
      .catch(() => {});
  }, [selectedStore, token, inventory]); // refresh when inventory changes

  const filteredItems = selectedCat ? inventory.filter(i => i.category_id === selectedCat) : inventory;

  // --- Category CRUD ---
  function openCreateCat() { setEditingCat(null); setCatName(''); setCatError(''); setShowCatForm(true); }
  function openEditCat(c: MerchantInventoryCategory) { setEditingCat(c); setCatName(c.name); setCatError(''); setShowCatForm(true); }
  function closeCatForm() { setShowCatForm(false); setEditingCat(null); setCatError(''); }

  async function handleCatSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCatSaving(true); setCatError('');
    const slug = catName.toLowerCase().replace(/\s+/g, '-');
    try {
      const res = editingCat
        ? await apiFetch(`/stores/${selectedStore}/inventory-categories/${editingCat.id}`, token, { method: 'PUT', body: JSON.stringify({ name: catName, slug, display_order: editingCat.display_order }) })
        : await apiFetch(`/stores/${selectedStore}/inventory-categories`, token, { method: 'POST', body: JSON.stringify({ name: catName, slug, display_order: 0 }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setCatError(d.detail || 'Failed'); return; }
      closeCatForm();
      onRefresh();
    } catch { setCatError('Network error'); } finally { setCatSaving(false); }
  }

  // --- Item CRUD ---
  function openCreate() {
    setEditingItem(null);
    setName(''); setStock(''); setUnit('pcs'); setReorderLevel('');
    setCatId(categories.length > 0 ? categories[0].id : null);
    setError(''); setShowForm(true);
  }
  function openEdit(item: MerchantInventoryItem) {
    setEditingItem(item);
    setName(item.name);
    setStock(String(item.current_stock));
    setUnit(item.unit);
    setReorderLevel(String(item.reorder_level));
    setCatId(item.category_id);
    setError(''); setShowForm(true);
  }
  function closeForm() { setShowForm(false); setEditingItem(null); setError(''); }
  function openAdjust(item: MerchantInventoryItem) { setAdjustingItem(item); setAdjType('received'); setAdjQty(''); setAdjNote(''); setAdjFile(null); setError(''); }
  function closeAdjust() { setAdjustingItem(null); setError(''); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError('');
    const payload = {
      name, current_stock: parseFloat(stock) || 0, unit,
      reorder_level: parseFloat(reorderLevel) || 0,
      category_id: catId,
    };
    try {
      const res = editingItem
        ? await apiFetch(`/stores/${selectedStore}/inventory/${editingItem.id}`, token, { method: 'PUT', body: JSON.stringify(payload) })
        : await apiFetch(`/stores/${selectedStore}/inventory`, token, { method: 'POST', body: JSON.stringify(payload) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.detail || `Failed (${res.status})`); return; }
      closeForm(); onRefresh();
    } catch (err: any) { setError(err.message || 'Network error'); } finally { setSaving(false); }
  }

  async function handleToggle(item: MerchantInventoryItem) {
    setError('');
    try {
      const res = await apiFetch(`/stores/${selectedStore}/inventory/${item.id}/toggle`, token, { method: 'PATCH' });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.detail || 'Toggle failed'); return; }
      onRefresh();
    } catch (err: any) { setError(err.message || 'Network error'); }
  }

  async function handleDelete(id: number) {
    try {
      const res = await apiFetch(`/stores/${selectedStore}/inventory/${id}`, token, { method: 'DELETE' });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.detail || 'Delete failed'); return; }
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
        const upRes = await fetch('/api/v1/upload/document', { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData });
        if (upRes.ok) { const d = await upRes.json(); attachmentPath = d.url; }
      } catch {}
    }
    try {
      const res = await apiFetch(`/stores/${selectedStore}/inventory/${adjustingItem.id}/adjust`, token, {
        method: 'POST',
        body: JSON.stringify({ movement_type: adjType, quantity: parseFloat(adjQty), note: adjNote, attachment_path: attachmentPath }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.detail || `Failed (${res.status})`); return; }
      closeAdjust(); onRefresh();
    } catch (err: any) { setError(err.message || 'Network error'); } finally { setSavingAdj(false); }
  }

  const physicalStores = stores.filter(s => String(s.id) !== '0');

  return (
    <div>
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
        {selectedStore !== 'all' && isHQ && activeTab === 'stock' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={openCreateCat}><i className="fas fa-folder-plus"></i> Add Category</button>
            <button className="btn btn-primary" onClick={openCreate}><i className="fas fa-plus"></i> New Ingredient</button>
          </div>
        )}
      </div>

      {selectedStore === 'all' && (
        <div className="card" style={{ textAlign: 'center', padding: 60, color: THEME.textMuted, marginTop: 40 }}>
          <i className="fas fa-boxes-stacked" style={{ fontSize: 48, marginBottom: 16 }}></i>
          <p style={{ fontSize: 16 }}>Select a store to view its inventory</p>
        </div>
      )}

      {selectedStore !== 'all' && (<>

      {/* Tab Navigation */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: `1px solid ${THEME.border}` }}>
        <button
          onClick={() => setActiveTab('stock')}
          style={{
            padding: '12px 20px',
            border: 'none',
            borderBottom: `2px solid ${activeTab === 'stock' ? THEME.primary : 'transparent'}`,
            background: 'transparent',
            color: activeTab === 'stock' ? THEME.primary : THEME.textMuted,
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          <i className="fas fa-boxes-stacked" style={{ marginRight: 8 }}></i>
          Stock
        </button>
        <button
          onClick={() => setActiveTab('ledger')}
          style={{
            padding: '12px 20px',
            border: 'none',
            borderBottom: `2px solid ${activeTab === 'ledger' ? THEME.primary : 'transparent'}`,
            background: 'transparent',
            color: activeTab === 'ledger' ? THEME.primary : THEME.textMuted,
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          <i className="fas fa-clock-rotate-left" style={{ marginRight: 8 }}></i>
          Ledger
        </button>
      </div>

      {error && !showForm && !adjustingItem && (
        <div style={{ background: '#FEF2F2', color: '#991B1B', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          <i className="fas fa-exclamation-circle"></i> {error}
        </div>
      )}

      {activeTab === 'ledger' ? (
      <InventoryLedgerPage
        selectedStore={selectedStore}
        storeObj={undefined}
        token={token}
        stores={stores}
        onStoreChange={onStoreChange || (() => {})}
        fromDate={fromDate}
        toDate={toDate}
        onDateChange={(from, to) => { setFromDate(from); setToDate(to); }}
      />
      ) : (

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 24 }}>
        {/* Category Sidebar */}
        <div>
          {showCatForm && isHQ && (
            <div style={{ background: THEME.bgMuted, borderRadius: 12, padding: 12, marginBottom: 12, border: `1px solid ${THEME.accentLight}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <strong style={{ fontSize: 13 }}>{editingCat ? 'Edit Category' : 'New Category'}</strong>
                <button className="btn btn-sm" onClick={closeCatForm} style={{ padding: '2px 6px' }}><i className="fas fa-times"></i></button>
              </div>
              {catError && <div style={{ background: '#FEF2F2', color: '#991B1B', padding: '4px 8px', borderRadius: 6, marginBottom: 8, fontSize: 12 }}>{catError}</div>}
              <form onSubmit={handleCatSubmit}>
                <input value={catName} onChange={e => setCatName(e.target.value)} required placeholder="Category name" style={{ marginBottom: 6, fontSize: 13 }} autoFocus />
                <button type="submit" className="btn btn-sm btn-primary" disabled={catSaving} style={{ width: '100%', justifyContent: 'center' }}>
                  {catSaving ? '...' : editingCat ? 'Update' : 'Create'}
                </button>
              </form>
            </div>
          )}

          <div className="card">
            <h4 style={{ marginBottom: 12 }}>Categories</h4>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              <li>
                  <div
                    onClick={() => setSelectedCat(null)}
                    style={{
                      padding: '8px 12px', borderRadius: 10, cursor: 'pointer', marginBottom: 4,
                      background: selectedCat === null ? THEME.bgMuted : 'transparent',
                      fontWeight: selectedCat === null ? 600 : 400, color: THEME.textPrimary,
                    }}
                  >
                  All Items ({inventory.length})
                </div>
              </li>
              {categories.map(c => (
                <li key={c.id}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 10, marginBottom: 4, cursor: 'pointer', background: selectedCat === c.id ? THEME.bgMuted : 'transparent', fontWeight: selectedCat === c.id ? 600 : 400, color: c.is_active ? THEME.textPrimary : THEME.textMuted, opacity: c.is_active ? 1 : 0.6 }}>
                    <span style={{ flex: 1 }} onClick={() => setSelectedCat(c.id)}>
                      {c.name}
                      {!c.is_active && <span style={{ fontSize: 10, marginLeft: 6, color: '#EF4444' }}>Inactive</span>}
                    </span>
                    {isHQ && (
                      <button onClick={(e) => { e.stopPropagation(); openEditCat(c); }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: THEME.textMuted, fontSize: 11, padding: '2px 4px' }}><i className="fas fa-edit"></i></button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Items Section */}
        <div>
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
                    <Select
                      value={unit}
                      onChange={(val) => setUnit(val)}
                      options={UNITS.map(u => ({ value: u, label: u }))}
                    />
                    <div style={hintStyle}>Measurement unit</div>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={labelStyle}>Reorder Level <span style={{ fontWeight: 400, color: THEME.textMuted }}>(blank = never)</span></label>
                    <input type="number" step="0.01" value={reorderLevel} onChange={e => setReorderLevel(e.target.value)} placeholder="e.g. 5" />
                    <div style={hintStyle}>Alert when stock drops below this level</div>
                  </div>
                  <div>
                    <label style={labelStyle}>Category</label>
                    <Select
                      value={catId ? String(catId) : ''}
                      onChange={(val) => setCatId(val ? Number(val) : null)}
                      options={[{ value: '', label: '— No Category —' }, ...categories.filter(c => c.is_active).map(c => ({ value: String(c.id), label: c.name }))]}
                    />
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

          {/* Adjust Inventory Form */}
          {adjustingItem && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h4 style={{ margin: 0 }}>Adjust: {adjustingItem.name}</h4>
                <button className="btn btn-sm" onClick={closeAdjust}><i className="fas fa-times"></i></button>
              </div>
              <div style={{ fontSize: 13, color: THEME.primaryLight, marginBottom: 12 }}>Current balance: <strong>{adjustingItem.current_stock} {adjustingItem.unit}</strong></div>
              {error && (
                <div style={{ background: '#FEF2F2', color: '#991B1B', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
                  <i className="fas fa-exclamation-circle"></i> {error}
                </div>
              )}
              <form onSubmit={handleAdjust}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={labelStyle}>Movement Type *</label>
                    <Select
                      value={adjType}
                      onChange={(val) => setAdjType(val)}
                      options={MOVEMENT_TYPES.map(m => ({ value: m.value, label: m.label }))}
                    />
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
                  <label style={labelStyle}>Attachment <span style={{ fontWeight: 400, color: THEME.textMuted }}>(optional)</span></label>
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

          {/* Stats Bar */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 16px',
            background: THEME.bgMuted,
            borderRadius: `${THEME.radius.md} ${THEME.radius.md} 0 0`,
            border: `1px solid ${THEME.border}`,
            borderBottom: 'none',
            marginTop: 20,
          }}>
            <div style={{ fontSize: 14, color: THEME.textSecondary }}>
              <i className="fas fa-boxes-stacked" style={{ marginRight: 8, color: THEME.primary }}></i>
              Showing <strong style={{ color: THEME.textPrimary }}>{filteredItems.length}</strong> of <strong style={{ color: THEME.textPrimary }}>{inventory.length}</strong> items
            </div>
          </div>

          {/* Table */}
          <div style={{
            overflowX: 'auto',
            borderRadius: `0 0 ${THEME.radius.md} ${THEME.radius.md}`,
            background: THEME.bgCard,
            border: `1px solid ${THEME.border}`,
            borderTop: 'none',
          }}>
            <table>
              <thead>
                <tr><th>Ingredient</th><th>Category</th><th>Balance</th><th>Unit</th><th>Reorder Level</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', color: THEME.textMuted, padding: 40 }}>
                    <i className="fas fa-boxes-stacked" style={{ fontSize: 40, display: 'block', marginBottom: 12 }}></i>
                    No inventory items yet.
                  </td></tr>
                ) : filteredItems.map(item => {
                  const isLow = item.current_stock <= item.reorder_level && item.is_active;
                  return (
                    <tr key={item.id} style={{ opacity: item.is_active ? 1 : 0.5 }}>
                      <td style={{ fontWeight: 500 }}>
                        {item.name}
                        {!item.is_active && <span style={{ marginLeft: 8, fontSize: 11, color: '#EF4444', fontWeight: 500 }}>Inactive</span>}
                      </td>
                      <td style={{ fontSize: 13 }}>{item.category_name || '—'}</td>
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
                                <i className={`fas ${item.is_active ? 'fa-toggle-on' : 'fa-toggle-off'}`} style={{ color: item.is_active ? THEME.success : THEME.primaryLight }}></i>
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
      </div>
      )}
    </>)}
    </div>
  );
}
