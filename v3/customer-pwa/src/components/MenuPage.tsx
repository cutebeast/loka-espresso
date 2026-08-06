'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useDebounce } from '@/hooks/useDebounce';
import { Search, X, ArrowLeft, Plus, Coffee, Star, Crown, KeyRound, Lock, Heart } from 'lucide-react';
import { useFavoritesStore, type FavoriteItem } from '@/stores/favoritesStore';
import { useUIStore } from '@/stores/uiStore';
import { useCartStore } from '@/stores/cartStore';
import { useWalletStore } from '@/stores/walletStore';
import api from '@/lib/api';
import type { MenuItem, BundleProduct, BundleCategory, EventCategory, MenuCategory } from '@/lib/api';
import { deriveCustomizationOptions } from '@/lib/storeHelpers';
import FloatingCartBar from '@/components/menu/FloatingCartBar';
import ItemCustomizeSheet from '@/components/menu/ItemCustomizeSheet';
import AddonDealSheet from '@/components/menu/AddonDealSheet';
import BundlePickerSheet from '@/components/menu/BundlePickerSheet';
import MultiCourseBundleSheet from '@/components/menu/MultiCourseBundleSheet';
import ExperienceCard, { type ExperienceSession } from '@/components/menu/ExperienceCard';
import ExperienceDetailSheet from '@/components/menu/ExperienceDetailSheet';
import { bundleIdsInCart } from '@/lib/addonDeal';
import { formatPrice, resolveAssetUrl, LOKA } from '@/lib/tokens';
import { getLocale } from '@/stores/localeStore';

// Synthetic section ids for bundle-category sections — kept far outside the
// real menu-category id space so the scroll-spy/nav chips can treat bundle
// sections like ordinary category sections.
const BUNDLE_SECTION_ID_BASE = 900000;
const UNCATEGORIZED_BUNDLE_SECTION_ID = 999999;

export default function MenuPage() {
  const {
    t
  } = useTranslation();
  const {
    categories,
    menuItems,
    searchQuery,
    setCategories,
    setMenuItems,
    setSearchQuery,
    setPage,
    showToast,
    selectedStore
  } = useUIStore();
  const addItem = useCartStore(s => s.addItem);
  const cartItems = useCartStore(s => s.items);
  const customerTierId = useWalletStore(s => s.tierId);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [inputValue, setInputValue] = useState(searchQuery);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<number | null>(null);
  // Deep-link target (e.g. from an event card's "Book on the Menu" action)
  const deepLinkCategoryId = useUIStore(s => s.selectedCategoryId);
  const setDeepLinkCategoryId = useUIStore(s => s.setSelectedCategoryId);
  const [selectedDietaryTag, setSelectedDietaryTag] = useState<string | null>(null);
  const [brokenImages, setBrokenImages] = useState<Set<number>>(new Set());
  const [customizeItem, setCustomizeItem] = useState<MenuItem | null>(null);
  const [experienceDetailItem, setExperienceDetailItem] = useState<MenuItem | null>(null);
  const { favorites, toggleFavorite } = useFavoritesStore();
  const addUsual = useCallback((fav: FavoriteItem) => {
    const item = menuItems.find(i => i.id === fav.menu_item_id && i.is_available);
    if (!item) {
      showToast(t('menu.noItemsAvailable'), 'error');
      return;
    }
    addItem({
      menu_item_id: fav.menu_item_id,
      name: fav.variant_name ? `${fav.name} (${fav.variant_name})` : fav.name,
      price: fav.price,
      base_price: fav.base_price,
      quantity: 1,
      variant_id: fav.variant_id ?? undefined,
      variant_name: fav.variant_name ?? undefined,
      customizations: { options: fav.options.map(o => ({ id: o.id, name: o.name, price_adjustment: o.price_adjustment })) },
      customization_option_ids: fav.options.map(o => o.id),
      customization_count: fav.options.length,
      store_id: selectedStore?.id,
    });
    showToast(t('menu.addedToCart'), 'success');
  }, [menuItems, addItem, selectedStore?.id, showToast, t]);
  const [bundleProducts, setBundleProducts] = useState<BundleProduct[]>([]);
  // type_key -> engine mechanic, from the public /bundle-types endpoint
  const [bundleTypeMechanics, setBundleTypeMechanics] = useState<Record<string, string>>({});
  const [bundleCategories, setBundleCategories] = useState<BundleCategory[]>([]);
  const [eventCategories, setEventCategories] = useState<EventCategory[]>([]);
  const [workshopSessions, setWorkshopSessions] = useState<Record<number, ExperienceSession[]>>({});
  // menu_item_id -> event_category_id, captured from the workshops payload
  const [workshopEventCatMap, setWorkshopEventCatMap] = useState<Record<number, number | null>>({});
  const [pendingAddonBundle, setPendingAddonBundle] = useState<BundleProduct | null>(null);
  const [pickerBundle, setPickerBundle] = useState<BundleProduct | null>(null);
  const [multiCourseBundle, setMultiCourseBundle] = useState<BundleProduct | null>(null);
  const activeBundleIds = useMemo(() => new Set(bundleIdsInCart(cartItems)), [cartItems]);
  const sectionRefs = useRef<Map<number, HTMLElement | null>>(new Map());
  const navRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMenu = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError(false);
    try {
      const storeId = selectedStore?.id;
      const [catRes, itemRes, bpRes, wsRes, bcRes, ecRes, btRes] = await Promise.all([api.get(`/menu/categories`, {
        signal
      }), api.get(`/menu/items`, {
        signal,
        params: { limit: 500 }
      }), api.get(`/menu/bundle-products`, {
        signal,
        params: storeId ? {
          store_id: storeId
        } : undefined
      }).catch(() => ({
        data: []
      })), api.get(`/menu/workshops`, {
        signal,
        params: { locale: getLocale() }
      }).catch(() => ({
        data: []
      })), api.get(`/bundle-categories`, {
        signal,
        params: { locale: getLocale() }
      }).catch(() => ({
        data: { data: { categories: [] } }
      })), api.get(`/event-categories`, {
        signal,
        params: { locale: getLocale() }
      }).catch(() => ({
        data: { data: { categories: [] } }
      })), api.get(`/bundle-types`, {
        signal,
        params: { locale: getLocale() }
      }).catch(() => ({
        data: []
      }))]);
      const catData = catRes.data;
      const itemData = itemRes.data;
      const rawCats = Array.isArray(catData) ? catData : catData?.categories || catData?.items || [];
      setCategories(rawCats as MenuCategory[]);
      setMenuItems(Array.isArray(itemData) ? itemData : itemData?.items || []);
      setBundleProducts((bpRes as {
        data?: BundleProduct[];
      })?.data || []);
      // Bundle/event grouping categories: { data: { categories: [...] } }
      const bcBody = (bcRes as { data?: { data?: { categories?: BundleCategory[] }; categories?: BundleCategory[] } }).data;
      setBundleCategories(bcBody?.data?.categories || bcBody?.categories || []);
      const ecBody = (ecRes as { data?: { data?: { categories?: EventCategory[] }; categories?: EventCategory[] } }).data;
      setEventCategories(ecBody?.data?.categories || ecBody?.categories || []);
      // Session availability for experience (class/workshop) cards
      const wsList = Array.isArray((wsRes as { data?: unknown }).data)
        ? (wsRes as { data: { id: number; sessions?: ExperienceSession[]; event_category_id?: number | null }[] }).data
        : [];
      const wsMap: Record<number, ExperienceSession[]> = {};
      const wsEventCat: Record<number, number | null> = {};
      for (const w of wsList) {
        wsMap[w.id] = w.sessions || [];
        wsEventCat[w.id] = w.event_category_id ?? null;
      }
      setWorkshopSessions(wsMap);
      setWorkshopEventCatMap(wsEventCat);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setCategories([]);
      setMenuItems([]);
      setLoadError(true);
      showToast(t('menu.loadErrorToast'), 'error');
    } finally {
      setLoading(false);
    }
  }, [setCategories, setMenuItems, showToast, t, selectedStore]);
  useEffect(() => {
    const controller = new AbortController();
    loadMenu(controller.signal);
    return () => {
      controller.abort();
    };
  }, [loadMenu]);

  // Bundle sections: one per bundle category that has bundles (ordered by
  // display_order), plus an uncategorized bucket for bundles without one.
  const bundleSections = useMemo(() => {
    const sections: { id: number; name: string; bundles: BundleProduct[] }[] = [];
    const sorted = [...bundleCategories].sort((a, b) => a.display_order - b.display_order);
    for (const bc of sorted) {
      const bundles = bundleProducts.filter(bp => bp.bundle_category_id === bc.id);
      if (bundles.length > 0) sections.push({ id: BUNDLE_SECTION_ID_BASE + bc.id, name: bc.name, bundles });
    }
    const uncategorized = bundleProducts.filter(bp => bp.bundle_category_id == null || !sorted.some(bc => bc.id === bp.bundle_category_id));
    if (uncategorized.length > 0) sections.push({ id: UNCATEGORIZED_BUNDLE_SECTION_ID, name: t('menu.bundles'), bundles: uncategorized });
    return sections;
  }, [bundleCategories, bundleProducts, t]);

  /* intersection observer for active category */
  useEffect(() => {
    const mountedRef = {
      current: true
    };
    if (observerRef.current) observerRef.current.disconnect();
    const rafId = requestAnimationFrame(() => {
      if (!mountedRef.current) return;
      observerRef.current = new IntersectionObserver(entries => {
        if (!mountedRef.current) return;
        const visible = entries.filter(e => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length > 0) {
          const firstVisible = visible[0];
          if (!firstVisible) return;
          const id = Number(firstVisible.target.getAttribute('data-category-id'));
          setActiveCategoryId(id);
        }
      }, {
        rootMargin: '-20% 0px -70% 0px',
        threshold: [0, 0.5, 1]
      });
      sectionRefs.current.forEach(el => {
        if (el && mountedRef.current) observerRef.current?.observe(el);
      });
    });
    return () => {
      mountedRef.current = false;
      cancelAnimationFrame(rafId);
      observerRef.current?.disconnect();
    };
  }, [categories, menuItems, bundleSections]);
  const openItem = useCallback((item: MenuItem) => {
    if ((item.modifier_groups?.length ?? 0) > 0 || (item.variants?.length ?? 0) > 0) {
      setCustomizeItem(item);
      return;
    }
    addItem({
      menu_item_id: item.id,
      name: item.item_name,
      price: item.base_price,
      base_price: item.base_price,
      quantity: 1,
      customizations: {},
      store_id: selectedStore?.id,
      customization_count: item.modifier_groups?.length ?? 0
    });
  }, [addItem, selectedStore?.id]);
  const handleCustomizeAdd = useCallback((item: MenuItem, quantity: number, selectedOptions: {
    id: number;
    name: string;
    price_adjustment: number;
  }[], totalPrice: number, variant?: {
    id: number;
    variant_name: string;
    price_adjustment: number;
  } | null, session?: {
    id: number;
    session_date: string;
    start_time: string;
    location: string | null;
  } | null) => {
    const sessionLabel = session ? `${new Date(`${session.session_date}T${session.start_time}`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${session.start_time}` : undefined;
    addItem({
      menu_item_id: item.id,
      name: variant ? `${item.item_name} (${variant.variant_name})` : item.item_name,
      price: totalPrice,
      base_price: item.base_price,
      quantity,
      variant_id: variant?.id,
      variant_name: variant?.variant_name,
      class_session_id: session?.id,
      class_session_label: sessionLabel,
      customizations: {
        options: selectedOptions.map(o => ({
          id: o.id,
          name: o.name,
          price_adjustment: o.price_adjustment
        }))
      },
      store_id: selectedStore?.id,
      customization_option_ids: selectedOptions.map(o => o.id),
      customization_count: selectedOptions.length
    });
    setCustomizeItem(null);
  }, [addItem, selectedStore?.id]);
  const handleAddBundle = useCallback((bp: BundleProduct) => {
    if (bp.bundle_type === 'multi_course') {
      setMultiCourseBundle(bp);
      return;
    }
    if (bp.pick_count && bp.pick_count > 0) {
      setPickerBundle(bp);
      return;
    }
    // Fixed/standard bundles require every component to be available.
    const unavailable: string[] = [];
    for (const comp of bp.components) {
      const mi = menuItems.find(i => i.id === comp.menu_item_id);
      if (!mi?.is_available) {
        unavailable.push(comp.menu_item_name || mi?.item_name || `Item #${comp.menu_item_id}`);
      }
    }
    if (unavailable.length > 0) {
      showToast(`${t('menu.bundleIncompleteToast')} ${unavailable.join(', ')}`, 'warning');
      return;
    }
    for (const comp of bp.components) {
      const mi = menuItems.find(i => i.id === comp.menu_item_id)!;
      addItem({
        menu_item_id: comp.menu_item_id,
        name: comp.menu_item_name || mi.item_name || `Item #${comp.menu_item_id}`,
        price: comp.menu_item_price ?? 0,
        base_price: comp.menu_item_price ?? 0,
        quantity: comp.default_quantity || 1,
        customizations: {},
        store_id: selectedStore?.id,
        customization_count: 0,
        bundle_product_id: bp.id,
        bundle_component_id: comp.id
      });
    }
    showToast(`${bp.title} ${t('menu.addedToCartToast')}`, 'success');
    setPendingAddonBundle(bp);
  }, [addItem, selectedStore?.id, showToast, t]);
  const debouncedSearch = useDebounce(searchQuery, 150);
  useEffect(() => {
    setInputValue(searchQuery);
  }, [searchQuery]);
  const filteredItems = useMemo(() => menuItems.filter(item => {
    const matchesSearch = !debouncedSearch || item.item_name.toLowerCase().includes(debouncedSearch.toLowerCase());
    const matchesDietary = !selectedDietaryTag || item.dietary_tags && item.dietary_tags.some((t: string) => t.toLowerCase() === selectedDietaryTag.toLowerCase());
    return matchesSearch && matchesDietary && item.is_available;
  }), [menuItems, debouncedSearch, selectedDietaryTag]);
  const availableDietaryTags = useMemo(() => {
    const tags = new Set<string>();
    menuItems.forEach(item => {
      if (item.dietary_tags) {
        item.dietary_tags.forEach((t: string) => tags.add(t));
      }
    });
    return Array.from(tags).sort();
  }, [menuItems]);
  const itemsByCategory = useMemo(() => categories.map(cat => ({
    category: cat,
    // Tier-locked ("Vault") items live only in the Vault section, not the grids
    items: filteredItems.filter(item => item.category_id === cat.id && !item.minimum_tier_id)
  })).filter(group => group.items.length > 0), [categories, filteredItems]);
  const vaultItems = useMemo(() => filteredItems.filter(item => item.minimum_tier_id), [filteredItems]);
  // Public tier names for the Vault "Unlock at X" hints
  const [tierNames, setTierNames] = useState<Record<number, string>>({});
  useEffect(() => {
    if (vaultItems.length === 0) return;
    api.get('/loyalty/tiers').then(res => {
      const map: Record<number, string> = {};
      for (const t2 of (Array.isArray(res.data) ? res.data : [])) map[t2.id] = t2.display_name;
      setTierNames(map);
    }).catch(() => setTierNames({}));
  }, [vaultItems.length]);
  const allCats = useMemo(() => [{
    id: null as number | null,
    name: t('menu.all')
  }, ...categories.map(c => ({
    id: c.id,
    name: c.category_name
  })), ...bundleSections.map(s => ({
    id: s.id,
    name: s.name
  }))], [categories, bundleSections, t]);
  const scrollToCategory = useCallback((categoryId: number | null) => {
    setActiveCategoryId(categoryId);
    if (categoryId === null) {      const firstCatId = categories[0]?.id;
      if (firstCatId !== undefined) {
        const first = sectionRefs.current.get(firstCatId);
        if (first) first.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }
    } else {
      const el = sectionRefs.current.get(categoryId);
      if (el) el.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  }, [categories, setActiveCategoryId]);

  // Honor deep-link category selection (e.g. event card "Book on the Menu")
  useEffect(() => {
    if (deepLinkCategoryId != null && categories.length > 0) {
      scrollToCategory(deepLinkCategoryId);
      setDeepLinkCategoryId(null);
    }
  }, [deepLinkCategoryId, categories, scrollToCategory, setDeepLinkCategoryId]);

  // Group experience/workshop items by their event category (ordered by
  // display_order); items without a known event category go last, untitled.
  const groupExperienceItems = useCallback((items: MenuItem[]) => {
    const groups: { id: number | null; name: string | null; items: MenuItem[] }[] = [];
    const sorted = [...eventCategories].sort((a, b) => a.display_order - b.display_order);
    for (const ec of sorted) {
      const catItems = items.filter(item => workshopEventCatMap[item.id] === ec.id);
      if (catItems.length > 0) groups.push({ id: ec.id, name: ec.name, items: catItems });
    }
    const rest = items.filter(item => !sorted.some(ec => ec.id === workshopEventCatMap[item.id]));
    if (rest.length > 0) groups.push({ id: null, name: null, items: rest });
    return groups;
  }, [eventCategories, workshopEventCatMap]);

  const renderExperienceCard = (item: MenuItem) => <ExperienceCard
      key={item.id}
      item={item}
      sessions={workshopSessions[item.id] || []}
      imageBroken={brokenImages.has(item.id)}
      onImageError={() => setBrokenImages(prev => new Set(prev).add(item.id))}
      onBook={() => setExperienceDetailItem(item)}
    />;

  // Bundle card markup — same look as the old inline bundle cards
  const renderBundleCard = (bp: BundleProduct) => {
    const bpImg = resolveAssetUrl(bp.image_url);
    return <div key={`bp-${bp.id}`} className="menu-product-card" onClick={() => handleAddBundle(bp)}>
        <div className="menu-product-img">
          {bpImg ? <img src={bpImg} alt={bp.title} loading="lazy" className="menu-product-img-bg" /> : <div className="menu-img-fallback">
              <Coffee size={28} color={LOKA.border} strokeWidth={1.5} />
            </div>}
          <span className="menu-img-badge" style={{
            background: 'var(--color-success-light)',
            color: 'var(--color-success)',
            fontSize: 10,
            fontWeight: 700,
            padding: '2px 8px',
            borderRadius: 20,
            left: 4
          }}>
            {bp.pick_count && bp.pick_count > 0 ? t('menu.pickXBadge', {
              count: bp.pick_count
            }) : t('menu.comboBadge')}
          </span>
        </div>
        <div className="menu-product-info">
          <div className="menu-product-name">{bp.title}</div>
          <div className="menu-product-desc" style={{
            fontSize: 11
          }}>
            {bp.pick_count && bp.pick_count > 0 ? t('menu.pickXSubtitle', {
              count: bp.pick_count
            }) : `${(bp.components || []).slice(0, 3).map(c => c.menu_item_name || t('menu.itemFallback')).join(" + ")}${(bp.components || []).length > 3 ? t('menu.moreCount', { count: (bp.components || []).length - 3 }) : ""}`}
          </div>
          <div className="menu-product-price">{formatPrice(bp.bundle_price)}</div>
        </div>
      </div>;
  };

  // Auto-scroll active tab into view in the horizontal category bar
  useEffect(() => {
    if (!navRef.current || activeCategoryId === null) return;
    const activeTab = navRef.current.querySelector('.menu-cat-tab.active');
    if (activeTab) {
      activeTab.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
      });
    }
  }, [activeCategoryId]);
  return <div className="menu-screen">
      {/* Header */}
      <div className="menu-header">
        {showSearch ? <div className="menu-search-bar">
            <div className="menu-search-input-wrap">
              <Search size={14} color={LOKA.textMuted} />
              <input type="text" autoFocus placeholder={t('menu.searchPlaceholder')} value={inputValue} onChange={e => {
                setInputValue(e.target.value);
                if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
                searchTimeoutRef.current = setTimeout(() => {
                  setSearchQuery(e.target.value);
                }, 300);
              }} className="menu-search-input" />
              {searchQuery && <button onClick={() => setSearchQuery('')} className="menu-search-clear">
                  <X size={14} />
                </button>}
            </div>
            <button onClick={() => {
          setShowSearch(false);
          setSearchQuery('');
        }} className="menu-search-cancel">
              {t('common.cancel')}
            </button>
          </div> : <>
            <div className="menu-header-left">
              <button className="menu-back-btn" onClick={() => setPage('home')} aria-label={t('common.back')}>
                <ArrowLeft size={20} />
              </button>
              <h1 className="menu-title">{t('menu.title')}</h1>
            </div>
            <button className="menu-search-btn" onClick={() => setShowSearch(true)} aria-label={t('menu.search')}>
              <Search size={18} />
            </button>
          </>}
      </div>

      {/* Your Usuals — one-tap reorder of saved drinks */}
      {!showSearch && favorites.length > 0 && <div className="menu-usuals-bar">
          <span className="menu-usuals-label">{t('menu_page.usuals')}</span>
          <div className="menu-usuals-scroll">
            {favorites.map(fav => <button key={fav.menu_item_id} className="menu-usual-chip" onClick={() => addUsual(fav)}>
                {fav.image_url ? <img src={resolveAssetUrl(fav.image_url) ?? undefined} alt="" className="menu-usual-img" loading="lazy" /> : <Coffee size={14} color={LOKA.border} />}
                <span className="menu-usual-name">{fav.variant_name ? `${fav.name} (${fav.variant_name})` : fav.name}</span>
                <span className="menu-usual-price">{formatPrice(fav.price)}</span>
              </button>)}
          </div>
        </div>}

      {/* Category Tabs */}
      {!showSearch && categories.length > 0 && <div className="menu-cat-bar" ref={navRef}>
          {allCats.map(cat => <button key={cat.id ?? 'all'} className={`menu-cat-tab ${activeCategoryId === cat.id ? 'active' : ''}`} onClick={() => scrollToCategory(cat.id)} aria-pressed={activeCategoryId === cat.id}>
              {cat.name}
            </button>)}
        </div>}

      {/* Dietary Filter Chips */}
      {!showSearch && availableDietaryTags.length > 0 && <div className="menu-dietary-bar">
          {availableDietaryTags.map(tag => <button key={tag} className={`menu-dietary-chip ${selectedDietaryTag === tag ? 'active' : ''}`} onClick={() => setSelectedDietaryTag(selectedDietaryTag === tag ? null : tag)}>
              {tag}
            </button>)}
        </div>}

      {/* Product List */}
      <div className="menu-product-list scroll-container">
        {/* The Vault — members-only items, locked below the required tier */}
        {!loading && vaultItems.length > 0 && !showSearch && <div className="menu-vault-section">
            <div className="menu-vault-header">
              <span className="menu-vault-key"><KeyRound size={18} color="var(--color-gold)" /></span>
              <div>
                <div className="menu-vault-title">{t('menu_page.vault_title')}</div>
                <div className="menu-vault-sub">{t('menu_page.vault_sub')}</div>
              </div>
            </div>
            {vaultItems.map(item => {
              const minTier = item.minimum_tier_id ?? 0;
              const locked = !customerTierId || customerTierId < minTier;
              const imgSrc = resolveAssetUrl(item.image_url);
              return <div key={item.id} className={`menu-vault-card ${locked ? 'locked' : ''}`} onClick={() => { if (!locked) openItem(item); }}>
                      <div className="menu-product-img">
                        {imgSrc && !brokenImages.has(item.id) ? <img src={imgSrc} alt={item.item_name} loading="lazy" className="menu-product-img-bg" onError={() => {
                  setBrokenImages(prev => new Set(prev).add(item.id));
                }} /> : <div className="menu-img-fallback">
                            <Coffee size={28} color={LOKA.border} strokeWidth={1.5} />
                          </div>}
                        {locked && <span className="menu-vault-lock-badge"><Lock size={10} /> {t('menu_page.members')}</span>}
                      </div>
                      <div className="menu-product-info">
                        <div className="menu-product-name">{item.item_name}</div>
                        <div className="menu-product-desc">{item.description}</div>
                        <div className="menu-product-bottom">
                          <span className="menu-product-price">{formatPrice(item.base_price)}</span>
                          {locked ? <span className="menu-vault-lock-chip"><Lock size={11} /> {t('menu_page.vault_unlock', { tier: tierNames[minTier] || '…' })}</span> : <button className="menu-add-btn" onClick={e => {
                    e.stopPropagation();
                    openItem(item);
                  }}>
                              <Plus size={14} strokeWidth={2.5} /> {t('common.add')}
                            </button>}
                        </div>
                      </div>
                    </div>;
            })}
          </div>}
        {loading ? <>
            {[1, 2, 3, 4, 5].map(i => <div key={i} className="skeleton menu-skeleton-card" />)}
          </> : filteredItems.length === 0 ? <div className="menu-empty-state">
            <div className="menu-empty-icon">
              <Coffee size={24} color={LOKA.copper} strokeWidth={1.5} />
            </div>
            <p className="menu-empty-title">
              {searchQuery ? t('menu.noSearchResults', {
            query: searchQuery
          }) : loadError ? t('menu.loadError') : t('menu.noItemsAvailable')}
            </p>
            {searchQuery && <button className="btn btn-primary btn-pill" onClick={() => setSearchQuery('')}>
                {t('menu.clearSearch')}
              </button>}
            {loadError && <button className="btn btn-primary btn-pill mt-2" onClick={() => {
          const ctrl = new AbortController();
          loadMenu(ctrl.signal);
        }}>
                {t('common.retry')}
              </button>}
          </div> : itemsByCategory.map(({
        category,
        items
      }) => <div key={category.id} ref={el => {
        sectionRefs.current.set(category.id, el);
      }} data-category-id={category.id}>
              <div className="menu-category-header">
                <div className="menu-category-accent" />
                <h2 className="menu-category-title">
                  {category.category_name}
                </h2>
              </div>
              {/* Classes/workshops get a rich booking card, not a product card —
                  they need the full description, schedule and a Book CTA.
                  Grouped by event category (Workshops, Experiences, ...). */}
              {category.slug === 'experiences' ? <>
                  {groupExperienceItems(items).map(group => <div key={group.id ?? 'uncategorized'}>
                      {group.name && <div className="menu-category-header">
                          <div className="menu-category-accent" />
                          <h3 className="menu-category-title">{group.name}</h3>
                        </div>}
                      <div className="menu-experience-list">
                        {group.items.map(renderExperienceCard)}
                      </div>
                    </div>)}
                </> : <>
              <div className="menu-items-grid">
                {items.map(item => {
            const imgSrc = resolveAssetUrl(item.image_url);
            const isFav = favorites.some(f => f.menu_item_id === item.id);
            return <div key={item.id} className="menu-product-card" onClick={() => openItem(item)}>
                      <div className="menu-product-img">
                        {imgSrc && !brokenImages.has(item.id) ? <img src={imgSrc} alt={item.item_name} loading="lazy" width="160" height="160" className="menu-product-img-bg" onError={() => {
                  setBrokenImages(prev => new Set(prev).add(item.id));
                }} /> : <div className="menu-img-fallback">
                            <Coffee size={28} color={LOKA.border} strokeWidth={1.5} />
                          </div>}
                        <button
                          className={`menu-fav-btn ${isFav ? 'active' : ''}`}
                          onClick={e => {
                            e.stopPropagation();
                            toggleFavorite({
                              menu_item_id: item.id,
                              name: item.item_name,
                              price: item.base_price,
                              base_price: item.base_price,
                              image_url: item.image_url ?? null,
                              variant_id: null,
                              variant_name: null,
                              options: [],
                            });
                          }}
                          aria-label={isFav ? t('menu_page.removeUsualAria') : t('menu_page.saveUsualAria')}
                          aria-pressed={isFav}
                        >
                          <Heart size={13} fill={isFav ? 'currentColor' : 'none'} />
                        </button>
                        {item.is_featured && <span className="menu-img-badge"><Star color="var(--color-gold)" size={12} fill="currentColor" /></span>}
                        {item.minimum_tier_id && <span className="menu-img-badge" style={{
                  right: 4,
                  top: 4,
                  left: 'auto',
                  background: 'rgba(0,0,0,0.6)',
                  color: 'var(--color-gold)',
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: 4
                }}>
                            <Crown size={10} style={{
                    display: 'inline',
                    verticalAlign: 'middle'
                  }} />{t("menu_page.members")}</span>}
                        {item.is_addon_deal_eligible && (() => {
                  const isActive = (item.eligible_bundle_ids || []).some(bid => activeBundleIds.has(bid));
                  return <span className={`menu-addon-badge ${isActive ? 'active' : ''}`} style={isActive ? undefined : {
                    position: 'absolute',
                    bottom: 4,
                    left: 4,
                    background: 'var(--color-primary)',
                    color: '#fff',
                    fontSize: 9,
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: 4
                  }}>
                              {item.addon_discount_type === 'percentage' ? `-${item.addon_discount_value ?? 0}%` : `-${formatPrice(item.addon_discount_value ?? 0)}`} {t('menu.addonBadge')}
                            </span>;
                })()}
                      </div>
                      <div className="menu-product-info">
                        <div>
                          <div className="menu-product-name">{item.item_name}</div>
                          {item.description && <div className="menu-product-desc">{item.description}</div>}
                          {item.dietary_tags && item.dietary_tags.length > 0 && <div className="menu-product-tags">
                              {item.dietary_tags.map((tag: string) => <span key={tag} className={`menu-product-tag ${tag === 'Vegan' || tag === 'Vegetarian' || tag === 'Gluten-Free' || tag === 'Dairy-Free' || tag === 'Sugar-Free' ? 'menu-tag-teal' : tag === 'Hot' || tag === 'Iced' || tag === 'Caffeinated' || tag === 'Decaf' ? 'menu-tag-green' : 'menu-tag-copper'}`}>{tag}</span>)}
                            </div>}
                          {item.calories != null && item.calories > 0 && <div className="menu-product-calories" style={{
                    fontSize: 11,
                    color: 'var(--color-text-muted)',
                    marginTop: 2
                  }}>
                              {item.calories}{t("menu_page.kcal")}</div>}
                          {item.allergens && item.allergens.length > 0 && <div className="menu-product-allergens">
                              {item.allergens.map(a => <span key={a.display_name} className={`menu-allergen-badge menu-allergen-${a.severity || 'medium'}`} title={a.display_name}>
                                  {a.display_name}
                                </span>)}
                            </div>}
                        </div>
                        <div className="menu-product-bottom">
                          <span className="menu-product-price">{formatPrice(item.base_price)}</span>
                          <button className="menu-add-btn" onClick={e => {
                    e.stopPropagation();
                    openItem(item);
                  }}>
                            <Plus size={14} strokeWidth={2.5} /> {t('common.add')}
                          </button>
                        </div>
                      </div>
                    </div>;
          })}
              </div>
              </>}
            </div>)}

        {/* Bundle sections — grouped by bundle category, after the F&B categories.
            data-category-id hooks them into the same scroll-spy as F&B sections. */}
        {!loading && !debouncedSearch ? bundleSections.map(section => <div key={section.id} ref={el => {
          // eslint-disable-next-line react-hooks/refs -- same ref-callback pattern as the F&B category sections above; runs at commit time, not during render
          sectionRefs.current.set(section.id, el);
        }} data-category-id={section.id}>
            <div className="menu-category-header">
              <div className="menu-category-accent" />
              <h2 className="menu-category-title">{section.name}</h2>
            </div>
            <div className="menu-items-grid">
              {section.bundles.map(renderBundleCard)}
            </div>
          </div>) : null}
      </div>

      {customizeItem && <ItemCustomizeSheet item={customizeItem} isOpen={customizeItem !== null} onClose={() => setCustomizeItem(null)} onAdd={handleCustomizeAdd} customizations={deriveCustomizationOptions(customizeItem)} />}
      {experienceDetailItem && <ExperienceDetailSheet
        item={experienceDetailItem}
        sessions={workshopSessions[experienceDetailItem.id] || []}
        onClose={() => setExperienceDetailItem(null)}
        onBook={() => {
          const item = experienceDetailItem;
          setExperienceDetailItem(null);
          setCustomizeItem(item);
        }}
      />}
      <AddonDealSheet bundle={pendingAddonBundle} menuItems={menuItems} onClose={() => setPendingAddonBundle(null)} />

      {pickerBundle && <BundlePickerSheet bundle={pickerBundle} onClose={() => setPickerBundle(null)} onDone={bp => {
      setPickerBundle(null);
      setPendingAddonBundle(bp);
    }} />}

      {multiCourseBundle && <MultiCourseBundleSheet bundle={multiCourseBundle} onClose={() => setMultiCourseBundle(null)} onDone={bp => {
      setMultiCourseBundle(null);
      setPendingAddonBundle(bp);
    }} />}

      <FloatingCartBar />
    </div>;
}