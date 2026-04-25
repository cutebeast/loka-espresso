'use client';

import { useState } from 'react';
import { apiFetch, formatRM } from '@/lib/merchant-api';
import type { MerchantCategory, MerchantMenuItem, MerchantStore } from '@/lib/merchant-types';
import { Select } from '@/components/ui';
import { THEME } from '@/lib/theme';

interface MenuPageProps {
  categories: MerchantCategory[];
  menuItems: MerchantMenuItem[];
  selectedCategory: number | null;
  setSelectedCategory: (id: number | null) => void;
  selectedStore: string;
  storeObj: MerchantStore | undefined;
  token: string;
  onRefresh: () => void;
  onCustomizeItem: (item: MerchantMenuItem) => void;
  userRole?: string;
  userType?: number;
}

const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4, color: THEME.primary };
const hintStyle: React.CSSProperties = { fontSize: 11, color: THEME.success, marginTop: 2 };

export default function MenuPage({ categories, menuItems, selectedCategory, setSelectedCategory, selectedStore, storeObj: _storeObj, token: _token, onRefresh, onCustomizeItem, userType = 1 }: MenuPageProps) {
  const isHQ = userType === 1;
  // Menu is universal (HQ-managed) — no store_id needed for menu CRUD
  // Item form
  const [showItemForm, setShowItemForm] = useState(false);
  const [editingItem, setEditingItem] = useState<MerchantMenuItem | null>(null);
  const [itemError, setItemError] = useState('');
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<number | null>(null);

  // Category form
  const [showCatForm, setShowCatForm] = useState(false);
  const [editingCat, setEditingCat] = useState<MerchantCategory | null>(null);
  const [catError, setCatError] = useState('');
  const [confirmDeleteCat, setConfirmDeleteCat] = useState<number | null>(null);

  // Item fields
  const [itemName, setItemName] = useState('');
  const [itemDesc, setItemDesc] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemCatId, setItemCatId] = useState(0);
  const [itemAvailable, setItemAvailable] = useState(true);
  const [itemFeatured, setItemFeatured] = useState(false);
  const [savingItem, setSavingItem] = useState(false);

  // Category fields
  const [catName, setCatName] = useState('');
  const [catSlug, setCatSlug] = useState('');
  const [savingCat, setSavingCat] = useState(false);

  const filteredItems = selectedCategory ? menuItems.filter(i => i.category_id === selectedCategory) : menuItems;

  // --- Item CRUD ---
  function openCreateItem() {
    setEditingItem(null);
    setItemName('');
    setItemDesc('');
    setItemPrice('');
    setItemCatId(categories[0]?.id || 0);
    setItemAvailable(true);
    setItemFeatured(false);
    setItemError('');
    setShowItemForm(true);
  }

  function openEditItem(item: MerchantMenuItem) {
    setEditingItem(item);
    setItemName(item.name);
    setItemDesc(item.description || '');
    setItemPrice(String(item.base_price));
    setItemCatId(item.category_id);
    setItemAvailable(item.is_available);
    setItemFeatured(item.is_featured || false);
    setItemError('');
    setShowItemForm(true);
  }

  function closeItemForm() {
    setShowItemForm(false);
    setEditingItem(null);
    setItemError('');
  }

  async function handleItemSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSavingItem(true);
    setItemError('');

    const payload = {
      name: itemName,
      description: itemDesc,
      base_price: parseFloat(itemPrice),
      category_id: itemCatId,
      is_available: itemAvailable,
      is_featured: itemFeatured,
      display_order: editingItem?.display_order || 0,
    };

    try {
      const res = editingItem
        ? await apiFetch(`/admin/items/${editingItem.id}`, undefined, { method: 'PUT', body: JSON.stringify(payload) })
        : await apiFetch(`/admin/items`, undefined, { method: 'POST', body: JSON.stringify(payload) });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setItemError(data.detail || `Failed (${res.status})`);
        return;
      }
      closeItemForm();
      onRefresh();
    } catch (err: any) {
      setItemError(err.message || 'Network error');
    } finally { setSavingItem(false); }
  }

  async function toggleItemAvailable(item: MerchantMenuItem) {
    setItemError('');
    try {
      const res = await apiFetch(`/admin/items/${item.id}`, undefined, {
        method: 'PUT',
        body: JSON.stringify({ is_available: !item.is_available }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setItemError(data.detail || 'Failed to toggle');
        return;
      }
      onRefresh();
    } catch (err: any) {
      setItemError(err.message || 'Network error');
    }
  }

  async function deleteItem(id: number) {
    try {
      const res = await apiFetch(`/admin/items/${id}`, undefined, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setItemError(data.detail || 'Delete failed');
        return;
      }
      setConfirmDeleteItem(null);
      onRefresh();
    } catch { setItemError('Network error'); }
  }

  // --- Category CRUD ---
  function openCreateCat() {
    setEditingCat(null);
    setCatName('');
    setCatSlug('');
    setCatError('');
    setShowCatForm(true);
  }

  function openEditCat(cat: MerchantCategory) {
    setEditingCat(cat);
    setCatName(cat.name);
    setCatSlug(cat.slug);
    setCatError('');
    setShowCatForm(true);
  }

  function closeCatForm() {
    setShowCatForm(false);
    setEditingCat(null);
    setCatError('');
  }

  async function handleCatSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSavingCat(true);
    setCatError('');

    const slug = catSlug || catName.toLowerCase().replaceAll(' ', '-');

    try {
      const res = editingCat
        ? await apiFetch(`/admin/categories/${editingCat.id}`, undefined, {
            method: 'PUT',
            body: JSON.stringify({ name: catName, slug, display_order: editingCat.display_order }),
          })
        : await apiFetch(`/admin/categories`, undefined, {
            method: 'POST',
            body: JSON.stringify({ name: catName, slug, display_order: 0, is_active: true }),
          });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCatError(data.detail || `Failed (${res.status})`);
        return;
      }
      closeCatForm();
      onRefresh();
    } catch (err: any) {
      setCatError(err.message || 'Network error');
    } finally { setSavingCat(false); }
  }

  async function deleteCat(id: number) {
    try {
      const res = await apiFetch(`/admin/categories/${id}`, undefined, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCatError(data.detail || 'Delete failed');
        return;
      }
      setConfirmDeleteCat(null);
      onRefresh();
    } catch { setCatError('Network error'); }
  }

  if (selectedStore === 'all') {
    // Menu is universal — always load from store_id=0, no store selection needed
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ margin: 0 }}>Menu &middot; Universal (All Stores)</h3>
        {isHQ && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn" onClick={openCreateCat}><i className="fas fa-folder-plus"></i> Add Category</button>
            <button className="btn btn-primary" onClick={openCreateItem}><i className="fas fa-plus"></i> New Item</button>
          </div>
        )}
        {!isHQ && (
          <span style={{ color: THEME.success, fontSize: 13 }}><i className="fas fa-eye"></i> View only — contact admin to make changes</span>
        )}
      </div>

      {itemError && (
        <div style={{ background: '#FEF2F2', color: '#991B1B', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          <i className="fas fa-exclamation-circle"></i> {itemError}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 24 }}>
        {/* Categories sidebar */}
        <div>
          {/* Category inline form */}
          {showCatForm && isHQ && (
            <div style={{ background: THEME.bgMuted, borderRadius: 12, padding: 12, marginBottom: 12, border: `1px solid ${THEME.accentLight}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <strong style={{ fontSize: 13 }}>{editingCat ? 'Edit Category' : 'New Category'}</strong>
                <button className="btn btn-sm" onClick={closeCatForm} style={{ padding: '2px 6px' }}><i className="fas fa-times"></i></button>
              </div>
              {catError && (
                <div style={{ background: '#FEF2F2', color: '#991B1B', padding: '4px 8px', borderRadius: 6, marginBottom: 8, fontSize: 12 }}>{catError}</div>
              )}
              <form onSubmit={handleCatSubmit}>
                <input value={catName} onChange={e => { setCatName(e.target.value); if (!catSlug) setCatSlug(e.target.value.toLowerCase().replaceAll(' ', '-')); }} required placeholder="Category name" style={{ marginBottom: 6, fontSize: 13 }} />
                <input value={catSlug} onChange={e => setCatSlug(e.target.value)} placeholder="slug (auto)" style={{ marginBottom: 6, fontSize: 13 }} />
                <button type="submit" className="btn btn-sm btn-primary" disabled={savingCat} style={{ width: '100%', justifyContent: 'center' }}>
                  {savingCat ? '...' : editingCat ? 'Update' : 'Create'}
                </button>
              </form>
            </div>
          )}

          <div className="card">
            <h4 style={{ marginBottom: 12 }}>Categories</h4>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {categories.map(c => (
                <li key={c.id}>
                  {confirmDeleteCat === c.id ? (
                    <div style={{ padding: '8px 12px', background: '#FEF2F2', borderRadius: 8, textAlign: 'center' }}>
                      <div style={{ fontSize: 12, marginBottom: 6, color: '#991B1B' }}>Delete &quot;{c.name}&quot;?</div>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        <button className="btn btn-sm" style={{ background: '#EF4444', color: 'white', fontSize: 11 }} onClick={() => deleteCat(c.id)}>Yes</button>
                        <button className="btn btn-sm" style={{ fontSize: 11 }} onClick={() => setConfirmDeleteCat(null)}>No</button>
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '8px 12px', borderRadius: 10, cursor: 'pointer',
                        background: selectedCategory === c.id ? THEME.bgMuted : 'transparent',
                        fontWeight: selectedCategory === c.id ? 600 : 400,
                        color: c.is_active ? (selectedCategory === c.id ? THEME.primary : THEME.primary) : THEME.success,
                        marginBottom: 4, opacity: c.is_active ? 1 : 0.6,
                      }}
                    >
                      <span style={{ flex: 1 }} onClick={() => setSelectedCategory(c.id)}>
                        {c.name}
                        {!c.is_active && <span style={{ fontSize: 10, marginLeft: 6, color: '#EF4444' }}>Inactive</span>}
                      </span>
                      <div style={{ display: 'flex', gap: 2 }}>
                        {isHQ && (
                          <>
                            <button onClick={(e) => { e.stopPropagation(); openEditCat(c); }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: THEME.success, fontSize: 11, padding: '2px 4px' }}><i className="fas fa-edit"></i></button>
                            <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteCat(c.id); }} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#EF4444', fontSize: 11, padding: '2px 4px' }}><i className="fas fa-trash"></i></button>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Items section */}
        <div>
          {/* Item inline form */}
          {showItemForm && isHQ && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h4 style={{ margin: 0 }}>{editingItem ? 'Edit Item' : 'New Item'}</h4>
                <button className="btn btn-sm" onClick={closeItemForm}><i className="fas fa-times"></i></button>
              </div>

              {itemError && showItemForm && (
                <div style={{ background: '#FEF2F2', color: '#991B1B', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
                  <i className="fas fa-exclamation-circle"></i> {itemError}
                </div>
              )}

              <form onSubmit={handleItemSubmit}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={labelStyle}>Name *</label>
                    <input value={itemName} onChange={e => setItemName(e.target.value)} required placeholder="e.g. Iced Latte" />
                    <div style={hintStyle}>Item name shown to customers</div>
                  </div>
                  <div>
                    <label style={labelStyle}>Price (RM) *</label>
                    <input type="number" step="0.01" value={itemPrice} onChange={e => setItemPrice(e.target.value)} required placeholder="e.g. 12.90" />
                    <div style={hintStyle}>Base price before customizations</div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={labelStyle}>Category *</label>
                    <Select value={String(itemCatId)} onChange={(val) => setItemCatId(Number(val))} options={categories.map(c => ({ value: String(c.id), label: c.name }))} />
                    <div style={hintStyle}>Which category this item belongs to</div>
                  </div>
                  <div>
                    <label style={labelStyle}>Description <span style={{ fontWeight: 400, color: THEME.success }}>(optional)</span></label>
                    <input value={itemDesc} onChange={e => setItemDesc(e.target.value)} placeholder="e.g. Double shot espresso with milk" />
                    <div style={hintStyle}>Shown below the item name</div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16, flexWrap: 'wrap' }}>
                  <button type="submit" className="btn btn-primary" disabled={savingItem}>
                    {savingItem ? 'Saving...' : editingItem ? 'Update' : 'Create'}
                  </button>
                  <button type="button" className="btn" onClick={closeItemForm}>Cancel</button>
                  <div style={{ flex: 1 }} />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                    <input type="checkbox" checked={itemFeatured} onChange={e => setItemFeatured(e.target.checked)} style={{ width: 16, height: 16 }} />
                    <span style={{ color: '#D18E38', fontWeight: 600 }}><i className="fas fa-star" style={{ marginRight: 4 }}></i>Featured</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                    <input type="checkbox" checked={itemAvailable} onChange={e => setItemAvailable(e.target.checked)} style={{ width: 16, height: 16 }} />
                    Available
                  </label>
                </div>
              </form>
            </div>
          )}

          <div className="card" style={{ padding: 0 }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              background: THEME.bgMuted,
              borderRadius: `${THEME.radius.md} ${THEME.radius.md} 0 0`,
              border: `1px solid ${THEME.border}`,
              borderBottom: 'none',
            }}>
              <div style={{ fontSize: 14, color: THEME.textSecondary }}>
                <i className="fas fa-mug-hot" style={{ marginRight: 8, color: THEME.primary }}></i>
                Showing <strong style={{ color: THEME.textPrimary }}>{filteredItems.length}</strong> items
              </div>
            </div>
            <div style={{ padding: '0 16px' }}>
            <h4 style={{ marginBottom: 16, marginTop: 16 }}>Items ({filteredItems.length})</h4>
            {filteredItems.length === 0 ? (
              <div style={{ textAlign: 'center', color: THEME.success, padding: 40 }}>
                <i className="fas fa-mug-hot" style={{ fontSize: 32, display: 'block', marginBottom: 12 }}></i>
                No items in this category. Add your first menu item.
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 0 }}>
                {filteredItems.map(item => (
                  <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: `1px solid ${THEME.accentLight}`, opacity: item.is_available ? 1 : 0.5 }}>
                    <div style={{ flex: 1 }}>
                      <strong>{item.name}</strong>
                      <span style={{ marginLeft: 12, color: THEME.primary, fontWeight: 600 }}>{formatRM(item.base_price)}</span>
                      {!item.is_available && <span style={{ marginLeft: 8, fontSize: 11, color: '#EF4444', fontWeight: 500 }}>Hidden</span>}
                      {item.is_featured && <span style={{ marginLeft: 8, fontSize: 11, color: '#D18E38', fontWeight: 600 }}><i className="fas fa-star"></i> Featured</span>}
                      {item.description && <p style={{ fontSize: 13, color: THEME.success, marginTop: 2 }}>{item.description}</p>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {confirmDeleteItem === item.id ? (
                        <>
                          <button className="btn btn-sm" style={{ background: '#EF4444', color: 'white', fontSize: 11 }} onClick={() => deleteItem(item.id)}>Delete</button>
                          <button className="btn btn-sm" style={{ fontSize: 11 }} onClick={() => setConfirmDeleteItem(null)}>Cancel</button>
                        </>
                      ) : isHQ ? (
                        <>
                          <button className="btn btn-sm" onClick={() => onCustomizeItem(item)} title="Manage add-ons">
                            <i className="fas fa-sliders-h"></i> Options
                          </button>
                          <button className="btn btn-sm" onClick={() => openEditItem(item)} title="Edit item">
                            <i className="fas fa-edit"></i>
                          </button>
                          <button className="btn btn-sm" style={{ color: '#EF4444' }} onClick={() => setConfirmDeleteItem(item.id)} title="Delete item">
                            <i className="fas fa-trash"></i>
                          </button>
                          <button onClick={() => toggleItemAvailable(item)} style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}>
                            <span className={`badge ${item.is_available ? 'badge-green' : 'badge-gray'}`}>
                              {item.is_available ? 'Available' : 'Hidden'}
                            </span>
                          </button>
                        </>
                      ) : (
                        <span className={`badge ${item.is_available ? 'badge-green' : 'badge-gray'}`}>
                          {item.is_available ? 'Available' : 'Hidden'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  </div>
);
}
