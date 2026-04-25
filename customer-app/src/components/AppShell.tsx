'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useCartStore } from '@/stores/cartStore';
import { useWalletStore } from '@/stores/walletStore';
import { useConfigStore } from '@/stores/configStore';

import api from '@/lib/api';
import { autoDetectStore, getDistanceToStore } from '@/lib/geolocation';
import type { PageId, Store as StoreType, CartItem } from '@/lib/api';
import { useVersionCheck } from '@/hooks/useVersionCheck';
import { resolveAppUrl } from '@/lib/tokens';
import OfflineBanner from '@/components/OfflineBanner';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useA2HS } from '@/hooks/useA2HS';
import PromotionPopup from '@/components/PromotionPopup';
import StorePickerModal from '@/components/StorePickerModal';

import { HubLayout } from '@/components/layouts';
import { HomeHeader } from '@/components/HomeHeader';
import AuthFlow from '@/components/AuthFlow';

import HomePage from './HomePage';
import MenuPage from './MenuPage';
import CartPage from './CartPage';

const OrdersPage = dynamic(() => import('./OrdersPage'), { ssr: false });
const ProfilePage = dynamic(() => import('./ProfilePage'), { ssr: false });
const CheckoutPage = dynamic(() => import('./CheckoutPage'), { ssr: false });
const RewardsPage = dynamic(() => import('./RewardsPage'), { ssr: false });
const HistoryPage = dynamic(() => import('./HistoryPage'), { ssr: false });
const WalletPage = dynamic(() => import('./WalletPage'), { ssr: false });
const QRScanner = dynamic(() => import('./QRScanner'), { ssr: false });
const PromotionsPage = dynamic(() => import('./PromotionsPage'), { ssr: false });
const InformationPage = dynamic(() => import('./InformationPage'), { ssr: false });
const MyRewardsPage = dynamic(() => import('./MyRewardsPage'), { ssr: false });
const AccountDetailsPage = dynamic(() => import('./profile/AccountDetailsPage'), { ssr: false });
const PaymentMethodsPage = dynamic(() => import('./profile/PaymentMethodsPage'), { ssr: false });
const SavedAddressesPage = dynamic(() => import('./profile/SavedAddressesPage'), { ssr: false });
const NotificationsPage = dynamic(() => import('./profile/NotificationsPage'), { ssr: false });
const HelpSupportPage = dynamic(() => import('./profile/HelpSupportPage'), { ssr: false });
const LegalPage = dynamic(() => import('./LegalPage'), { ssr: false });
const SettingsPage = dynamic(() => import('./profile/SettingsPage'), { ssr: false });
const MyCardPage = dynamic(() => import('./MyCardPage'), { ssr: false });
const OrderDetailPage = dynamic(() => import('./OrderDetailPage'), { ssr: false });

// Pages that don't show bottom nav (sub-pages)
const SUB_PAGES: PageId[] = [
  'cart', 'checkout', 'order-detail', 'wallet', 'history',
  'promotions', 'information', 'my-rewards', 'account-details',
  'payment-methods', 'saved-addresses', 'notifications', 'help-support', 'legal', 'settings', 'my-card',
];

// Pages accessible to guest users without login
const PUBLIC_PAGES: PageId[] = [
  'home', 'menu', 'promotions', 'information', 'legal',
];

function isPublicPage(page: PageId): boolean {
  return PUBLIC_PAGES.includes(page);
}

export default function AppShell() {
  const { user, isAuthenticated, setUser, logout } = useAuthStore();
  const {
    page, selectedStore, stores, toast, pageParams, isGuest,
    setPage, setSelectedStore, setStores, showToast, hideToast,
    setIsLoading, showStorePicker, setShowStorePicker,
  } = useUIStore();
  const { setBalance, setPoints, setTier, refreshWallet } = useWalletStore();
  const { loadConfig } = useConfigStore();
  const reducedMotion = useReducedMotion();
  const a2hs = useA2HS();

  const [authDone, setAuthDone] = useState(false);
  const [showStoreModal, setShowStoreModal] = useState(false);
  const [, setStoreSearch] = useState('');
  const [, setSelectedStoreDistance] = useState('');
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingArticleId = useRef<number | null>(null);
  const pendingArticleSlug = useRef<string | null>(null);
  const pendingGuestPage = useRef<PageId | null>(null);
  const savedGuestCart = useRef<{ items: CartItem[]; storeId: number | null } | null>(null);

  // Parse deep-link query params on mount (e.g., ?article=123 or ?slug=history-of-pide from QR code)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);

    // Support ?article=123 (numeric ID)
    const article = params.get('article');
    if (article) {
      const id = parseInt(article, 10);
      if (!isNaN(id)) {
        pendingArticleId.current = id;
        setPage('information', { selectedInfoId: id });
      }
    }

    // Support ?slug=history-of-pide (human-readable slug)
    const slug = params.get('slug');
    if (slug) {
      pendingArticleSlug.current = slug;
      setPage('information', { selectedInfoSlug: slug });
    }

    // Clean query params from URL without reloading
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
  }, [isGuest, authDone]);

  // Redirect guest away from restricted pages — trigger auth flow
  useEffect(() => {
    if (isGuest && !isPublicPage(page) && authDone) {
      pendingGuestPage.current = page;
      const cart = useCartStore.getState();
      savedGuestCart.current = { items: [...cart.items], storeId: cart.storeId };
      useUIStore.getState().setIsGuest(false);
      setAuthDone(false);
      useAuthStore.getState().resetAllExceptCart();
    }
  }, [isGuest, page, authDone]);

  // Hash-based routing: listen for back/forward browser navigation
  useEffect(() => {
    const handler = () => {
      const raw = window.location.hash.replace('#', '');
      const pagePart = raw.split('?')[0];
      const valid: PageId[] = [
        'home', 'menu', 'rewards', 'cart', 'orders', 'checkout', 'profile',
        'wallet', 'history', 'promotions', 'information', 'my-rewards',
        'account-details', 'payment-methods', 'saved-addresses', 'notifications', 'help-support', 'legal', 'settings', 'my-card', 'order-detail',
      ];
      if (valid.includes(pagePart as PageId)) {
        const queryPart = raw.split('?')[1];
        const params: Record<string, unknown> = {};
        if (queryPart) {
          new URLSearchParams(queryPart).forEach((v, k) => {
            if (k === 'orderId' || k === 'selectedInfoId' || k === 'selectedPromoId') params[k] = parseInt(v, 10);
            else params[k] = v;
          });
        }
        setPage(pagePart as PageId, Object.keys(params).length > 0 ? params : undefined);
      }
    };
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, [setPage]);

  // Calculate store distance
  useEffect(() => {
    const calc = async () => {
      if (selectedStore && selectedStore.lat != null && selectedStore.lng != null) {
        const dist = await getDistanceToStore(selectedStore);
        setSelectedStoreDistance(dist || '');
      }
    };
    calc();
  }, [selectedStore]);

  // Load stores when modal opens
  useEffect(() => {
    if (showStoreModal && stores.length === 0) {
      api.get('/stores')
        .then((res) => setStores(res.data))
        .catch(() => showToast('Failed to load stores', 'error'));
    }
  }, [showStoreModal, stores.length, setStores, showToast]);

  // Version check
  useVersionCheck();

  // Listen for QR scanner open requests from child components (e.g. cart)
  useEffect(() => {
    const handler = () => setShowQRScanner(true);
    window.addEventListener('open-qr-scanner', handler);
    return () => window.removeEventListener('open-qr-scanner', handler);
  }, []);

  // Toast auto-hide
  useEffect(() => {
    if (toast) {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => hideToast(), 3000);
    }
    return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); };
  }, [toast, hideToast]);

  // Load app data when authenticated
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
      // Fetch unread notification count
      try {
        const notifRes = await api.get('/notifications');
        const notifs = Array.isArray(notifRes.data) ? notifRes.data : [];
        setUnreadCount(notifs.filter((n: { is_read?: boolean }) => !n.is_read).length);
      } catch { /* ignore */ }
    } catch {
      showToast('Failed to load app data', 'error');
    }
  }, [setUser, setPoints, setTier, setBalance, setStores, setSelectedStore, selectedStore, showToast, refreshWallet, loadConfig]);

  useEffect(() => {
    if (isAuthenticated && authDone) loadAppData();
  }, [isAuthenticated, authDone, loadAppData]);

  // Validate session on mount via httpOnly cookie
  useEffect(() => {
    if (!isAuthenticated) return;
    const abortCtrl = new AbortController();
    const validate = async () => {
      setIsLoading(true);
      try {
        const res = await api.get('/users/me', { signal: abortCtrl.signal });
        setUser(res.data);
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
  }, [logout, setIsLoading, setUser, isAuthenticated]);

  const handleAuthDone = useCallback(() => {
    setAuthDone(true);
    // Restore guest cart that was saved before sign-in
    if (savedGuestCart.current) {
      const { items, storeId } = savedGuestCart.current;
      savedGuestCart.current = null;
      if (items.length > 0) {
        const cart = useCartStore.getState();
        cart.clearCart();
        if (storeId) cart.setStoreId(storeId);
        items.forEach((item) => cart.addItem(item, storeId));
        useUIStore.getState().showToast('Cart restored', 'success');
      }
    }
    // Navigate to pending page (guest wanted to go to checkout/cart etc.)
    if (pendingGuestPage.current) {
      const target = pendingGuestPage.current;
      pendingGuestPage.current = null;
      setTimeout(() => setPage(target), 100);
    }
    // If a QR code brought us here with an article ID or slug, navigate there after login
    if (pendingArticleId.current != null) {
      setPage('information', { selectedInfoId: pendingArticleId.current });
      pendingArticleId.current = null;
    } else if (pendingArticleSlug.current != null) {
      setPage('information', { selectedInfoSlug: pendingArticleSlug.current });
      pendingArticleSlug.current = null;
    }
  }, [setPage]);

  const handleNavClick = (id: PageId) => {
    if (id === page) return;
    setPage(id);
  };

  const renderPage = () => {
    switch (page) {
      case 'home': return (
        <HubLayout
          page={page}
          onNavigate={handleNavClick}
          isGuest={isGuest}
          header={
            <HomeHeader
              userName={user?.name}
              unreadNotifications={unreadCount}
              onNotificationClick={() => setPage('notifications')}
              onQRScanClick={() => setShowQRScanner(true)}
            />
          }
        >
          <HomePage />
        </HubLayout>
      );
      case 'menu': return (
        <HubLayout page={page} onNavigate={handleNavClick} isGuest={isGuest}>
          <MenuPage />
        </HubLayout>
      );
      case 'rewards': return (
        <HubLayout page={page} onNavigate={handleNavClick} isGuest={isGuest}>
          <RewardsPage />
        </HubLayout>
      );
      case 'orders': return (
        <HubLayout page={page} onNavigate={handleNavClick} isGuest={isGuest}>
          <OrdersPage />
        </HubLayout>
      );
      case 'profile': return (
        <HubLayout page={page} onNavigate={handleNavClick} isGuest={isGuest}>
          <ProfilePage />
        </HubLayout>
      );
      case 'cart': return <CartPage />;
      case 'checkout': return <CheckoutPage />;
      case 'wallet': return <WalletPage />;
      case 'history': return <HistoryPage />;
      case 'promotions': return <PromotionsPage onBack={() => setPage('home')} preselectedId={pageParams.selectedPromoId as number | undefined} />;
      case 'information': return <InformationPage onBack={() => setPage('home')} preselectedId={pageParams.selectedInfoId as number | undefined} preselectedSlug={pageParams.selectedInfoSlug as string | undefined} />;
      case 'my-rewards': return <MyRewardsPage onBack={() => setPage('profile')} initialTab={pageParams.initialTab as 'rewards' | 'vouchers' | undefined} />;
      case 'account-details': return <AccountDetailsPage />;
      case 'payment-methods': return <PaymentMethodsPage />;
      case 'saved-addresses': return <SavedAddressesPage />;
      case 'notifications': return <NotificationsPage />;
      case 'help-support': return <HelpSupportPage />;
      case 'legal': return <LegalPage />;
      case 'settings': return <SettingsPage />;
      case 'my-card': return <MyCardPage />;
      case 'order-detail': return <OrderDetailPage />;
      default: return <HomePage />;
    }
  };

  const toastColorMap = {
    success: 'bg-success',
    error: 'bg-danger',
    info: 'bg-info',
  };

  const _isSubPage = SUB_PAGES.includes(page);

  return (
    <div className="app-container">
      <OfflineBanner />
      {page === 'home' && <PromotionPopup />}

      {/* Guest banner — prompts sign-in for full access */}
      {isGuest && authDone && (
        <div className="guest-banner">
          <div className="guest-banner-text">
            <span>Browsing as guest</span>
          </div>
          <button
            className="guest-banner-btn"
            onClick={() => {
              const cart = useCartStore.getState();
              savedGuestCart.current = { items: [...cart.items], storeId: cart.storeId };
              useUIStore.getState().setIsGuest(false);
              setAuthDone(false);
              useAuthStore.getState().resetAllExceptCart();
            }}
          >
            Sign in
          </button>
        </div>
      )}

      {/* Information pages and other public pages can be accessed without login */}
      {/* Guest users skip auth flow entirely */}
      {!isGuest && !authDone ? (
        <AuthFlow onAuthDone={handleAuthDone} />
      ) : (
        <>
          {/* Toast */}
          <AnimatePresence>
            {toast && (
              <motion.div
                initial={{ opacity: 0, y: -60 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -60 }}
                transition={reducedMotion ? { duration: 0 } : undefined}
                className={`absolute top-0 left-0 right-0 z-50 px-4 pt-3 pb-3 safe-area-top ${toastColorMap[toast.type]}`}
                role="status"
                aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
                aria-atomic="true"
              >
                <div className="flex items-center justify-between text-white pt-2">
                  <span className="text-sm font-medium flex-1">{toast.message}</span>
                  <button onClick={hideToast} className="ml-3 p-1 rounded-full hover:bg-white/20 touch-target">
                    <span className="text-white">✕</span>
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* A2HS Centered Modal */}
          {a2hs.canInstall && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="a2hs-backdrop"
                onClick={a2hs.dismiss}
              />
              {/* Modal */}
              <motion.div
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.92 }}
                transition={reducedMotion ? { duration: 0 } : { duration: 0.25 }}
                className="a2hs-modal-wrap"
              >
                <div className="a2hs-modal-box">
                  <h3 className="a2hs-modal-title">Add to Home Screen</h3>
                  <div className="a2hs-app-row">
                    <img
                      src="/icon-192.png"
                      alt="Loka"
                      className="a2hs-app-icon"
                    />
                    <div>
                      <p className="a2hs-app-name">Loka Espresso</p>
                      <p className="a2hs-app-url">app.loyaltysystem.uk</p>
                    </div>
                  </div>
                  <div className="a2hs-btn-row">
                    <button
                      onClick={a2hs.dismiss}
                      className="a2hs-btn-cancel"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={a2hs.promptInstall}
                      className="a2hs-btn-add"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </motion.div>
            </>
          )}

          {/* Main Content */}
          <main id="main-content" className="flex-1 overflow-hidden bg-bg">
            <AnimatePresence mode="wait">
              <motion.div
                key={page}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={reducedMotion ? { duration: 0 } : { duration: 0.2 }}
                className="h-full"
              >
                {renderPage()}
              </motion.div>
            </AnimatePresence>
          </main>

          {/* Store Picker Modal */}
          <AnimatePresence>
            {(showStoreModal || showStorePicker) && (
              <StorePickerModal
                stores={stores}
                selectedStore={selectedStore}
                onSelect={(store) => {
                  setSelectedStore(store);
                  setShowStoreModal(false);
                  setShowStorePicker(false);
                  useCartStore.getState().setStoreId(store.id);
                  setStoreSearch('');
                  showToast(`Switched to ${store.name}`, 'success');
                }}
                onClose={() => { setShowStoreModal(false); setShowStorePicker(false); setStoreSearch(''); }}
              />
            )}
          </AnimatePresence>

          {/* QR Scanner */}
          <QRScanner
            isOpen={showQRScanner}
            onClose={() => setShowQRScanner(false)}
            onScan={async (result) => {
              setShowQRScanner(false);
              let storeSlug = '';
              let tableId = 0;
              let qrToken = '';
              let articleSlug = '';
              try {
                if (result.startsWith('http')) {
                  const url = new URL(result);
                  storeSlug = url.searchParams.get('store') || '';
                  tableId = parseInt(url.searchParams.get('table') || '0', 10);
                  qrToken = url.searchParams.get('t') || '';
                  articleSlug = url.searchParams.get('slug') || '';
                } else if (result.startsWith('loka://')) {
                  const url = new URL(result.replace('loka://', resolveAppUrl('/')));
                  storeSlug = url.searchParams.get('store') || '';
                  tableId = parseInt(url.searchParams.get('table') || '0', 10);
                  qrToken = url.searchParams.get('t') || '';
                  articleSlug = url.searchParams.get('slug') || '';
                } else {
                  const parsed = JSON.parse(result);
                  storeSlug = parsed.store_slug || parsed.storeSlug || '';
                  tableId = parsed.table_id || parsed.tableId || 0;
                  qrToken = parsed.t || parsed.qr_token || '';
                  articleSlug = parsed.slug || '';
                }
              } catch {
                showToast('Invalid QR code format', 'error');
                return;
              }
              // Information / product deep-link QR
              if (articleSlug) {
                setPage('information', { selectedInfoSlug: articleSlug });
                return;
              }
              if (!storeSlug || !tableId) {
                showToast('Invalid QR code', 'error');
                return;
              }
              try {
                const res = await api.post('/tables/scan', { store_slug: storeSlug, table_id: tableId, qr_token: qrToken });
                const data = res.data;
                const { setOrderMode, setDineInSession, setSelectedStore } = useUIStore.getState();
                const { setStoreId } = useCartStore.getState();
                setDineInSession({
                  storeId: data.store_id,
                  storeName: data.store_name,
                  storeSlug: data.store_slug,
                  tableId: data.table_id,
                  tableNumber: data.table_number,
                });
                setOrderMode('dine_in');
                setStoreId(data.store_id);
                const storeRes = await api.get('/stores');
                const storeList: StoreType[] = storeRes.data;
                const found = storeList.find((s) => s.id === data.store_id);
                if (found) setSelectedStore(found);
                showToast(`Table ${data.table_number} at ${data.store_name}`, 'success');
              } catch (err: unknown) {
                const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || 'Failed to scan table';
                showToast(msg, 'error');
              }
            }}
          />
        </>
      )}

      <div className="rotate-prompt">
        <div className="rotate-prompt-inner">
          <div className="rotate-prompt-icon">📱</div>
          <p className="rotate-prompt-text">Please rotate your device to portrait</p>
        </div>
      </div>
    </div>
  );
}
