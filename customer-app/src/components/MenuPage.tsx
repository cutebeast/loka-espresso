'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Coffee, Plus, X, Minus, ShoppingCart } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { useCartStore } from '@/stores/cartStore';
import api from '@/lib/api';
import type { Category, MenuItem, CustomizationOption } from '@/lib/api';
import { Button } from '@/components/ui/Button';

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.05 },
  },
};

const staggerItem = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

function formatPrice(val: number): string {
  return `RM ${val.toFixed(2)}`;
}

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
    selectedCategoryId,
    selectedStore,
    searchQuery,
    setSelectedCategoryId,
    setCategories,
    setMenuItems,
    setSearchQuery,
  } = useUIStore();

  const addItem = useCartStore((s) => s.addItem);

  const [loading, setLoading] = useState(true);
  const [detailItem, setDetailItem] = useState<MenuItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [customizations, setCustomizations] = useState<SelectedOption[]>([]);
  const [availableOptions, setAvailableOptions] = useState<CustomizationOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

  const loadMenu = useCallback(async () => {
    setLoading(true);
    try {
      // Load global menu (not store-specific)
      const [catRes, itemsRes] = await Promise.all([
        api.get('/categories'),
        api.get('/items'),
      ]);
      setCategories(Array.isArray(catRes.data) ? catRes.data : []);
      setMenuItems(Array.isArray(itemsRes.data) ? itemsRes.data : []);
    } catch {
      try {
        // Fallback: try global menu endpoint
        const menuRes = await api.get('/menu');
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
    setCustomizations([]);
    try {
      // Try global endpoint first, fallback to item's customizations
      const res = await api.get(`/items/${item.id}/customizations`);
      setAvailableOptions(res.data ?? []);
    } catch {
      setAvailableOptions(item.customization_options ?? []);
    } finally {
      setLoadingOptions(false);
    }
  }, []);

  const openDetail = useCallback((item: MenuItem) => {
    setDetailItem(item);
    setQuantity(1);
    setCustomizations([]);
    loadCustomizations(item);
  }, [loadCustomizations]);

  const closeDetail = useCallback(() => {
    setDetailItem(null);
    setQuantity(1);
    setCustomizations([]);
    setAvailableOptions([]);
  }, []);

  const toggleOption = useCallback((opt: CustomizationOption) => {
    setCustomizations((prev) => {
      const exists = prev.find((o) => o.id === opt.id);
      if (exists) {
        return prev.filter((o) => o.id !== opt.id);
      }
      return [...prev, { id: opt.id, name: opt.name, option_type: opt.option_type, price_adjustment: opt.price_adjustment }];
    });
  }, []);

  const totalPrice = detailItem
    ? detailItem.base_price + customizations.reduce((sum, o) => sum + o.price_adjustment, 0)
    : 0;

  const handleAddToCart = useCallback(() => {
    if (!detailItem) return;
    // Menu is global, but orders still need a store - use selected store
    const storeId = selectedStore?.id ?? 1; // Default to store 1 if none selected
    addItem(
      {
        menu_item_id: detailItem.id,
        name: detailItem.name,
        price: totalPrice,
        quantity,
        customizations: customizations.length > 0
          ? customizations.reduce<Record<string, unknown>>((acc, o) => {
              acc[o.name] = { id: o.id, type: o.option_type, price: o.price_adjustment };
              return acc;
            }, {})
          : {},
      },
      storeId,
    );
    closeDetail();
  }, [detailItem, totalPrice, quantity, customizations, selectedStore, addItem, closeDetail]);

  const filteredItems = menuItems.filter((item) => {
    const matchesCategory = selectedCategoryId === null || item.category_id === selectedCategoryId;
    const matchesSearch = !searchQuery || item.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch && item.is_available;
  });

  const groupedOptions = availableOptions.reduce<Record<string, CustomizationOption[]>>((acc, opt) => {
    const type = opt.option_type || 'other';
    if (!acc[type]) acc[type] = [];
    acc[type].push(opt);
    return acc;
  }, {});

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="px-4 pt-4 pb-24"
    >
      {/* Search Bar */}
      <motion.div variants={staggerItem} className="mb-4">
        <div className="relative">
          <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search menu..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-10 py-3.5 bg-white rounded-2xl border-2 border-gray-100 focus:border-primary focus:bg-white transition-all text-base shadow-sm"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </motion.div>

      {/* Category Pills */}
      <motion.div variants={staggerItem} className="mb-5">
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scroll-x">
          <button
            onClick={() => setSelectedCategoryId(null)}
            className={`flex-shrink-0 px-5 py-2.5 rounded-full text-sm font-semibold transition-all ${
              selectedCategoryId === null
                ? 'bg-primary text-white shadow-md'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
            }`}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCategoryId(c.id)}
              className={`flex-shrink-0 px-5 py-2.5 rounded-full text-sm font-semibold transition-all ${
                selectedCategoryId === c.id
                  ? 'bg-primary text-white shadow-md'
                  : 'bg-white text-gray-600 border border-gray-200 hover:border-gray-300'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Menu Grid */}
      <motion.div variants={staggerItem}>
        {loading ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl p-3 shadow-card border border-gray-100 animate-pulse">
                <div className="bg-gray-100 rounded-xl h-28 mb-3" />
                <div className="h-4 bg-gray-100 rounded w-3/4 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-full" />
              </div>
            ))}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-20 h-20 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Search size={28} className="text-gray-400" />
            </div>
            <p className="text-gray-500 font-medium text-lg">No items found</p>
            <p className="text-sm text-gray-400 mt-1">
              {searchQuery ? 'Try a different search term' : 'No menu items available'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filteredItems.map((item) => (
              <motion.div
                key={item.id}
                whileTap={{ scale: 0.97 }}
                onClick={() => openDetail(item)}
                className="bg-white rounded-2xl p-3 shadow-card border border-gray-100 flex flex-col cursor-pointer active:shadow-md transition-shadow"
              >
                <div className="bg-primary/5 rounded-xl h-28 flex items-center justify-center mb-3">
                  <Coffee size={32} className="text-primary/40" />
                </div>
                <p className="text-sm font-bold text-gray-900 line-clamp-1">{item.name}</p>
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 leading-snug">{item.description}</p>
                <div className="flex items-center justify-between mt-auto pt-3">
                  <span className="text-sm font-bold text-primary">{formatPrice(item.base_price)}</span>
                  <motion.button
                    whileTap={{ scale: 0.85 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      addItem(
                        {
                          menu_item_id: item.id,
                          name: item.name,
                          price: item.base_price,
                          quantity: 1,
                          customizations: {},
                        },
                        selectedStore?.id ?? 1,
                      );
                    }}
                    className="w-9 h-9 bg-primary rounded-full flex items-center justify-center text-white shadow-md touch-target"
                  >
                    <Plus size={18} />
                  </motion.button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Item Detail Modal */}
      <AnimatePresence>
        {detailItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center"
            onClick={closeDetail}
          >
            <div className="absolute inset-0 bg-black/50" />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative bg-white w-full max-w-[430px] rounded-t-3xl max-h-[85vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
                <h2 className="text-lg font-bold text-gray-900">{detailItem.name}</h2>
                <button
                  onClick={closeDetail}
                  className="p-2 rounded-full hover:bg-gray-100 touch-target"
                >
                  <X size={20} className="text-gray-500" />
                </button>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-y-auto p-5 scroll-container">
                <p className="text-sm text-gray-500 leading-relaxed">{detailItem.description}</p>
                <p className="text-xl font-bold text-primary mt-3">{formatPrice(detailItem.base_price)}</p>

                {/* Customizations */}
                {loadingOptions ? (
                  <div className="space-y-3 mt-5">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />
                    ))}
                  </div>
                ) : Object.keys(groupedOptions).length > 0 ? (
                  <div className="space-y-5 mt-5">
                    {Object.entries(groupedOptions).map(([type, options]) => (
                      <div key={type}>
                        <p className="text-sm font-semibold text-gray-900 capitalize mb-3">{type}</p>
                        <div className="space-y-2">
                          {options.map((opt) => {
                            const isSelected = customizations.some((o) => o.id === opt.id);
                            return (
                              <button
                                key={opt.id}
                                onClick={() => toggleOption(opt)}
                                className={`w-full flex items-center justify-between px-4 py-3.5 rounded-xl text-sm transition-all ${
                                  isSelected
                                    ? 'bg-primary/10 border-2 border-primary text-primary font-medium'
                                    : 'bg-gray-50 border-2 border-transparent text-gray-700 hover:bg-gray-100'
                                }`}
                              >
                                <span>{opt.name}</span>
                                {opt.price_adjustment > 0 && (
                                  <span className={`text-xs font-medium ${isSelected ? 'text-primary' : 'text-gray-500'}`}>
                                    +{formatPrice(opt.price_adjustment)}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {/* Quantity */}
                <div className="flex items-center justify-between py-4 mt-4">
                  <p className="text-sm font-semibold text-gray-700">Quantity</p>
                  <div className="flex items-center gap-4">
                    <motion.button
                      whileTap={{ scale: 0.85 }}
                      onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                      className="w-10 h-10 rounded-full border-2 border-gray-200 flex items-center justify-center text-gray-600 hover:border-primary hover:text-primary transition-colors touch-target"
                    >
                      <Minus size={18} />
                    </motion.button>
                    <span className="text-lg font-bold text-gray-900 w-8 text-center">{quantity}</span>
                    <motion.button
                      whileTap={{ scale: 0.85 }}
                      onClick={() => setQuantity((q) => q + 1)}
                      className="w-10 h-10 rounded-full border-2 border-gray-200 flex items-center justify-center text-gray-600 hover:border-primary hover:text-primary transition-colors touch-target"
                    >
                      <Plus size={18} />
                    </motion.button>
                  </div>
                </div>
              </div>

              {/* Add to Cart Button */}
              <div className="p-5 border-t border-gray-100 safe-area-bottom">
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  onClick={handleAddToCart}
                  leftIcon={<ShoppingCart size={20} />}
                >
                  Add to cart - {formatPrice(totalPrice * quantity)}
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
