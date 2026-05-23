'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useDebounce } from '@/hooks/useDebounce';
import { Search, X, ArrowLeft, Plus, Coffee, Star, Crown } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { useCartStore } from '@/stores/cartStore';
import { useWalletStore } from '@/stores/walletStore';
import api from '@/lib/api';
import type { MenuItem } from '@/lib/api';
import FloatingCartBar from '@/components/menu/FloatingCartBar';
import ItemCustomizeSheet from '@/components/menu/ItemCustomizeSheet';
import { formatPrice, resolveAssetUrl, LOKA } from '@/lib/tokens';

export default function MenuPage() {
  const { t } = useTranslation();
  const {
    categories,
    menuItems,
    searchQuery,
    setCategories,
    setMenuItems,
    setSearchQuery,
    setPage,
    showToast,
    selectedStore,
  } = useUIStore();

  const addItem = useCartStore((s) => s.addItem);
  const customerTierId = useWalletStore((s) => s.tierId);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);

  const [selectedDietaryTag, setSelectedDietaryTag] = useState<string | null>(null);
  const [brokenImages, setBrokenImages] = useState<Set<number>>(new Set());
  const [customizeItem, setCustomizeItem] = useState<MenuItem | null>(null);

  const sectionRefs = useRef<Map<number, HTMLElement | null>>(new Map());
  const navRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const loadMenu = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      // v3: /menu/categories and /menu/items both map to /menu/stores/{store_id}
      // which returns { items: [...], categories: [...] }
      const res = await api.get(`/menu/categories`);
      const data = res.data;
      if (data && typeof data === 'object' && data.categories) {
        // Response already mapped to { items, categories } by api.ts
        setCategories(Array.isArray(data.categories) ? data.categories : []);
        setMenuItems(Array.isArray(data.items) ? data.items : []);
      } else if (Array.isArray(data)) {
        // Fallback: flat array (legacy)
        setCategories([]);
        setMenuItems(data);
      } else {
        setCategories([]);
        setMenuItems([]);
      }
    } catch {
      setCategories([]);
      setMenuItems([]);
      setLoadError(true);
      showToast(t('menu.loadErrorToast'), 'error');
    } finally {
      setLoading(false);
    }
  }, [setCategories, setMenuItems, showToast, t]);

  useEffect(() => {
    loadMenu();
  }, [loadMenu]);

  /* intersection observer for active category */
  useEffect(() => {
    const mountedRef = { current: true };
    if (observerRef.current) observerRef.current.disconnect();
    const rafId = requestAnimationFrame(() => {
      if (!mountedRef.current) return;
      observerRef.current = new IntersectionObserver(
        (entries) => {
          if (!mountedRef.current) return;
          const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
          if (visible.length > 0) {
            const firstVisible = visible[0];
            if (!firstVisible) return;
            const id = Number(firstVisible.target.getAttribute('data-category-id'));
            setActiveCategoryId(id);
          }
        },
        { rootMargin: '-20% 0px -70% 0px', threshold: [0, 0.5, 1] }
      );
      sectionRefs.current.forEach((el) => { if (el && mountedRef.current) observerRef.current?.observe(el); });
    });
    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(rafId);
      observerRef.current?.disconnect();
    };
  }, [categories, menuItems]);

  const openItem = useCallback((item: MenuItem) => {
    if ((item.customization_count ?? 0) > 0) {
      setCustomizeItem(item);
      return;
    }
    addItem({ menu_item_id: item.id, name: item.name, price: item.base_price, base_price: item.base_price, quantity: 1, customizations: {}, store_id: selectedStore?.id, customization_count: item.customization_count ?? 0 });
  }, [addItem, selectedStore?.id]);

  const handleCustomizeAdd = useCallback((item: MenuItem, quantity: number, selectedOptions: { id: number; name: string; price_adjustment: number }[], totalPrice: number) => {
    addItem({
      menu_item_id: item.id,
      name: item.name,
      price: totalPrice,
      base_price: item.base_price,
      quantity,
      customizations: { options: selectedOptions.map(o => ({ id: o.id, name: o.name, price_adjustment: o.price_adjustment })) },
      store_id: selectedStore?.id,
      customization_option_ids: selectedOptions.map(o => o.id),
      customization_count: selectedOptions.length,
    });
    setCustomizeItem(null);
  }, [addItem, selectedStore?.id]);

  const debouncedSearch = useDebounce(searchQuery, 150);

  const filteredItems = useMemo(() => menuItems.filter((item) => {
    const matchesSearch = !debouncedSearch || item.name.toLowerCase().includes(debouncedSearch.toLowerCase());
    const matchesDietary = !selectedDietaryTag || (item.dietary_tags && item.dietary_tags.some((t: string) => t.toLowerCase() === selectedDietaryTag.toLowerCase()));
    const hasTierAccess = !item.minimum_tier_id || customerTierId >= item.minimum_tier_id;
    return matchesSearch && matchesDietary && hasTierAccess && item.is_available;
  }), [menuItems, debouncedSearch, selectedDietaryTag, customerTierId]);

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

  const allCats = useMemo(() => [{ id: null as number | null, name: t('menu.all') }, ...categories.map((c) => ({ id: c.id, name: c.name }))], [categories, t]);

  const scrollToCategory = useCallback((categoryId: number | null) => {
    setActiveCategoryId(categoryId);
    if (categoryId === null) {
      const firstCatId = categories[0]?.id;
      if (firstCatId !== undefined) {
        const first = sectionRefs.current.get(firstCatId);
        if (first) first.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
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
                placeholder={t('menu.searchPlaceholder')}
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
              {t('common.cancel')}
            </button>
          </div>
        ) : (
          <>
            <div className="menu-header-left">
              <button className="menu-back-btn" onClick={() => setPage('home')} aria-label={t('common.back')}>
                <ArrowLeft size={20} />
              </button>
              <h1 className="menu-title">{t('menu.title')}</h1>
            </div>
            <button className="menu-search-btn" onClick={() => setShowSearch(true)} aria-label={t('menu.search')}>
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
              aria-selected={activeCategoryId === cat.id}
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
              {searchQuery ? t('menu.noSearchResults', { query: searchQuery }) : loadError ? t('menu.loadError') : t('menu.noItemsAvailable')}
            </p>
            {searchQuery && (
              <button className="btn btn-primary btn-pill" onClick={() => setSearchQuery('')}>
                {t('menu.clearSearch')}
              </button>
            )}
            {loadError && (
              <button className="btn btn-primary btn-pill mt-2" onClick={loadMenu}>
                {t('common.retry')}
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
                          <img src={imgSrc} alt={item.name} loading="lazy" width="160" height="160" className="menu-product-img-bg" onError={() => { setBrokenImages(prev => new Set(prev).add(item.id)); }} />
                        ) : (
                          <div className="menu-img-fallback">
                            <Coffee size={28} color={LOKA.border} strokeWidth={1.5} />
                          </div>
                        )}
                        {item.is_featured && (
                          <span className="menu-img-badge"><Star color="#C9A84C" size={12} fill="currentColor" /></span>
                        )}
                        {item.minimum_tier_id && (
                          <span className="menu-img-badge" style={{ right: 4, top: 4, left: 'auto', background: 'rgba(0,0,0,0.6)', color: '#C9A84C', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>
                            <Crown size={10} style={{ display: 'inline', verticalAlign: 'middle' }} /> MEMBERS
                          </span>
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
                          {item.calories != null && item.calories > 0 && (
                            <div className="menu-product-calories" style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 2 }}>
                              {item.calories} kcal
                            </div>
                          )}
                          {item.allergens && item.allergens.length > 0 && (
                            <div className="menu-product-allergens">
                              {item.allergens.map((a) => (
                                <span key={a.display_name} className={`menu-allergen-badge menu-allergen-${a.severity || 'medium'}`} title={a.display_name}>
                                  {a.display_name}
                                </span>
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
                            <Plus size={14} strokeWidth={2.5} /> {t('common.add')}
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

      {customizeItem && (
        <ItemCustomizeSheet
          item={customizeItem}
          isOpen={customizeItem !== null}
          onClose={() => setCustomizeItem(null)}
          onAdd={handleCustomizeAdd}
          customizations={customizeItem.customization_options || []}
        />
      )}

      <FloatingCartBar />
    </div>
  );
}
