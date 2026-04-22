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
import type { PageId, Store as StoreType } from '@/lib/api';
import { useVersionCheck } from '@/hooks/useVersionCheck';
import OfflineBanner from '@/components/OfflineBanner';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useA2HS } from '@/hooks/useA2HS';
import EmergencyPopup from '@/components/EmergencyPopup';
import StorePickerModal from '@/components/StorePickerModal';
import BottomNav from '@/components/BottomNav';
import DashboardHeader from '@/components/DashboardHeader';
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

// Pages that don't show bottom nav or dashboard header
const SUB_PAGES: PageId[] = [
  'checkout', 'order-detail', 'wallet', 'history', 'profile',
  'promotions', 'information', 'my-rewards', 'account-details',
  'payment-methods', 'saved-addresses', 'notifications', 'help-support',
];

export default function AppShell() {
  const { token, user, isAuthenticated, setUser, logout } = useAuthStore();
  const {
    page, selectedStore, stores, toast, pageParams,
    setPage, setSelectedStore, setStores, showToast, hideToast,
    setIsLoading, showStorePicker, setShowStorePicker,
  } = useUIStore();
  const { setBalance, setPoints, setTier, refreshWallet } = useWalletStore();
  const { loadConfig } = useConfigStore();
  const reducedMotion = useReducedMotion();
  const a2hs = useA2HS();

  const [authDone, setAuthDone] = useState(false);
  const [showStoreModal, setShowStoreModal] = useState(false);
  const [storeSearch, setStoreSearch] = useState('');
  const [selectedStoreDistance, setSelectedStoreDistance] = useState('');
  const [showQRScanner, setShowQRScanner] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hash-based routing: listen for back/forward browser navigation
  useEffect(() => {
    const handler = () => {
      const hash = window.location.hash.replace('#', '') as PageId;
      const valid: PageId[] = [
        'home', 'menu', 'rewards', 'cart', 'orders', 'checkout', 'profile',
        'wallet', 'history', 'promotions', 'information', 'my-rewards',
        'account-details', 'payment-methods', 'saved-addresses', 'notifications', 'help-support',
      ];
      if (valid.includes(hash)) {
        setPage(hash);
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
    } catch {
      showToast('Failed to load app data', 'error');
    }
  }, [setUser, setPoints, setTier, setBalance, setStores, setSelectedStore, selectedStore, showToast, refreshWallet, loadConfig]);

  useEffect(() => {
    if (isAuthenticated && token && authDone) loadAppData();
  }, [isAuthenticated, token, authDone, loadAppData]);

  // Validate token on mount
  useEffect(() => {
    if (!token) return;
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
  }, [logout, setIsLoading, setUser, token]);

  const handleAuthDone = useCallback(() => {
    setAuthDone(true);
  }, []);

  const handleNavClick = (id: PageId) => {
    if (id === page) return;
    setPage(id);
  };

  const renderPage = () => {
    switch (page) {
      case 'home': return <HomePage />;
      case 'menu': return <MenuPage />;
      case 'rewards': return <RewardsPage />;
      case 'cart': return <CartPage />;
      case 'checkout': return <CheckoutPage />;
      case 'orders': return <OrdersPage />;
      case 'order-detail': return <OrdersPage />;
      case 'profile': return <ProfilePage />;
      case 'wallet': return <WalletPage />;
      case 'history': return <HistoryPage />;
      case 'promotions': return <PromotionsPage onBack={() => setPage('home')} preselectedId={pageParams.selectedPromoId as number | undefined} />;
      case 'information': return <InformationPage onBack={() => setPage('home')} preselectedId={pageParams.selectedInfoId as number | undefined} />;
      case 'my-rewards': return <MyRewardsPage onBack={() => setPage('profile')} initialTab={pageParams.initialTab as 'rewards' | 'vouchers' | undefined} />;
      case 'account-details': return <AccountDetailsPage />;
      case 'payment-methods': return <PaymentMethodsPage />;
      case 'saved-addresses': return <SavedAddressesPage />;
      case 'notifications': return <NotificationsPage />;
      case 'help-support': return <HelpSupportPage />;
      default: return <HomePage />;
    }
  };

  const toastColorMap = {
    success: 'bg-[#85B085]',
    error: 'bg-[#C75050]',
    info: 'bg-[#4A607A]',
  };

  const isSubPage = SUB_PAGES.includes(page);

  return (
    <div className="app-container">
      <OfflineBanner />
      <EmergencyPopup />

      {!authDone ? (
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

          {/* A2HS Banner */}
          {a2hs.canInstall && (
            <motion.div
              initial={{ opacity: 0, y: -40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -40 }}
              transition={reducedMotion ? { duration: 0 } : { duration: 0.3 }}
              className="absolute top-0 left-0 right-0 z-[55] px-4 pt-3 pb-3 safe-area-top bg-[#384B16]"
            >
              <div className="flex items-center justify-between text-white pt-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="text-lg">📲</span>
                  <span className="text-sm font-medium truncate">Add Loka to your home screen for quick access</span>
                </div>
                <div className="flex items-center gap-2 ml-3 shrink-0">
                  <button onClick={a2hs.promptInstall} className="px-3 py-1.5 rounded-lg bg-white text-[#384B16] text-xs font-bold">Install</button>
                  <button onClick={a2hs.dismiss} className="p-1 rounded-full hover:bg-white/20" aria-label="Dismiss">✕</button>
                </div>
              </div>
            </motion.div>
          )}

          {/* Dashboard Header (only on home) */}
          {page === 'home' && (
            <DashboardHeader
              userName={user?.name}
              selectedStore={selectedStore}
              selectedStoreDistance={selectedStoreDistance}
              onShowStoreModal={() => setShowStoreModal(true)}
              onShowQRScanner={() => setShowQRScanner(true)}
              onShowNotifications={() => showToast('No new notifications', 'info')}
              onShowProfile={() => setPage('profile')}
            />
          )}

          {/* Main Content */}
          <main className="flex-1 overflow-y-auto scroll-container" style={{ background: '#E4EAEF' }}>
            <AnimatePresence mode="wait">
              <motion.div
                key={page}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={reducedMotion ? { duration: 0 } : { duration: 0.2 }}
              >
                {renderPage()}
              </motion.div>
            </AnimatePresence>
          </main>

          {/* Bottom Nav (hidden on sub-pages) */}
          {!isSubPage && <BottomNav page={page} onNavigate={handleNavClick} />}

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
              try {
                if (result.startsWith('http')) {
                  const url = new URL(result);
                  storeSlug = url.searchParams.get('store') || '';
                  tableId = parseInt(url.searchParams.get('table') || '0', 10);
                  qrToken = url.searchParams.get('t') || '';
                } else if (result.startsWith('loka://')) {
                  const url = new URL(result.replace('loka://', 'https://loka.app/'));
                  storeSlug = url.searchParams.get('store') || '';
                  tableId = parseInt(url.searchParams.get('table') || '0', 10);
                  qrToken = url.searchParams.get('t') || '';
                } else {
                  const parsed = JSON.parse(result);
                  storeSlug = parsed.store_slug || parsed.storeSlug || '';
                  tableId = parsed.table_id || parsed.tableId || 0;
                  qrToken = parsed.t || parsed.qr_token || '';
                }
              } catch {
                showToast('Invalid QR code format', 'error');
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
