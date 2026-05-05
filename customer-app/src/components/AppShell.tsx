'use client';

import { useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';

import api from '@/lib/api';
import type { Store as StoreType } from '@/lib/api';
import { useVersionCheck } from '@/hooks/useVersionCheck';
import { useAuthFlow } from '@/hooks/useAuthFlow';
import { usePageRouter, SUB_PAGES } from '@/hooks/usePageRouter';
import { useNotifications } from '@/hooks/useNotifications';
import { resolveAppUrl } from '@/lib/tokens';
import { getBrowserLocation } from '@/lib/geolocation';
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
const ReferralPage = dynamic(() => import('./profile/ReferralPage'), { ssr: false });
const MyCardPage = dynamic(() => import('./MyCardPage'), { ssr: false });
const OrderDetailPage = dynamic(() => import('./OrderDetailPage'), { ssr: false });

export default function AppShell() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const {
    page, selectedStore, stores, toast, pageParams, isGuest, requestSignIn,
    setPage, setSelectedStore, setStores, showToast,
    showStorePicker, setShowStorePicker, triggerSignIn, userLocation, setUserLocation,
  } = useUIStore();
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

  // Scroll to top on page change
  useEffect(() => {
    const main = document.querySelector('main.scroll-container');
    if (main) main.scrollTo({ top: 0, behavior: 'auto' });
  }, [page]);

  // Load stores when modal opens
  useEffect(() => {
    if ((showStoreModal || showStorePicker) && stores.length === 0) {
      api.get('/content/stores')
        .then((res) => setStores(res.data))
        .catch(() => showToast(t('toast.storesLoadFailed'), 'error'));
    }
  }, [showStoreModal, showStorePicker, stores.length, setStores, showToast]);

  // Prefetch user location at startup for instant distance display
  useEffect(() => {
    getBrowserLocation().then((loc) => {
      if (loc) setUserLocation(loc);
    });
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

  const renderPage = () => {
    switch (page) {
      case 'home': return (
          <HubLayout
          page={page}
          onNavigate={handleNavClick}
          header={
            <HomeHeader
              userName={user?.name}
              unreadNotifications={unreadCount}
              onNotificationClick={() => isGuest ? triggerSignIn() : setPage('notifications')}
              onQRScanClick={() => setShowQRScanner(true)}
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
          <RewardsPage />
        </HubLayout>
      );
      case 'orders': return (
        <HubLayout page={page} onNavigate={handleNavClick}>
          <OrdersPage />
        </HubLayout>
      );
      case 'profile': return (
        <HubLayout page={page} onNavigate={handleNavClick}>
          <ProfilePage />
        </HubLayout>
      );
      case 'cart': return <CartPage />;
      case 'checkout': return <CheckoutPage />;
      case 'wallet': return <WalletPage />;
      case 'history': return <HistoryPage />;
      case 'promotions': return (
        <HubLayout page={page} onNavigate={handleNavClick}>
          <PromotionsPage onBack={() => setPage('home')} preselectedId={pageParams.selectedPromoId as number | undefined} />
        </HubLayout>
      );
      case 'information': return <InformationPage onBack={() => setPage('home')} preselectedId={pageParams.selectedInfoId as number | undefined} preselectedSlug={pageParams.selectedInfoSlug as string | undefined} contentType={pageParams.selectedInfoContentType as string | undefined} />;
      case 'my-rewards': return <MyRewardsPage onBack={() => setPage('profile')} initialTab={pageParams.initialTab as 'rewards' | 'vouchers' | undefined} />;
      case 'account-details': return <AccountDetailsPage />;
      case 'payment-methods': return <PaymentMethodsPage />;
      case 'saved-addresses': return <SavedAddressesPage />;
      case 'notifications': return <NotificationsPage />;
      case 'help-support': return <HelpSupportPage />;
      case 'legal': return <LegalPage />;
      case 'settings': return <SettingsPage />;
      case 'referral': return <ReferralPage />;
      case 'my-card': return <MyCardPage />;
      case 'order-detail': return <OrderDetailPage />;
      default: return <HomePage />;
    }
  };

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
            onClick={() => {
              if (navigator.serviceWorker?.controller) {
                navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
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
                      <p className="a2hs-app-name">Loka Espresso</p>
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
                showToast(t('toast.invalidQrFormat'), 'error');
                return;
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
                const res = await api.post('/tables/scan', { store_slug: storeSlug, table_id: tableId, qr_token: qrToken });
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
                const storeRes = await api.get('/content/stores');
                const storeList: StoreType[] = storeRes.data;
                const found = storeList.find((s) => s.id === data.store_id);
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
