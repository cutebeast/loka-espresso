'use client';

import { useState, useEffect } from 'react';
import { apiFetch, apiUpload } from '@/lib/merchant-api';
import { StoreSelector, Select } from '@/components/ui';
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


export default function InventoryPage({ inventory, selectedStore, storeObj: _storeObj, token, onRefresh, userRole: _userRole, userType, stores, onStoreChange }: InventoryPageProps) {
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
    apiFetch(`/stores/${selectedStore}/inventory-categories`)
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
        ? await apiFetch(`/stores/${selectedStore}/inventory-categories/${editingCat.id}`, undefined, { method: 'PUT', body: JSON.stringify({ name: catName, slug, display_order: editingCat.display_order }) })
        : await apiFetch(`/stores/${selectedStore}/inventory-categories`, undefined, { method: 'POST', body: JSON.stringify({ name: catName, slug, display_order: 0 }) });
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
        ? await apiFetch(`/stores/${selectedStore}/inventory/${editingItem.id}`, undefined, { method: 'PUT', body: JSON.stringify(payload) })
        : await apiFetch(`/stores/${selectedStore}/inventory`, undefined, { method: 'POST', body: JSON.stringify(payload) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.detail || `Failed (${res.status})`); return; }
      closeForm(); onRefresh();
    } catch (err: any) { setError(err.message || 'Network error'); } finally { setSaving(false); }
  }

  async function handleToggle(item: MerchantInventoryItem) {
    setError('');
    try {
      const res = await apiFetch(`/stores/${selectedStore}/inventory/${item.id}/toggle`, undefined, { method: 'PATCH' });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.detail || 'Toggle failed'); return; }
      onRefresh();
    } catch (err: any) { setError(err.message || 'Network error'); }
  }

  async function handleDelete(id: number) {
    try {
      const res = await apiFetch(`/stores/${selectedStore}/inventory/${id}`, undefined, { method: 'DELETE' });
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
        const upRes = await apiUpload('/upload/document', formData);
        if (upRes.ok) { const d = await upRes.json(); attachmentPath = d.url; }
      } catch {}
    }
    try {
      const res = await apiFetch(`/stores/${selectedStore}/inventory/${adjustingItem.id}/adjust`, undefined, {
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
      <div className="ip-0">
        <div className="ip-1">
          <StoreSelector
            stores={physicalStores}
            selectedStore={selectedStore === 'all' ? '' : selectedStore}
            onChange={onStoreChange}
            showAllOption={false}
            placeholder="Select a store..."
          />
        </div>
        {selectedStore !== 'all' && isHQ && activeTab === 'stock' && (
          <div className="ip-2">
            <button className="btn ip-3" onClick={openCreateCat} ><i className="fas fa-folder-plus"></i> Add Category</button>
            <button className="btn btn-primary ip-4" onClick={openCreate} ><i className="fas fa-plus"></i> New Ingredient</button>
          </div>
        )}
      </div>

      {selectedStore === 'all' && (
        <div className="card ip-5" >
          <span className="ip-6"><i className="fas fa-boxes-stacked"></i></span>
          <p className="ip-7">Select a store to view its inventory</p>
        </div>
      )}

      {selectedStore !== 'all' && (<>

      {/* Tab Navigation */}
      <div className="ip-8">
        <button
          onClick={() => setActiveTab('stock')}
          className={`ip-tab ${activeTab === 'stock' ? 'ip-tab-active' : 'ip-tab-inactive'}`}
        >
          <span className="ip-9"><i className="fas fa-boxes-stacked"></i></span>
          Stock
        </button>
        <button
          onClick={() => setActiveTab('ledger')}
          className={`ip-tab ${activeTab === 'ledger' ? 'ip-tab-active' : 'ip-tab-inactive'}`}
        >
          <span className="ip-10"><i className="fas fa-clock-rotate-left"></i></span>
          Ledger
        </button>
      </div>

      {error && !showForm && !adjustingItem && (
        <div className="ip-11">
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

      <div  className="inventory-grid ip-12">
        {/* Category Sidebar */}
        <div>
          {showCatForm && isHQ && (
            <div className="ip-13">
              <div className="ip-14">
                <strong className="ip-15">{editingCat ? 'Edit Category' : 'New Category'}</strong>
                <button className="btn btn-sm ip-16" onClick={closeCatForm} ><i className="fas fa-times"></i></button>
              </div>
              {catError && <div className="ip-17">{catError}</div>}
              <form onSubmit={handleCatSubmit}>
                <input value={catName} onChange={e => setCatName(e.target.value)} required placeholder="Category name" className="ip-18" autoFocus />
                <button type="submit" className="btn btn-sm btn-primary ip-19" disabled={catSaving} >
                  {catSaving ? '...' : editingCat ? 'Update' : 'Create'}
                </button>
              </form>
            </div>
          )}

          <div className="card">
            <h4 className="ip-20">Categories</h4>
            <ul className="ip-21">
              <li>
                <div
                  onClick={() => setSelectedCat(null)}
                  className={`ip-cat-item ${selectedCat === null ? 'ip-cat-selected' : 'ip-cat-normal'}`}
                >
                  All
                </div>
              </li>
              {categories.map(c => (
                <li key={c.id}>
                    <div className={`ip-cat-item-flex ${selectedCat === c.id ? 'ip-cat-selected' : 'ip-cat-normal'} ${c.is_active ? 'text-primary opacity-1' : 'text-muted opacity-0-6'}`}>
                    <span className="ip-22" onClick={() => setSelectedCat(c.id)}>
                      {c.name}
                      {!c.is_active && <span className="ip-23">Inactive</span>}
                    </span>
                    {isHQ && (
                      <button onClick={(e) => { e.stopPropagation(); openEditCat(c); }} className="ip-24"><i className="fas fa-edit"></i></button>
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
            <div className="card ip-25" >
              <div className="ip-26">
                <h4 className="ip-27">{editingItem ? `Edit: ${editingItem.name}` : 'New Ingredient'}</h4>
                <button className="btn btn-sm" onClick={closeForm}><i className="fas fa-times"></i></button>
              </div>
              {error && (
                <div className="ip-28">
                  <i className="fas fa-exclamation-circle"></i> {error}
                </div>
              )}
              <form onSubmit={handleSubmit}>
                <div  className="inventory-form-grid ip-29">
                  <div>
                    <label className="ip-label">Ingredient Name *</label>
                    <input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Arabica Coffee Beans" />
                    <div className="ip-hint">Name of the ingredient or supply item</div>
                  </div>
                  <div>
                    <label className="ip-label">Opening Stock *</label>
                    <input type="number" step="0.01" value={stock} onChange={e => setStock(e.target.value)} required />
                    <div className="ip-hint">Starting quantity on hand</div>
                  </div>
                  <div>
                    <label className="ip-label">Unit *</label>
                    <Select
                      value={unit}
                      onChange={(val) => setUnit(val)}
                      options={UNITS.map(u => ({ value: u, label: u }))}
                    />
                    <div className="ip-hint">Measurement unit</div>
                  </div>
                </div>
                <div  className="inventory-form-grid-2 ip-30">
                  <div>
                    <label className="ip-label">Reorder Level <span className="ip-31">(blank = never)</span></label>
                    <input type="number" step="0.01" value={reorderLevel} onChange={e => setReorderLevel(e.target.value)} placeholder="e.g. 5" />
                    <div className="ip-hint">Alert when stock drops below this level</div>
                  </div>
                  <div>
                    <label className="ip-label">Category</label>
                    <Select
                      value={catId ? String(catId) : ''}
                      onChange={(val) => setCatId(val ? Number(val) : null)}
                      options={[{ value: '', label: '— No Category —' }, ...categories.filter(c => c.is_active).map(c => ({ value: String(c.id), label: c.name }))]}
                    />
                    <div className="ip-hint">Group ingredients for filtering</div>
                  </div>
                </div>
                <div  className="inventory-form-actions ip-32">
                  <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving...' : editingItem ? 'Update' : 'Create'}</button>
                  <button type="button" className="btn" onClick={closeForm}>Cancel</button>
                </div>
              </form>
            </div>
          )}

          {/* Adjust Inventory Form */}
          {adjustingItem && (
            <div className="card ip-33" >
              <div className="ip-34">
                <h4 className="ip-35">Adjust: {adjustingItem.name}</h4>
                <button className="btn btn-sm" onClick={closeAdjust}><i className="fas fa-times"></i></button>
              </div>
              <div className="ip-36">Current balance: <strong>{adjustingItem.current_stock} {adjustingItem.unit}</strong></div>
              {error && (
                <div className="ip-37">
                  <i className="fas fa-exclamation-circle"></i> {error}
                </div>
              )}
              <form onSubmit={handleAdjust}>
                <div  className="inventory-form-grid ip-38">
                  <div>
                    <label className="ip-label">Movement Type *</label>
                    <Select
                      value={adjType}
                      onChange={(val) => setAdjType(val)}
                      options={MOVEMENT_TYPES.map(m => ({ value: m.value, label: m.label }))}
                    />
                    <div className="ip-hint">
                      {['waste', 'transfer_out'].includes(adjType) ? '⚠ This will DEDUCT from current balance' : 'This will ADD to current balance'}
                    </div>
                  </div>
                  <div>
                    <label className="ip-label">Quantity *</label>
                    <input type="number" step="0.01" value={adjQty} onChange={e => setAdjQty(e.target.value)} required placeholder="e.g. 5" min="0.01" />
                    <div className="ip-hint">Amount to add or deduct</div>
                  </div>
                  <div>
                    <label className="ip-label">Note / Reason *</label>
                    <input value={adjNote} onChange={e => setAdjNote(e.target.value)} required placeholder="e.g. Delivery from supplier" />
                    <div className="ip-hint">Required — explain why this adjustment</div>
                  </div>
                </div>
                <div className="ip-39">
                  <label className="ip-label">Attachment <span className="ip-40">(optional)</span></label>
                  <input type="file" accept="image/*,.pdf,.csv,.xlsx" onChange={e => setAdjFile(e.target.files?.[0] || null)} className="ip-41" />
                  <div className="ip-hint">Receipt, delivery note, or waste photo (max 10MB)</div>
                </div>
                <div  className="inventory-form-actions ip-42">
                  <button type="submit" className="btn btn-primary" disabled={savingAdj}>{savingAdj ? 'Processing...' : 'Submit Adjustment'}</button>
                  <button type="button" className="btn" onClick={closeAdjust}>Cancel</button>
                </div>
              </form>
            </div>
          )}

          {/* Stats Bar */}
          <div className="ip-43">
            <div className="ip-44">
              <span className="ip-45"><i className="fas fa-boxes-stacked"></i></span>
              Showing <strong className="ip-46">{filteredItems.length}</strong> of <strong className="ip-47">{inventory.length}</strong> items
            </div>
          </div>

          {/* Table */}
          <div className="ip-48">
            <table className="inventory-table">
              <thead>
                <tr><th>Ingredient</th><th>Category</th><th>Balance</th><th>Unit</th><th>Reorder Level</th><th>Status</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {filteredItems.length === 0 ? (
                  <tr><td colSpan={7} className="ip-49">
                    <span className="ip-50"><i className="fas fa-boxes-stacked"></i></span>
                    No inventory items yet.
                  </td></tr>
                ) : filteredItems.map(item => {
                  const isLow = item.current_stock <= item.reorder_level && item.is_active;
                  return (
                    <tr key={item.id} className={item.is_active ? 'opacity-1' : 'opacity-0-5'}>
                      <td className="ip-51">
                        {item.name}
                        {!item.is_active && <span className="ip-52">Inactive</span>}
                      </td>
                      <td className="ip-53">{item.category_name || '—'}</td>
                      <td><strong>{item.current_stock}</strong></td>
                      <td>{item.unit}</td>
                      <td>{item.reorder_level}</td>
                      <td><span className={`badge ${!item.is_active ? 'badge-gray' : isLow ? 'badge-yellow' : 'badge-green'}`}>{!item.is_active ? 'Inactive' : isLow ? 'Low' : 'OK'}</span></td>
                      <td>
                        <div  className="inventory-actions ip-54">
                          <button className="btn btn-sm" onClick={() => openAdjust(item)} title="Adjust qty"><i className="fas fa-right-left"></i></button>
                          {isHQ && (
                            <>
                              <button className="btn btn-sm" onClick={() => handleToggle(item)} title={item.is_active ? 'Deactivate' : 'Activate'}>
                                <i className={`fas ${item.is_active ? 'fa-toggle-on' : 'fa-toggle-off'} ${item.is_active ? 'text-success' : 'text-primary-light'}`}></i>
                              </button>
                              <button className="btn btn-sm" onClick={() => openEdit(item)} title="Edit"><i className="fas fa-edit"></i></button>
                              {confirmDelete === item.id ? (
                                <>
                                  <button className="btn btn-sm ip-55"  onClick={() => handleDelete(item.id)}>Confirm</button>
                                  <button className="btn btn-sm" onClick={() => setConfirmDelete(null)}>Cancel</button>
                                </>
                              ) : (
                                <button className="btn btn-sm ip-56"  onClick={() => setConfirmDelete(item.id)} title="Delete"><i className="fas fa-trash"></i></button>
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
