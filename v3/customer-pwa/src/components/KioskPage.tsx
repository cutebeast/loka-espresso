'use client';

/**
 * Self-Ordering Kiosk Mode
 *
 * Accessed via #kiosk?store=1 or kiosk.loyaltysystem.uk — a full-screen touch-optimized
 * ordering interface for customer-facing LCD touch screens at the restaurant.
 *
 * Supports both Portrait (standing LCD, 1080×1920) and Landscape (tablet, 1920×1080)
 * orientations with responsive layouts.
 *
 * Flow: Welcome → Order Type → Browse Menu → Cart → Checkout → Confirmation
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '@/stores/uiStore';
import { useTranslation } from '@/hooks/useTranslation';
import api from '@/lib/api';
import { formatPrice, resolveAssetUrl, LOKA } from '@/lib/tokens';
import {
  Utensils, ShoppingBag, Search, Plus, Minus, Trash2,
  ShoppingCart, ArrowLeft, ArrowRight, CheckCircle, Loader2,
  CreditCard, Smartphone, Phone
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
  lineKey: string;
  name: string;
  price: number;
  qty: number;
  image_url?: string;
  selected_modifier_options?: number[];
  selected_variant_id?: number;
  modifier_label?: string;
}

type KioskPhase = 'welcome' | 'order_type' | 'phone' | 'menu' | 'cart' | 'checkout' | 'success' | 'setup';
type Orientation = 'portrait' | 'landscape';
type KioskMode = 'standing' | 'tablet';

const INACTIVITY_TIMEOUT_MS = 60 * 1000;
const INACTIVITY_WARNING_MS = 10 * 1000;
const STAFF_PHONE = '+60312345678';
const TABLET_TABLE_KEY = 'kiosk-tablet-table';

function cartLineKey(itemId: number, variantId?: number, modifierOptionIds: number[] = []): string {
  const mods = [...modifierOptionIds].sort((a, b) => a - b).join(',');
  return `${itemId}:${variantId ?? ''}:${mods}`;
}

function modifierRequirementsMet(item: KioskMenuItem, selections: Record<number, number[]>): boolean {
  return (item.modifier_groups || []).every(
    (g) => (selections[g.id] || []).length >= (g.min_selections || 0)
  );
}

export default function KioskPage() {
  const { pageParams } = useUIStore();
  const { t, locale, setLocale } = useTranslation();
  const storeId = parseInt((pageParams.store as string) || '1', 10);

  const [phase, setPhase] = useState<KioskPhase>('welcome');
  const [kioskMode, setKioskMode] = useState<KioskMode>('standing');
  const [orderType, setOrderType] = useState<'dine_in' | 'takeaway'>('dine_in');
  const [tableNumber, setTableNumber] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
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
  const [orientation, setOrientation] = useState<Orientation>('landscape');
  const [inactivityWarn, setInactivityWarn] = useState(false);
  const [showCallStaff, setShowCallStaff] = useState(false);
  const _orderId = useRef<number | null>(null);

  const inactivityRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isPortrait = orientation === 'portrait';
  const isLandscape = orientation === 'landscape';

  // ── Kiosk mode detection (standing floor LCD vs tablet on table) ──
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    if (mode === 'tablet') {
      setKioskMode('tablet');
      setOrderType('dine_in');
      const urlTable = params.get('table');
      if (urlTable) {
        setTableNumber(urlTable);
        try { localStorage.setItem(TABLET_TABLE_KEY, urlTable); } catch {}
        setPhase('menu');
      } else {
        const saved = (() => { try { return localStorage.getItem(TABLET_TABLE_KEY); } catch { return null; } })();
        if (saved) {
          setTableNumber(saved);
          setPhase('menu');
        } else {
          setPhase('setup');
        }
      }
    }
  }, []);

  // ── Orientation detection ──
  useEffect(() => {
    const check = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setOrientation(w > h ? 'landscape' : 'portrait');
    };
    check();
    window.addEventListener('resize', check);
    window.addEventListener('orientationchange', check);
    return () => {
      window.removeEventListener('resize', check);
      window.removeEventListener('orientationchange', check);
    };
  }, []);

  // ── Load menu data ──
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [catRes, itemRes] = await Promise.all([
          api.get('/menu/categories'),
          api.get('/menu/items', { params: { limit: 500 } }),
        ]);
        const cats = catRes.data?.categories || catRes.data || [];
        const items = itemRes.data?.items || itemRes.data || [];
        setCategories(cats);
        setMenuItems(items.filter((i: KioskMenuItem) => i.is_available));
        const firstCatWithItems = cats.find((c: KioskCategory) => items.some((i: KioskMenuItem) => i.category_id === c.id && i.is_available));
        if (firstCatWithItems) setActiveCategory(firstCatWithItems.id);
        else if (cats.length > 0) setActiveCategory(cats[0].id);
      } catch {
        setError(t('kiosk.load_failed'));
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // ── Inactivity timer with warning ──
  const resetInactivity = useCallback(() => {
    if (inactivityRef.current) clearTimeout(inactivityRef.current);
    if (warnRef.current) clearTimeout(warnRef.current);
    setInactivityWarn(false);
    if (phase !== 'welcome' && phase !== 'success') {
      warnRef.current = setTimeout(() => {
        setInactivityWarn(true);
      }, INACTIVITY_TIMEOUT_MS - INACTIVITY_WARNING_MS);
      inactivityRef.current = setTimeout(() => {
        setPhase('welcome');
        setCart([]);
        setTableNumber('');
        setSearchQuery('');
        setInactivityWarn(false);
      }, INACTIVITY_TIMEOUT_MS);
    }
  }, [phase]);

  useEffect(() => {
    resetInactivity();
    return () => {
      if (inactivityRef.current) clearTimeout(inactivityRef.current);
      if (warnRef.current) clearTimeout(warnRef.current);
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

  // ── Fullscreen + Wake Lock (with re-acquisition) ──
  useEffect(() => {
    let wakeLockSentinel: any = null;

    const requestWakeLock = async () => {
      try {
        if ('wakeLock' in navigator) {
          wakeLockSentinel = await (navigator as any).wakeLock.request('screen');
          wakeLockSentinel?.addEventListener('release', () => { wakeLockSentinel = null; });
        }
      } catch { /* not supported or denied */ }
    };

    const enterFs = async () => {
      try {
        if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
          await document.documentElement.requestFullscreen();
        }
      } catch { /* needs user gesture */ }
      await requestWakeLock();
    };

    const onFirstInteraction = () => {
      enterFs();
      document.removeEventListener('click', onFirstInteraction);
      document.removeEventListener('touchstart', onFirstInteraction);
    };
    document.addEventListener('click', onFirstInteraction);
    document.addEventListener('touchstart', onFirstInteraction);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('click', onFirstInteraction);
      document.removeEventListener('touchstart', onFirstInteraction);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      if (wakeLockSentinel) {
        wakeLockSentinel.release().catch(() => {});
      }
    };
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
        return prev;
      }
      return { ...prev, [groupId]: [...current, optionId] };
    });
  };

  const addToCart = (item: KioskMenuItem, modifierOptionIds: number[], variantId?: number, extraCost = 0, modifierLabel = '') => {
    const basePrice = parseFloat(item.base_price) || 0;
    const finalPrice = basePrice + extraCost;
    const lineKey = cartLineKey(item.id, variantId, modifierOptionIds);
    setCart(prev => {
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
        ...(customerPhone ? { customer_phone: customerPhone } : {}),
      };
      const res = await api.post('/kiosk/orders', payload);
      const data = res.data?.data || res.data;
      _orderId.current = data.order_id;
      setOrderNumber(data.order_number);
      if (data.pay_token) {
        const pwaBase = window.location.origin;
        setPayUrl(`${pwaBase}/#guest-pay?orderId=${data.order_id}&token=${data.pay_token}`);
      }
      setPhase('success');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t('kiosk.order_failed');
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
    setCustomerPhone('');
    setPhoneInput('');
    setPhase(kioskMode === 'tablet' ? 'menu' : 'welcome');
  };

  // ── Responsive sizing ──
  const fs = (portrait: number, landscape: number) => isPortrait ? portrait : landscape;

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
        {/* ── TABLET SETUP (staff sets table number once) ── */}
        {phase === 'setup' && (
          <motion.div key="setup" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <div style={{ fontSize: fs(36, 28), fontWeight: 800, color: LOKA.primary, marginBottom: 8 }}>LOKA Espresso</div>
            <div style={{ fontSize: fs(20, 16), color: '#888', marginBottom: fs(32, 24) }}>Tablet Setup</div>
            <label style={{ fontSize: fs(18, 16), fontWeight: 600, marginBottom: fs(8, 6) }}>Table Number</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="e.g. 5"
              value={tableNumber}
              onChange={e => setTableNumber(e.target.value.replace(/[^0-9]/g, ''))}
              style={{
                fontSize: fs(32, 28), padding: '14px 24px', borderRadius: 12, border: '2px solid #ddd',
                width: 200, textAlign: 'center', marginBottom: fs(24, 20),
              }}
              autoFocus
            />
            <button onClick={() => {
              const v = tableNumber.trim();
              if (!v) return;
              try { localStorage.setItem(TABLET_TABLE_KEY, v); } catch {}
              setPhase('menu');
            }} disabled={!tableNumber.trim()} style={{
              ...kioskBtnPrimary(fs), opacity: tableNumber.trim() ? 1 : 0.4,
            }}>
              Set Table {tableNumber.trim() ? tableNumber.trim() : ''} &amp; Start
            </button>
            <p style={{ fontSize: fs(14, 12), color: '#999', marginTop: fs(16, 12), maxWidth: 400, textAlign: 'center' }}>
              Staff: set the table number once before placing this tablet on the table.
              It will be saved and remembered for future use.
            </p>
          </motion.div>
        )}

        {/* ── WELCOME ── */}
        {phase === 'welcome' && (
          <motion.div key="welcome" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', position: 'relative' }}>
            <div style={{ position: 'absolute', top: fs(24, 16), left: fs(24, 16), display: 'flex', gap: 8 }}>
              {([['en', 'EN'], ['ms', 'BM'], ['zh', '中文'], ['ta', 'தமிழ்'], ['tr', 'TR']] as const).map(([code, label]) => (
                <button key={code} onClick={() => setLocale(code)} style={{
                  padding: '12px 18px', fontSize: fs(18, 15), fontWeight: 700, borderRadius: 10, cursor: 'pointer',
                  border: locale === code ? `2px solid ${LOKA.primary}` : '2px solid #ddd',
                  background: locale === code ? LOKA.primary : 'white',
                  color: locale === code ? 'white' : '#555', minHeight: 48, minWidth: 48,
                }}>{label}</button>
              ))}
            </div>
            {/* Call Staff button */}
            <button onClick={() => setShowCallStaff(true)} style={{
              position: 'absolute', top: fs(24, 16), right: fs(24, 16),
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '12px 20px', fontSize: fs(18, 15), fontWeight: 600,
              background: 'white', border: '2px solid #ddd', borderRadius: 10, cursor: 'pointer',
            }}>
              <Phone size={fs(22, 18)} style={{ color: LOKA.primary }} />
              <span style={{ color: '#555' }}>{t('kiosk.call_staff')}</span>
            </button>

            <div style={{ fontSize: fs(72, 48), fontWeight: 800, color: LOKA.primary, marginBottom: 8 }}>LOKA Espresso</div>
            <div style={{ fontSize: fs(32, 24), color: '#888', marginBottom: fs(48, 32) }}>{t('kiosk.subtitle')}</div>
            <div style={{ fontSize: fs(80, 64), fontWeight: 300, color: '#666', marginBottom: fs(64, 48) }}>
              {new Date(now).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
            </div>
            <button onClick={() => setPhase('order_type')} style={kioskBtnPrimary(fs)}>
              <Utensils size={fs(40, 32)} style={{ marginRight: 12 }} />
              {t('kiosk.tap_to_order')}
            </button>
          </motion.div>
        )}

        {/* ── ORDER TYPE ── */}
        {phase === 'order_type' && (
          <motion.div key="order_type" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <h1 style={{ fontSize: fs(48, 36), fontWeight: 800, marginBottom: fs(56, 48) }}>{t('kiosk.order_type_title')}</h1>
            <div style={{ display: 'flex', gap: fs(40, 32), flexWrap: 'wrap', justifyContent: 'center' }}>
                <button onClick={() => { setOrderType('dine_in'); setPhase('phone'); }} style={kioskCardBtn(fs)}>
                <Utensils size={fs(80, 64)} style={{ marginBottom: 16, color: LOKA.primary }} />
                <div style={{ fontSize: fs(36, 28), fontWeight: 700 }}>{t('kiosk.dine_in')}</div>
                <div style={{ fontSize: fs(20, 16), color: '#888', marginTop: 8 }}>{t('kiosk.dine_in_desc')}</div>
              </button>
              <button onClick={() => { setOrderType('takeaway'); setPhase('phone'); }} style={kioskCardBtn(fs)}>
                <ShoppingBag size={fs(80, 64)} style={{ marginBottom: 16, color: LOKA.primary }} />
                <div style={{ fontSize: fs(36, 28), fontWeight: 700 }}>{t('kiosk.takeaway')}</div>
                <div style={{ fontSize: fs(20, 16), color: '#888', marginTop: 8 }}>{t('kiosk.takeaway_desc')}</div>
              </button>
            </div>
            <button onClick={() => setPhase('welcome')} style={kioskBtnGhost(fs)}>
              <ArrowLeft size={fs(24, 20)} style={{ marginRight: 8 }} /> {t('kiosk.back')}
            </button>
          </motion.div>
        )}

        {/* ── PHONE INPUT ── */}
        {phase === 'phone' && (
          <motion.div key="phone" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Smartphone size={fs(64, 48)} style={{ color: LOKA.primary, marginBottom: fs(24, 16) }} />
            <h1 style={{ fontSize: fs(36, 28), fontWeight: 800, marginBottom: fs(12, 8), textAlign: 'center' }}>{t('kiosk.phone_title')}</h1>
            <p style={{ fontSize: fs(18, 16), color: '#888', marginBottom: fs(32, 24), maxWidth: 500, textAlign: 'center' }}>
              {t('kiosk.phone_desc')}
            </p>
            <input
              type="tel"
              inputMode="numeric"
              placeholder="0123456789"
              value={phoneInput}
              onChange={e => setPhoneInput(e.target.value.replace(/[^0-9+]/g, ''))}
              style={{
                fontSize: fs(28, 24), padding: '14px 24px', borderRadius: 12, border: '2px solid #ddd',
                width: '100%', maxWidth: 360, textAlign: 'center', marginBottom: fs(24, 20),
              }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 16 }}>
              <button onClick={() => {
                setCustomerPhone('');
                setPhase('menu');
              }} style={kioskBtnGhost(fs)}>
                {t('kiosk.skip')}
              </button>
              <button onClick={() => {
                const v = phoneInput.trim();
                if (v.length >= 9) setCustomerPhone(v);
                setPhase('menu');
              }} style={kioskBtnPrimary(fs)}>
                {phoneInput.trim().length >= 9 ? t('kiosk.continue_with_phone') : t('kiosk.continue_skip')}
              </button>
            </div>
            <button onClick={() => setPhase('order_type')} style={{ ...kioskBtnGhost(fs), marginTop: fs(24, 16) }}>
              <ArrowLeft size={fs(20, 16)} style={{ marginRight: 8 }} /> {t('kiosk.back')}
            </button>
          </motion.div>
        )}

        {/* ── MENU BROWSE ── */}
        {phase === 'menu' && (
          <motion.div key="menu" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ display: 'flex', flexDirection: isPortrait ? 'column' : 'row', height: '100%' }}>
            {/* Category sidebar — landscape only */}
            {isLandscape && (
              <div style={{
                width: 220, minWidth: 220, background: 'white', borderRight: '1px solid #eee',
                display: 'flex', flexDirection: 'column', overflow: 'hidden',
              }}>
                <div style={{ padding: '16px', borderBottom: '1px solid #eee' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: LOKA.primary, marginBottom: 4 }}>{t('kiosk.menu')}</div>
                  <div style={{
                    display: 'inline-block', padding: '4px 12px', borderRadius: 20,
                    fontSize: 14, fontWeight: 600,
                    background: orderType === 'dine_in' ? '#E8F5E9' : '#FFF3E0',
                    color: orderType === 'dine_in' ? '#2E7D32' : '#E65100',
                  }}>
                    {orderType === 'dine_in' ? t('kiosk.dine_in') : t('kiosk.takeaway')}
                    {orderType === 'dine_in' && tableNumber ? ` · ${t('kiosk.table_label')} ${tableNumber}` : ''}
                  </div>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
                  {categories.map(cat => (
                    <button key={cat.id} onClick={() => setActiveCategory(cat.id)} style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '14px 20px', fontSize: 16, fontWeight: activeCategory === cat.id ? 700 : 500,
                      background: activeCategory === cat.id ? 'rgba(59,74,26,0.08)' : 'transparent',
                      color: activeCategory === cat.id ? LOKA.primary : '#555',
                      border: 'none', borderLeft: activeCategory === cat.id ? `3px solid ${LOKA.primary}` : '3px solid transparent',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}>{cat.category_name}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Main content area */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Header */}
              <div style={{
                display: 'flex', alignItems: 'center', padding: '16px 24px',
                background: 'white', borderBottom: '2px solid #eee', gap: 16, flexWrap: 'wrap',
              }}>
                {orderType === 'dine_in' && (
                  <input type="text" placeholder={t('kiosk.table_number')} value={tableNumber}
                    onChange={e => setTableNumber(e.target.value)}
                    style={{ fontSize: fs(22, 18), padding: '10px 16px', borderRadius: 8, border: '2px solid #ddd', width: fs(200, 160) }} />
                )}
                {/* Order type badge — portrait */}
                {isPortrait && (
                  <div style={{
                    padding: '6px 14px', borderRadius: 20, fontSize: 15, fontWeight: 600,
                    background: orderType === 'dine_in' ? '#E8F5E9' : '#FFF3E0',
                    color: orderType === 'dine_in' ? '#2E7D32' : '#E65100',
                  }}>
                    {orderType === 'dine_in' ? t('kiosk.dine_in') : t('kiosk.takeaway')}
                    {orderType === 'dine_in' && tableNumber ? ` · ${tableNumber}` : ''}
                  </div>
                )}
                <div style={{ flex: 1, position: 'relative', minWidth: 200 }}>
                  <Search size={fs(22, 20)} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#999' }} />
                  <input type="text" placeholder={t('kiosk.search_menu')} value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    style={{ fontSize: fs(22, 18), padding: '10px 16px 10px 44px', borderRadius: 8, border: '2px solid #ddd', width: '100%' }} />
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button onClick={() => setShowCallStaff(true)} style={{
                    ...kioskBtnGhost(fs), padding: '10px 16px',
                  }}>
                    <Phone size={fs(22, 18)} />
                  </button>
                  <button onClick={() => setPhase('cart')} style={{ ...kioskBtnPrimary(fs), padding: '12px 24px' }}>
                    <ShoppingCart size={fs(26, 24)} style={{ marginRight: 8 }} />
                    {cartCount > 0
                      ? `${t('kiosk.cart_count', { n: cartCount })} · ${formatPrice(String(cartTotal))}`
                      : t('kiosk.cart')}
                  </button>
                </div>
              </div>

              {/* Category tabs — portrait only (landscape uses sidebar) */}
              {isPortrait && (
                <div style={{ display: 'flex', gap: 8, padding: '12px 24px', overflowX: 'auto', background: 'white', borderBottom: '1px solid #eee' }}>
                  {categories.map(cat => (
                    <button key={cat.id} onClick={() => setActiveCategory(cat.id)} style={{
                      padding: '14px 24px', borderRadius: 24, fontSize: 18, fontWeight: 600, whiteSpace: 'nowrap',
                      background: activeCategory === cat.id ? LOKA.primary : '#f0f0f0',
                      color: activeCategory === cat.id ? 'white' : '#666', border: 'none', cursor: 'pointer',
                      minHeight: 48,
                    }}>{cat.category_name}</button>
                  ))}
                </div>
              )}

              {/* Menu items grid */}
              <div style={{ flex: 1, overflowY: 'auto', padding: fs(28, 24) }}>
                {loading ? (
                  <div style={{ textAlign: 'center', padding: 48 }}><Loader2 size={48} className="animate-spin" style={{ color: LOKA.primary }} /></div>
                ) : (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: isPortrait
                      ? '1fr'
                      : `repeat(auto-fill, minmax(${fs(320, 280)}px, 1fr))`,
                    gap: fs(24, 20),
                  }}>
                    {filteredItems.map(item => (
                      <div key={item.id} onClick={() => openModifierDrawer(item)} style={{
                        background: 'white', borderRadius: 16, overflow: 'hidden', cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.06)', transition: 'transform 0.15s',
                      }}
                        onPointerDown={e => (e.currentTarget as HTMLElement).style.transform = 'scale(0.97)'}
                        onPointerUp={e => (e.currentTarget as HTMLElement).style.transform = 'scale(1)'}
                        onPointerLeave={e => (e.currentTarget as HTMLElement).style.transform = 'scale(1)'}
                      >
                        {item.image_url && (
                          <img src={resolveAssetUrl(item.image_url) || ''} alt={item.item_name}
                            style={{ width: '100%', height: fs(200, 160), objectFit: 'cover' }} />
                        )}
                        <div style={{ padding: fs(20, 16) }}>
                          <div style={{ fontSize: fs(22, 18), fontWeight: 700, marginBottom: 4 }}>{item.item_name}</div>
                          {item.description && (
                            <div style={{
                              fontSize: fs(16, 14), color: '#888', marginBottom: 8,
                              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                            }}>{item.description}</div>
                          )}
                          <div style={{ fontSize: fs(24, 20), fontWeight: 800, color: LOKA.primary }}>{formatPrice(item.base_price)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {filteredItems.length === 0 && !loading && (
                  <div style={{ textAlign: 'center', padding: 48, fontSize: fs(22, 20), color: '#888' }}>{t('kiosk.no_items')}</div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── CART ── */}
        {phase === 'cart' && (
          <motion.div key="cart" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}
            style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '16px 24px', background: 'white', borderBottom: '2px solid #eee' }}>
              <button onClick={() => setPhase('menu')} style={kioskBtnGhost(fs)}><ArrowLeft size={fs(24, 20)} style={{ marginRight: 8 }} /> {t('kiosk.back_to_menu')}</button>
              <h1 style={{ flex: 1, textAlign: 'center', fontSize: fs(36, 28), fontWeight: 800 }}>{t('kiosk.your_order')}</h1>
              <div style={{ width: 140 }} />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 24, maxWidth: fs(800, 600), margin: '0 auto', width: '100%' }}>
              {cart.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 48, fontSize: fs(22, 20), color: '#888' }}>{t('kiosk.cart_empty')}</div>
              ) : (
                cart.map(item => (
                  <div key={item.lineKey} style={{ display: 'flex', alignItems: 'center', padding: '16px 0', borderBottom: '1px solid #eee', gap: 16 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: fs(22, 20), fontWeight: 600 }}>{item.name}</div>
                      {item.modifier_label && <div style={{ fontSize: fs(16, 14), color: '#888' }}>{item.modifier_label}</div>}
                      <div style={{ fontSize: fs(18, 16), color: LOKA.primary, fontWeight: 700 }}>{formatPrice(String(item.price))}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <button onClick={() => updateQty(item.lineKey, -1)} style={kioskQtyBtn(fs)}><Minus size={fs(22, 20)} /></button>
                      <span style={{ fontSize: fs(28, 24), fontWeight: 700, minWidth: 40, textAlign: 'center' }}>{item.qty}</span>
                      <button onClick={() => updateQty(item.lineKey, 1)} style={kioskQtyBtn(fs)}><Plus size={fs(22, 20)} /></button>
                      <button onClick={() => removeFromCart(item.lineKey)} style={{ ...kioskQtyBtn(fs), marginLeft: 8, color: '#DC2626' }}><Trash2 size={fs(22, 20)} /></button>
                    </div>
                  </div>
                ))
              )}
            </div>
            {cart.length > 0 && (
              <div style={{ padding: 24, background: 'white', borderTop: '2px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: fs(18, 16), color: '#888' }}>{t('kiosk.total')}</div>
                  <div style={{ fontSize: fs(44, 36), fontWeight: 800, color: LOKA.primary }}>{formatPrice(String(cartTotal))}</div>
                </div>
                <button onClick={() => setPhase('checkout')} style={kioskBtnPrimary(fs)}>
                  {t('kiosk.checkout')} <ArrowRight size={fs(28, 24)} style={{ marginLeft: 8 }} />
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* ── CHECKOUT ── */}
        {phase === 'checkout' && (
          <motion.div key="checkout" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <h1 style={{ fontSize: fs(44, 36), fontWeight: 800, marginBottom: 16 }}>{t('kiosk.confirm_title')}</h1>
            {orderType === 'dine_in' && tableNumber && (
              <div style={{ fontSize: fs(24, 20), marginBottom: 16 }}>{t('kiosk.table_label')} <strong>{tableNumber}</strong></div>
            )}
            <div style={{ fontSize: fs(24, 20), marginBottom: 32 }}>
              {t('kiosk.items_count', { n: cartCount })} · <strong style={{ color: LOKA.primary, fontSize: fs(36, 28) }}>{formatPrice(String(cartTotal))}</strong>
            </div>
            {error && <div style={{ color: '#DC2626', fontSize: fs(20, 18), marginBottom: 16 }}>{error}</div>}
            <div style={{ display: 'flex', gap: 16 }}>
              <button onClick={() => setPhase('cart')} style={kioskBtnGhost(fs)}>{t('kiosk.back')}</button>
              <button onClick={placeOrder} disabled={loading} style={kioskBtnPrimary(fs)}>
                {loading ? <Loader2 size={24} className="animate-spin" /> : <>
                  <CreditCard size={fs(28, 24)} style={{ marginRight: 8 }} /> {t('kiosk.pay_now')}
                </>}
              </button>
            </div>
          </motion.div>
        )}

        {/* ── SUCCESS ── */}
        {phase === 'success' && (
          <motion.div key="success" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <CheckCircle size={fs(96, 80)} style={{ color: '#16A34A', marginBottom: 24 }} />
            <h1 style={{ fontSize: fs(52, 42), fontWeight: 800, color: LOKA.primary }}>{t('kiosk.order_placed')}</h1>
            <div style={{ fontSize: fs(36, 28), color: '#666', marginTop: 8 }}>Order #{orderNumber}</div>
            <div style={{ fontSize: fs(22, 20), color: '#888', marginTop: 16, maxWidth: 400, textAlign: 'center' }}>{t('kiosk.counter_note')}</div>
            {payUrl && (
              <div style={{ marginTop: 24, textAlign: 'center' }}>
                <PaymentQR url={payUrl} size={fs(280, 200)} />
                <div style={{ fontSize: fs(18, 16), color: '#888', marginTop: 8 }}>
                  <Smartphone size={16} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                  {t('kiosk.scan_to_pay')}
                </div>
              </div>
            )}
            <button onClick={startNewOrder} style={{ ...kioskBtnGhost(fs), marginTop: 32 }}>{t('kiosk.start_new_order')}</button>
            <AutoResetTimer onTimeout={startNewOrder} seconds={30} t={t} fs={fs} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inactivity countdown overlay */}
      {(inactivityWarn && phase !== 'welcome' && phase !== 'success') && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.7)', zIndex: 200,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        }} onClick={resetInactivity}>
          <div style={{ fontSize: fs(32, 28), fontWeight: 700, color: 'white', marginBottom: 16 }}>
            {t('kiosk.inactivity_warning')}
          </div>
          <div style={{ fontSize: fs(20, 18), color: 'rgba(255,255,255,0.7)', marginBottom: 32 }}>
            {t('kiosk.tap_to_continue')}
          </div>
          <div style={{
            padding: '16px 40px', fontSize: fs(24, 20), fontWeight: 700,
            background: 'white', color: LOKA.primary, border: 'none', borderRadius: 12, cursor: 'pointer',
          }} onClick={resetInactivity}>
            {t('kiosk.keep_ordering')}
          </div>
        </div>
      )}

      {/* Call Staff modal */}
      {showCallStaff && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.6)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={() => setShowCallStaff(false)}>
          <div style={{
            background: 'white', borderRadius: 20, padding: 32,
            maxWidth: 400, width: '90%', textAlign: 'center',
          }} onClick={e => e.stopPropagation()}>
            <Phone size={48} style={{ color: LOKA.primary, marginBottom: 16 }} />
            <h2 style={{ fontSize: fs(28, 24), fontWeight: 700, marginBottom: 8 }}>{t('kiosk.need_help')}</h2>
            <p style={{ fontSize: fs(18, 16), color: '#666', marginBottom: 24 }}>{t('kiosk.staff_assistance')}</p>
            <div style={{ fontSize: fs(32, 28), fontWeight: 800, color: LOKA.primary, marginBottom: 24 }}>
              {STAFF_PHONE}
            </div>
            <button onClick={() => setShowCallStaff(false)} style={{
              width: '100%', padding: '14px', fontSize: fs(20, 18), fontWeight: 700,
              background: LOKA.primary, color: 'white', border: 'none', borderRadius: 12, cursor: 'pointer',
            }}>{t('kiosk.close')}</button>
          </div>
        </div>
      )}

      {/* Modifier drawer overlay */}
      {modifierDrawerItem && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)', zIndex: 100,
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }} onClick={() => setModifierDrawerItem(null)}>
          <div style={{
            background: 'white', borderRadius: '20px 20px 0 0', padding: 24,
            maxWidth: fs(600, 500), width: '100%', maxHeight: '80vh', overflowY: 'auto',
          }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: fs(28, 24), fontWeight: 700 }}>{modifierDrawerItem.item_name}</h2>
              <button onClick={() => setModifierDrawerItem(null)} style={{ background: 'none', border: 'none', fontSize: 32, cursor: 'pointer', color: '#999' }}>×</button>
            </div>
            <div style={{ fontSize: fs(24, 20), fontWeight: 700, color: LOKA.primary, marginBottom: 16 }}>
              {formatPrice(modifierDrawerItem.base_price)}
            </div>
            {modifierDrawerItem.variants && modifierDrawerItem.variants.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: fs(20, 18), fontWeight: 600, marginBottom: 8 }}>{t('kiosk.choose_variant')}</div>
                {modifierDrawerItem.variants.map(v => (
                  <button key={v.id} onClick={() => setSelectedVariant(v.id)} style={{
                    display: 'flex', justifyContent: 'space-between', width: '100%',
                    padding: '14px 18px', marginBottom: 8, borderRadius: 10, cursor: 'pointer',
                    border: selectedVariant === v.id ? '2px solid ' + LOKA.primary : '2px solid #eee',
                    background: selectedVariant === v.id ? 'rgba(59,74,26,0.05)' : 'white',
                  }}>
                    <span style={{ fontSize: fs(18, 16) }}>{v.variant_name}</span>
                    <span style={{ fontSize: fs(18, 16), color: '#666' }}>{v.price_adjustment > 0 ? `+RM${v.price_adjustment.toFixed(2)}` : ''}</span>
                  </button>
                ))}
              </div>
            )}
            {modifierDrawerItem.modifier_groups?.map(group => (
              <div key={group.id} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: fs(20, 18), fontWeight: 600, marginBottom: 8 }}>
                  {group.group_name}
                  {group.min_selections > 0 && <span style={{ color: '#DC2626', fontSize: fs(16, 14) }}> *</span>}
                  <span style={{ fontSize: fs(16, 14), color: '#999', marginLeft: 8 }}>
                    {group.selection_type === 'single' ? t('kiosk.choose_one') : t('kiosk.choose_up_to', { n: group.max_selections })}
                  </span>
                </div>
                {group.options.map(opt => {
                  const isSelected = (selectedOptions[group.id] || []).includes(opt.id);
                  return (
                    <button key={opt.id}
                      onClick={() => toggleOption(group.id, opt.id, group.selection_type, group.max_selections)}
                      style={{
                        display: 'flex', justifyContent: 'space-between', width: '100%',
                        padding: '14px 18px', marginBottom: 8, borderRadius: 10, cursor: 'pointer',
                        border: isSelected ? '2px solid ' + LOKA.primary : '2px solid #eee',
                        background: isSelected ? 'rgba(59,74,26,0.05)' : 'white',
                      }}>
                      <span style={{ fontSize: fs(18, 16) }}>{opt.option_name}</span>
                      <span style={{ fontSize: fs(18, 16), color: '#666' }}>{opt.price_adjustment > 0 ? `+RM${opt.price_adjustment.toFixed(2)}` : ''}</span>
                    </button>
                  );
                })}
              </div>
            ))}
            <button onClick={confirmAddWithModifiers} disabled={!modifierRequirementsMet(modifierDrawerItem, selectedOptions)} style={{
              width: '100%', padding: '16px', fontSize: fs(22, 20), fontWeight: 700,
              background: LOKA.primary, color: 'white', border: 'none', borderRadius: 12,
              cursor: modifierRequirementsMet(modifierDrawerItem, selectedOptions) ? 'pointer' : 'not-allowed',
              opacity: modifierRequirementsMet(modifierDrawerItem, selectedOptions) ? 1 : 0.5,
            }}>{modifierRequirementsMet(modifierDrawerItem, selectedOptions) ? t('kiosk.add_to_cart') : t('kiosk.select_required')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Payment QR sub-component ──
function PaymentQR({ url, size }: { url: string; size: number }) {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    import('qrcode').then(QRCode =>
      QRCode.toDataURL(url, { width: size, margin: 2, color: { dark: '#2C1E16', light: '#FFFFFF' } })
    ).then(data => { if (!cancelled) setQr(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, [url, size]);
  if (!qr) return <Loader2 size={32} className="animate-spin" />;
  return <img src={qr} alt="Payment QR" style={{ width: size, height: size, borderRadius: 12 }} />;
}

// ── Auto-reset timer for success screen ──
function AutoResetTimer({ onTimeout, seconds, t, fs }: { onTimeout: () => void; seconds: number; t: (key: string, options?: Record<string, string | number>) => string; fs: (portrait: number, landscape: number) => number }) {
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
  return <div style={{ fontSize: fs(18, 14), color: '#999', marginTop: 16 }}>{t('kiosk.returning_in', { n: remaining })}</div>;
}

// ── Responsive styles ──
function kioskBtnPrimary(fs: (p: number, l: number) => number): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: `${fs(20, 16)}px ${fs(36, 32)}px`, fontSize: fs(26, 22), fontWeight: 700,
    background: LOKA.primary, color: 'white', border: 'none',
    borderRadius: 12, cursor: 'pointer', whiteSpace: 'nowrap',
  };
}

function kioskBtnGhost(fs: (p: number, l: number) => number): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: `${fs(14, 12)}px ${fs(28, 24)}px`, fontSize: fs(20, 18), fontWeight: 600,
    background: 'transparent', color: '#666', border: '2px solid #ddd',
    borderRadius: 12, cursor: 'pointer', whiteSpace: 'nowrap',
  };
}

function kioskCardBtn(fs: (p: number, l: number) => number): React.CSSProperties {
  return {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    width: fs(320, 280), height: fs(360, 320), padding: fs(40, 32),
    background: 'white', border: '2px solid #eee', borderRadius: 20,
    cursor: 'pointer',
  };
}

function kioskQtyBtn(fs: (p: number, l: number) => number): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: fs(52, 44), height: fs(52, 44), borderRadius: 10,
    background: '#f0f0f0', border: 'none', cursor: 'pointer', color: '#333',
  };
}
