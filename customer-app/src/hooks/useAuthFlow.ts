'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useCartStore } from '@/stores/cartStore';
import { useWalletStore } from '@/stores/walletStore';
import { useConfigStore } from '@/stores/configStore';
import api from '@/lib/api';
import { autoDetectStore } from '@/lib/geolocation';
import type { PageId, Store as StoreType, CartItem } from '@/lib/api';

const PUBLIC_PAGES: PageId[] = [
  'home', 'menu', 'promotions', 'information', 'legal', 'cart', 'rewards', 'help-support', 'settings',
];

function isPublicPage(page: PageId): boolean {
  return PUBLIC_PAGES.includes(page);
}

export function useAuthFlow() {
  const { isAuthenticated, setUser, logout, authDone, setAuthDone } = useAuthStore();
  const {
    page, selectedStore,
    setPage, setSelectedStore, setStores, showToast,
    setIsLoading,
  } = useUIStore();
  const { setBalance, setPoints, setTier, refreshWallet } = useWalletStore();
  const { loadConfig } = useConfigStore();
  const isGuest = useUIStore((s) => s.isGuest);
  const requestSignIn = useUIStore((s) => s.requestSignIn);
  const pendingArticleId = useRef<number | null>(null);
  const pendingArticleSlug = useRef<string | null>(null);
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

    if (article || slug) {
      const url = new URL(window.location.href);
      url.searchParams.delete('article');
      url.searchParams.delete('slug');
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

  // Validate session on mount via httpOnly cookie
  useEffect(() => {
    if (!isAuthenticated) return;
    const abortCtrl = new AbortController();
    const validate = async () => {
      setIsLoading(true);
      try {
        const res = await api.get('/auth/session', { signal: abortCtrl.signal });
        if (res.data?.authenticated) {
          const userRes = await api.get('/users/me', { signal: abortCtrl.signal });
          setUser(userRes.data);
        }
        setAuthDone(true);
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        logout();
      } finally {
        setIsLoading(false);
      }
    };
    validate();
    return () => abortCtrl.abort();
  }, [logout, setIsLoading, setUser, setAuthDone, isAuthenticated]);

  const loadAppData = useCallback(async () => {
    try {
      const [profileRes, loyaltyRes, walletRes, storesRes] = await Promise.allSettled([
        api.get('/users/me'),
        api.get('/loyalty/balance'),
        api.get('/wallet'),
        api.get('/stores'),
      ]);

      if (profileRes.status === 'fulfilled') setUser(profileRes.value.data);
      if (loyaltyRes.status === 'fulfilled') {
        const d = loyaltyRes.value.data;
        if (d?.points_balance != null) setPoints(Number(d.points_balance));
        if (d?.tier) setTier(d.tier);
      }
      if (walletRes.status === 'fulfilled') {
        const d = walletRes.value.data;
        if (d?.balance != null) setBalance(Number(d.balance));
      }
      if (storesRes.status === 'fulfilled') {
        const list: StoreType[] = storesRes.value.data;
        setStores(list);
        if (!selectedStore && list.length > 0) {
          const detected = await autoDetectStore(list);
          setSelectedStore(detected);
        }
      }
      refreshWallet();
      loadConfig();
    } catch {
      showToast('Failed to load app data', 'error');
    }
  }, [setUser, setPoints, setTier, setBalance, setStores, setSelectedStore, selectedStore, showToast, refreshWallet, loadConfig]);

  useEffect(() => {
    if (isAuthenticated && authDone) loadAppData();
  }, [isAuthenticated, authDone, loadAppData]);

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
