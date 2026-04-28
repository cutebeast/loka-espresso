'use client';

import { useState, useEffect } from 'react';
import { apiFetch, apiUpload } from '@/lib/merchant-api';
import { StoreSelector, Select, Modal, Button, Drawer, DataTable } from '@/components/ui';
import type { ColumnDef } from '@/components/ui';
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
  const activeStoreId = selectedStore !== 'all' && selectedStore ? selectedStore : '';

  const [categories, setCategories] = useState<MerchantInventoryCategory[]>([]);
  const [selectedCat, setSelectedCat] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'stock' | 'ledger'>('stock');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  // Category form
  const [catModal, setCatModal] = useState(false);
  const [editingCat, setEditingCat] = useState<MerchantInventoryCategory | null>(null);
  const [catName, setCatName] = useState('');
  const [catSaving, setCatSaving] = useState(false);
  const [catError, setCatError] = useState('');

  // Item form
  const [itemModal, setItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MerchantInventoryItem | null>(null);
  const [name, setName] = useState('');
  const [stock, setStock] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [reorderLevel, setReorderLevel] = useState('');
  const [catId, setCatId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Adjust form
  const [adjModal, setAdjModal] = useState(false);
  const [adjustingItem, setAdjustingItem] = useState<MerchantInventoryItem | null>(null);
  const [adjType, setAdjType] = useState('received');
  const [adjQty, setAdjQty] = useState('');
  const [adjNote, setAdjNote] = useState('');
  const [adjFile, setAdjFile] = useState<File | null>(null);
  const [savingAdj, setSavingAdj] = useState(false);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Fetch categories
  useEffect(() => {
    if (!activeStoreId) return;
    apiFetch(`/admin/stores/${activeStoreId}/inventory-categories`)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        const cats = Array.isArray(data) ? data : (data.items || []);
        setCategories(cats);
      })
      .catch(() => {});
  }, [selectedStore, token, inventory]);

  const filteredItems = selectedCat ? inventory.filter(i => i.category_id === selectedCat) : inventory;

  // --- Category CRUD ---
  function openCreateCat() { setEditingCat(null); setCatName(''); setCatError(''); setCatModal(true); }
  function openEditCat(c: MerchantInventoryCategory) { setEditingCat(c); setCatName(c.name); setCatError(''); setCatModal(true); }
  function closeCatModal() { setCatModal(false); setEditingCat(null); setCatError(''); }

  async function handleCatSubmit() {
    setCatSaving(true); setCatError('');
    const slug = catName.toLowerCase().replace(/\s+/g, '-');
    try {
      const res = editingCat
        ? await apiFetch(`/admin/stores/${activeStoreId}/inventory-categories/${editingCat.id}`, undefined, { method: 'PUT', body: JSON.stringify({ name: catName, slug, display_order: editingCat.display_order }) })
        : await apiFetch(`/admin/stores/${activeStoreId}/inventory-categories`, undefined, { method: 'POST', body: JSON.stringify({ name: catName, slug, display_order: 0 }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setCatError(d.detail || 'Failed'); return; }
      closeCatModal();
      onRefresh();
    } catch { setCatError('Network error'); } finally { setCatSaving(false); }
  }

  // --- Item CRUD ---
  function openCreate() { setEditingItem(null); setName(''); setStock(''); setUnit('pcs'); setReorderLevel(''); setCatId(selectedCat); setError(''); setItemModal(true); }
  function openEdit(i: MerchantInventoryItem) { setEditingItem(i); setName(i.name); setStock(String(i.current_stock)); setUnit(i.unit); setReorderLevel(String(i.reorder_level)); setCatId(i.category_id); setError(''); setItemModal(true); }
  function closeItemModal() { setItemModal(false); setEditingItem(null); setError(''); }

  async function handleSubmit() {
    setSaving(true); setError('');
    try {
      const body = JSON.stringify({ name, current_stock: parseFloat(stock), unit, reorder_level: parseFloat(reorderLevel) || 0, category_id: catId });
      const res = editingItem
        ? await apiFetch(`/admin/stores/${activeStoreId}/inventory/${editingItem.id}`, undefined, { method: 'PUT', body })
        : await apiFetch(`/admin/stores/${activeStoreId}/inventory`, undefined, { method: 'POST', body });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.detail || `Failed (${res.status})`); return; }
      closeItemModal(); onRefresh();
    } catch (err: any) { setError(err.message || 'Network error'); } finally { setSaving(false); }
  }

  async function handleToggle(item: MerchantInventoryItem) {
    try {
      const res = await apiFetch(`/admin/stores/${activeStoreId}/inventory/${item.id}/toggle`, undefined, { method: 'PATCH', body: JSON.stringify({ is_active: !item.is_active }) });
      if (res.ok) onRefresh();
    } catch { console.error('Failed to toggle inventory item'); }
  }

  async function handleDelete(id: number) {
    try {
      const res = await apiFetch(`/admin/stores/${activeStoreId}/inventory/${id}`, undefined, { method: 'DELETE' });
      if (res.ok) { setConfirmDelete(null); onRefresh(); }
    } catch { console.error('Failed to toggle inventory item'); }
  }

  // --- Adjust ---
  function openAdjust(item: MerchantInventoryItem) { setAdjustingItem(item); setAdjType('received'); setAdjQty(''); setAdjNote(''); setAdjFile(null); setError(''); setAdjModal(true); }
  function closeAdjust() { setAdjModal(false); setAdjustingItem(null); setError(''); }

  async function handleAdjust() {
    if (!adjustingItem) return;
    setSavingAdj(true); setError('');
    let attachmentPath: string | null = null;
    if (adjFile) {
      try {
        const formData = new FormData();
        formData.append('file', adjFile);
        const upRes = await apiUpload('/upload/document', formData);
        if (upRes.ok) { const d = await upRes.json(); attachmentPath = d.url; }
      } catch { console.error('Failed to toggle inventory item'); }
    }
    try {
      const res = await apiFetch(`/admin/stores/${activeStoreId}/inventory/${adjustingItem.id}/adjust`, undefined, {
        method: 'POST',
        body: JSON.stringify({ movement_type: adjType, quantity: parseFloat(adjQty), note: adjNote, attachment_path: attachmentPath }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.detail || `Failed (${res.status})`); return; }
      closeAdjust(); onRefresh();
    } catch (err: any) { setError(err.message || 'Network error'); } finally { setSavingAdj(false); }
  }

  const physicalStores = stores.filter(s => String(s.id) !== '0');

  const columns: ColumnDef<MerchantInventoryItem>[] = [
    {
      key: 'name',
      header: 'Ingredient',
      render: (item) => (
        <div>
          <div>{item.name}{!item.is_active && <span className="ip-52"> Inactive</span>}</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{item.category_name || '—'}</div>
        </div>
      ),
    },
    {
      key: 'current_stock',
      header: 'Stock',
      render: (item) => (
        <div>
          <div><strong>{item.current_stock}</strong> {item.unit}</div>
          <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>Reorder: {item.reorder_level || '—'}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (item) => {
        const isLow = item.current_stock <= item.reorder_level && item.is_active;
        const badgeClass = !item.is_active ? 'badge-gray' : isLow ? 'badge-yellow' : 'badge-green';
        const label = !item.is_active ? 'Inactive' : isLow ? 'Low' : 'OK';
        return <span className={`badge ${badgeClass}`}>{label}</span>;
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (item) => (
        <div className="inventory-actions ip-54">
          <button className="btn btn-sm" onClick={() => openAdjust(item)} title="Adjust qty"><i className="fas fa-right-left"></i></button>
          {isHQ && (<>
            <button className="btn btn-sm" onClick={() => handleToggle(item)} title={item.is_active ? 'Deactivate' : 'Activate'}>
              <i className={`fas ${item.is_active ? 'fa-toggle-on' : 'fa-toggle-off'} ${item.is_active ? 'text-success' : 'text-primary-light'}`}></i>
            </button>
            <button className="btn btn-sm" onClick={() => openEdit(item)} title="Edit"><i className="fas fa-edit"></i></button>
            {confirmDelete === item.id ? (<>
              <button className="btn btn-sm ip-55" onClick={() => handleDelete(item.id)}>Confirm</button>
              <button className="btn btn-sm" onClick={() => setConfirmDelete(null)}>Cancel</button>
            </>) : (
              <button className="btn btn-sm ip-56" onClick={() => setConfirmDelete(item.id)} title="Delete"><i className="fas fa-trash"></i></button>
            )}
          </>)}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="invp-0">
        <div className="invp-1">
          <StoreSelector
            stores={physicalStores}
            selectedStore={activeStoreId}
            onChange={onStoreChange}
            showAllOption={false}
            placeholder="Select a store..."
          />
        </div>
      </div>

      {!activeStoreId && (
        <div className="card ip-5">
          <span className="ip-6"><i className="fas fa-boxes-stacked"></i></span>
          <p className="ip-7">Select a store to view its inventory</p>
        </div>
      )}

      {activeStoreId && (<> 
      {/* Tab Navigation */}
      <div className="ip-8">
        <button onClick={() => setActiveTab('stock')} className={`ip-tab ${activeTab === 'stock' ? 'ip-tab-active' : 'ip-tab-inactive'}`}>
          <span className="ip-9"><i className="fas fa-boxes-stacked"></i></span> Stock
        </button>
        <button onClick={() => setActiveTab('ledger')} className={`ip-tab ${activeTab === 'ledger' ? 'ip-tab-active' : 'ip-tab-inactive'}`}>
          <span className="ip-10"><i className="fas fa-clock-rotate-left"></i></span> Ledger
        </button>
      </div>

      {error && !itemModal && !adjModal && (
        <div className="ip-11"><i className="fas fa-exclamation-circle"></i> {error}</div>
      )}

      {activeTab === 'ledger' ? (
        <InventoryLedgerPage
          selectedStore={activeStoreId}
          storeObj={undefined}
          token={token}
          stores={stores}
          onStoreChange={onStoreChange || (() => {})}
          fromDate={fromDate}
          toDate={toDate}
          onDateChange={(from, to) => { setFromDate(from); setToDate(to); }}
        />
      ) : (
      <>
      {/* Mobile sidebar toggle */}
      <div className="inv-mobile-toggle">
        <button className="btn btn-sm" onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}>
          <i className={`fas fa-${mobileSidebarOpen ? 'times' : 'bars'}`}></i> Categories
        </button>
      </div>

      {isHQ && (<div className="inv-toolbar">
        <Button variant="ghost" size="sm" onClick={openCreateCat}>
          <i className="fas fa-folder-plus"></i> Add Category
        </Button>
        <Button variant="primary" size="sm" onClick={openCreate}>
          <i className="fas fa-plus"></i> Add Stock
        </Button>
      </div>)}

      <div className="inventory-grid ip-12">
        {/* Category Sidebar */}
        <div className={`inv-sidebar ${mobileSidebarOpen ? 'inv-sidebar-open' : ''}`}>
          <div className="card">
            <h4 className="ip-20">Categories</h4>
            <ul className="ip-21">
              <li>
                <div onClick={() => { setSelectedCat(null); setMobileSidebarOpen(false); }} className={`ip-cat-item ${selectedCat === null ? 'ip-cat-selected' : 'ip-cat-normal'}`}>
                  All
                </div>
              </li>
              {categories.map(c => (
                <li key={c.id}>
                  <div className={`ip-cat-item-flex ${selectedCat === c.id ? 'ip-cat-selected' : 'ip-cat-normal'} ${c.is_active ? 'text-primary opacity-1' : 'text-muted opacity-0-6'}`}>
                    <span className="ip-22" onClick={() => { setSelectedCat(c.id); setMobileSidebarOpen(false); }}>
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
          {/* Stats Bar */}
          <div className="ip-43">
            <div className="ip-44">
              <span className="ip-45"><i className="fas fa-boxes-stacked"></i></span>
              Showing <strong className="ip-46">{filteredItems.length}</strong> of <strong className="ip-47">{inventory.length}</strong> items
            </div>
            <div className="invp-stats-info">
              {selectedCat ? 'Filtered by category' : 'All categories'}
            </div>
          </div>

          {/* Table */}
          <div className="ip-48">
            <DataTable
              data={filteredItems}
              columns={columns}
              emptyMessage="No inventory items yet."
            />
          </div>
        </div>
      </div>
      </>)}
      </>)}

      {/* ── Modals ── */}
      <Modal isOpen={catModal} onClose={closeCatModal} title={editingCat ? 'Edit Category' : 'New Category'}>
        {catError && <div className="ip-17">{catError}</div>}
        <div>
          <input value={catName} onChange={e => setCatName(e.target.value)} required placeholder="Category name" className="ip-18" autoFocus />
          <div className="inventory-form-actions ip-32" style={{marginTop:12}}>
            <button className="btn btn-primary" disabled={catSaving} onClick={handleCatSubmit}>{catSaving ? '...' : editingCat ? 'Update' : 'Create'}</button>
            <button className="btn" onClick={closeCatModal}>Cancel</button>
          </div>
        </div>
      </Modal>

      <Drawer isOpen={itemModal} onClose={closeItemModal} title={editingItem ? `Edit: ${editingItem.name}` : 'New Ingredient'}>
        {error && <div className="ip-28"><i className="fas fa-exclamation-circle"></i> {error}</div>}
        <div className="df-section">
          <div className="df-grid">
            <div className="df-field">
              <label className="df-label">Stock Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Arabica Coffee Beans" />
              <div className="df-hint">Name of the ingredient or supply item</div>
            </div>
            <div className="df-field">
              <label className="df-label">Unit *</label>
              <Select value={unit} onChange={(val) => setUnit(val)} options={UNITS.map(u => ({ value: u, label: u }))} />
              <div className="df-hint">Measurement unit</div>
            </div>
          </div>
          <div className="df-grid-2-wide-short">
            <div className="df-field">
              <label className="df-label">Category</label>
              <Select value={catId ? String(catId) : ''} onChange={(val) => setCatId(val ? Number(val) : null)} options={[{ value: '', label: '— No Category —' }, ...categories.filter(c => c.is_active).map(c => ({ value: String(c.id), label: c.name }))]} />
              <div className="df-hint">Group ingredients for filtering</div>
            </div>
          </div>
          <div className="df-grid">
            <div className="df-field">
              <label className="df-label">Opening Stock *</label>
              <input type="number" step="0.01" value={stock} onChange={e => setStock(e.target.value)} required placeholder="0" />
              <div className="df-hint">Starting quantity on hand</div>
            </div>
            <div className="df-field">
              <label className="df-label">Reorder Level <span>(blank = never)</span></label>
              <input type="number" step="0.01" value={reorderLevel} onChange={e => setReorderLevel(e.target.value)} placeholder="e.g. 5" />
              <div className="df-hint">Low stock alert threshold</div>
            </div>
          </div>
        </div>
        <div className="df-actions">
          <button className="btn" onClick={closeItemModal}>Cancel</button>
          <button className="btn btn-primary" disabled={saving} onClick={handleSubmit}>{saving ? 'Saving...' : editingItem ? 'Update' : 'Create'}</button>
        </div>
      </Drawer>

      <Drawer isOpen={adjModal} onClose={closeAdjust} title={adjustingItem ? `Adjust: ${adjustingItem.name}` : 'Adjust Inventory'}>
        {adjustingItem && <div className="ip-36" style={{marginBottom:16}}>Current balance: <strong>{adjustingItem.current_stock} {adjustingItem.unit}</strong></div>}
        {error && <div className="ip-37"><i className="fas fa-exclamation-circle"></i> {error}</div>}
        <div className="df-section">
          <div className="df-grid">
            <div className="df-field">
              <label className="df-label">Movement Type *</label>
              <Select value={adjType} onChange={(val) => setAdjType(val)} options={MOVEMENT_TYPES.map(m => ({ value: m.value, label: m.label }))} />
              <div className="df-hint">{['waste', 'transfer_out'].includes(adjType) ? '⚠ This will DEDUCT from current balance' : 'This will ADD to current balance'}</div>
            </div>
            <div className="df-field">
              <label className="df-label">Quantity *</label>
              <input type="number" step="0.01" value={adjQty} onChange={e => setAdjQty(e.target.value)} required placeholder="e.g. 5" min="0.01" />
              <div className="df-hint">Amount to add or deduct</div>
            </div>
          </div>
          <div className="df-grid-2-wide-short">
            <div className="df-field">
              <label className="df-label">Note / Reason *</label>
              <input value={adjNote} onChange={e => setAdjNote(e.target.value)} required placeholder="e.g. Delivery from supplier" />
              <div className="df-hint">Required — explain why this adjustment</div>
            </div>
            <div className="df-field">
              <label className="df-label">Attachment <span>(optional)</span></label>
              <input type="file" accept="image/*,.pdf,.csv,.xlsx" onChange={e => setAdjFile(e.target.files?.[0] || null)} />
              <div className="df-hint">Receipt, delivery note, or waste photo</div>
            </div>
          </div>
        </div>
        <div className="df-actions">
          <button className="btn" onClick={closeAdjust}>Cancel</button>
          <button className="btn btn-primary" disabled={savingAdj} onClick={handleAdjust}>{savingAdj ? 'Processing...' : 'Submit Adjustment'}</button>
        </div>
      </Drawer>
    </div>
  );
}