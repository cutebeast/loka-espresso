'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { useCartStore } from '@/stores/cartStore';
import api from '@/lib/api';
import type { Category, MenuItem, CustomizationOption } from '@/lib/api';
import CategoryNav from '@/components/menu/CategoryNav';
import ItemCard from '@/components/menu/ItemCard';
import FloatingCartBar from '@/components/menu/FloatingCartBar';
import ItemCustomizeSheet from '@/components/menu/ItemCustomizeSheet';

const LOKA = {
  primary: '#384B16',
  copper: '#D18E38',
  copperSoft: 'rgba(209,142,56,0.12)',
  cream: '#F3EEE5',
  brown: '#57280D',
  textPrimary: '#1B2023',
  textSecondary: '#3A4A5A',
  textMuted: '#6A7A8A',
  border: '#D4DCE5',
  borderSubtle: '#E4EAEF',
  surface: '#F5F7FA',
  bg: '#E4EAEF',
  white: '#FFFFFF',
} as const;

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
      addItem({
        menu_item_id: item.id,
        name: item.name,
        price: item.base_price,
        quantity: 1,
        customizations: {},
      });
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
    .map((cat) => ({
      category: cat,
      items: filteredItems.filter((item) => item.category_id === cat.id),
    }))
    .filter((group) => group.items.length > 0);

  const setSectionRef = useCallback((categoryId: number, el: HTMLElement | null) => {
    sectionRefs.current.set(categoryId, el);
  }, []);

  const hasCartItems = getItemCount() > 0;
  const cartTotal = useCartStore((s) => s.getTotal)();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: LOKA.bg }}>
      <div style={{ background: LOKA.white, borderBottom: `1px solid ${LOKA.borderSubtle}`, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px 0 8px', height: 44, gap: 8 }}>
          <button
            onClick={() => setShowSearch(!showSearch)}
            style={{
              width: 36, height: 36, borderRadius: 10,
              background: showSearch ? LOKA.copperSoft : LOKA.surface,
              border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0,
            }}
            aria-label="Search"
          >
            {showSearch ? <X size={16} color={LOKA.copper} /> : <Search size={16} color={LOKA.textMuted} />}
          </button>

          {showSearch ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', background: LOKA.surface, borderRadius: 999, height: 36 }}>
              <Search size={14} color={LOKA.textMuted} />
              <input
                type="text"
                autoFocus
                placeholder="Search items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: LOKA.textPrimary }}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} style={{ background: 'transparent', border: 'none', padding: 0, color: LOKA.textMuted, cursor: 'pointer', display: 'flex' }}>
                  <X size={14} />
                </button>
              )}
            </div>
          ) : (
            <h1 style={{ flex: 1, fontSize: 16, fontWeight: 800, color: LOKA.textPrimary, letterSpacing: '-0.01em' }}>
              Menu
            </h1>
          )}

          {showSearch && (
            <button
              onClick={() => { setShowSearch(false); setSearchQuery(''); }}
              style={{ fontSize: 13, fontWeight: 600, color: LOKA.copper, background: 'transparent', border: 'none', cursor: 'pointer', flexShrink: 0, padding: '4px 4px' }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="scroll-container" style={{ flex: 1, position: 'relative' }}>
        <CategoryNav
          categories={categories}
          activeCategoryId={activeCategoryId}
          onSelect={setActiveCategoryId}
          sectionRefs={sectionRefs}
        />

        {loading ? (
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="skeleton" style={{ height: 64, borderRadius: 16 }} />
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px' }}>
            <div style={{ width: 56, height: 56, borderRadius: 999, background: LOKA.cream, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Search size={24} color={LOKA.copper} />
            </div>
            <p style={{ fontSize: 15, fontWeight: 700, color: LOKA.textPrimary, marginBottom: 8 }}>
              {searchQuery ? `No items match "${searchQuery}"` : 'No items available'}
            </p>
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ padding: '8px 16px', borderRadius: 999, background: LOKA.primary, color: LOKA.white, fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div style={{ padding: '8px 10px', paddingBottom: hasCartItems ? 76 : 8 }}>
            {itemsByCategory.map(({ category, items }) => (
              <div key={category.id} ref={(el) => setSectionRef(category.id, el)} data-category-id={category.id} style={{ marginBottom: 16 }}>
                <div style={{ padding: '18px 16px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 4, height: 18, borderRadius: 999, background: LOKA.copper, flexShrink: 0 }} />
                  <h2 style={{ fontSize: 15, fontWeight: 800, color: LOKA.textPrimary, letterSpacing: '-0.01em' }}>
                    {category.name}
                  </h2>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {items.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      onPress={() => openItem(item)}
                      onAdd={() => openItem(item)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
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