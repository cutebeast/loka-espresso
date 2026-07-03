'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useCartStore } from '@/stores/cartStore';
import { useWalletStore } from '@/stores/walletStore';
import { useConfigStore } from '@/stores/configStore';
import api from '@/lib/api';
import { autoDetectStore } from '@/lib/geolocation';
import type { PageId, Store as StoreType, CartItem, UserProfile } from '@/lib/api';

const PUBLIC_PAGES: PageId[] = [
  'home', 'menu', 'promotions', 'information', 'legal', 'cart', 'rewards', 'help-support', 'settings',
];

function isPublicPage(page: PageId): boolean {
  return PUBLIC_PAGES.includes(page);
}

export function useAuthFlow() {
  const { isAuthenticated, setUser, authDone, setAuthDone } = useAuthStore();
  const {
    page,
    setPage, setSelectedStore, setStores, showToast,
    setIsLoading,
  } = useUIStore();
  const { setBalance, setPoints, setTier, refreshWallet } = useWalletStore();
  const { loadConfig } = useConfigStore();
  const isGuest = useUIStore((s) => s.isGuest);
  const requestSignIn = useUIStore((s) => s.requestSignIn);
  const pendingArticleId = useRef<number | null>(null);
  const pendingArticleSlug = useRef<string | null>(null);
  const pendingPromoId = useRef<number | null>(null);
  const pendingGuestPage = useRef<PageId | null>(null);
  const savedGuestCart = useRef<CartItem[] | null>(null);

  // Parse deep-link query params on mount (e.g., ?article=123 or ?slug=history-of-pide from QR code)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);

    const article = params.get('article');
    if (article) {
      const id = parseInt(article, 10);
      if (!isNaN(id)) {
        pendingArticleId.current = id;
        setPage('information', { selectedInfoId: id });
      }
    }

    const slug = params.get('slug');
    if (slug) {
      pendingArticleSlug.current = slug;
      setPage('information', { selectedInfoSlug: slug });
    }

    const promo = params.get('promo');
    if (promo) {
      const id = parseInt(promo, 10);
      if (!isNaN(id)) {
        pendingPromoId.current = id;
        setPage('promotions', { preselectedId: id });
      }
    }

    if (article || slug || promo) {
      const url = new URL(window.location.href);
      url.searchParams.delete('article');
      url.searchParams.delete('slug');
      url.searchParams.delete('promo');
      window.history.replaceState({}, '', url.toString());
    }
  }, [setPage]);

  // When guest mode is enabled, allow browsing without auth
  useEffect(() => {
    if (isGuest && !authDone) {
      setAuthDone(true);
    }
  }, [isGuest, authDone, setAuthDone]);

  // When requestSignIn signal fires, save cart for restoration after modal login
  useEffect(() => {
    if (requestSignIn > 0) {
      const cart = useCartStore.getState();
      if (cart.items.length > 0) {
        savedGuestCart.current = [...cart.items];
      }
    }
  }, [requestSignIn]);

  // Redirect guest away from restricted pages — show LoginModal instead
  useEffect(() => {
    if (isGuest && !isPublicPage(page) && authDone) {
      pendingGuestPage.current = page;
      const cart = useCartStore.getState();
      savedGuestCart.current = [...cart.items];
      useUIStore.getState().triggerSignIn();
    }
  }, [isGuest, page, authDone]);

  // Validate session on mount — restores user after page reload
  useEffect(() => {
    if (useUIStore.getState().isGuest) return;
    const abortCtrl = new AbortController();
    let cancelled = false;
    const validate = async () => {
      setIsLoading(true);
      try {
        const token = localStorage.getItem('token');
        if (token) {
          const userRes = await api.get('/me', { signal: abortCtrl.signal });
          if (!cancelled) {
            const raw = userRes.data as { profile?: UserProfile; addresses?: UserProfile['addresses']; referral_code?: string } | UserProfile;
            const profile = ('profile' in raw && raw.profile) ? raw.profile : raw as UserProfile;
            const addresses = ('addresses' in raw && raw.addresses) ? raw.addresses : profile.addresses;
            setUser({ ...profile, addresses: addresses || [], referral_code: ('referral_code' in raw && raw.referral_code) ? raw.referral_code : (profile.referral_code || '') });
            setAuthDone(true);
          }
        }
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        console.error('[AuthFlow] Session validation failed:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    validate();
    return () => { cancelled = true; abortCtrl.abort(); };
  }, [setUser, setAuthDone, setIsLoading]);

  const loadAppData = useCallback(async () => {
    try {
      const [profileRes, loyaltyRes, walletRes, storesRes] = await Promise.allSettled([
        api.get('/me'),
        api.get('/loyalty/me'),
        api.get('/wallet/me'),
        api.get('/stores'),
      ]);
      if (profileRes.status === 'fulfilled') {
        const raw = profileRes.value.data as { profile?: UserProfile; addresses?: UserProfile['addresses']; referral_code?: string } | UserProfile;
        const p = ('profile' in raw && raw.profile) ? raw.profile : raw as UserProfile;
        const addresses = ('addresses' in raw && raw.addresses) ? raw.addresses : p.addresses;
        setUser({ ...p, addresses: addresses || [], referral_code: ('referral_code' in raw && raw.referral_code) ? raw.referral_code : (p.referral_code || '') });
      }
      if (loyaltyRes.status === 'fulfilled') {
        const d = loyaltyRes.value.data;
        if (d?.current_points != null) setPoints(Number(d.current_points));
        if (d?.tier_name) setTier(d.tier_name);
      }
      if (walletRes.status === 'fulfilled') {
        const d = walletRes.value.data;
        if (d?.balance != null) setBalance(Number(d.balance));
      }
      if (storesRes.status === 'fulfilled') {
        const storeData = storesRes.value.data as StoreType[] | { items?: StoreType[] } | undefined;
        const list: StoreType[] = Array.isArray(storeData) ? storeData : (storeData?.items ?? []);
        setStores(list);
      }
      refreshWallet();
      loadConfig();
    } catch {
      showToast('Failed to load app data', 'error');
    }
  }, [setUser, setPoints, setTier, setBalance, setStores, showToast, refreshWallet, loadConfig]);

  const detectAndSetStore = useCallback(async () => {
    const stores = useUIStore.getState().stores;
    const currentStore = useUIStore.getState().selectedStore;
    if (stores.length > 0 && !currentStore) {
      const detected = await autoDetectStore(stores);
      setSelectedStore(detected);
    }
  }, [setSelectedStore]);

  useEffect(() => {
    if (isAuthenticated && authDone) loadAppData();
  }, [isAuthenticated, authDone, loadAppData]);

  useEffect(() => {
    if (isAuthenticated && authDone) detectAndSetStore();
  }, [isAuthenticated, authDone, detectAndSetStore]);

  const handleAuthDone = useCallback(() => {
    setAuthDone(true);
    if (savedGuestCart.current) {
      const items = savedGuestCart.current;
      savedGuestCart.current = null;
      if (items.length > 0) {
        const cart = useCartStore.getState();
        cart.clearCart();
        items.forEach((item) => cart.addItem(item));
        useUIStore.getState().showToast('Cart restored', 'success');
      }
    }
    if (pendingGuestPage.current) {
      const target = pendingGuestPage.current;
      pendingGuestPage.current = null;
      // If navigating to checkout without a store, show store picker first
      if (target === 'checkout') {
        const ui = useUIStore.getState();
        if (!ui.selectedStore && ui.orderMode !== 'dine_in') {
          ui.setShowStorePicker(true);
          return;
        }
      }
      setTimeout(() => setPage(target), 100);
    }
    if (pendingArticleId.current != null) {
      setPage('information', { selectedInfoId: pendingArticleId.current });
      pendingArticleId.current = null;
    } else if (pendingArticleSlug.current != null) {
      setPage('information', { selectedInfoSlug: pendingArticleSlug.current });
      pendingArticleSlug.current = null;
    }
  }, [setPage, setAuthDone]);

  const enterGuestSignIn = useCallback(() => {
    const cart = useCartStore.getState();
    savedGuestCart.current = [...cart.items];
    useUIStore.getState().setIsGuest(false);
    setAuthDone(false);
    useAuthStore.getState().resetAllExceptCart();
  }, [setAuthDone]);

  return {
    authDone,
    handleAuthDone,
    enterGuestSignIn,
    savedGuestCart,
  };
}
