'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';

import api from '@/lib/api';
import type { Store as StoreType } from '@/lib/api';
import { useVersionCheck } from '@/hooks/useVersionCheck';
import { useAuthFlow } from '@/hooks/useAuthFlow';
import { usePageRouter } from '@/hooks/usePageRouter';
import { useNotifications } from '@/hooks/useNotifications';
import { resolveAppUrl } from '@/lib/tokens';
import { getBrowserLocation } from '@/lib/geolocation';
import type { PaginatedResponse } from '@/lib/api';
import { registerCartSyncListeners } from '@/lib/cartSync';
import OfflineBanner from '@/components/shared/OfflineBanner';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useTranslation } from '@/hooks/useTranslation';
import { useA2HS } from '@/hooks/useA2HS';
import PromotionPopup from '@/components/PromotionPopup';
import StorePickerModal from '@/components/StorePickerModal';
import { LoginModal } from '@/components/auth/LoginModal';
import Toast from '@/components/shared/Toast';

import { HubLayout } from '@/components/layouts';
import { HomeHeader } from '@/components/HomeHeader';
import AuthFlow from '@/components/AuthFlow';

import HomePage from './HomePage';
import MenuPage from './MenuPage';
import CartPage from './CartPage';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pageImporters: Record<string, () => Promise<{ default: React.ComponentType<any> }>> = {
  orders: () => import('./OrdersPage'),
  profile: () => import('./ProfilePage'),
  checkout: () => import('./CheckoutPage'),
  rewards: () => import('./RewardsPage'),
  history: () => import('./HistoryPage'),
  wallet: () => import('./WalletPage'),
  qrScanner: () => import('./QRScanner'),
  promotions: () => import('./PromotionsPage'),
  information: () => import('./InformationPage'),
  'my-rewards': () => import('./MyRewardsPage'),
  'account-details': () => import('./profile/AccountDetailsPage'),
  'payment-methods': () => import('./profile/PaymentMethodsPage'),
  'saved-addresses': () => import('./profile/SavedAddressesPage'),
  notifications: () => import('./profile/NotificationsPage'),
  'help-support': () => import('./profile/HelpSupportPage'),
  legal: () => import('./LegalPage'),
  settings: () => import('./profile/SettingsPage'),
  referral: () => import('./profile/ReferralPage'),
  'my-card': () => import('./MyCardPage'),
  'order-detail': () => import('./OrderDetailPage'),
  reservations: () => import('./ReservationsPage'),
  events: () => import('./EventsPage'),
  checkin: () => import('./CheckinPage'),
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dynamicCache: Record<string, React.ComponentType<any>> = {};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPageComponent(key: string): React.ComponentType<any> | null {
  return dynamicCache[key] || null;
}

// Pre-register all dynamic page components at module scope
(function initDynamicCache() {
  for (const [key, importer] of Object.entries(pageImporters)) {
    dynamicCache[key] = dynamic(importer, { ssr: false });
  }
})();

function LazyRenderer({ pageKey, ...props }: { pageKey: string } & Record<string, unknown>) {
  const Comp = getPageComponent(pageKey);
  // eslint-disable-next-line -- dynamic components are pre-cached at module scope
  return Comp ? <Comp {...props} /> : null;
}

export default function AppShell() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const page = useUIStore((s) => s.page);
  const selectedStore = useUIStore((s) => s.selectedStore);
  const stores = useUIStore((s) => s.stores);
  const toast = useUIStore((s) => s.toast);
  const pageParams = useUIStore((s) => s.pageParams);
  const isGuest = useUIStore((s) => s.isGuest);
  const requestSignIn = useUIStore((s) => s.requestSignIn);
  const setPage = useUIStore((s) => s.setPage);
  const setSelectedStore = useUIStore((s) => s.setSelectedStore);
  const setStores = useUIStore((s) => s.setStores);
  const showToast = useUIStore((s) => s.showToast);
  const showStorePicker = useUIStore((s) => s.showStorePicker);
  const setShowStorePicker = useUIStore((s) => s.setShowStorePicker);
  const triggerSignIn = useUIStore((s) => s.triggerSignIn);
  const userLocation = useUIStore((s) => s.userLocation);
  const setUserLocation = useUIStore((s) => s.setUserLocation);

  // ── Menu is global — no store_id mapping needed for browsing ──
  const reducedMotion = useReducedMotion();
  const a2hs = useA2HS();

  const { authDone, handleAuthDone } = useAuthFlow();
  const { handleNavClick } = usePageRouter();
  const { unreadCount, fetchUnreadCount } = useNotifications();

  const [showStoreModal, setShowStoreModal] = useState(false);
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [swUpdateAvailable, setSwUpdateAvailable] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const prevRequestSignIn = useRef(requestSignIn);

  const onNotificationClick = useCallback(() => {
    if (isGuest) triggerSignIn(); else setPage('notifications');
  }, [isGuest, triggerSignIn, setPage]);
  const onQRScanClick = useCallback(() => setShowQRScanner(true), []);
  const onBackHome = useCallback(() => setPage('home'), [setPage]);
  const onBackProfile = useCallback(() => setPage('profile'), [setPage]);

  // Handle auth expiration from API layer
  useEffect(() => {
    const handler = () => {
      if (!useAuthStore.getState().isAuthenticated) return;
      logout();
    };
    window.addEventListener('auth:expired', handler);
    return () => window.removeEventListener('auth:expired', handler);
  }, [logout]);

  // Scroll to top on page change
  useEffect(() => {
    const main = document.querySelector('main.scroll-container');
    if (main) main.scrollTo({ top: 0, behavior: 'auto' });
  }, [page]);

  // Load stores when modal opens
  useEffect(() => {
    if ((showStoreModal || showStorePicker) && stores.length === 0) {
      const controller = new AbortController();
      api.get('/stores', { signal: controller.signal })
        .then((res) => {
          const data = res.data as StoreType[] | PaginatedResponse<StoreType>;
          const list = Array.isArray(data) ? data : (data?.items ?? []);
          setStores(list);
        })
        .catch((err) => {
          if ((err as { name?: string })?.name === 'CanceledError') return;
          console.error('[AppShell] Store list fetch failed:', err); showToast(t('toast.storesLoadFailed'), 'error');
        });
      return () => controller.abort();
    }
  }, [showStoreModal, showStorePicker, stores.length, setStores, showToast, t]);

  // Prefetch user location at startup for instant distance display
  useEffect(() => {
    getBrowserLocation().then((loc) => {
      if (loc) setUserLocation(loc);
    });
  }, [setUserLocation]);

  // Register cart sync online/offline listeners with cleanup
  useEffect(() => {
    return registerCartSyncListeners();
  }, []);

  // Version check
  useVersionCheck();

  // Fetch unread notification count after auth
  useEffect(() => {
    if (authDone && !isGuest) fetchUnreadCount();
  }, [authDone, isGuest, fetchUnreadCount]);

  // Listen for QR scanner open requests from child components (e.g. cart)
  useEffect(() => {
    const handler = () => setShowQRScanner(true);
    window.addEventListener('open-qr-scanner', handler);
    return () => window.removeEventListener('open-qr-scanner', handler);
  }, []);

  // Listen for SW update notifications
  useEffect(() => {
    const handler = () => setSwUpdateAvailable(true);
    window.addEventListener('sw-update-available', handler);
    return () => window.removeEventListener('sw-update-available', handler);
  }, []);

  // When requestSignIn fires, open LoginModal instead of full-screen AuthFlow
  useEffect(() => {
    if (requestSignIn > prevRequestSignIn.current) {
      prevRequestSignIn.current = requestSignIn;
      setShowLoginModal(true);
    }
  }, [requestSignIn]);

  const renderPage = useMemo(() => {
    switch (page) {
      case 'home': return (
          <HubLayout
          page={page}
          onNavigate={handleNavClick}
          header={
            <HomeHeader
              userName={user?.display_name}
              unreadNotifications={unreadCount}
              onNotificationClick={onNotificationClick}
              onQRScanClick={onQRScanClick}
            />
          }
        >
          <HomePage />
        </HubLayout>
      );
      case 'menu': return (
        <HubLayout page={page} onNavigate={handleNavClick}>
          <MenuPage />
        </HubLayout>
      );
      case 'rewards': return (
        <HubLayout page={page} onNavigate={handleNavClick}>
          <LazyRenderer pageKey="rewards" />
        </HubLayout>
      );
      case 'orders': return (
        <HubLayout page={page} onNavigate={handleNavClick}>
          <LazyRenderer pageKey="orders" />
        </HubLayout>
      );
      case 'profile': return (
        <HubLayout page={page} onNavigate={handleNavClick}>
          <LazyRenderer pageKey="profile" />
        </HubLayout>
      );
      case 'cart': return <CartPage />;
      case 'checkout': return <LazyRenderer pageKey="checkout" />;
      case 'wallet': return <LazyRenderer pageKey="wallet" />;
      case 'history': return <LazyRenderer pageKey="history" />;
      case 'promotions': return (
        <HubLayout page={page} onNavigate={handleNavClick}>
          <LazyRenderer pageKey="promotions" onBack={onBackHome} preselectedId={pageParams.selectedPromoId as number | undefined} />
        </HubLayout>
      );
      case 'information': return <LazyRenderer pageKey="information" onBack={onBackHome} preselectedId={pageParams.selectedInfoId as number | undefined} preselectedSlug={pageParams.selectedInfoSlug as string | undefined} contentType={pageParams.selectedInfoContentType as string | undefined} />;
      case 'my-rewards': return <LazyRenderer pageKey="my-rewards" onBack={onBackProfile} initialTab={pageParams.initialTab as 'rewards' | 'vouchers' | undefined} />;
      case 'account-details': return <LazyRenderer pageKey="account-details" />;
      case 'payment-methods': return <LazyRenderer pageKey="payment-methods" />;
      case 'saved-addresses': return <LazyRenderer pageKey="saved-addresses" />;
      case 'notifications': return <LazyRenderer pageKey="notifications" />;
      case 'help-support': return <LazyRenderer pageKey="help-support" />;
      case 'legal': return <LazyRenderer pageKey="legal" />;
      case 'settings': return <LazyRenderer pageKey="settings" />;
      case 'referral': return <LazyRenderer pageKey="referral" />;
      case 'my-card': return <LazyRenderer pageKey="my-card" />;
      case 'order-detail': return <LazyRenderer pageKey="order-detail" />;
      case 'reservations': return <LazyRenderer pageKey="reservations" onBack={onBackProfile} />;
      case 'events': return <LazyRenderer pageKey="events" onBack={onBackProfile} />;
      case 'checkin': return <LazyRenderer pageKey="checkin" onBack={onBackHome} />;
      default: return <HomePage />;
    }
  }, [page, handleNavClick, user?.display_name, unreadCount, onNotificationClick, onQRScanClick, onBackHome, onBackProfile, pageParams]);

  return (
    <div className="app-container">
      <OfflineBanner />
      {swUpdateAvailable && (
        <motion.div
          initial={{ opacity: 0, y: -40 }}
          animate={{ opacity: 1, y: 0 }}
          className="sw-update-banner"
        >
          <span className="sw-update-text">{t('common.newVersionAvailable')}</span>
          <button
            className="sw-update-btn"
            onClick={async () => {
              const registration = await navigator.serviceWorker?.getRegistration();
              if (registration?.waiting) {
                registration.waiting.postMessage('SKIP_WAITING');
              }
              window.location.reload();
            }}
          >
            {t('common.refresh')}
          </button>
        </motion.div>
      )}
      {page === 'home' && authDone && <PromotionPopup />}

      {/* Guest users skip auth flow entirely */}
      {!isGuest && !authDone ? (
        <AuthFlow onAuthDone={handleAuthDone} />
      ) : (
        <>
          {/* Toast */}
          {toast && <Toast toast={toast} onDismiss={() => useUIStore.getState().hideToast()} />}

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
                  <h3 className="a2hs-modal-title">{t('common.addToHomeScreen')}</h3>
                  <div className="a2hs-app-row">
                    <img
                      src="/icon-192.png"
                      alt="Loka"
                      className="a2hs-app-icon"
                    />
                    <div>
                      <p className="a2hs-app-name">LOKA Espresso</p>
                      <p className="a2hs-app-url">app.loyaltysystem.uk</p>
                    </div>
                  </div>
                  <div className="a2hs-btn-row">
                    <button
                      onClick={a2hs.dismiss}
                      className="a2hs-btn-cancel"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      onClick={a2hs.promptInstall}
                      className="a2hs-btn-add"
                    >
                      {t('common.add')}
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
                {renderPage}
              </motion.div>
            </AnimatePresence>
          </main>

          {/* Store Picker Modal */}
          <AnimatePresence>
            {(showStoreModal || showStorePicker) && (
              <StorePickerModal
                stores={stores}
                selectedStore={selectedStore}
                userLocation={userLocation}
                onSelect={(store) => {
                  setSelectedStore(store);
                  setShowStoreModal(false);
                  setShowStorePicker(false);
                }}
                onClose={() => { setShowStoreModal(false); setShowStorePicker(false); }}
              />
            )}
          </AnimatePresence>

          {/* QR Scanner */}
          <LazyRenderer pageKey="qrScanner"
            isOpen={showQRScanner}
            onClose={() => setShowQRScanner(false)}
            onScan={async (result: string) => {
              setShowQRScanner(false);
              let storeSlug = '';
              let tableId = 0;
              let qrToken = '';
              let articleSlug = '';
              // Try URL-based parse first, JSON parse as fallback
              if (result.startsWith('http')) {
                try {
                  const url = new URL(result);
                  storeSlug = url.searchParams.get('store') || '';
                  tableId = parseInt(url.searchParams.get('table') || '0', 10);
                  qrToken = url.searchParams.get('t') || '';
                  articleSlug = url.searchParams.get('slug') || '';
                } catch {
                  showToast(t('toast.invalidQrFormat'), 'error');
                  return;
                }
              } else if (result.startsWith('loka://')) {
                try {
                  const url = new URL(result.replace('loka://', resolveAppUrl('/')));
                  storeSlug = url.searchParams.get('store') || '';
                  tableId = parseInt(url.searchParams.get('table') || '0', 10);
                  qrToken = url.searchParams.get('t') || '';
                  articleSlug = url.searchParams.get('slug') || '';
                } catch {
                  showToast(t('toast.invalidQrFormat'), 'error');
                  return;
                }
              } else {
                try {
                  const parsed = JSON.parse(result);
                  storeSlug = parsed.store_slug || parsed.storeSlug || '';
                  tableId = parsed.table_id || parsed.tableId || 0;
                  qrToken = parsed.t || parsed.qr_token || '';
                  articleSlug = parsed.slug || '';
                } catch {
                  showToast(t('toast.invalidQrFormat'), 'error');
                  return;
                }
              }
              if (articleSlug) {
                setPage('information', { selectedInfoSlug: articleSlug });
                return;
              }
              if (!storeSlug || !tableId) {
                showToast(t('toast.invalidQrCode'), 'error');
                return;
              }
              try {
                const res = await api.post('/stores/tables/scan', { store_slug: storeSlug, table_id: tableId, qr_token: qrToken });
                const data = res.data;
                const { setOrderMode, setDineInSession, setSelectedStore: setStore } = useUIStore.getState();
                setDineInSession({
                  storeId: data.store_id,
                  storeName: data.store_name,
                  storeSlug: data.store_slug,
                  tableId: data.table_id,
                  tableNumber: data.table_number,
                });
                setOrderMode('dine_in');
                let found = stores.find((s) => s.id === data.store_id);
                if (!found) {
                  const storeRes = await api.get('/stores');
                  const storeData = storeRes.data as StoreType[] | PaginatedResponse<StoreType>;
                  const storeList = Array.isArray(storeData) ? storeData : (storeData?.items ?? []);
                  if (storeList.length > 0) setStores(storeList);
                  found = storeList.find((s) => s.id === data.store_id);
                }
                if (found) setStore(found);
                showToast(t('toast.tableScanned', { table: data.table_number, store: data.store_name }), 'success');
              } catch (err: unknown) {
                const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t('toast.scanTableFailed');
                showToast(msg, 'error');
              }
            }}
          />

          {/* Login Modal — shown when guest triggers sign-in */}
          <LoginModal
            isOpen={showLoginModal}
            onClose={() => setShowLoginModal(false)}
            onAuthDone={handleAuthDone}
          />
        </>
      )}

      <div className="rotate-prompt">
        <div className="rotate-prompt-inner">
          <div className="rotate-prompt-icon"><Smartphone color="#4A4038" size={32} /></div>
          <p className="rotate-prompt-text">{t('common.rotateToPortrait')}</p>
        </div>
      </div>
    </div>
  );
}
