'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Search, X, ArrowLeft, Plus, Coffee, Star, RefreshCw } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { useCartStore } from '@/stores/cartStore';
import api from '@/lib/api';
import type { MenuItem, CustomizationOption } from '@/lib/api';
import FloatingCartBar from '@/components/menu/FloatingCartBar';
import ItemCustomizeSheet from '@/components/menu/ItemCustomizeSheet';
import { formatPrice, resolveAssetUrl, LOKA } from '@/lib/tokens';

interface SelectedOption {
  id: number;
  name: string;
  option_type: string;
  price_adjustment: number;
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
    isGuest,
    showToast,
    triggerSignIn,
    selectedStore,
  } = useUIStore();

  const addItem = useCartStore((s) => s.addItem);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  const [detailItem, setDetailItem] = useState<MenuItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [availableOptions, setAvailableOptions] = useState<CustomizationOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [selectedDietaryTag, setSelectedDietaryTag] = useState<string | null>(null);
  const [brokenImages, setBrokenImages] = useState<Set<number>>(new Set());

  const sectionRefs = useRef<Map<number, HTMLElement | null>>(new Map());
  const navRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const loadMenu = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [catRes, itemsRes] = await Promise.all([
        api.get(`/menu/categories`),
        api.get(`/menu/items`, { params: { available_only: true } }),
      ]);
      setCategories(Array.isArray(catRes.data) ? catRes.data : []);
      setMenuItems(Array.isArray(itemsRes.data) ? itemsRes.data : []);
    } catch {
      setCategories([]);
      setMenuItems([]);
      setLoadError(true);
      showToast('Failed to load menu. Check your connection.', 'error');
    } finally {
      setLoading(false);
    }
  }, [setCategories, setMenuItems, showToast]);

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
      const res = await api.get(`/menu/items/${item.id}/customizations`);
      setAvailableOptions(res.data ?? []);
    } catch {
      setAvailableOptions(item.customization_options ?? []);
    } finally {
      setLoadingOptions(false);
    }
  }, []);

  const openItem = useCallback((item: MenuItem) => {
    addItem({ menu_item_id: item.id, name: item.name, price: item.base_price, base_price: item.base_price, quantity: 1, customizations: {}, store_id: selectedStore?.id, customization_count: item.customization_count ?? 0 });
  }, [addItem, selectedStore?.id]);

  const handleSheetAdd = useCallback(
    (item: MenuItem, quantity: number, customizations: SelectedOption[], totalPrice: number) => {
      addItem({
        menu_item_id: item.id,
        name: item.name,
        price: totalPrice,
        base_price: item.base_price,
        quantity,
        store_id: selectedStore?.id,
        customizations: customizations.length > 0
          ? { options: customizations.map((o) => ({ id: o.id, name: o.name, price_adjustment: o.price_adjustment })) }
          : {},
        customization_option_ids: customizations.length > 0 ? customizations.map((o) => o.id) : [],
      });
    },
    [addItem, selectedStore],
  );

  const filteredItems = useMemo(() => menuItems.filter((item) => {
    const matchesSearch = !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesDietary = !selectedDietaryTag || (item.dietary_tags && item.dietary_tags.some((t: string) => t.toLowerCase() === selectedDietaryTag.toLowerCase()));
    return matchesSearch && matchesDietary && item.is_available;
  }), [menuItems, searchQuery, selectedDietaryTag]);

  const availableDietaryTags = useMemo(() => {
    const tags = new Set<string>();
    menuItems.forEach((item) => {
      if (item.dietary_tags) {
        item.dietary_tags.forEach((t: string) => tags.add(t));
      }
    });
    return Array.from(tags).sort();
  }, [menuItems]);

  const itemsByCategory = useMemo(() => categories
    .map((cat) => ({ category: cat, items: filteredItems.filter((item) => item.category_id === cat.id) }))
    .filter((group) => group.items.length > 0), [categories, filteredItems]);

  const allCats = useMemo(() => [{ id: null as number | null, name: 'All' }, ...categories.map((c) => ({ id: c.id, name: c.name }))], [categories]);

  const scrollToCategory = useCallback((categoryId: number | null) => {
    setActiveCategoryId(categoryId);
    if (categoryId === null) {
      const first = sectionRefs.current.get(categories[0]?.id);
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      const el = sectionRefs.current.get(categoryId);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [categories, setActiveCategoryId]);

  // Auto-scroll active tab into view in the horizontal category bar
  useEffect(() => {
    if (!navRef.current || activeCategoryId === null) return;
    const activeTab = navRef.current.querySelector('.menu-cat-tab.active');
    if (activeTab) {
      activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [activeCategoryId]);

  return (
    <div className="menu-screen">
      {/* Header */}
      <div className="menu-header">
        {showSearch ? (
          <div className="menu-search-bar">
            <div className="menu-search-input-wrap">
              <Search size={14} color={LOKA.textMuted} />
              <input
                type="text"
                autoFocus
                placeholder="Search items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="menu-search-input"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="menu-search-clear">
                  <X size={14} />
                </button>
              )}
            </div>
            <button
              onClick={() => { setShowSearch(false); setSearchQuery(''); }}
              className="menu-search-cancel"
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
        <div className="menu-cat-bar" ref={navRef}>
          {allCats.map((cat) => (
            <button
              key={cat.id ?? 'all'}
              className={`menu-cat-tab ${activeCategoryId === cat.id ? 'active' : ''}`}
              onClick={() => scrollToCategory(cat.id)}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Dietary Filter Chips */}
      {!showSearch && availableDietaryTags.length > 0 && (
        <div className="menu-dietary-bar">
          {availableDietaryTags.map((tag) => (
            <button
              key={tag}
              className={`menu-dietary-chip ${selectedDietaryTag === tag ? 'active' : ''}`}
              onClick={() => setSelectedDietaryTag(selectedDietaryTag === tag ? null : tag)}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* Product List */}
      <div className="menu-product-list scroll-container">
        {loading ? (
          <>
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="skeleton menu-skeleton-card" />
            ))}
          </>
        ) : filteredItems.length === 0 ? (
          <div className="menu-empty-state">
            <div className="menu-empty-icon">
              <Coffee size={24} color={LOKA.copper} strokeWidth={1.5} />
            </div>
            <p className="menu-empty-title">
              {searchQuery ? `No items match "${searchQuery}"` : loadError ? 'Unable to load menu' : 'No items available'}
            </p>
            {searchQuery && (
              <button className="btn btn-primary btn-pill" onClick={() => setSearchQuery('')}>
                Clear search
              </button>
            )}
            {loadError && (
              <button className="btn btn-primary btn-pill mt-2" onClick={loadMenu}>
                Retry
              </button>
            )}
          </div>
        ) : (
          itemsByCategory.map(({ category, items }) => (
            <div key={category.id} ref={(el) => { sectionRefs.current.set(category.id, el); }} data-category-id={category.id}>
              <div className="menu-category-header">
                <div className="menu-category-accent" />
                <h2 className="menu-category-title">
                  {category.name}
                </h2>
              </div>
              <div className="menu-items-grid">
                {items.map((item) => {
                  const imgSrc = resolveAssetUrl(item.image_url);
                  return (
                    <div
                      key={item.id}
                      className="menu-product-card"
                      onClick={() => openItem(item)}
                    >
                      <div className="menu-product-img">
                        {imgSrc && !brokenImages.has(item.id) ? (
                          <img src={imgSrc} alt={item.name} loading="lazy" className="menu-product-img-bg" onError={() => { setBrokenImages(prev => new Set(prev).add(item.id)); }} />
                        ) : (
                          <div className="menu-img-fallback">
                            <Coffee size={28} color={LOKA.border} strokeWidth={1.5} />
                          </div>
                        )}
                        {item.is_featured && (
                          <span className="menu-img-badge"><Star color="#C9A84C" size={12} fill="currentColor" /></span>
                        )}
                      </div>
                      <div className="menu-product-info">
                        <div>
                          <div className="menu-product-name">{item.name}</div>
                          {item.description && (
                            <div className="menu-product-desc">{item.description}</div>
                          )}
                          {item.dietary_tags && item.dietary_tags.length > 0 && (
                            <div className="menu-product-tags">
                              {item.dietary_tags.map((tag: string) => (
                                <span key={tag} className={`menu-product-tag ${tag === 'Vegan' || tag === 'Vegetarian' || tag === 'Gluten-Free' || tag === 'Dairy-Free' || tag === 'Sugar-Free' ? 'menu-tag-teal' : tag === 'Hot' || tag === 'Iced' || tag === 'Caffeinated' || tag === 'Decaf' ? 'menu-tag-green' : 'menu-tag-copper'}`}>{tag}</span>
                              ))}
                            </div>
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
