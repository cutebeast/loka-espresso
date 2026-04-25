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
      <div className="mp-0">
        <h3 className="mp-1">Menu &middot; Universal (All Stores)</h3>
        {isHQ && (
          <div className="mp-2">
            <button className="btn" onClick={openCreateCat}><i className="fas fa-folder-plus"></i> Add Category</button>
            <button className="btn btn-primary" onClick={openCreateItem}><i className="fas fa-plus"></i> New Item</button>
          </div>
        )}
        {!isHQ && (
          <span className="mp-3"><i className="fas fa-eye"></i> View only — contact admin to make changes</span>
        )}
      </div>

      {itemError && (
        <div className="mp-4">
          <i className="fas fa-exclamation-circle"></i> {itemError}
        </div>
      )}

      <div className="mp-5">
        {/* Categories sidebar */}
        <div>
          {/* Category inline form */}
          {showCatForm && isHQ && (
            <div className="mp-6">
              <div className="mp-7">
                <strong className="mp-8">{editingCat ? 'Edit Category' : 'New Category'}</strong>
                <button className="btn btn-sm mp-9" onClick={closeCatForm} ><i className="fas fa-times"></i></button>
              </div>
              {catError && (
                <div className="mp-10">{catError}</div>
              )}
              <form onSubmit={handleCatSubmit}>
                <input value={catName} onChange={e => { setCatName(e.target.value); if (!catSlug) setCatSlug(e.target.value.toLowerCase().replaceAll(' ', '-')); }} required placeholder="Category name" className="mp-11" />
                <input value={catSlug} onChange={e => setCatSlug(e.target.value)} placeholder="slug (auto)" className="mp-12" />
                <button type="submit" className="btn btn-sm btn-primary mp-13" disabled={savingCat} >
                  {savingCat ? '...' : editingCat ? 'Update' : 'Create'}
                </button>
              </form>
            </div>
          )}

          <div className="card">
            <h4 className="mp-14">Categories</h4>
            <ul className="mp-15">
              {categories.map(c => (
                <li key={c.id}>
                  {confirmDeleteCat === c.id ? (
                    <div className="mp-16">
                      <div className="mp-17">Delete &quot;{c.name}&quot;?</div>
                      <div className="mp-18">
                        <button className="btn btn-sm mp-19"  onClick={() => deleteCat(c.id)}>Yes</button>
                        <button className="btn btn-sm mp-20"  onClick={() => setConfirmDeleteCat(null)}>No</button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="mp-cat-item"
                      style={{
                        background: selectedCategory === c.id ? THEME.bgMuted : 'transparent',
                        fontWeight: selectedCategory === c.id ? 600 : 400,
                        color: c.is_active ? THEME.primary : THEME.success,
                        opacity: c.is_active ? 1 : 0.6,
                      }}
                    >
                      <span className="mp-21" onClick={() => setSelectedCategory(c.id)}>
                        {c.name}
                        {!c.is_active && <span className="mp-22">Inactive</span>}
                      </span>
                      <div className="mp-23">
                        {isHQ && (
                          <>
                            <button onClick={(e) => { e.stopPropagation(); openEditCat(c); }} className="mp-24"><i className="fas fa-edit"></i></button>
                            <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteCat(c.id); }} className="mp-25"><i className="fas fa-trash"></i></button>
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
            <div className="card mp-26" >
              <div className="mp-27">
                <h4 className="mp-28">{editingItem ? 'Edit Item' : 'New Item'}</h4>
                <button className="btn btn-sm" onClick={closeItemForm}><i className="fas fa-times"></i></button>
              </div>

              {itemError && showItemForm && (
                <div className="mp-29">
                  <i className="fas fa-exclamation-circle"></i> {itemError}
                </div>
              )}

              <form onSubmit={handleItemSubmit}>
                <div className="mp-30">
                  <div>
                    <label className="mp-label">Name *</label>
                    <input value={itemName} onChange={e => setItemName(e.target.value)} required placeholder="e.g. Iced Latte" />
                    <div className="mp-hint">Item name shown to customers</div>
                  </div>
                  <div>
                    <label className="mp-label">Price (RM) *</label>
                    <input type="number" step="0.01" value={itemPrice} onChange={e => setItemPrice(e.target.value)} required placeholder="e.g. 12.90" />
                    <div className="mp-hint">Base price before customizations</div>
                  </div>
                </div>

                <div className="mp-31">
                  <div>
                    <label className="mp-label">Category *</label>
                    <Select value={String(itemCatId)} onChange={(val) => setItemCatId(Number(val))} options={categories.map(c => ({ value: String(c.id), label: c.name }))} />
                    <div className="mp-hint">Which category this item belongs to</div>
                  </div>
                  <div>
                    <label className="mp-label">Description <span className="mp-32">(optional)</span></label>
                    <input value={itemDesc} onChange={e => setItemDesc(e.target.value)} placeholder="e.g. Double shot espresso with milk" />
                    <div className="mp-hint">Shown below the item name</div>
                  </div>
                </div>

                <div className="mp-33">
                  <button type="submit" className="btn btn-primary" disabled={savingItem}>
                    {savingItem ? 'Saving...' : editingItem ? 'Update' : 'Create'}
                  </button>
                  <button type="button" className="btn" onClick={closeItemForm}>Cancel</button>
                  <div className="mp-34" />
                  <label className="mp-35">
                    <input type="checkbox" checked={itemFeatured} onChange={e => setItemFeatured(e.target.checked)} className="mp-36" />
                    <span className="mp-37"><span className="mp-38"><i className="fas fa-star"></i></span>Featured</span>
                  </label>
                  <label className="mp-39">
                    <input type="checkbox" checked={itemAvailable} onChange={e => setItemAvailable(e.target.checked)} className="mp-40" />
                    Available
                  </label>
                </div>
              </form>
            </div>
          )}

          <div className="card mp-41" >
            <div className="mp-42">
              <div className="mp-43">
                <span className="mp-44"><i className="fas fa-mug-hot"></i></span>
                Showing <strong className="mp-45">{filteredItems.length}</strong> items
              </div>
            </div>
            <div className="mp-46">
            <h4 className="mp-47">Items ({filteredItems.length})</h4>
            {filteredItems.length === 0 ? (
              <div className="mp-48">
                <span className="mp-49"><i className="fas fa-mug-hot"></i></span>
                No items in this category. Add your first menu item.
              </div>
            ) : (
              <div className="mp-50">
                {filteredItems.map(item => (
                  <div key={item.id} className="mp-menu-item" style={{ opacity: item.is_available ? 1 : 0.5 }}>
                    <div className="mp-51">
                      <strong>{item.name}</strong>
                      <span className="mp-52">{formatRM(item.base_price)}</span>
                      {!item.is_available && <span className="mp-53">Hidden</span>}
                      {item.is_featured && <span className="mp-54"><i className="fas fa-star"></i> Featured</span>}
                      {item.description && <p className="mp-55">{item.description}</p>}
                    </div>
                    <div className="mp-56">
                      {confirmDeleteItem === item.id ? (
                        <>
                          <button className="btn btn-sm mp-57"  onClick={() => deleteItem(item.id)}>Delete</button>
                          <button className="btn btn-sm mp-58"  onClick={() => setConfirmDeleteItem(null)}>Cancel</button>
                        </>
                      ) : isHQ ? (
                        <>
                          <button className="btn btn-sm" onClick={() => onCustomizeItem(item)} title="Manage add-ons">
                            <i className="fas fa-sliders-h"></i> Options
                          </button>
                          <button className="btn btn-sm" onClick={() => openEditItem(item)} title="Edit item">
                            <i className="fas fa-edit"></i>
                          </button>
                          <button className="btn btn-sm mp-59"  onClick={() => setConfirmDeleteItem(item.id)} title="Delete item">
                            <i className="fas fa-trash"></i>
                          </button>
                          <button onClick={() => toggleItemAvailable(item)} className="mp-60">
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
