'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X, ArrowLeft, Plus, Coffee } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { useCartStore } from '@/stores/cartStore';
import api, { cacheBust } from '@/lib/api';
import type { Category, MenuItem, CustomizationOption } from '@/lib/api';
import FloatingCartBar from '@/components/menu/FloatingCartBar';
import ItemCustomizeSheet from '@/components/menu/ItemCustomizeSheet';
import { formatPrice } from '@/lib/tokens';

interface SelectedOption {
  id: number;
  name: string;
  option_type: string;
  price_adjustment: number;
}

function resolveImg(path: string | null | undefined) {
  if (!path) return null;
  return cacheBust(path.startsWith('http') ? path : `https://admin.loyaltysystem.uk${path}`);
}

export default function MenuPage() {
  const {
    categories,
    menuItems,
    searchQuery,
    setCategories,
    setMenuItems,
    setSearchQuery,
    setPage,
  } = useUIStore();

  const addItem = useCartStore((s) => s.addItem);
  const getItemCount = useCartStore((s) => s.getItemCount);

  const [loading, setLoading] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [detailItem, setDetailItem] = useState<MenuItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [availableOptions, setAvailableOptions] = useState<CustomizationOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  const sectionRefs = useRef<Map<number, HTMLElement | null>>(new Map());
  const navRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const loadMenu = useCallback(async () => {
    setLoading(true);
    try {
      const [catRes, itemsRes] = await Promise.all([
        api.get('/stores/0/categories'),
        api.get('/stores/0/items', { params: { available_only: true } }),
      ]);
      setCategories(Array.isArray(catRes.data) ? catRes.data : []);
      setMenuItems(Array.isArray(itemsRes.data) ? itemsRes.data : []);
    } catch {
      try {
        const menuRes = await api.get('/stores/0/menu');
        const data = menuRes.data;
        const cats = Array.isArray(data) ? data : (data?.categories ?? []);
        const allCategories: Category[] = [];
        const allItems: MenuItem[] = [];
        cats.forEach((cat: { id: number; name: string; slug: string; items?: MenuItem[] }) => {
          allCategories.push({ id: cat.id, name: cat.name, slug: cat.slug, is_active: true });
          (cat.items ?? []).forEach((item: MenuItem) => {
            allItems.push({ ...item, category_id: cat.id });
          });
        });
        setCategories(allCategories);
        setMenuItems(allItems);
      } catch {
        setCategories([]);
        setMenuItems([]);
      }
    } finally {
      setLoading(false);
    }
  }, [setCategories, setMenuItems]);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  /* intersection observer for active category */
  useEffect(() => {
    if (observerRef.current) observerRef.current.disconnect();
    const rafId = requestAnimationFrame(() => {
      observerRef.current = new IntersectionObserver(
        (entries) => {
          const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
          if (visible.length > 0) {
            const id = Number(visible[0].target.getAttribute('data-category-id'));
            setActiveCategoryId(id);
          }
        },
        { rootMargin: '-20% 0px -70% 0px', threshold: [0, 0.5, 1] }
      );
      sectionRefs.current.forEach((el) => { if (el) observerRef.current?.observe(el); });
    });
    return () => {
      cancelAnimationFrame(rafId);
      observerRef.current?.disconnect();
    };
  }, [categories, menuItems]);

  const loadCustomizations = useCallback(async (item: MenuItem) => {
    setLoadingOptions(true);
    try {
      const res = await api.get(`/stores/0/items/${item.id}/customizations`);
      setAvailableOptions(res.data ?? []);
    } catch {
      setAvailableOptions(item.customization_options ?? []);
    } finally {
      setLoadingOptions(false);
    }
  }, []);

  const openItem = useCallback((item: MenuItem) => {
    if (item.customization_options && item.customization_options.length > 0) {
      setDetailItem(item);
      setSheetOpen(true);
      loadCustomizations(item);
    } else {
      addItem({ menu_item_id: item.id, name: item.name, price: item.base_price, quantity: 1, customizations: {} });
    }
  }, [addItem, loadCustomizations]);

  const handleSheetAdd = useCallback(
    (item: MenuItem, quantity: number, customizations: SelectedOption[], totalPrice: number) => {
      addItem({
        menu_item_id: item.id,
        name: item.name,
        price: totalPrice,
        quantity,
        customizations: customizations.length > 0
          ? customizations.reduce<Record<string, unknown>>((acc, o) => {
              acc[o.name] = { id: o.id, type: o.option_type, price: o.price_adjustment };
              return acc;
            }, {})
          : {},
      });
    },
    [addItem],
  );

  const filteredItems = menuItems.filter((item) => {
    const matchesSearch = !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch && item.is_available;
  });

  const itemsByCategory = categories
    .map((cat) => ({ category: cat, items: filteredItems.filter((item) => item.category_id === cat.id) }))
    .filter((group) => group.items.length > 0);

  const allCats = [{ id: null as number | null, name: 'All' }, ...categories.map((c) => ({ id: c.id, name: c.name }))];

  const scrollToCategory = (categoryId: number | null) => {
    setActiveCategoryId(categoryId);
    if (categoryId === null) {
      const first = sectionRefs.current.get(categories[0]?.id);
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      const el = sectionRefs.current.get(categoryId);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const hasCartItems = getItemCount() > 0;

  return (
    <div className="menu-screen">
      {/* Header */}
      <div className="menu-header">
        {showSearch ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', background: '#F5F7FA', borderRadius: 999, height: 36 }}>
              <Search size={14} color="#6A7A8A" />
              <input
                type="text"
                autoFocus
                placeholder="Search items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: '#1B2023' }}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} style={{ background: 'transparent', border: 'none', padding: 0, color: '#6A7A8A', cursor: 'pointer', display: 'flex' }}>
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              onClick={() => { setShowSearch(false); setSearchQuery(''); }}
              style={{ fontSize: 13, fontWeight: 600, color: '#384B16', background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0, padding: '4px 4px' }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <div className="menu-header-left">
              <button className="menu-back-btn" onClick={() => setPage('home')} aria-label="Back">
                <ArrowLeft size={20} />
              </button>
              <h1 className="menu-title">Menu</h1>
            </div>
            <button className="menu-search-btn" onClick={() => setShowSearch(true)} aria-label="Search">
              <Search size={18} />
            </button>
          </>
        )}
      </div>

      {/* Category Tabs */}
      {!showSearch && categories.length > 0 && (
        <div className="category-bar" ref={navRef}>
          {allCats.map((cat) => (
            <button
              key={cat.id ?? 'all'}
              className={`cat-tab ${activeCategoryId === cat.id ? 'active' : ''}`}
              onClick={() => scrollToCategory(cat.id)}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Product List */}
      <div className="menu-product-list scroll-container">
        {loading ? (
          <>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="skeleton" style={{ height: 140, borderRadius: 20 }} />
            ))}
          </>
        ) : filteredItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 56, height: 56, borderRadius: 999, background: '#F3EEE5', margin: '0 auto 16px' }}>
              <Coffee size={24} color="#D18E38" strokeWidth={1.5} />
            </div>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#1B2023', marginBottom: 8 }}>
              {searchQuery ? `No items match "${searchQuery}"` : 'No items available'}
            </p>
            {searchQuery && (
              <button className="btn btn-primary btn-pill" onClick={() => setSearchQuery('')}>
                Clear search
              </button>
            )}
          </div>
        ) : (
          itemsByCategory.map(({ category, items }) => (
            <div key={category.id} ref={(el) => { sectionRefs.current.set(category.id, el); }} data-category-id={category.id}>
              <div style={{ padding: '18px 16px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 4, height: 18, borderRadius: 999, background: '#D18E38', flexShrink: 0 }} />
                <h2 style={{ fontSize: 15, fontWeight: 800, color: '#1B2023', letterSpacing: '-0.01em' }}>
                  {category.name}
                </h2>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {items.map((item) => {
                  const imgSrc = resolveImg(item.image_url);
                  return (
                    <div
                      key={item.id}
                      className="menu-product-card"
                      onClick={() => openItem(item)}
                    >
                      <div
                        className="menu-product-img"
                        style={imgSrc ? { backgroundImage: `url(${imgSrc})` } : {}}
                      >
                        {!imgSrc && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                            <Coffee size={28} color="#C4CED8" strokeWidth={1.5} />
                          </div>
                        )}
                        {item.is_featured && (
                          <span className="menu-img-badge">⭐ Popular</span>
                        )}
                      </div>
                      <div className="menu-product-info">
                        <div>
                          <div className="menu-product-name">{item.name}</div>
                          {item.description && (
                            <div className="menu-product-desc">{item.description}</div>
                          )}
                        </div>
                        <div className="menu-product-bottom">
                          <span className="menu-product-price">{formatPrice(item.base_price)}</span>
                          <button
                            className="menu-add-btn"
                            onClick={(e) => { e.stopPropagation(); openItem(item); }}
                          >
                            <Plus size={14} strokeWidth={2.5} /> Add
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      <FloatingCartBar />

      <ItemCustomizeSheet
        item={detailItem}
        isOpen={sheetOpen}
        onClose={() => { setSheetOpen(false); setDetailItem(null); setAvailableOptions([]); }}
        onAdd={handleSheetAdd}
        loadingOptions={loadingOptions}
        customizations={availableOptions}
      />
    </div>
  );
}
