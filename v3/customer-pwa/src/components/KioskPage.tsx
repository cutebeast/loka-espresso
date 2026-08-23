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
 * Flow: Welcome → Order Type → Phone → Menu → Item Detail / Bundle Builder → Cart → Add-on Deals → Checkout → Confirmation
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '@/stores/uiStore';
import { useTranslation } from '@/hooks/useTranslation';
import { useSwipe } from '@/hooks/useSwipe';
import api from '@/lib/api';
import type { UserReward, UserVoucher } from '@/lib/api';
import { normalizePhone } from '@/lib/phone';
import { formatPrice, resolveAssetUrl, LOKA } from '@/lib/tokens';
import {
  Utensils, ShoppingBag, Search, Plus, Minus, Trash2,
  ShoppingCart, ArrowLeft, ArrowRight, CheckCircle, Loader2,
  CreditCard, Smartphone, Phone, Sparkles, Wallet, ArrowLeftRight,
  ChevronLeft, ChevronRight, Gift, Tag
} from 'lucide-react';
import KioskItemPage from './kiosk/KioskItemPage';
import KioskBundlePage, { type KioskBundle, type KioskBundleComponent } from './kiosk/KioskBundlePage';
import { previewAddonDiscount } from '@/lib/addonDeal';

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
  is_addon_deal_eligible?: boolean;
  addon_discount_type?: string | null;
  addon_discount_value?: number | null;
  eligible_bundle_ids?: number[] | null;
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
  bundle_product_id?: number;
  bundle_component_id?: number;
  bundle_title?: string;
}

type KioskPhase = 'welcome' | 'order_type' | 'table_number' | 'phone' | 'menu' | 'item' | 'bundle' | 'cart' | 'addon_deals' | 'checkout' | 'payment_select' | 'redeem_phone' | 'redeem_otp' | 'redeem_pick' | 'success' | 'setup' | 'store_setup';
type Orientation = 'portrait' | 'landscape';
type KioskMode = 'standing' | 'tablet';

const INACTIVITY_TIMEOUT_MS = 60 * 1000;
const INACTIVITY_WARNING_MS = 10 * 1000;
const STAFF_PHONE = '+60312345678';
const TABLET_TABLE_KEY = 'kiosk-tablet-table';
// Bundle categories share the sidebar with menu categories — offset their ids
// so the two id spaces can't collide.
const BUNDLE_CAT_OFFSET = 100000;

function cartLineKey(itemId: number, variantId?: number, modifierOptionIds: number[] = [], bundleProductId?: number, bundleComponentId?: number): string {
  const mods = [...modifierOptionIds].sort((a, b) => a - b).join(',');
  return `${itemId}:${variantId ?? ''}:${mods}:${bundleProductId ?? ''}:${bundleComponentId ?? ''}`;
}

function modifierRequirementsMet(item: KioskMenuItem, selections: Record<number, number[]>): boolean {
  return (item.modifier_groups || []).every(
    (g) => (selections[g.id] || []).length >= (g.min_selections || 0)
  );
}

export default function KioskPage() {
  const { pageParams } = useUIStore();
  const { t, locale, setLocale } = useTranslation();
  // Store resolution: ?store=N URL param → device-persisted choice → one-time
  // setup screen. (Was: hardcoded default store 1 — every store's kiosk would
  // have ordered into store 1.)
  const KIOSK_STORE_KEY = 'loka-kiosk-store';
  const [storeId, setStoreId] = useState<number | null>(() => {
    const fromUrl = parseInt((pageParams.store as string) || '', 10);
    if (!isNaN(fromUrl)) return fromUrl;
    try {
      const saved = localStorage.getItem(KIOSK_STORE_KEY);
      const n = saved ? parseInt(saved, 10) : NaN;
      return isNaN(n) ? null : n;
    } catch { return null; }
  });
  const [availableStores, setAvailableStores] = useState<{ id: number; store_name: string; city?: string }[]>([]);

  const [phase, setPhase] = useState<KioskPhase>(storeId ? 'welcome' : 'store_setup');
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
  const [orderTotal, setOrderTotal] = useState('');
  const [now, setNow] = useState(0);
  const [orientation, setOrientation] = useState<Orientation>('landscape');
  const [inactivityWarn, setInactivityWarn] = useState(false);
  const [showCallStaff, setShowCallStaff] = useState(false);
  const [promos, setPromos] = useState<any[]>([]);
  const [promoIdx, setPromoIdx] = useState(0);
  const [bundles, setBundles] = useState<KioskBundle[]>([]);
  const [bundleCategories, setBundleCategories] = useState<{ id: number; name: string; display_order: number }[]>([]);
  const _orderId = useRef<number | null>(null);
  // Stable idempotency key per cart-checkout attempt: a double-tap / retry of
  // the same cart replays the existing order instead of duplicating it.
  const idempotencyKeyRef = useRef<string | null>(null);

  // ── Member sign-in at checkout (redeem vouchers/rewards) ──
  // OTP-verified on the kiosk itself (dev OTP bypass applies until go-live);
  // the access token authorizes the order so voucher/reward ownership checks pass.
  const [redeemPhoneInput, setRedeemPhoneInput] = useState('');
  const [redeemOtpInput, setRedeemOtpInput] = useState('');
  const [memberToken, setMemberToken] = useState<string | null>(null);
  const [memberPhone, setMemberPhone] = useState('');
  const [memberVouchers, setMemberVouchers] = useState<UserVoucher[]>([]);
  const [memberRewards, setMemberRewards] = useState<UserReward[]>([]);
  const [selectedRedemption, setSelectedRedemption] = useState<
    | { kind: 'voucher'; code: string; label: string }
    | { kind: 'reward'; id: number; label: string }
    | null
  >(null);
  const [redeemBusy, setRedeemBusy] = useState(false);

  const returnPhaseRef = useRef<KioskPhase>('menu');

  const inactivityRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isPortrait = orientation === 'portrait';
  const isLandscape = orientation === 'landscape';

  // ── Kiosk mode detection (standing floor LCD vs tablet on table) ──
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const pathname = window.location.pathname;
    const isTabletPath = pathname === '/tablet' || pathname.startsWith('/tablet/') || pathname.startsWith('/mode/tablet');
    const mode = searchParams.get('mode');
    const isTablet = mode === 'tablet' || isTabletPath;
    if (isTablet) {
      setKioskMode('tablet');
      setOrderType('dine_in');
      if (!storeId) return; // store setup first; table setup follows
      const urlTable = searchParams.get('table');
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
  }, [storeId]);

  // ── Store list for the one-time setup screen (only when needed) ──
  useEffect(() => {
    if (storeId) return;
    api.get('/stores').then((res: { data?: unknown }) => {
      const list = Array.isArray(res.data) ? res.data : ((res.data as { items?: unknown[] })?.items ?? []);
      setAvailableStores(list as { id: number; store_name: string; city?: string }[]);
    }).catch(() => setAvailableStores([]));
  }, [storeId]);

  const pickStore = (id: number) => {
    setStoreId(id);
    try { localStorage.setItem(KIOSK_STORE_KEY, String(id)); } catch {}
    setPhase(kioskMode === 'tablet' ? 'setup' : 'welcome');
  };

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
    if (!storeId) return; // wait for the store setup screen
    const loadData = async () => {
      setLoading(true);
      try {
        const [catRes, itemRes, bundleRes, bundleCatRes] = await Promise.all([
          api.get('/menu/categories'),
          api.get('/menu/items', { params: { limit: 500 } }),
          api.get('/menu/bundle-products'),
          api.get('/bundle-categories').catch(() => ({ data: { data: { categories: [] } } })),
        ]);
        const cats = catRes.data?.categories || catRes.data || [];
        const items = itemRes.data?.items || itemRes.data || [];
        const bundles = bundleRes.data?.items || bundleRes.data || [];
        const bundleCatsRaw = (bundleCatRes as { data?: { data?: { categories?: { id: number; name: string; display_order: number }[] }; categories?: { id: number; name: string; display_order: number }[] } }).data;
        const bundleCats = bundleCatsRaw?.data?.categories || bundleCatsRaw?.categories || [];
        // Classes/workshops are session-booked on the PWA — the kiosk backend
        // rejects them at checkout (400), so hide the category entirely
        // rather than let customers build a cart that cannot be placed.
        const expCatIds = new Set(
          cats.filter((c: KioskCategory & { slug?: string }) => c.slug === 'experiences').map((c: KioskCategory) => c.id)
        );
        const sellableCats = cats.filter((c: KioskCategory) => !expCatIds.has(c.id))
          .sort((a: KioskCategory, b: KioskCategory) => (a.display_order ?? 0) - (b.display_order ?? 0));
        const sellableItems = items.filter((i: KioskMenuItem) => i.is_available && !expCatIds.has(i.category_id));
        const sellableBundles = bundles.filter((b: KioskBundle) => (b.components?.length ?? 0) > 0);
        // Only show bundle categories that have at least one product
        const populatedBundleCatIds = new Set(sellableBundles.map((b: KioskBundle) => b.bundle_category_id).filter((id: number | null | undefined): id is number => id != null));
        const populatedBundleCats = bundleCats
          .filter((bc: { id: number }) => populatedBundleCatIds.has(bc.id))
          .sort((a: { display_order?: number }, b: { display_order?: number }) => (a.display_order ?? 0) - (b.display_order ?? 0));
        setCategories(sellableCats);
        setMenuItems(sellableItems);
        setBundles(sellableBundles);
        setBundleCategories(populatedBundleCats);
        const firstCatWithItems = sellableCats.find((c: KioskCategory) => sellableItems.some((i: KioskMenuItem) => i.category_id === c.id));
        if (firstCatWithItems) setActiveCategory(firstCatWithItems.id);
        else if (cats.length > 0) setActiveCategory(cats[0].id);
      } catch {
        setError(t('kiosk.load_failed'));
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [storeId, t]);

  // ── Inactivity timer with warning ──
  const resetInactivity = useCallback(() => {
    if (inactivityRef.current) clearTimeout(inactivityRef.current);
    if (warnRef.current) clearTimeout(warnRef.current);
    setInactivityWarn(false);
    if (phase !== 'welcome' && phase !== 'success' && phase !== 'setup' && phase !== 'store_setup') {
      warnRef.current = setTimeout(() => {
        setInactivityWarn(true);
      }, INACTIVITY_TIMEOUT_MS - INACTIVITY_WARNING_MS);
      inactivityRef.current = setTimeout(() => {
        if (kioskMode === 'tablet') {
          // Tablet on a table: return to the menu, keeping the staff-set table
          setPhase('menu');
        } else {
          setPhase('welcome');
          setTableNumber('');
        }
        setCart([]);
        setCustomerPhone('');
        setPhoneInput('');
        setSearchQuery('');
        setInactivityWarn(false);
        resetMemberSession(true);
      }, INACTIVITY_TIMEOUT_MS);
    }
  }, [phase, kioskMode]);

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


  // ── Fetch promo banners for welcome carousel ──
  useEffect(() => {
    api.get('/promos/banners?limit=10').then((res: any) => {
      const data = res.data?.data || res.data || [];
      setPromos(Array.isArray(data) ? data : []);
    }).catch(() => {});
  }, []);

  // ── Promo carousel rotation ──
  useEffect(() => {
    if (promos.length <= 1) return;
    const t = setInterval(() => setPromoIdx((i: number) => (i + 1) % promos.length), 8000);
    return () => clearInterval(t);
  }, [promos.length]);

  // ── Touch gestures ──
  // Promo carousel: swipe left/right (also works as mouse drag on the LCD
  // when a touch controller is absent). Chevrons mirror the gesture.
  const promoNext = useCallback(() => {
    setPromoIdx(i => (promos.length > 1 ? (i + 1) % promos.length : i));
  }, [promos.length]);
  const promoPrev = useCallback(() => {
    setPromoIdx(i => (promos.length > 1 ? (i - 1 + promos.length) % promos.length : i));
  }, [promos.length]);
  const promoSwipe = useSwipe(promoNext, promoPrev);

  // ── Cart helpers ──
  const [modifierDrawerItem, setModifierDrawerItem] = useState<KioskMenuItem | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<Record<number, number[]>>({});
  const [selectedVariant, setSelectedVariant] = useState<number | null>(null);
  const [itemQty, setItemQty] = useState(1);
  const [activeBundle, setActiveBundle] = useState<KioskBundle | null>(null);

  // Menu grid: swipe left/right moves between categories (portrait tabs and
  // landscape sidebar stay in sync — same activeCategory state).
  const allCatIds = useMemo(() => {
    const ids: number[] = categories.map(c => c.id);
    bundleCategories.forEach(bc => ids.push(BUNDLE_CAT_OFFSET + bc.id));
    return ids;
  }, [categories, bundleCategories]);
  const catNext = useCallback(() => {
    if (allCatIds.length < 2) return;
    const idx = allCatIds.indexOf(activeCategory ?? allCatIds[0] ?? -1);
    setActiveCategory(allCatIds[(idx + 1) % allCatIds.length] ?? null);
  }, [allCatIds, activeCategory]);
  const catPrev = useCallback(() => {
    if (allCatIds.length < 2) return;
    const idx = allCatIds.indexOf(activeCategory ?? allCatIds[0] ?? -1);
    setActiveCategory(allCatIds[(idx - 1 + allCatIds.length) % allCatIds.length] ?? null);
  }, [allCatIds, activeCategory]);
  const catSwipe = useSwipe(catNext, catPrev);

  // Bundle confirm — each picked component becomes a cart line carrying the
  // bundle linkage; the backend bundle engine validates the set and applies
  // the bundle discount at order time.
  const confirmBundle = (bundle: KioskBundle, picked: { component: KioskBundleComponent; qty: number }[], setQty: number) => {
    for (const { component, qty } of picked) {
      const asItem: KioskMenuItem = {
        id: component.menu_item_id,
        item_name: component.menu_item_name,
        base_price: String(component.menu_item_price ?? 0),
        image_url: component.menu_item_image_url || undefined,
        category_id: 0,
        is_available: true,
      };
      addToCart(asItem, [], undefined, 0, '', qty * setQty, { productId: bundle.id, componentId: component.id, title: bundle.title });
    }
    setActiveBundle(null);
    setPhase('menu');
  };

  // Tapping an item opens the full-screen item page (no modals on kiosk —
  // they are bad touch UX). Even modifier-free items open it, so customers
  // can set quantity and see the photo before adding.
  const openModifierDrawer = (item: KioskMenuItem) => {
    setSelectedOptions({});
    setSelectedVariant(null);
    setItemQty(1);
    setModifierDrawerItem(item);
    setPhase('item');
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
    addToCart(modifierDrawerItem, optionIds, selectedVariant !== null ? selectedVariant : undefined, extraCost, fullLabel, itemQty);
    setModifierDrawerItem(null);
    setSelectedOptions({});
    setSelectedVariant(null);
    setItemQty(1);
    setPhase(returnPhaseRef.current);
    returnPhaseRef.current = 'menu';
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

  const addToCart = (item: KioskMenuItem, modifierOptionIds: number[], variantId?: number, extraCost = 0, modifierLabel = '', qty = 1, bundleInfo?: { productId: number; componentId?: number; title: string }) => {
    const basePrice = parseFloat(item.base_price) || 0;
    const finalPrice = basePrice + extraCost;
    const lineKey = cartLineKey(item.id, variantId, modifierOptionIds, bundleInfo?.productId, bundleInfo?.componentId);
    setCart(prev => {
      const existing = prev.find(c => c.lineKey === lineKey);
      if (existing) {
        return prev.map(c =>
          c.lineKey === lineKey ? { ...c, qty: c.qty + qty } : c
        );
      }
      return [...prev, {
        id: item.id,
        lineKey,
        name: item.item_name,
        price: finalPrice,
        qty,
        image_url: item.image_url,
        selected_modifier_options: modifierOptionIds.length > 0 ? modifierOptionIds : undefined,
        selected_variant_id: variantId,
        modifier_label: modifierLabel || undefined,
        bundle_product_id: bundleInfo?.productId,
        bundle_component_id: bundleInfo?.componentId,
        bundle_title: bundleInfo?.title,
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
    if (activeCategory !== null && activeCategory < BUNDLE_CAT_OFFSET && item.category_id !== activeCategory) return false;
    if (activeCategory !== null && activeCategory >= BUNDLE_CAT_OFFSET) return false; // bundle categories show bundles, not items
    if (searchQuery && !item.item_name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });
  const isBundleCat = activeCategory !== null && activeCategory >= BUNDLE_CAT_OFFSET;
  const filteredBundles = isBundleCat
    ? bundles.filter(b => b.bundle_category_id === (activeCategory as number) - BUNDLE_CAT_OFFSET)
    : (searchQuery ? bundles.filter(b => b.title.toLowerCase().includes(searchQuery.toLowerCase())) : []);
  // Add-on deals: items discounted when a matching bundle is in the cart
  const cartBundleIds = new Set(cart.map(c => c.bundle_product_id).filter(Boolean) as number[]);
  const addonDealItems = menuItems.filter(i =>
    i.is_addon_deal_eligible && (i.eligible_bundle_ids || []).some(bid => cartBundleIds.has(bid))
  );
  const addonDealItemsWithPreview = useMemo(() => {
    return addonDealItems.map(item => ({
      item,
      preview: previewAddonDiscount(item as any),
    })).filter(x => x.preview !== null);
  }, [addonDealItems]);

  const hasBundleInCart = cartBundleIds.size > 0;

  const proceedFromCart = () => {
    if (addonDealItemsWithPreview.length > 0) {
      setPhase('addon_deals');
    } else {
      setPhase('checkout');
    }
  };

  // Any cart change starts a new checkout attempt → fresh idempotency key,
  // so a retry after editing the cart creates a new order rather than
  // replaying the stale one.
  useEffect(() => {
    idempotencyKeyRef.current = null;
  }, [cart]);

  // ── Member session helpers ──
  // End the member session: best-effort backend logout (clears the HttpOnly
  // cookie the login set on this shared device) + local state wipe.
  const resetMemberSession = (logout: boolean) => {
    if (logout && memberToken) {
      api.post('/auth/logout', {}, { headers: { Authorization: `Bearer ${memberToken}` } }).catch(() => {});
    }
    setMemberToken(null);
    setMemberPhone('');
    setMemberVouchers([]);
    setMemberRewards([]);
    setSelectedRedemption(null);
    setRedeemPhoneInput('');
    setRedeemOtpInput('');
    setRedeemBusy(false);
  };

  const startRedeemSignIn = () => {
    setRedeemPhoneInput('');
    setRedeemOtpInput('');
    setError('');
    setPhase('redeem_phone');
  };

  const sendRedeemOtp = async () => {
    const digits = redeemPhoneInput.replace(/\D/g, '');
    if (digits.length < 9 || redeemBusy) return;
    setRedeemBusy(true);
    setError('');
    try {
      const phone = normalizePhone(redeemPhoneInput);
      await api.post('/auth/send-otp', { phone_number: phone });
      setMemberPhone(phone);
      setPhase('redeem_otp');
    } catch (e: unknown) {
      const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t('kiosk.redeem_login_failed');
      setError(msg);
    } finally {
      setRedeemBusy(false);
    }
  };

  const verifyRedeemOtp = async () => {
    if (redeemOtpInput.trim().length < 4 || redeemBusy) return;
    setRedeemBusy(true);
    setError('');
    try {
      const res = await api.post('/auth/login', { phone_number: memberPhone, otp_code: redeemOtpInput.trim() });
      const token = res.data?.tokens?.access_token;
      if (!token) throw new Error('missing access token');
      setMemberToken(token);
      // Load the member's active vouchers + rewards for the picker
      const w = await api.get('/wallet/me', { headers: { Authorization: `Bearer ${token}` } });
      const data = w.data as { vouchers?: UserVoucher[]; rewards?: UserReward[] } | undefined;
      setMemberVouchers((data?.vouchers ?? []).filter(v => v.status === 'active' || v.status === 'available'));
      setMemberRewards((data?.rewards ?? []).filter(r => r.status === 'active' || r.status === 'available'));
      setPhase('redeem_pick');
    } catch {
      setError(t('kiosk.redeem_login_failed'));
    } finally {
      setRedeemBusy(false);
    }
  };

  const pickRedemption = (sel: { kind: 'voucher'; code: string; label: string } | { kind: 'reward'; id: number; label: string }) => {
    setSelectedRedemption(sel);
    setPhase('payment_select');
  };

  // ── Place order ──
  const placeOrder = async (method: 'card' | 'wallet') => {
    setLoading(true);
    setError('');
    try {
      // Reuse the same key across retries of THIS cart so the backend replays
      // instead of double-charging; any cart change mints a fresh key below.
      if (!idempotencyKeyRef.current) {
        idempotencyKeyRef.current = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? `kiosk-${crypto.randomUUID()}`
          : `kiosk-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      }
      const payload = {
        store_id: storeId,
        order_type: orderType,
        kiosk_mode: kioskMode === 'tablet' ? 'tablet' : 'kiosk',
        idempotency_key: idempotencyKeyRef.current,
        items: cart.map(c => ({
          menu_item_id: c.id,
          quantity: c.qty,
          ...(c.selected_modifier_options ? { modifier_option_ids: c.selected_modifier_options } : {}),
          ...(c.selected_variant_id ? { variant_id: c.selected_variant_id } : {}),
          ...(c.bundle_product_id ? { bundle_product_id: c.bundle_product_id } : {}),
          ...(c.bundle_component_id ? { bundle_component_id: c.bundle_component_id } : {}),
        })),
        dining_table_number: orderType === 'dine_in' ? (tableNumber ? (tableNumber.match(/^[0-9]+$/) ? 'T' + tableNumber : tableNumber) : undefined) : undefined,
        ...(customerPhone ? { customer_phone: customerPhone } : {}),
        ...(selectedRedemption?.kind === 'voucher' ? { voucher_code: selectedRedemption.code } : {}),
        ...(selectedRedemption?.kind === 'reward' ? { reward_id: selectedRedemption.id } : {}),
      };
      const res = await api.post('/kiosk/orders', payload,
        memberToken ? { headers: { Authorization: `Bearer ${memberToken}` } } : undefined);
      const data = res.data?.data || res.data;
      _orderId.current = data.order_id;
      setOrderNumber(data.order_number);
      setOrderTotal(data.total_amount);

      if (method === 'wallet' && data.pay_token) {
        const pwaBase = window.location.origin;
        setPayUrl(`${pwaBase}/#guest-pay?orderId=${data.order_id}&token=${data.pay_token}&prefer=wallet`);
        setPhase('success');
      } else if (method === 'card' && data.pay_token) {
        const pwaBase = window.location.origin;
        setPayUrl(`${pwaBase}/#guest-pay?orderId=${data.order_id}&token=${data.pay_token}&prefer=stripe`);
        setPhase('success');
      } else {
        setPhase('success');
      }
    } catch (e: unknown) {
      const resp = (e as { response?: { status?: number; data?: { detail?: string } } })?.response;
      const msg = resp?.data?.detail || t('kiosk.order_failed');
      setError(msg);
      if (resp?.status === 401 && memberToken) {
        // Member session no longer valid — drop it so the retry is a clean guest order
        resetMemberSession(true);
      } else if (resp?.status === 400 && selectedRedemption) {
        // Voucher/reward rejected (ineligible, min spend, …) — unselect it so a
        // retry doesn't fail the same way; the member stays signed in.
        setSelectedRedemption(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const startNewOrder = () => {
    setCart([]);
    _orderId.current = null;
    setOrderNumber('');
    setOrderTotal('');
    setPayUrl('');
    setError('');
    if (kioskMode === 'tablet') {
      // Tablet stays on its table — restore the staff-set table number
      const saved = (() => { try { return localStorage.getItem(TABLET_TABLE_KEY); } catch { return null; } })();
      setTableNumber(saved || '');
    } else {
      setTableNumber('');
    }
    setCustomerPhone('');
    setPhoneInput('');
    resetMemberSession(true);
    setPhase(kioskMode === 'tablet' ? 'menu' : 'welcome');
  };

  // ── Responsive sizing ──
  const fs = (portrait: number, landscape: number) => isPortrait ? portrait : landscape;

  // ── Render ──
  return (
    <div
      className="kiosk-container"
      onPointerDown={resetInactivity}
      onContextMenu={e => e.preventDefault()}
      style={{
        width: '100vw', height: '100vh', overflow: 'hidden',
        background: 'var(--bg-page, #FAFAF8)', color: 'var(--text-primary, #1a1a1a)',
        fontFamily: 'var(--font-sans, system-ui, sans-serif)',
        userSelect: 'none', touchAction: 'manipulation', WebkitTouchCallout: 'none',
      }}
    >
      <AnimatePresence mode="wait">
        {/* ── STORE SETUP (one-time per device; persisted to localStorage) ── */}
        {phase === 'store_setup' && (
          <motion.div key="store_setup" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: 24 }}>
            <div style={{ fontSize: fs(36, 28), fontWeight: 800, color: LOKA.primary, marginBottom: 8 }}>LOKA Espresso</div>
            <div style={{ fontSize: fs(20, 16), color: '#888', marginBottom: fs(32, 24) }}>Kiosk Setup — Select Store</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 420 }}>
              {availableStores.length === 0 && (
                <div style={{ textAlign: 'center', color: '#999', fontSize: fs(16, 14) }}>{t('common.loading')}</div>
              )}
              {availableStores.map(s => (
                <button key={s.id} onClick={() => pickStore(s.id)} style={{
                  ...kioskBtnPrimary(fs), fontSize: fs(20, 16), padding: '16px 24px', textAlign: 'left',
                }}>
                  {s.store_name}{s.city ? ` — ${s.city}` : ''}
                </button>
              ))}
            </div>
            <p style={{ fontSize: fs(14, 12), color: '#999', marginTop: fs(20, 16), maxWidth: 420, textAlign: 'center' }}>
              Staff: pick this device's store once. The choice is saved on this device.
              Override anytime with ?store=N in the URL.
            </p>
          </motion.div>
        )}

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
              <ArrowRight size={fs(20, 18)} style={{ marginLeft: 8, verticalAlign: 'middle' }} />
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
              {([['en', 'EN'], ['zh', '中文']] as const).map(([code, label]) => (
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
            <div style={{ fontSize: fs(56, 40), fontWeight: 300, color: '#666', marginBottom: fs(40, 32) }}>
              {new Date(now).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
            </div>
            {/* Promo banner carousel */}
            {promos.length > 0 && promos[promoIdx] && (
              <div
                {...promoSwipe}
                style={{
                  maxWidth: fs(600, 480), width: '90%', marginBottom: fs(32, 24),
                  borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
                  position: 'relative',
                }}>
                {promos[promoIdx].image_url ? (
                  <img src={promos[promoIdx].image_url.startsWith('http') ? promos[promoIdx].image_url : resolveAssetUrl(promos[promoIdx].image_url) || ''}
                    alt={promos[promoIdx].title || ''}
                    draggable={false}
                    style={{ width: '100%', height: fs(280, 220), objectFit: 'cover' }} />
                ) : (
                  <div style={{ width: '100%', height: fs(280, 220), background: 'var(--loka-cream, #f5f2ea)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 48, opacity: 0.3 }}>🎉</span>
                  </div>
                )}
                <div style={{
                  position: 'absolute', bottom: 0, left: 0, right: 0,
                  padding: '12px 16px',
                  background: 'linear-gradient(transparent, rgba(0,0,0,0.7))',
                  color: '#fff',
                }}>
                  <div style={{ fontSize: fs(16, 13), fontWeight: 700 }}>{promos[promoIdx].title}</div>
                  {promos[promoIdx].short_description && (
                    <div style={{ fontSize: fs(12, 11), opacity: 0.85 }}>{promos[promoIdx].short_description}</div>
                  )}
                </div>
                {/* Prev/next chevrons (mouse + touch fallback) */}
                {promos.length > 1 && (
                  <>
                    <button onClick={promoPrev} aria-label="Previous promo" style={{
                      position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                      width: 44, height: 44, minWidth: 44, minHeight: 44, borderRadius: '50%',
                      background: 'rgba(0,0,0,0.35)', color: '#fff', border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <ChevronLeft size={fs(26, 22)} />
                    </button>
                    <button onClick={promoNext} aria-label="Next promo" style={{
                      position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                      width: 44, height: 44, minWidth: 44, minHeight: 44, borderRadius: '50%',
                      background: 'rgba(0,0,0,0.35)', color: '#fff', border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <ChevronRight size={fs(26, 22)} />
                    </button>
                  </>
                )}
                {/* Dot indicators */}
                {promos.length > 1 && (
                  <div style={{ position: 'absolute', top: 8, right: 12, display: 'flex', gap: 6 }}>
                    {promos.map((_: any, i: number) => (
                      <div key={i} style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: i === promoIdx ? '#fff' : 'rgba(255,255,255,0.5)',
                      }} />
                    ))}
                  </div>
                )}
              </div>
            )}
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
                <button onClick={() => { setOrderType('dine_in'); setPhase('table_number'); }} style={{...kioskCardBtn(fs), border: '3px solid #2E7D32', background: '#f1f8f1'}}>
                <Utensils size={fs(80, 64)} style={{ marginBottom: 16, color: '#2E7D32' }} />
                <div style={{ fontSize: fs(36, 28), fontWeight: 700 }}>{t('kiosk.dine_in')}</div>
                <div style={{ fontSize: fs(20, 16), color: '#888', marginTop: 8 }}>{t('kiosk.dine_in_desc')}</div>
              </button>
              <button onClick={() => { setOrderType('takeaway'); setPhase('phone'); }} style={{...kioskCardBtn(fs), border: '3px solid #E65100', background: '#fff7f0'}}>
                <ShoppingBag size={fs(80, 64)} style={{ marginBottom: 16, color: '#E65100' }} />
                <div style={{ fontSize: fs(36, 28), fontWeight: 700 }}>{t('kiosk.takeaway')}</div>
                <div style={{ fontSize: fs(20, 16), color: '#888', marginTop: 8 }}>{t('kiosk.takeaway_desc')}</div>
              </button>
            </div>
            <button onClick={() => setPhase('welcome')} style={{...kioskBtnGhost(fs), marginTop: fs(40, 32)}}>
              <ArrowLeft size={fs(24, 20)} style={{ marginRight: 8 }} /> {t('kiosk.back')}
            </button>
          </motion.div>
        )}

        {/* ── TABLE NUMBER ── */}
        {phase === 'table_number' && (
          <motion.div key="table_number" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: fs(20, 16), padding: '0 24px' }}>
            <Utensils size={fs(56, 44)} style={{ color: LOKA.primary }} />
            <h1 style={{ fontSize: fs(32, 26), fontWeight: 800, textAlign: 'center' }}>{t('kiosk.table_number_title')}</h1>
            <p style={{ fontSize: fs(16, 14), color: '#888', textAlign: 'center', maxWidth: 360 }}>{t('kiosk.table_number_desc')}</p>
            <input
              type="text"
              inputMode="text"
              placeholder={t('kiosk.table_number_placeholder')}
              value={tableNumber}
              onChange={e => setTableNumber(e.target.value.replace(/[^0-9a-zA-Z]/g, '').toUpperCase())}
              style={{
                fontSize: fs(36, 28), padding: '16px 28px', borderRadius: 16,
                border: tableNumber.trim() ? '3px solid var(--color-success)' : '3px solid #ddd',
                width: isPortrait ? '100%' : 240, maxWidth: 360, textAlign: 'center', fontWeight: 700,
              }}
              autoFocus
            />
            <div style={{ display: 'flex', gap: 16 }}>
              <button onClick={() => { setOrderType('dine_in'); setPhase('order_type'); }} style={kioskBtnGhost(fs)}>
                <ArrowLeft size={fs(24, 20)} style={{ marginRight: 8 }} /> {t('kiosk.back')}
              </button>
              <button onClick={() => setPhase('phone')} disabled={!tableNumber.trim()} style={{
                ...kioskBtnPrimary(fs), opacity: tableNumber.trim() ? 1 : 0.5,
              }}>
                {t('kiosk.continue')} <ArrowRight size={fs(24, 20)} style={{ marginLeft: 8 }} />
              </button>
            </div>
          </motion.div>
        )}

        {/* ── PHONE INPUT ── */}
        {phase === 'phone' && (
          <motion.div key="phone" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <Smartphone size={fs(64, 48)} style={{ color: LOKA.primary, marginBottom: fs(24, 16) }} />
            <h1 style={{ fontSize: fs(36, 28), fontWeight: 800, marginBottom: fs(12, 8), textAlign: 'center' }}>{t('kiosk.phone_title')}</h1>
            <p style={{ fontSize: fs(18, 16), color: '#888', marginBottom: fs(12, 8), maxWidth: 500, textAlign: 'center' }}>
              {t('kiosk.phone_desc')}
            </p>
            <p style={{ fontSize: fs(15, 13), color: LOKA.gold, fontWeight: 600, marginBottom: fs(28, 20), maxWidth: 500, textAlign: 'center' }}>
              ★ {t('kiosk.phone_loyalty_note')}
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
                if (phoneInput.trim().length < 9) return;
                const v = phoneInput.trim();
                setCustomerPhone(v);
                setPhase('menu');
              }} disabled={phoneInput.trim().length < 9} style={{
                ...kioskBtnPrimary(fs),
                opacity: phoneInput.trim().length >= 9 ? 1 : 0.5,
              }}>
                {t('kiosk.continue')}
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
                <div style={{ padding: '16px 16px 0', borderBottom: '1px solid #eee' }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: LOKA.primary, marginBottom: 8 }}>{t('kiosk.menu')}</div>
                  <button onClick={() => setOrderType(orderType === 'dine_in' ? 'takeaway' : 'dine_in')} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '10px 18px', borderRadius: 8, fontSize: 14, fontWeight: 700,
                    cursor: 'pointer', border: 'none', fontFamily: 'inherit', whiteSpace: 'nowrap',
                    background: orderType === 'dine_in' ? '#2E7D32' : '#E65100',
                    color: '#fff',
                  }}>
                    {orderType === 'dine_in' ? <Utensils size={16} /> : <ShoppingBag size={16} />}
                    {orderType === 'dine_in' ? t('kiosk.dine_in') : t('kiosk.takeaway')}
                    {orderType === 'dine_in' && tableNumber ? ` · ${t('kiosk.table_label')} ${tableNumber}` : ''}
                    <ArrowLeftRight size={14} style={{ marginLeft: 2, opacity: 0.7 }} />
                  </button>
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
                  {bundleCategories.map(bc => (
                    <button key={BUNDLE_CAT_OFFSET + bc.id} onClick={() => setActiveCategory(BUNDLE_CAT_OFFSET + bc.id)} style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '14px 20px', fontSize: 16, fontWeight: activeCategory === BUNDLE_CAT_OFFSET + bc.id ? 700 : 500,
                      background: activeCategory === BUNDLE_CAT_OFFSET + bc.id ? 'rgba(59,74,26,0.08)' : 'transparent',
                      color: activeCategory === BUNDLE_CAT_OFFSET + bc.id ? LOKA.primary : '#555',
                      border: 'none', borderLeft: activeCategory === BUNDLE_CAT_OFFSET + bc.id ? `3px solid ${LOKA.primary}` : '3px solid transparent',
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}>{bc.name}</button>
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
                  <input type="text" placeholder={t('kiosk.table_number_placeholder')} value={tableNumber}
                    onChange={e => setTableNumber(e.target.value.replace(/[^0-9a-zA-Z]/g, '').toUpperCase())}
                    style={{ fontSize: fs(22, 18), padding: '10px 16px', borderRadius: 8, border: '2px solid #ddd', width: fs(200, 160) }} />
                )}
                {/* Order type tabs — portrait */}
                {isPortrait && (
                  <button onClick={() => setOrderType(orderType === 'dine_in' ? 'takeaway' : 'dine_in')} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 700,
                    cursor: 'pointer', border: 'none', fontFamily: 'inherit', whiteSpace: 'nowrap',
                    background: orderType === 'dine_in' ? '#2E7D32' : '#E65100',
                    color: '#fff',
                  }}>
                    {orderType === 'dine_in' ? <Utensils size={15} /> : <ShoppingBag size={15} />}
                    {orderType === 'dine_in' ? t('kiosk.dine_in') : t('kiosk.takeaway')}
                    {orderType === 'dine_in' && tableNumber ? ` · ${tableNumber}` : ''}
                    <ArrowLeftRight size={13} style={{ marginLeft: 2, opacity: 0.7 }} />
                  </button>
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
                      background: activeCategory === cat.id ? LOKA.primary : 'var(--color-surface)',
                      color: activeCategory === cat.id ? 'white' : '#666', border: 'none', cursor: 'pointer',
                      minHeight: 48,
                    }}>{cat.category_name}</button>
                  ))}
                  {bundleCategories.map(bc => (
                    <button key={BUNDLE_CAT_OFFSET + bc.id} onClick={() => setActiveCategory(BUNDLE_CAT_OFFSET + bc.id)} style={{
                      padding: '14px 24px', borderRadius: 24, fontSize: 18, fontWeight: 600, whiteSpace: 'nowrap',
                      background: activeCategory === BUNDLE_CAT_OFFSET + bc.id ? LOKA.primary : 'var(--color-surface)',
                      color: activeCategory === BUNDLE_CAT_OFFSET + bc.id ? 'white' : '#666', border: 'none', cursor: 'pointer',
                      minHeight: 48,
                    }}>{bc.name}</button>
                  ))}
                </div>
              )}

              {/* Menu items grid — swipe left/right to move between categories */}
              <div {...catSwipe} style={{ flex: 1, overflowY: 'auto', padding: fs(28, 24), touchAction: 'pan-y' }}>
                {loading ? (
                  <div style={{ textAlign: 'center', padding: 48 }}><Loader2 size={48} className="animate-spin" style={{ color: LOKA.primary }} /></div>
                ) : (
                  <>
                    {isBundleCat ? (
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: isPortrait
                          ? '1fr'
                          : `repeat(auto-fill, minmax(${fs(320, 280)}px, 1fr))`,
                        gap: fs(24, 20),
                      }}>
                        {filteredBundles.map(bundle => (
                          <div key={bundle.id} onClick={() => { setActiveBundle(bundle); setPhase('bundle'); }} style={{
                            background: 'white', borderRadius: 16, overflow: 'hidden', cursor: 'pointer',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.06)', transition: 'transform 0.15s',
                          }}
                            onPointerDown={e => (e.currentTarget as HTMLElement).style.transform = 'scale(0.97)'}
                            onPointerUp={e => (e.currentTarget as HTMLElement).style.transform = 'scale(1)'}
                            onPointerLeave={e => (e.currentTarget as HTMLElement).style.transform = 'scale(1)'}
                          >
                            <div style={{ width: '100%', height: fs(280, 220), background: 'var(--loka-cream, #f5f2ea)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {bundle.image_url ? (
                                <img src={resolveAssetUrl(bundle.image_url) || ''} alt={bundle.title}
                                  style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                              ) : (
                                <ShoppingBag size={fs(64, 48)} style={{ color: '#ccc' }} />
                              )}
                            </div>
                            <div style={{ padding: fs(20, 16) }}>
                              <div style={{ fontSize: fs(22, 18), fontWeight: 700, marginBottom: 4 }}>{bundle.title}</div>
                              {bundle.description && (
                                <div style={{
                                  fontSize: fs(16, 14), color: '#888', marginBottom: 8,
                                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                                }}>{bundle.description}</div>
                              )}
                              <div style={{ fontSize: fs(24, 20), fontWeight: 800, color: LOKA.primary }}>{formatPrice(bundle.bundle_price)}</div>
                            </div>
                          </div>
                        ))}
                      </div>
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
                              <div style={{ width: '100%', height: fs(280, 220), background: 'var(--loka-cream, #f5f2ea)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {/* contain — never crop item photos on kiosk cards */}
                                <img src={resolveAssetUrl(item.image_url) || ''} alt={item.item_name}
                                  style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                              </div>
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
                        {!isBundleCat && filteredBundles.length > 0 && (
                          <>
                            <div style={{ gridColumn: '1 / -1', fontSize: fs(22, 20), fontWeight: 700, paddingTop: 8 }}>🎁 {t('kiosk.bundles')}</div>
                            {filteredBundles.map(bundle => (
                              <div key={bundle.id} onClick={() => { setActiveBundle(bundle); setPhase('bundle'); }} style={{
                                background: 'white', borderRadius: 16, overflow: 'hidden', cursor: 'pointer',
                                boxShadow: '0 2px 8px rgba(0,0,0,0.06)', transition: 'transform 0.15s',
                              }}
                                onPointerDown={e => (e.currentTarget as HTMLElement).style.transform = 'scale(0.97)'}
                                onPointerUp={e => (e.currentTarget as HTMLElement).style.transform = 'scale(1)'}
                                onPointerLeave={e => (e.currentTarget as HTMLElement).style.transform = 'scale(1)'}
                              >
                                <div style={{ width: '100%', height: fs(280, 220), background: 'var(--loka-cream, #f5f2ea)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  {bundle.image_url ? (
                                    <img src={resolveAssetUrl(bundle.image_url) || ''} alt={bundle.title}
                                      style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                  ) : (
                                    <ShoppingBag size={fs(64, 48)} style={{ color: '#ccc' }} />
                                  )}
                                </div>
                                <div style={{ padding: fs(20, 16) }}>
                                  <div style={{ fontSize: fs(22, 18), fontWeight: 700, marginBottom: 4 }}>{bundle.title}</div>
                                  {bundle.description && (
                                    <div style={{
                                      fontSize: fs(16, 14), color: '#888', marginBottom: 8,
                                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                                    }}>{bundle.description}</div>
                                  )}
                                  <div style={{ fontSize: fs(24, 20), fontWeight: 800, color: LOKA.primary }}>{formatPrice(bundle.bundle_price)}</div>
                                </div>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
                {filteredItems.length === 0 && filteredBundles.length === 0 && !loading && (
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
              <div style={{ flex: '0 0 200px' }}>
                <button onClick={() => setPhase('menu')} style={kioskBtnGhost(fs)}><ArrowLeft size={fs(24, 20)} style={{ marginRight: 8 }} /> {t('kiosk.back_to_menu')}</button>
              </div>
              <h1 style={{ flex: 1, textAlign: 'center', fontSize: fs(36, 28), fontWeight: 800 }}>{t('kiosk.your_order')}</h1>
              <div style={{ flex: '0 0 200px' }} />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 24, maxWidth: fs(800, 600), margin: '0 auto', width: '100%' }}>
              {cart.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 48, fontSize: fs(22, 20), color: '#888' }}>{t('kiosk.cart_empty')}</div>
              ) : (
                cart.map(item => (
                  <div key={item.lineKey} style={{ display: 'flex', alignItems: 'center', padding: '16px 0', borderBottom: '1px solid #eee', gap: 16 }}>
                    {item.image_url ? <img src={resolveAssetUrl(item.image_url) || ''} alt="" style={{ width: fs(72, 60), height: fs(72, 60), borderRadius: 10, objectFit: 'contain', background: 'var(--loka-cream, #f5f2ea)', flexShrink: 0 }} /> : null}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: fs(22, 20), fontWeight: 600 }}>{item.name}</div>
                      {item.bundle_title && <div style={{ fontSize: fs(16, 14), color: LOKA.gold, fontWeight: 600 }}>{item.bundle_title}</div>}
                      {item.modifier_label && <div style={{ fontSize: fs(16, 14), color: '#888' }}>{item.modifier_label}</div>}
                      <div style={{ fontSize: fs(18, 16), color: LOKA.primary, fontWeight: 700 }}>{formatPrice(String(item.price))}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <button onClick={() => updateQty(item.lineKey, -1)} style={kioskQtyBtn(fs)}><Minus size={fs(22, 20)} /></button>
                      <span style={{ fontSize: fs(28, 24), fontWeight: 700, minWidth: 40, textAlign: 'center' }}>{item.qty}</span>
                      <button onClick={() => updateQty(item.lineKey, 1)} style={kioskQtyBtn(fs)}><Plus size={fs(22, 20)} /></button>
                      <button onClick={() => removeFromCart(item.lineKey)} style={{ ...kioskQtyBtn(fs), marginLeft: 8, color: 'var(--color-danger)' }}><Trash2 size={fs(22, 20)} /></button>
                    </div>
                  </div>
                ))
              )}
            </div>
            {cart.length > 0 && (
              <div style={{ padding: 24, background: 'white', borderTop: '2px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: fs(18, 16), color: '#888' }}>
                    {t('kiosk.total')}
                    {hasBundleInCart && <span style={{ fontSize: fs(14, 12), color: '#888', marginLeft: 8 }}>({t('kiosk.bundle_pricing_note')})</span>}
                  </div>
                  <div style={{ fontSize: fs(44, 36), fontWeight: 800, color: LOKA.primary }}>{formatPrice(String(cartTotal))}</div>
                </div>
                <button onClick={proceedFromCart} style={kioskBtnPrimary(fs)}>
                  {t('kiosk.checkout')} <ArrowRight size={fs(28, 24)} style={{ marginLeft: 8 }} />
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* ── ADD-ON DEALS ── */}
        {phase === 'addon_deals' && (
          <motion.div key="addon_deals" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}
            style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '16px 24px', background: 'white', borderBottom: '2px solid #eee' }}>
              <button onClick={() => setPhase('cart')} style={kioskBtnGhost(fs)}><ArrowLeft size={fs(24, 20)} style={{ marginRight: 8 }} /> {t('kiosk.back')}</button>
              <h1 style={{ flex: 1, textAlign: 'center', fontSize: fs(36, 28), fontWeight: 800 }}>
                <Sparkles size={fs(28, 24)} style={{ color: LOKA.gold, verticalAlign: 'middle', marginRight: 8 }} />
                {t('kiosk.addon_deals_title')}
              </h1>
              <button onClick={() => setPhase('checkout')} style={kioskBtnGhost(fs)}>
                {t('kiosk.addon_deals_skip')}
              </button>
            </div>
            <div style={{ padding: '12px 24px', background: 'white', borderBottom: '1px solid #eee' }}>
              <div style={{ fontSize: fs(18, 16), color: '#888', textAlign: 'center' }}>{t('kiosk.addon_deals_subtitle')}</div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: fs(28, 24) }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: isPortrait
                  ? 'repeat(2, 1fr)'
                  : `repeat(auto-fill, minmax(${fs(320, 280)}px, 1fr))`,
                gap: fs(16, 20),
              }}>
                {addonDealItemsWithPreview.map(({ item, preview }) => (
                  <div key={item.id} onClick={() => {
                    returnPhaseRef.current = 'addon_deals';
                    openModifierDrawer(item);
                  }} style={{
                    background: 'white', borderRadius: 16, overflow: 'hidden', cursor: 'pointer',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.06)', transition: 'transform 0.15s',
                    border: `2px solid ${LOKA.gold}20`,
                  }}
                    onPointerDown={e => (e.currentTarget as HTMLElement).style.transform = 'scale(0.97)'}
                    onPointerUp={e => (e.currentTarget as HTMLElement).style.transform = 'scale(1)'}
                    onPointerLeave={e => (e.currentTarget as HTMLElement).style.transform = 'scale(1)'}
                  >
                    <div style={{ width: '100%', height: fs(280, 220), background: 'var(--loka-cream, #f5f2ea)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {item.image_url ? (
                        <img src={resolveAssetUrl(item.image_url) || ''} alt={item.item_name}
                          style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                      ) : (
                        <Sparkles size={fs(64, 48)} style={{ color: '#ccc' }} />
                      )}
                    </div>
                    <div style={{ padding: fs(20, 16) }}>
                      <div style={{ fontSize: fs(22, 18), fontWeight: 700, marginBottom: 4 }}>{item.item_name}</div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontSize: fs(16, 14), color: '#aaa', textDecoration: 'line-through' }}>{formatPrice(item.base_price)}</span>
                        <span style={{ fontSize: fs(24, 20), fontWeight: 800, color: LOKA.gold }}>{formatPrice((preview as any).discountedUnitPrice)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {addonDealItemsWithPreview.length === 0 && (
                <div style={{ textAlign: 'center', padding: 48, fontSize: fs(22, 20), color: '#888' }}>{t('kiosk.no_items')}</div>
              )}
            </div>
            <div style={{ padding: 24, background: 'white', borderTop: '2px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: fs(18, 16), color: '#888' }}>{t('kiosk.total')}</div>
                <div style={{ fontSize: fs(44, 36), fontWeight: 800, color: LOKA.primary }}>{formatPrice(String(cartTotal))}</div>
              </div>
              <button onClick={() => setPhase('checkout')} style={kioskBtnPrimary(fs)}>
                {t('kiosk.checkout')} <ArrowRight size={fs(28, 24)} style={{ marginLeft: 8 }} />
              </button>
            </div>
          </motion.div>
        )}

        {/* ── CHECKOUT ── */}
        {phase === 'checkout' && (
          <motion.div key="checkout" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}
            style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px 24px', background: 'white', borderBottom: '2px solid #eee' }}>
              <h1 style={{ fontSize: fs(36, 28), fontWeight: 800 }}>{t('kiosk.confirm_title')}</h1>
            </div>

            {/* Body: order summary + table/pay */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: isPortrait ? 'column' : 'row', gap: fs(24, 20), padding: fs(24, 20), maxWidth: isPortrait ? 600 : 1100, margin: '0 auto', width: '100%' }}>
              {/* Order items */}
              <div style={{ flex: 1, background: 'white', borderRadius: 16, padding: fs(20, 16), boxShadow: '0 2px 8px rgba(0,0,0,0.04)', overflowY: 'auto' }}>
                <div style={{ fontSize: fs(20, 18), fontWeight: 700, marginBottom: 12, color: '#888' }}>
                  {t('kiosk.items_count', { n: cartCount })}
                </div>
                {cart.map(item => (
                  <div key={item.lineKey} style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f5f5f5', gap: 12 }}>
                    {item.image_url ? (
                      <img src={resolveAssetUrl(item.image_url) || ''} alt="" style={{ width: fs(48, 40), height: fs(48, 40), borderRadius: 8, objectFit: 'contain', background: 'var(--loka-cream, #f5f2ea)', flexShrink: 0 }} />
                    ) : null}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: fs(18, 16), fontWeight: 600 }}>{item.name}</div>
                      {item.bundle_title && <div style={{ fontSize: fs(14, 12), color: LOKA.gold, fontWeight: 600 }}>{item.bundle_title}</div>}
                      {item.modifier_label && <div style={{ fontSize: fs(14, 12), color: '#888' }}>{item.modifier_label}</div>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: fs(16, 14), color: '#888' }}>x{item.qty}</div>
                      <div style={{ fontSize: fs(18, 16), color: LOKA.primary, fontWeight: 700 }}>{formatPrice(String(item.price))}</div>
                    </div>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 12, borderTop: '2px solid #eee' }}>
                  <div style={{ fontSize: fs(20, 18), fontWeight: 700 }}>
                    {t('kiosk.total')}
                    {hasBundleInCart && <span style={{ fontSize: fs(14, 12), color: '#888', marginLeft: 8, fontWeight: 400 }}>({t('kiosk.bundle_pricing_note')})</span>}
                  </div>
                  <div style={{ fontSize: fs(32, 28), fontWeight: 800, color: LOKA.primary }}>{formatPrice(String(cartTotal))}</div>
                </div>
              </div>

              {/* Table number + Pay */}
              <div style={{ flex: isPortrait ? 'none' : '0 0 360px', display: 'flex', flexDirection: 'column', gap: fs(20, 16) }}>
                {orderType === 'dine_in' && (
                  <div style={{ background: 'white', borderRadius: 16, padding: fs(20, 16), boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                    <div style={{ fontSize: fs(20, 18), fontWeight: 700, marginBottom: 10 }}>{t('kiosk.table_label').replace(':', '')}</div>
                    <input
                      type="text"
                      inputMode="text"
                      placeholder={t('kiosk.table_number_placeholder')}
                      value={tableNumber}
                      onChange={e => setTableNumber(e.target.value.replace(/[^0-9a-zA-Z]/g, '').toUpperCase())}
                      style={{
                        fontSize: fs(32, 28), padding: '16px 20px', borderRadius: 14,
                        border: tableNumber.trim() ? '3px solid var(--color-success)' : '3px solid #ddd',
                        width: '100%', textAlign: 'center', fontWeight: 700,
                      }}
                      autoFocus
                    />
                    {!tableNumber.trim() && (
                      <div style={{ fontSize: fs(15, 13), color: 'var(--color-danger)', marginTop: 8, textAlign: 'center' }}>{t('kiosk.table_required')}</div>
                    )}
                  </div>
                )}
                {error && <div style={{ color: 'var(--color-danger)', fontSize: fs(18, 16), textAlign: 'center' }}>{error}</div>}
                <div style={{ display: 'flex', gap: 16, marginTop: 'auto' }}>
                  <button onClick={() => setPhase('cart')} style={{ ...kioskBtnGhost(fs), flex: 1 }}>
                    <ArrowLeft size={fs(24, 20)} style={{ marginRight: 8 }} /> {t('kiosk.back')}
                  </button>
                  <button onClick={() => setPhase('payment_select')} disabled={loading || (orderType === 'dine_in' && !tableNumber.trim())} style={{
                    ...kioskBtnPrimary(fs), flex: 1,
                    opacity: (loading || (orderType === 'dine_in' && !tableNumber.trim())) ? 0.5 : 1,
                  }}>
                    {loading ? <Loader2 size={24} className="animate-spin" /> : <>
                      <CreditCard size={fs(24, 20)} style={{ marginRight: 8 }} /> {t('kiosk.pay_now')}
                    </>}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── PAYMENT SELECT ── */}
        {phase === 'payment_select' && (
          <motion.div key="payment_select" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 24 }}>
            <h1 style={{ fontSize: fs(40, 32), fontWeight: 800 }}>{t('kiosk.payment_method')}</h1>

            {/* Member redemption — sign in with OTP to spend vouchers/rewards */}
            {!memberToken ? (
              <button onClick={startRedeemSignIn} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: `${fs(16, 14)}px ${fs(28, 24)}px`, borderRadius: 14,
                border: `2px dashed ${LOKA.gold}`, background: 'rgba(198,156,88,0.08)',
                color: LOKA.gold, fontSize: fs(20, 17), fontWeight: 700, cursor: 'pointer',
              }}>
                <Gift size={fs(26, 22)} />
                {t('kiosk.redeem_signin')}
              </button>
            ) : (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'center',
                padding: `${fs(14, 12)}px ${fs(20, 16)}px`, borderRadius: 14,
                border: `2px solid ${LOKA.gold}`, background: 'rgba(198,156,88,0.08)',
                maxWidth: isPortrait ? 420 : 640,
              }}>
                <Gift size={fs(24, 20)} style={{ color: LOKA.gold, flexShrink: 0 }} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: fs(15, 13), color: '#888' }}>{t('kiosk.redeem_signed_in_as', { phone: memberPhone })}</div>
                  {selectedRedemption ? (
                    <div style={{ fontSize: fs(19, 16), fontWeight: 700, color: LOKA.primary }}>
                      {t('kiosk.redeem_selected')}: {selectedRedemption.label}
                    </div>
                  ) : (
                    <div style={{ fontSize: fs(16, 14), color: '#666' }}>{t('kiosk.redeem_applied_note')}</div>
                  )}
                </div>
                {selectedRedemption ? (
                  <button onClick={() => setSelectedRedemption(null)} style={{ ...kioskBtnGhost(fs), padding: '8px 16px', fontSize: fs(16, 14) }}>
                    {t('kiosk.redeem_remove')}
                  </button>
                ) : (
                  <button onClick={() => setPhase('redeem_pick')} style={{ ...kioskBtnGhost(fs), padding: '8px 16px', fontSize: fs(16, 14), borderColor: LOKA.gold, color: LOKA.gold }}>
                    {t('kiosk.redeem_choose')}
                  </button>
                )}
                <button onClick={() => resetMemberSession(true)} style={{ ...kioskBtnGhost(fs), padding: '8px 16px', fontSize: fs(16, 14) }}>
                  {t('kiosk.redeem_signout')}
                </button>
              </div>
            )}
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', justifyContent: 'center', flexDirection: isPortrait ? 'column' : 'row', width: isPortrait ? '100%' : 'auto', maxWidth: isPortrait ? 420 : 'none', padding: isPortrait ? '0 24px' : 0 }}>
              <button onClick={() => placeOrder('card')} disabled={loading} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
                padding: `${fs(28, 24)}px ${fs(48, 40)}px`, borderRadius: 20,
                border: `3px solid ${LOKA.primary}`, background: loading ? '#eee' : LOKA.primary, color: '#fff',
                cursor: 'pointer', fontSize: fs(22, 20), fontWeight: 700, flex: isPortrait ? 1 : 'none',
                opacity: loading ? 0.5 : 1,
              }}>
                <CreditCard size={fs(56, 48)} />
                {t('kiosk.pay_with_card')}
              </button>
              <button onClick={() => placeOrder('wallet')} disabled={loading} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16,
                padding: `${fs(28, 24)}px ${fs(48, 40)}px`, borderRadius: 20,
                border: `3px solid ${LOKA.gold}`, background: loading ? '#eee' : 'transparent',
                color: LOKA.gold, cursor: 'pointer', fontSize: fs(22, 20), fontWeight: 700, flex: isPortrait ? 1 : 'none',
                opacity: loading ? 0.5 : 1,
              }}>
                <Wallet size={fs(56, 48)} />
                {t('kiosk.pay_with_wallet')}
              </button>
            </div>
            {loading && (
              <div style={{ fontSize: fs(20, 18), color: '#888' }}>
                <Loader2 size={24} className="animate-spin" style={{ marginRight: 8 }} />
                {t('kiosk.processing')}
              </div>
            )}
            {error && <div style={{ color: 'var(--color-danger)', fontSize: fs(18, 16), textAlign: 'center' }}>{error}</div>}
            <button onClick={() => setPhase('checkout')} style={{ ...kioskBtnGhost(fs), marginTop: 16 }}>
              <ArrowLeft size={fs(24, 20)} style={{ marginRight: 8 }} /> {t('kiosk.back')}
            </button>
          </motion.div>
        )}

        {/* ── REDEEM: PHONE ── */}
        {phase === 'redeem_phone' && (
          <motion.div key="redeem_phone" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '0 24px' }}>
            <Gift size={fs(64, 48)} style={{ color: LOKA.gold, marginBottom: fs(24, 16) }} />
            <h1 style={{ fontSize: fs(36, 28), fontWeight: 800, marginBottom: fs(12, 8), textAlign: 'center' }}>{t('kiosk.redeem_phone_title')}</h1>
            <p style={{ fontSize: fs(18, 16), color: '#888', marginBottom: fs(28, 20), maxWidth: 480, textAlign: 'center' }}>
              {t('kiosk.redeem_phone_desc')}
            </p>
            <input
              type="tel"
              inputMode="numeric"
              placeholder="0123456789"
              value={redeemPhoneInput}
              onChange={e => setRedeemPhoneInput(e.target.value.replace(/[^0-9+]/g, ''))}
              style={{
                fontSize: fs(28, 24), padding: '14px 24px', borderRadius: 12, border: '2px solid #ddd',
                width: '100%', maxWidth: 360, textAlign: 'center', marginBottom: fs(24, 20),
              }}
              autoFocus
            />
            {error && <div style={{ color: 'var(--color-danger)', fontSize: fs(18, 16), marginBottom: 16, textAlign: 'center' }}>{error}</div>}
            <div style={{ display: 'flex', gap: 16 }}>
              <button onClick={() => { setError(''); setPhase('payment_select'); }} style={kioskBtnGhost(fs)}>
                <ArrowLeft size={fs(24, 20)} style={{ marginRight: 8 }} /> {t('kiosk.back')}
              </button>
              <button onClick={sendRedeemOtp} disabled={redeemPhoneInput.replace(/\D/g, '').length < 9 || redeemBusy} style={{
                ...kioskBtnPrimary(fs),
                opacity: (redeemPhoneInput.replace(/\D/g, '').length >= 9 && !redeemBusy) ? 1 : 0.5,
              }}>
                {redeemBusy ? <Loader2 size={24} className="animate-spin" /> : t('kiosk.redeem_send_code')}
              </button>
            </div>
          </motion.div>
        )}

        {/* ── REDEEM: OTP ── */}
        {phase === 'redeem_otp' && (
          <motion.div key="redeem_otp" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '0 24px' }}>
            <Smartphone size={fs(64, 48)} style={{ color: LOKA.primary, marginBottom: fs(24, 16) }} />
            <h1 style={{ fontSize: fs(36, 28), fontWeight: 800, marginBottom: fs(12, 8), textAlign: 'center' }}>{t('kiosk.redeem_otp_title')}</h1>
            <p style={{ fontSize: fs(18, 16), color: '#888', marginBottom: fs(28, 20), maxWidth: 480, textAlign: 'center' }}>
              {t('kiosk.redeem_otp_desc', { phone: memberPhone })}
            </p>
            <input
              type="tel"
              inputMode="numeric"
              placeholder="••••••"
              value={redeemOtpInput}
              onChange={e => setRedeemOtpInput(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
              style={{
                fontSize: fs(36, 30), padding: '14px 24px', borderRadius: 12, border: '2px solid #ddd',
                width: '100%', maxWidth: 300, textAlign: 'center', letterSpacing: 8, marginBottom: fs(24, 20),
              }}
              autoFocus
            />
            {error && <div style={{ color: 'var(--color-danger)', fontSize: fs(18, 16), marginBottom: 16, textAlign: 'center' }}>{error}</div>}
            <div style={{ display: 'flex', gap: 16 }}>
              <button onClick={() => { setError(''); setPhase('redeem_phone'); }} style={kioskBtnGhost(fs)}>
                <ArrowLeft size={fs(24, 20)} style={{ marginRight: 8 }} /> {t('kiosk.back')}
              </button>
              <button onClick={verifyRedeemOtp} disabled={redeemOtpInput.length < 4 || redeemBusy} style={{
                ...kioskBtnPrimary(fs),
                opacity: (redeemOtpInput.length >= 4 && !redeemBusy) ? 1 : 0.5,
              }}>
                {redeemBusy ? <Loader2 size={24} className="animate-spin" /> : t('kiosk.redeem_verify')}
              </button>
            </div>
          </motion.div>
        )}

        {/* ── REDEEM: PICK VOUCHER / REWARD ── */}
        {phase === 'redeem_pick' && (
          <motion.div key="redeem_pick" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}
            style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '16px 24px', background: 'white', borderBottom: '2px solid #eee' }}>
              <button onClick={() => setPhase('payment_select')} style={kioskBtnGhost(fs)}>
                <ArrowLeft size={fs(24, 20)} style={{ marginRight: 8 }} /> {t('kiosk.back')}
              </button>
              <h1 style={{ flex: 1, textAlign: 'center', fontSize: fs(32, 26), fontWeight: 800 }}>{t('kiosk.redeem_pick_title')}</h1>
              <div style={{ width: 120 }} />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: fs(24, 20), maxWidth: 640, margin: '0 auto', width: '100%' }}>
              {memberVouchers.length === 0 && memberRewards.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 48, fontSize: fs(20, 18), color: '#888' }}>
                  {t('kiosk.redeem_none_available')}
                </div>
              ) : (
                <>
                  {memberVouchers.map(v => (
                    <button key={`v-${v.id}`} onClick={() => pickRedemption({
                      kind: 'voucher', code: v.code,
                      label: `${v.code} (${v.discount_type === 'percentage_off' ? `${v.discount_value}%` : formatPrice(v.discount_value)})`,
                    })} style={{
                      display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left',
                      padding: fs(18, 16), marginBottom: 12, borderRadius: 14, cursor: 'pointer',
                      border: `2px solid ${LOKA.gold}40`, background: 'white',
                    }}>
                      <Tag size={fs(26, 22)} style={{ color: LOKA.gold, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: fs(20, 17), fontWeight: 700 }}>{v.voucher_title || v.code}</div>
                        <div style={{ fontSize: fs(15, 13), color: '#888' }}>
                          {v.code} · {v.discount_type === 'percentage_off' ? `${v.discount_value}% off` : `${formatPrice(v.discount_value)} off`}
                          {v.min_spend ? ` · min ${formatPrice(v.min_spend)}` : ''}
                        </div>
                      </div>
                    </button>
                  ))}
                  {memberRewards.map(r => (
                    <button key={`r-${r.id}`} onClick={() => pickRedemption({ kind: 'reward', id: r.id, label: r.reward_name })} style={{
                      display: 'flex', alignItems: 'center', gap: 14, width: '100%', textAlign: 'left',
                      padding: fs(18, 16), marginBottom: 12, borderRadius: 14, cursor: 'pointer',
                      border: `2px solid ${LOKA.primary}40`, background: 'white',
                    }}>
                      <Gift size={fs(26, 22)} style={{ color: LOKA.primary, flexShrink: 0 }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: fs(20, 17), fontWeight: 700 }}>{r.reward_name}</div>
                      </div>
                    </button>
                  ))}
                </>
              )}
            </div>
            <div style={{ padding: 20, background: 'white', borderTop: '2px solid #eee', display: 'flex', justifyContent: 'center' }}>
              <button onClick={() => setPhase('payment_select')} style={kioskBtnGhost(fs)}>
                {t('kiosk.redeem_no_thanks')}
              </button>
            </div>
          </motion.div>
        )}

        {/* ── SUCCESS ── */}
        {phase === 'success' && (
          <motion.div key="success" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
            <CheckCircle size={fs(96, 80)} style={{ color: 'var(--color-success)', marginBottom: 24 }} />
            <h1 style={{ fontSize: fs(52, 42), fontWeight: 800, color: LOKA.primary }}>{t('kiosk.order_placed')}</h1>
            <div style={{ fontSize: fs(36, 28), color: '#666', marginTop: 8 }}>Order #{orderNumber}</div>
            {orderTotal && <div style={{ fontSize: fs(44, 36), fontWeight: 800, color: LOKA.primary, marginTop: 4 }}>{formatPrice(orderTotal)}</div>}
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
            <AutoResetTimer onTimeout={startNewOrder} seconds={120} t={t} fs={fs} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inactivity countdown overlay */}
      {(inactivityWarn && phase !== 'welcome' && phase !== 'success' && phase !== 'setup' && phase !== 'store_setup') && (
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

      {/* Item detail — full-screen page, not a modal (kiosk touch UX) */}
      {phase === 'item' && modifierDrawerItem && (
        <motion.div key="item" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}
          style={{ position: 'absolute', inset: 0, background: 'white' }}>
          <KioskItemPage
            item={modifierDrawerItem}
            qty={itemQty}
            onQtyChange={(d) => setItemQty(q => Math.max(1, q + d))}
            selectedOptions={selectedOptions}
            onToggleOption={toggleOption}
            selectedVariant={selectedVariant}
            onSelectVariant={setSelectedVariant}
            canConfirm={modifierRequirementsMet(modifierDrawerItem, selectedOptions)}
            confirmLabel={modifierRequirementsMet(modifierDrawerItem, selectedOptions) ? t('kiosk.add_to_cart') : t('kiosk.select_required')}
            totalPrice={(() => {
              const mods = Object.values(selectedOptions).flat().reduce((sum, modId) => {
                for (const g of modifierDrawerItem.modifier_groups || []) {
                  const m = g.options.find(x => x.id === modId);
                  if (m) return sum + Number(m.price_adjustment || 0);
                }
                return sum;
              }, 0);
              const vAdj = selectedVariant !== null && modifierDrawerItem.variants
                ? Number(modifierDrawerItem.variants.find(v => v.id === selectedVariant)?.price_adjustment || 0) : 0;
              return formatPrice(String((parseFloat(modifierDrawerItem.base_price) + mods + vAdj) * itemQty));
            })()}
            onConfirm={confirmAddWithModifiers}
            onBack={() => { setModifierDrawerItem(null); setPhase(returnPhaseRef.current); returnPhaseRef.current = 'menu'; }}
            fs={fs}
            isPortrait={isPortrait}
            t={t}
            formatPrice={formatPrice}
          />
        </motion.div>
      )}

      {/* Bundle builder — full-screen page */}
      {phase === 'bundle' && activeBundle && (
        <motion.div key="bundle" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}
          style={{ position: 'absolute', inset: 0, background: 'white' }}>
          <KioskBundlePage
            bundle={activeBundle}
            onBack={() => { setActiveBundle(null); setPhase('menu'); }}
            onConfirm={confirmBundle}
            fs={fs}
            isPortrait={isPortrait}
            t={t}
            formatPrice={formatPrice}
          />
        </motion.div>
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
    background: 'var(--color-surface)', border: 'none', cursor: 'pointer', color: '#333',
  };
}
