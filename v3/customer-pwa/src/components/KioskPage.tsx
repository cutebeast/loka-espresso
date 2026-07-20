'use client';

/**
 * Self-Ordering Kiosk Mode
 *
 * Accessed via #kiosk?store=1 — a full-screen touch-optimized ordering
 * interface for customer-facing LCD touch screens at the restaurant.
 *
 * Flow: Welcome → Order Type → Browse Menu → Cart → Checkout → Confirmation
 *
 * Features:
 * - Full-screen, large touch targets, simplified UI
 * - Guest mode (no login required)
 * - Auto-return to welcome after 60s inactivity
 * - Reuses existing PWA menu/cart/checkout APIs
 * - Supports Dine In (table selection) and Takeaway
 * - Stripe + HitPay payment via guest-pay flow
 * - Wallet top-up QR on welcome screen
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '@/stores/uiStore';
import api from '@/lib/api';
import { formatPrice, resolveAssetUrl, LOKA } from '@/lib/tokens';
import {
  Utensils, ShoppingBag, Search, Plus, Minus, Trash2,
  ShoppingCart, ArrowLeft, ArrowRight, CheckCircle, Loader2,
  CreditCard, Smartphone
} from 'lucide-react';

interface KioskModifierOption {
  id: number;
  option_name: string;
  price_adjustment: number;
}

interface KioskModifierGroup {
  id: number;
  group_name: string;
  display_order: number;
  selection_type: string;
  min_selections: number;
  max_selections: number;
  options: KioskModifierOption[];
}

interface KioskMenuItem {
  id: number;
  item_name: string;
  description?: string;
  base_price: string;
  image_url?: string;
  category_id: number;
  is_available: boolean;
  modifier_groups?: KioskModifierGroup[];
  variants?: { id: number; variant_name: string; price_adjustment: number; display_order: number }[];
}

interface KioskCategory {
  id: number;
  category_name: string;
  display_order?: number;
}

interface CartItem {
  id: number;
  /** Unique per item+variant+modifiers combination — used for identity and React keys */
  lineKey: string;
  name: string;
  price: number;
  qty: number;
  image_url?: string;
  selected_modifier_options?: number[];
  selected_variant_id?: number;
  modifier_label?: string;
}

type KioskPhase = 'welcome' | 'order_type' | 'menu' | 'cart' | 'checkout' | 'success';

const INACTIVITY_TIMEOUT_MS = 60 * 1000; // 60 seconds

/** Unique identity for a cart line: item id + variant + sorted modifier option ids */
function cartLineKey(itemId: number, variantId?: number, modifierOptionIds: number[] = []): string {
  const mods = [...modifierOptionIds].sort((a, b) => a - b).join(',');
  return `${itemId}:${variantId ?? ''}:${mods}`;
}

/** True when every required modifier group (min_selections > 0) has enough selections */
function modifierRequirementsMet(item: KioskMenuItem, selections: Record<number, number[]>): boolean {
  return (item.modifier_groups || []).every(
    (g) => (selections[g.id] || []).length >= (g.min_selections || 0)
  );
}

export default function KioskPage() {
  const { pageParams } = useUIStore();
  const storeId = parseInt((pageParams.store as string) || '1', 10);

  const [phase, setPhase] = useState<KioskPhase>('welcome');
  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway'>('dine_in');
  const [tableNumber, setTableNumber] = useState('');
  const [categories, setCategories] = useState<KioskCategory[]>([]);
  const [menuItems, setMenuItems] = useState<KioskMenuItem[]>([]);
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [payUrl, setPayUrl] = useState('');
  const [now, setNow] = useState(Date.now());
  const _orderId = useRef<number | null>(null); // stored for potential future use

  const inactivityRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load menu data ──
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [catRes, itemRes] = await Promise.all([
          api.get('/menu/categories'),
          api.get('/menu/items', { params: { per_page: 500 } }),
        ]);
        // Axios interceptor already unwraps { success, data } → data
        // So catRes.data = { categories: [...] } and itemRes.data = { items: [...] }
        const cats = catRes.data?.categories || catRes.data || [];
        const items = itemRes.data?.items || itemRes.data || [];
        setCategories(cats);
        setMenuItems(items.filter((i: KioskMenuItem) => i.is_available));
        // Select the first category that has available items
        const firstCatWithItems = cats.find((c: KioskCategory) => items.some((i: KioskMenuItem) => i.category_id === c.id && i.is_available));
        if (firstCatWithItems) setActiveCategory(firstCatWithItems.id);
        else if (cats.length > 0) setActiveCategory(cats[0].id);
      } catch {
        setError('Failed to load menu');
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // ── Inactivity timer — auto-return to welcome ──
  const resetInactivity = useCallback(() => {
    if (inactivityRef.current) clearTimeout(inactivityRef.current);
    if (phase !== 'welcome' && phase !== 'success') {
      inactivityRef.current = setTimeout(() => {
        setPhase('welcome');
        setCart([]);
        setTableNumber('');
        setSearchQuery('');
      }, INACTIVITY_TIMEOUT_MS);
    }
  }, [phase]);

  useEffect(() => {
    resetInactivity();
    return () => {
      if (inactivityRef.current) clearTimeout(inactivityRef.current);
    };
  }, [resetInactivity, phase, cart, tableNumber, searchQuery]);

  // ── Clock for welcome screen ──
  useEffect(() => {
    if (phase === 'welcome') {
      setNow(Date.now());
      const id = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(id);
    }
  }, [phase]);

  // ── Fullscreen + Wake Lock ──
  useEffect(() => {
    const enterFs = async () => {
      try {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
      } catch { /* needs user gesture */ }
      try {
        if ('wakeLock' in navigator) {
          await (navigator as any).wakeLock.request('screen');
        }
      } catch { /* */ }
    };
    const onFirstClick = () => { enterFs(); document.removeEventListener('click', onFirstClick); };
    document.addEventListener('click', onFirstClick);
    return () => document.removeEventListener('click', onFirstClick);
  }, []);

  // ── Cart helpers ──
  const [modifierDrawerItem, setModifierDrawerItem] = useState<KioskMenuItem | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<Record<number, number[]>>({});
  const [selectedVariant, setSelectedVariant] = useState<number | null>(null);

  const openModifierDrawer = (item: KioskMenuItem) => {
    if (item.modifier_groups && item.modifier_groups.length > 0) {
      setSelectedOptions({});
      setSelectedVariant(null);
      setModifierDrawerItem(item);
    } else {
      // No modifiers — add directly
      addToCart(item, [], undefined);
    }
  };

  const confirmAddWithModifiers = () => {
    if (!modifierDrawerItem) return;
    const optionIds: number[] = [];
    let modifierLabel = '';
    let extraCost = 0;

    for (const group of modifierDrawerItem.modifier_groups || []) {
      const selected = selectedOptions[group.id] || [];
      for (const optId of selected) {
        const opt = group.options.find(o => o.id === optId);
        if (opt) {
          optionIds.push(opt.id);
          extraCost += opt.price_adjustment;
          modifierLabel += (modifierLabel ? ', ' : '') + opt.option_name;
        }
      }
    }

    let variantLabel = '';
    if (selectedVariant !== null && modifierDrawerItem.variants) {
      const variant = modifierDrawerItem.variants.find(v => v.id === selectedVariant);
      if (variant) {
        extraCost += variant.price_adjustment;
        variantLabel = variant.variant_name;
      }
    }

    const fullLabel = [variantLabel, modifierLabel].filter(Boolean).join(', ');
    addToCart(modifierDrawerItem, optionIds, selectedVariant !== null ? selectedVariant : undefined, extraCost, fullLabel);
    setModifierDrawerItem(null);
    setSelectedOptions({});
    setSelectedVariant(null);
  };

  const toggleOption = (groupId: number, optionId: number, selectionType: string, maxSelections: number) => {
    setSelectedOptions(prev => {
      const current = prev[groupId] || [];
      if (selectionType === 'single') {
        return { ...prev, [groupId]: [optionId] };
      }
      if (current.includes(optionId)) {
        return { ...prev, [groupId]: current.filter(id => id !== optionId) };
      }
      if (maxSelections > 0 && current.length >= maxSelections) {
        return prev; // Don't exceed max
      }
      return { ...prev, [groupId]: [...current, optionId] };
    });
  };

  const addToCart = (item: KioskMenuItem, modifierOptionIds: number[], variantId?: number, extraCost = 0, modifierLabel = '') => {
    const basePrice = parseFloat(item.base_price) || 0;
    const finalPrice = basePrice + extraCost;
    const lineKey = cartLineKey(item.id, variantId, modifierOptionIds);
    setCart(prev => {
      // Match by item ID + same modifiers + same variant
      const existing = prev.find(c => c.lineKey === lineKey);
      if (existing) {
        return prev.map(c =>
          c.lineKey === lineKey ? { ...c, qty: c.qty + 1 } : c
        );
      }
      return [...prev, {
        id: item.id,
        lineKey,
        name: item.item_name,
        price: finalPrice,
        qty: 1,
        image_url: item.image_url,
        selected_modifier_options: modifierOptionIds.length > 0 ? modifierOptionIds : undefined,
        selected_variant_id: variantId,
        modifier_label: modifierLabel || undefined,
      }];
    });
  };

  const updateQty = (lineKey: string, delta: number) => {
    setCart(prev => prev
      .map(c => c.lineKey === lineKey ? { ...c, qty: c.qty + delta } : c)
      .filter(c => c.qty > 0));
  };

  const removeFromCart = (lineKey: string) => {
    setCart(prev => prev.filter(c => c.lineKey !== lineKey));
  };

  const cartTotal = cart.reduce((sum, c) => sum + c.price * c.qty, 0);
  const cartCount = cart.reduce((sum, c) => sum + c.qty, 0);

  const filteredItems = menuItems.filter(item => {
    if (activeCategory && item.category_id !== activeCategory) return false;
    if (searchQuery && !item.item_name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  // ── Place order ──
  const placeOrder = async () => {
    setLoading(true);
    setError('');
    try {
      const payload = {
        store_id: storeId,
        order_type: orderType,
        items: cart.map(c => ({
          menu_item_id: c.id,
          quantity: c.qty,
          ...(c.selected_modifier_options ? { modifier_option_ids: c.selected_modifier_options } : {}),
          ...(c.selected_variant_id ? { variant_id: c.selected_variant_id } : {}),
        })),
        dining_table_number: orderType === 'dine_in' ? tableNumber : undefined,
      };
      const res = await api.post('/kiosk/orders', payload);
      const data = res.data?.data || res.data;
      _orderId.current = data.order_id;
      setOrderNumber(data.order_number);

      // Get guest-pay token
      if (data.pay_token) {
        const pwaBase = window.location.origin;
        setPayUrl(`${pwaBase}/#guest-pay?orderId=${data.order_id}&token=${data.pay_token}`);
      }
      setPhase('success');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Order failed. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const startNewOrder = () => {
    setCart([]);
    _orderId.current = null;
    setOrderNumber('');
    setPayUrl('');
    setTableNumber('');
    setPhase('welcome');
  };

  // ── Render ──
  return (
    <div
      className="kiosk-container"
      onPointerDown={resetInactivity}
      style={{
        width: '100vw', height: '100vh', overflow: 'hidden',
        background: 'var(--bg-page, #FAFAF8)', color: 'var(--text-primary, #1a1a1a)',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
        userSelect: 'none', touchAction: 'manipulation',
      }}
    >
      <AnimatePresence mode="wait">
        {/* ── WELCOME ── */}
        {phase === 'welcome' && (
          <motion.div key="welcome" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <div style={{ fontSize: 48, fontWeight: 800, color: LOKA.primary, marginBottom: 8 }}>LOKA Espresso</div>
            <div style={{ fontSize: 24, color: '#888', marginBottom: 32 }}>Self-Ordering Kiosk</div>
            <div style={{ fontSize: 64, fontWeight: 300, color: '#666', marginBottom: 48 }}>
              {new Date(now).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
            </div>
            <button onClick={() => setPhase('order_type')} style={kioskBtnPrimary}>
              <Utensils size={32} style={{ marginRight: 12 }} />
              Tap to Order
            </button>
          </motion.div>
        )}

        {/* ── ORDER TYPE ── */}
        {phase === 'order_type' && (
          <motion.div key="order_type" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 48 }}>How would you like your order?</h1>
            <div style={{ display: 'flex', gap: 32 }}>
              <button onClick={() => { setOrderType('dine_in'); setPhase('menu'); }} style={kioskCardBtn}>
                <Utensils size={64} style={{ marginBottom: 16, color: LOKA.primary }} />
                <div style={{ fontSize: 28, fontWeight: 700 }}>Dine In</div>
                <div style={{ fontSize: 16, color: '#888', marginTop: 8 }}>Eat at the restaurant</div>
              </button>
              <button onClick={() => { setOrderType('takeaway'); setPhase('menu'); }} style={kioskCardBtn}>
                <ShoppingBag size={64} style={{ marginBottom: 16, color: LOKA.primary }} />
                <div style={{ fontSize: 28, fontWeight: 700 }}>Takeaway</div>
                <div style={{ fontSize: 16, color: '#888', marginTop: 8 }}>Pick up and go</div>
              </button>
            </div>
            <button onClick={() => setPhase('welcome')} style={kioskBtnGhost}>
              <ArrowLeft size={20} style={{ marginRight: 8 }} /> Back
            </button>
          </motion.div>
        )}

        {/* ── MENU BROWSE ── */}
        {phase === 'menu' && (
          <motion.div key="menu" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '16px 24px', background: 'white', borderBottom: '2px solid #eee', gap: 16 }}>
              {orderType === 'dine_in' && (
                <input
                  type="text"
                  placeholder="Table Number"
                  value={tableNumber}
                  onChange={e => setTableNumber(e.target.value)}
                  style={{ fontSize: 18, padding: '10px 16px', borderRadius: 8, border: '2px solid #ddd', width: 160 }}
                />
              )}
              <div style={{ flex: 1, position: 'relative' }}>
                <Search size={20} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#999' }} />
                <input
                  type="text"
                  placeholder="Search menu..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ fontSize: 18, padding: '10px 16px 10px 44px', borderRadius: 8, border: '2px solid #ddd', width: '100%' }}
                />
              </div>
              <button onClick={() => setPhase('cart')} style={{ ...kioskBtnPrimary, padding: '12px 24px' }}>
                <ShoppingCart size={24} style={{ marginRight: 8 }} />
                {cartCount > 0 ? `Cart (${cartCount})` : 'Cart'}
              </button>
            </div>

            {/* Category tabs */}
            <div style={{ display: 'flex', gap: 8, padding: '12px 24px', overflowX: 'auto', background: 'white', borderBottom: '1px solid #eee' }}>
              {categories.map(cat => (
                <button key={cat.id} onClick={() => setActiveCategory(cat.id)}
                  style={{
                    padding: '10px 20px', borderRadius: 24, fontSize: 16, fontWeight: 600, whiteSpace: 'nowrap',
                    background: activeCategory === cat.id ? LOKA.primary : '#f0f0f0',
                    color: activeCategory === cat.id ? 'white' : '#666', border: 'none', cursor: 'pointer',
                  }}>
                  {cat.category_name}
                </button>
              ))}
            </div>

            {/* Menu items grid */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
              {loading ? (
                <div style={{ textAlign: 'center', padding: 48 }}><Loader2 size={48} className="animate-spin" style={{ color: LOKA.primary }} /></div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 20 }}>
                  {filteredItems.map(item => (
                    <div key={item.id} onClick={() => openModifierDrawer(item)}
                      style={{ background: 'white', borderRadius: 16, overflow: 'hidden', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', transition: 'transform 0.15s' }}
                      onMouseDown={e => (e.currentTarget as HTMLElement).style.transform = 'scale(0.97)'}
                      onMouseUp={e => (e.currentTarget as HTMLElement).style.transform = 'scale(1)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.transform = 'scale(1)'}
                    >
                      {item.image_url && (
                        <img src={resolveAssetUrl(item.image_url) || ''} alt={item.item_name} style={{ width: '100%', height: 160, objectFit: 'cover' }} />
                      )}
                      <div style={{ padding: 16 }}>
                        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{item.item_name}</div>
                        {item.description && <div style={{ fontSize: 14, color: '#888', marginBottom: 8, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{item.description}</div>}
                        <div style={{ fontSize: 20, fontWeight: 800, color: LOKA.primary }}>{formatPrice(item.base_price)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {filteredItems.length === 0 && !loading && (
                <div style={{ textAlign: 'center', padding: 48, fontSize: 20, color: '#888' }}>No items found</div>
              )}
            </div>
          </motion.div>
        )}

        {/* ── CART ── */}
        {phase === 'cart' && (
          <motion.div key="cart" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}
            style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '16px 24px', background: 'white', borderBottom: '2px solid #eee' }}>
              <button onClick={() => setPhase('menu')} style={kioskBtnGhost}><ArrowLeft size={20} style={{ marginRight: 8 }} /> Back to Menu</button>
              <h1 style={{ flex: 1, textAlign: 'center', fontSize: 28, fontWeight: 800 }}>Your Order</h1>
              <div style={{ width: 140 }} />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 24, maxWidth: 600, margin: '0 auto', width: '100%' }}>
              {cart.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 48, fontSize: 20, color: '#888' }}>Your cart is empty</div>
              ) : (
                cart.map(item => (
                  <div key={item.lineKey} style={{ display: 'flex', alignItems: 'center', padding: '16px 0', borderBottom: '1px solid #eee', gap: 16 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 20, fontWeight: 600 }}>{item.name}</div>
                      {item.modifier_label && <div style={{ fontSize: 14, color: '#888' }}>{item.modifier_label}</div>}
                      <div style={{ fontSize: 16, color: LOKA.primary, fontWeight: 700 }}>{formatPrice(String(item.price))}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <button onClick={() => updateQty(item.lineKey, -1)} style={kioskQtyBtn}><Minus size={20} /></button>
                      <span style={{ fontSize: 24, fontWeight: 700, minWidth: 40, textAlign: 'center' }}>{item.qty}</span>
                      <button onClick={() => updateQty(item.lineKey, 1)} style={kioskQtyBtn}><Plus size={20} /></button>
                      <button onClick={() => removeFromCart(item.lineKey)} style={{ ...kioskQtyBtn, marginLeft: 8, color: '#DC2626' }}><Trash2 size={20} /></button>
                    </div>
                  </div>
                ))
              )}
            </div>
            {cart.length > 0 && (
              <div style={{ padding: 24, background: 'white', borderTop: '2px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 16, color: '#888' }}>Total</div>
                  <div style={{ fontSize: 36, fontWeight: 800, color: LOKA.primary }}>{formatPrice(String(cartTotal))}</div>
                </div>
                <button onClick={() => setPhase('checkout')} style={kioskBtnPrimary}>
                  Checkout <ArrowRight size={24} style={{ marginLeft: 8 }} />
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* ── CHECKOUT ── */}
        {phase === 'checkout' && (
          <motion.div key="checkout" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <h1 style={{ fontSize: 36, fontWeight: 800, marginBottom: 16 }}>Confirm Your Order</h1>
            {orderType === 'dine_in' && tableNumber && (
              <div style={{ fontSize: 20, marginBottom: 16 }}>Table: <strong>{tableNumber}</strong></div>
            )}
            <div style={{ fontSize: 20, marginBottom: 32 }}>
              {cartCount} item(s) · <strong style={{ color: LOKA.primary, fontSize: 28 }}>{formatPrice(String(cartTotal))}</strong>
            </div>
            {error && <div style={{ color: '#DC2626', fontSize: 18, marginBottom: 16 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 16 }}>
              <button onClick={() => setPhase('cart')} style={kioskBtnGhost}>Back</button>
              <button onClick={placeOrder} disabled={loading} style={kioskBtnPrimary}>
                {loading ? <Loader2 size={24} className="animate-spin" /> : <>
                  <CreditCard size={24} style={{ marginRight: 8 }} /> Pay Now
                </>}
              </button>
            </div>
          </motion.div>
        )}

        {/* ── SUCCESS ── */}
        {phase === 'success' && (
          <motion.div key="success" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <CheckCircle size={80} style={{ color: '#16A34A', marginBottom: 24 }} />
            <h1 style={{ fontSize: 42, fontWeight: 800, color: LOKA.primary }}>Order Placed!</h1>
            <div style={{ fontSize: 28, color: '#666', marginTop: 8 }}>Order #{orderNumber}</div>
            <div style={{ fontSize: 20, color: '#888', marginTop: 16, maxWidth: 400, textAlign: 'center' }}>
              Please proceed to the counter to complete your payment, or scan the QR code below to pay from your phone.
            </div>

            {/* Payment QR */}
            {payUrl && (
              <div style={{ marginTop: 24, textAlign: 'center' }}>
                <PaymentQR url={payUrl} />
                <div style={{ fontSize: 16, color: '#888', marginTop: 8 }}>
                  <Smartphone size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                  Scan to pay
                </div>
              </div>
            )}

            <button onClick={startNewOrder} style={{ ...kioskBtnGhost, marginTop: 32 }}>
              Start New Order
            </button>

            {/* Auto-reset timer */}
            <AutoResetTimer onTimeout={startNewOrder} seconds={30} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modifier drawer overlay */}
      {modifierDrawerItem && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 100,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }} onClick={() => setModifierDrawerItem(null)}>
          <div style={{
            background: 'white', borderRadius: '20px 20px 0 0', padding: 24,
            maxWidth: 500, width: '100%', maxHeight: '80vh', overflowY: 'auto',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 24, fontWeight: 700 }}>{modifierDrawerItem.item_name}</h2>
              <button onClick={() => setModifierDrawerItem(null)} style={{ background: 'none', border: 'none', fontSize: 28, cursor: 'pointer', color: '#999' }}>×</button>
            </div>
            <div style={{ fontSize: 20, fontWeight: 700, color: LOKA.primary, marginBottom: 16 }}>
              {formatPrice(modifierDrawerItem.base_price)}
            </div>

            {/* Variants */}
            {modifierDrawerItem.variants && modifierDrawerItem.variants.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Choose a variant:</div>
                {modifierDrawerItem.variants.map(v => (
                  <button key={v.id} onClick={() => setSelectedVariant(v.id)}
                    style={{
                      display: 'flex', justifyContent: 'space-between', width: '100%',
                      padding: '12px 16px', marginBottom: 8, borderRadius: 10, cursor: 'pointer',
                      border: selectedVariant === v.id ? '2px solid ' + LOKA.primary : '2px solid #eee',
                      background: selectedVariant === v.id ? 'rgba(59,74,26,0.05)' : 'white',
                    }}>
                    <span style={{ fontSize: 16 }}>{v.variant_name}</span>
                    <span style={{ fontSize: 16, color: '#666' }}>{v.price_adjustment > 0 ? `+RM${v.price_adjustment.toFixed(2)}` : ''}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Modifier groups */}
            {modifierDrawerItem.modifier_groups?.map(group => (
              <div key={group.id} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
                  {group.group_name}
                  {group.min_selections > 0 && <span style={{ color: '#DC2626', fontSize: 14 }}> *</span>}
                  <span style={{ fontSize: 12, color: '#999', marginLeft: 8 }}>
                    {group.selection_type === 'single' ? 'Choose one' : `Choose up to ${group.max_selections}`}
                  </span>
                </div>
                {group.options.map(opt => {
                  const isSelected = (selectedOptions[group.id] || []).includes(opt.id);
                  return (
                    <button key={opt.id}
                      onClick={() => toggleOption(group.id, opt.id, group.selection_type, group.max_selections)}
                      style={{
                        display: 'flex', justifyContent: 'space-between', width: '100%',
                        padding: '12px 16px', marginBottom: 8, borderRadius: 10, cursor: 'pointer',
                        border: isSelected ? '2px solid ' + LOKA.primary : '2px solid #eee',
                        background: isSelected ? 'rgba(59,74,26,0.05)' : 'white',
                      }}>
                      <span style={{ fontSize: 16 }}>{opt.option_name}</span>
                      <span style={{ fontSize: 16, color: '#666' }}>{opt.price_adjustment > 0 ? `+RM${opt.price_adjustment.toFixed(2)}` : ''}</span>
                    </button>
                  );
                })}
              </div>
            ))}

            <button onClick={confirmAddWithModifiers} disabled={!modifierRequirementsMet(modifierDrawerItem, selectedOptions)} style={{
              width: '100%', padding: '16px', fontSize: 20, fontWeight: 700,
              background: LOKA.primary, color: 'white', border: 'none', borderRadius: 12,
              cursor: modifierRequirementsMet(modifierDrawerItem, selectedOptions) ? 'pointer' : 'not-allowed',
              opacity: modifierRequirementsMet(modifierDrawerItem, selectedOptions) ? 1 : 0.5,
            }}>
              {modifierRequirementsMet(modifierDrawerItem, selectedOptions) ? 'Add to Cart' : 'Select required options'}
            </button>
          </div>
        </div>
      )}

      {/* Inactivity warning */}
      {phase !== 'welcome' && phase !== 'success' && (
        <InactivityWarning onTimeout={() => { setPhase('welcome'); setCart([]); }} resetTrigger={resetInactivity} />
      )}
    </div>
  );
}

// ── Payment QR sub-component ──
function PaymentQR({ url }: { url: string }) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    import('qrcode').then(QRCode =>
      QRCode.toDataURL(url, { width: 240, margin: 2, color: { dark: '#2C1E16', light: '#FFFFFF' } })
    ).then(data => { if (!cancelled) setQr(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, [url]);
  if (!qr) return <Loader2 size={32} className="animate-spin" />;
  return <img src={qr} alt="Payment QR" style={{ width: 200, height: 200, borderRadius: 12 }} />;
}

// ── Auto-reset timer for success screen ──
function AutoResetTimer({ onTimeout, seconds }: { onTimeout: () => void; seconds: number }) {
  const [remaining, setRemaining] = useState(seconds);
  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) { onTimeout(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [onTimeout]);
  return <div style={{ fontSize: 14, color: '#999', marginTop: 16 }}>Returning to home in {remaining}s...</div>;
}

// ── Inactivity warning (reserved for future countdown UI) ──
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function InactivityWarning(_props: { onTimeout: () => void; resetTrigger: () => void }) {
  return null;
}

// ── Styles ──
const kioskBtnPrimary: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: '16px 32px', fontSize: 22, fontWeight: 700,
  background: LOKA.primary, color: 'white', border: 'none',
  borderRadius: 12, cursor: 'pointer', transition: 'transform 0.1s',
};

const kioskBtnGhost: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: '12px 24px', fontSize: 18, fontWeight: 600,
  background: 'transparent', color: '#666', border: '2px solid #ddd',
  borderRadius: 12, cursor: 'pointer',
};

const kioskCardBtn: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  width: 280, height: 320, padding: 32,
  background: 'white', border: '2px solid #eee', borderRadius: 20,
  cursor: 'pointer', transition: 'all 0.15s',
};

const kioskQtyBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  width: 44, height: 44, borderRadius: 10,
  background: '#f0f0f0', border: 'none', cursor: 'pointer', color: '#333',
};
