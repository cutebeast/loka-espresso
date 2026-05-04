'use client';

import { useState } from 'react';
import { apiFetch, apiUpload, formatRM } from '@/lib/merchant-api';
import type { MerchantCategory, MerchantMenuItem, MerchantStore } from '@/lib/merchant-types';
import { Select, Modal, Drawer, DataTable, type ColumnDef } from '@/components/ui';
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
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [confirmDeleteItem, setConfirmDeleteItem] = useState<number | null>(null);
  const [confirmDeleteCat, setConfirmDeleteCat] = useState<number | null>(null);
  const [itemCatError, setItemCatError] = useState('');

  // Category form (modal)
  const [catModal, setCatModal] = useState(false);
  const [editingCat, setEditingCat] = useState<MerchantCategory | null>(null);
  const [catName, setCatName] = useState('');
  const [catSlug, setCatSlug] = useState('');
  const [catError, setCatError] = useState('');
  const [savingCat, setSavingCat] = useState(false);

  // Item form (modal)
  const [itemModal, setItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState<MerchantMenuItem | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemDesc, setItemDesc] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemCatId, setItemCatId] = useState(0);
  const [itemAvailable, setItemAvailable] = useState(true);
  const [itemFeatured, setItemFeatured] = useState(false);
  const [itemDietaryTags, setItemDietaryTags] = useState<string[]>([]);
  const [itemImageFile, setItemImageFile] = useState<File | null>(null);
  const [savingItem, setSavingItem] = useState(false);

  const dietaryTagOptions = ['Vegan', 'Vegetarian', 'Gluten-Free', 'Dairy-Free', 'Halal', 'Hot', 'Iced', 'Caffeinated', 'Decaf', 'Popular', 'New', 'Seasonal', 'Sugar-Free'];

  const filteredItems = selectedCategory ? menuItems.filter(i => i.category_id === selectedCategory) : menuItems;

  // --- Category CRUD ---
  function openCreateCat() { setEditingCat(null); setCatName(''); setCatSlug(''); setCatError(''); setCatModal(true); }
  function openEditCat(c: MerchantCategory) { setEditingCat(c); setCatName(c.name); setCatSlug(c.slug || ''); setCatError(''); setCatModal(true); }
  function closeCatModal() { setCatModal(false); setEditingCat(null); setCatError(''); }

  async function handleCatSubmit() {
    setSavingCat(true); setCatError('');
    const slug = catSlug || catName.toLowerCase().replaceAll(' ', '-');
    try {
      const res = editingCat
        ? await apiFetch(`/admin/categories/${editingCat.id}`, undefined, { method: 'PUT', body: JSON.stringify({ name: catName, slug, display_order: editingCat.display_order }) })
        : await apiFetch(`/admin/categories`, undefined, { method: 'POST', body: JSON.stringify({ name: catName, slug, display_order: 0 }) });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setCatError(d.detail || 'Failed'); return; }
      closeCatModal(); onRefresh();
    } catch { setCatError('Network error'); } finally { setSavingCat(false); }
  }

  async function deleteCat(id: number) {
    try { const res = await apiFetch(`/admin/categories/${id}`, undefined, { method: 'DELETE' }); if (res.ok) { setConfirmDeleteCat(null); onRefresh(); } } catch { console.error('Failed to delete category'); }
  }

  async function toggleCatActive(c: MerchantCategory) {
    try {
      await apiFetch(`/admin/categories/${c.id}`, undefined, { method: 'PUT', body: JSON.stringify({ name: c.name, slug: c.slug, display_order: c.display_order, is_active: !c.is_active }) });
      onRefresh();
    } catch { console.error('Failed to toggle category'); }
  }

  // --- Item CRUD ---
  function openCreateItem() {
    setEditingItem(null); setItemName(''); setItemDesc(''); setItemPrice(''); setItemCatId(selectedCategory || categories[0]?.id || 0);
    setItemAvailable(true); setItemFeatured(false); setItemDietaryTags([]); setItemImageFile(null); setItemCatError(''); setItemModal(true);
  }
  function openEditItem(i: MerchantMenuItem) {
    setEditingItem(i); setItemName(i.name); setItemDesc(i.description || ''); setItemPrice(String(i.base_price));
    setItemCatId(i.category_id); setItemAvailable(i.is_available); setItemFeatured(i.is_featured);
    setItemDietaryTags(i.dietary_tags || []); setItemImageFile(null); setItemCatError(''); setItemModal(true);
  }
  function closeItemModal() { setItemModal(false); setEditingItem(null); setItemCatError(''); }

  async function handleItemSubmit() {
    setSavingItem(true); setItemCatError('');
    try {
      let imageUrl = editingItem?.image_url || '';
      if (itemImageFile) {
        const fd = new FormData();
        fd.append('file', itemImageFile);
        const uploadRes = await apiUpload('/upload/image', fd);
        if (uploadRes.ok) {
          const uploadData = await uploadRes.json();
          imageUrl = uploadData.url || uploadData.image_url || '';
        }
      }
      const price = parseFloat(itemPrice);
      if (isNaN(price)) { setItemCatError('Please enter a valid price'); return; }
      const body = JSON.stringify({ name: itemName, description: itemDesc, base_price: price, category_id: itemCatId, is_available: itemAvailable, is_featured: itemFeatured, dietary_tags: itemDietaryTags.length > 0 ? itemDietaryTags : undefined, image_url: imageUrl || undefined });
      const res = editingItem
        ? await apiFetch(`/admin/items/${editingItem.id}`, undefined, { method: 'PUT', body })
        : await apiFetch(`/admin/items`, undefined, { method: 'POST', body });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setItemCatError(d.detail || `Failed (${res.status})`); return; }
      closeItemModal(); onRefresh();
    } catch (err: any) { setItemCatError(err.message || 'Network error'); } finally { setSavingItem(false); }
  }

  async function deleteItem(id: number) {
    try { const res = await apiFetch(`/admin/items/${id}`, undefined, { method: 'DELETE' }); if (res.ok) { setConfirmDeleteItem(null); onRefresh(); } } catch { console.error('Failed to delete item'); }
  }

  async function toggleItemAvailable(item: MerchantMenuItem) {
    try {
      await apiFetch(`/admin/items/${item.id}`, undefined, { method: 'PUT', body: JSON.stringify({ name: item.name, base_price: item.base_price, category_id: item.category_id, is_available: !item.is_available, is_featured: item.is_featured }) });
      onRefresh();
    } catch { console.error('Failed to delete item'); }
  }

  const columns: ColumnDef<MerchantMenuItem>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (item) => (
        <div>
          <strong>{item.name}</strong>
          {item.is_featured && <span className="mp-54"><i className="fas fa-star"></i> Featured</span>}
          {item.description && <p className="mp-55">{item.description}</p>}
        </div>
      ),
    },
    {
      key: 'options',
      header: 'Add-ons',
      render: (item: MerchantMenuItem) => isHQ ? (
        <button className="btn btn-sm" onClick={() => onCustomizeItem(item)} title="Manage add-ons"><i className="fas fa-sliders-h"></i> Manage</button>
      ) : (
        <span className="badge badge-gray">—</span>
      ),
    },
    {
      key: 'price',
      header: 'Price (RM)',
      render: (item) => <span>{formatRM(item.base_price)}</span>,
    },
    ...(isHQ ? [{
      key: 'actions',
      header: 'Actions',
      render: (item: MerchantMenuItem) => (
        confirmDeleteItem === item.id ? (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm mp-57" onClick={() => deleteItem(item.id)}>Delete</button>
            <button className="btn btn-sm mp-58" onClick={() => setConfirmDeleteItem(null)}>Cancel</button>
          </div>
        ) : (
          <div className="mp-56">
            <button className="btn btn-sm" onClick={() => toggleItemAvailable(item)} title={item.is_available ? 'Available — click to hide' : 'Hidden — click to show'}>
              <i className={`fas ${item.is_available ? 'fa-toggle-on' : 'fa-toggle-off'}`} style={{ fontSize: 20, color: item.is_available ? '#16A34A' : '#9CA3AF' }}></i>
            </button>
            <button className="btn btn-sm" onClick={() => openEditItem(item)} title="Edit item"><i className="fas fa-edit"></i></button>
            <button className="btn btn-sm mp-59" onClick={() => setConfirmDeleteItem(item.id)} title="Delete item"><i className="fas fa-trash"></i></button>
          </div>
        )
      ),
    }] : []),
  ];

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

      {itemCatError && (
        <div className="mp-4"><i className="fas fa-exclamation-circle"></i> {itemCatError}</div>
      )}

      {/* Mobile sidebar toggle */}
      <div className="menu-mobile-toggle">
        <button className="btn btn-sm" onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}>
          <i className={`fas fa-${mobileSidebarOpen ? 'times' : 'bars'}`}></i> Categories
        </button>
      </div>

      <div className="mp-5">
        {/* Categories sidebar */}
        <div className={`menu-sidebar ${mobileSidebarOpen ? 'menu-sidebar-open' : ''}`}>
          <div className="card">
            <h4 className="mp-14">Categories</h4>
            <ul className="mp-15">
              {categories.map(c => (
                <li key={c.id}>
                    <div
                      className="mp-cat-item"
                      style={{
                        background: selectedCategory === c.id ? THEME.bgMuted : 'transparent',
                        fontWeight: selectedCategory === c.id ? 600 : 400,
                        color: c.is_active ? THEME.primary : THEME.success,
                        opacity: c.is_active ? 1 : 0.6,
                      }}
                    >
                      <span className="mp-21" onClick={() => { setSelectedCategory(c.id); setMobileSidebarOpen(false); }}>
                        {c.name}
                        {!c.is_active && <span className="mp-22">Inactive</span>}
                      </span>
                       <div className="mp-23">
                        {isHQ && (<>
                          <button onClick={(e) => { e.stopPropagation(); toggleCatActive(c); }} title={c.is_active ? 'Active — click to deactivate' : 'Inactive — click to activate'} className="mp-24" style={{ color: c.is_active ? '#16A34A' : '#9CA3AF' }}>
                            <i className={`fas ${c.is_active ? 'fa-toggle-on' : 'fa-toggle-off'}`} style={{ fontSize: 18 }}></i>
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); openEditCat(c); }} className="mp-24"><i className="fas fa-edit"></i></button>
                        </>)}
                      </div>
                    </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Items section */}
        <div>
          <div className="mp-42">
            <div className="mp-43">
              <span className="mp-44"><i className="fas fa-mug-hot"></i></span>
              Showing <strong className="mp-45">{filteredItems.length}</strong> items
            </div>
          </div>
          <DataTable
            data={filteredItems}
            columns={columns}
            emptyMessage="No items in this category. Add your first menu item."
          />
        </div>
      </div>

      {/* ── Modals ── */}
      <Modal isOpen={catModal} onClose={closeCatModal} title={editingCat ? 'Edit Category' : 'New Category'}>
        {catError && <div className="mp-10">{catError}</div>}
        <div>
          <input value={catName} onChange={e => { setCatName(e.target.value); if (!catSlug) setCatSlug(e.target.value.toLowerCase().replaceAll(' ', '-')); }} required placeholder="Category name" className="mp-11" />
          <input value={catSlug} onChange={e => setCatSlug(e.target.value)} placeholder="slug (auto)" className="mp-12" />
          <div style={{display:'flex',gap:8,marginTop:12}}>
            <button className="btn btn-primary" disabled={savingCat} onClick={handleCatSubmit}>{savingCat ? '...' : editingCat ? 'Update' : 'Create'}</button>
            <button className="btn" onClick={closeCatModal}>Cancel</button>
          </div>
        </div>
      </Modal>

      <Drawer isOpen={itemModal} onClose={closeItemModal} title={editingItem ? 'Edit Item' : 'New Item'}>
        {itemCatError && <div className="mp-29"><i className="fas fa-exclamation-circle"></i> {itemCatError}</div>}
        <div className="df-section">
          <div className="df-grid-2-wide-short">
            <div className="df-field">
              <label className="df-label">Name *</label>
              <input value={itemName} onChange={e => setItemName(e.target.value)} required placeholder="e.g. Iced Latte" />
              <div className="df-hint">Item name shown to customers</div>
            </div>
            <div className="df-field">
              <label className="df-label">Price (RM) *</label>
              <input type="number" step="0.01" value={itemPrice} onChange={e => setItemPrice(e.target.value)} required placeholder="12.90" />
              <div className="df-hint">Base price</div>
            </div>
          </div>
          <div className="df-field" style={{ marginBottom: 16 }}>
            <label className="df-label">Description <span>(optional)</span></label>
            <input value={itemDesc} onChange={e => setItemDesc(e.target.value)} placeholder="e.g. Double shot espresso with milk" />
            <div className="df-hint">Shown below the item name</div>
          </div>
          <div className="df-field" style={{ marginBottom: 16 }}>
            <label className="df-label">Category *</label>
            <Select value={String(itemCatId)} onChange={(val) => setItemCatId(Number(val))} options={categories.map(c => ({ value: String(c.id), label: c.name }))} />
            <div className="df-hint">Which category this item belongs to</div>
          </div>
          <div className="df-field" style={{ marginBottom: 16 }}>
            <label className="df-label">Image File <span>(optional)</span></label>
            <input type="file" accept="image/*" onChange={e => setItemImageFile(e.target.files?.[0] || null)} />
            {editingItem?.image_url && !itemImageFile && (
              <div className="df-hint" style={{ marginTop: 4 }}>
                <i className="fas fa-image" style={{ marginRight: 4 }}></i> Current: {editingItem.image_url.split('/').pop()}
              </div>
            )}
            {!editingItem?.image_url && <div className="df-hint">Upload a product photo for the menu</div>}
          </div>
          <div className="df-field">
            <label className="df-label">Availability</label>
            <div style={{ display: 'flex', gap: 20, paddingTop: 6 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                <input type="checkbox" checked={itemAvailable} onChange={e => setItemAvailable(e.target.checked)} style={{ width: 16, height: 16 }} /> Available
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                <input type="checkbox" checked={itemFeatured} onChange={e => setItemFeatured(e.target.checked)} style={{ width: 16, height: 16 }} /> <i className="fas fa-star" style={{ color: '#D18E38' }}></i> Featured
              </label>
            </div>
          </div>
          <div className="df-field" style={{ marginBottom: 16 }}>
            <label className="df-label">Dietary Tags <span>(max 3)</span></label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingTop: 6 }}>
              {dietaryTagOptions.map(tag => {
                const checked = itemDietaryTags.includes(tag);
                const disabled = !checked && itemDietaryTags.length >= 3;
                return (
                  <label key={tag} style={{
                    display: 'flex', alignItems: 'center', gap: 4, cursor: disabled ? 'not-allowed' : 'pointer',
                    fontSize: 13, opacity: disabled ? 0.5 : 1, padding: '4px 10px',
                    border: '1px solid #D4DCE5', borderRadius: 8, background: checked ? '#E8EDE0' : '#fff',
                  }}>
                    <input type="checkbox" checked={checked} disabled={disabled}
                      onChange={e => {
                        if (e.target.checked) setItemDietaryTags(prev => [...prev, tag]);
                        else setItemDietaryTags(prev => prev.filter(t => t !== tag));
                      }}
                      style={{ width: 14, height: 14 }}
                    /> {tag}
                  </label>
                );
              })}
            </div>
            <div className="df-hint">Select up to 3 tags — shown on PWA menu cards</div>
          </div>
        </div>
        <div className="df-actions">
          <button className="btn" onClick={closeItemModal}>Cancel</button>
          <button className="btn btn-primary" disabled={savingItem} onClick={handleItemSubmit}>{savingItem ? 'Saving...' : editingItem ? 'Update' : 'Create'}</button>
        </div>
      </Drawer>
    </div>
  );
}