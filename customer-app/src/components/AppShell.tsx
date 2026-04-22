'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home,
  Coffee,
  Crown,
  ShoppingBag,
  Clock,
  QrCode,
  User,
  Bell,
  Store,
  MapPin,
  ChevronDown,
  Check,
  X,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useCartStore } from '@/stores/cartStore';
import { useWalletStore } from '@/stores/walletStore';
import { useConfigStore } from '@/stores/configStore';

import { LOKA } from '@/lib/tokens';
import { normalizePhone } from '@/lib/phone';
import api from '@/lib/api';
import { autoDetectStore, getDistanceToStore, getStoresWithDistance } from '@/lib/geolocation';
import type { PageId, Store as StoreType } from '@/lib/api';
import { SplashScreen } from '@/components/auth/SplashScreen';
import { PhoneInput } from '@/components/auth/PhoneInput';
import { OTPInput } from '@/components/auth/OTPInput';
import { ProfileSetup } from '@/components/auth/ProfileSetup';
import { useVersionCheck } from '@/hooks/useVersionCheck';
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

type AuthStep = 'splash' | 'phone' | 'otp' | 'profile' | 'done';

function StoreModal({ stores, selectedStore, storeSearch, setStoreSearch, onSelect, onClose }: {
  stores: StoreType[];
  selectedStore: StoreType | null;
  storeSearch: string;
  setStoreSearch: (v: string) => void;
  onSelect: (store: StoreType) => void;
  onClose: () => void;
}) {
  const [storesWithDist, setStoresWithDist] = useState<Array<StoreType & { distance?: string; distanceKm?: number }>>([]);

  useEffect(() => {
    const calc = async () => {
      const sorted = await getStoresWithDistance(stores);
      setStoresWithDist(sorted);
    };
    calc();
  }, [stores]);

  const visible = storesWithDist
    .filter((s) => s.id !== 0)
    .filter((s) => {
      if (!storeSearch.trim()) return true;
      const q = storeSearch.trim().toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        (s.address || '').toLowerCase().includes(q)
      );
    });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50"
      onClick={onClose}
      style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,19,23,0.55)', backdropFilter: 'blur(2px)' }} />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative', width: '100%', maxWidth: 430, background: '#FFFFFF',
          borderTopLeftRadius: 28, borderTopRightRadius: 28,
          boxShadow: '0 -20px 50px -12px rgba(15,19,23,0.25)',
          display: 'flex', flexDirection: 'column', maxHeight: '82vh', overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10, paddingBottom: 4 }}>
          <div style={{ width: 44, height: 4, borderRadius: 999, background: LOKA.border }} />
        </div>
        <div style={{ padding: '12px 22px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: LOKA.copper, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              <MapPin size={11} style={{ display: 'inline', marginRight: 4 }} />
              Pickup location
            </div>
            <h3 style={{ fontSize: 22, fontWeight: 800, color: LOKA.textPrimary, marginTop: 2, letterSpacing: '-0.01em' }}>
              Select your Loka
            </h3>
          </div>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onClose}
            aria-label="Close"
            style={{ width: 36, height: 36, borderRadius: 999, background: LOKA.surface, border: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: LOKA.textMuted, cursor: 'pointer' }}
          >
            <X size={18} />
          </motion.button>
        </div>
        <div style={{ padding: '0 22px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 999, background: LOKA.surface, border: `1px solid ${LOKA.borderSubtle}` }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: LOKA.textMuted, flexShrink: 0 }} aria-hidden>
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input type="text" value={storeSearch} onChange={(e) => setStoreSearch(e.target.value)} placeholder="Search by name or area" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 14, color: LOKA.textPrimary }} />
            {storeSearch && (
              <button onClick={() => setStoreSearch('')} aria-label="Clear" style={{ background: 'transparent', border: 'none', padding: 0, color: LOKA.textMuted, cursor: 'pointer', display: 'inline-flex' }}>
                <X size={14} />
              </button>
            )}
          </div>
        </div>
        <div style={{ padding: '0 22px 8px', fontSize: 12, fontWeight: 700, color: LOKA.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          {storeSearch ? `${visible.length} result${visible.length === 1 ? '' : 's'}` : 'Nearest to you'}
        </div>
        <div className="scroll-container" style={{ flex: 1, overflowY: 'auto', padding: '0 14px 24px' }}>
          {visible.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: LOKA.textMuted, fontSize: 14 }}>
              {storeSearch ? `No stores match "${storeSearch}"` : 'No stores available'}
            </div>
          ) : visible.map((store) => {
            const isSelected = selectedStore?.id === store.id;
            return (
              <motion.button
                key={store.id}
                whileTap={{ scale: 0.985 }}
                onClick={() => onSelect(store)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: 14, marginBottom: 8,
                  borderRadius: 18, background: isSelected ? 'rgba(56,75,22,0.06)' : '#FFFFFF',
                  border: `1.5px solid ${isSelected ? LOKA.primary : LOKA.borderSubtle}`,
                  cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.15s ease, background 0.15s ease',
                }}
              >
                <div style={{ width: 42, height: 42, borderRadius: 12, background: isSelected ? LOKA.primary : LOKA.copperSoft, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Store size={18} style={{ color: isSelected ? '#FFFFFF' : LOKA.copper }} strokeWidth={2} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: LOKA.textPrimary, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{store.name}</div>
                  {store.address && <div style={{ fontSize: 12, color: LOKA.textMuted, marginTop: 2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{store.address}</div>}
                  <div style={{ marginTop: 6, display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 11, color: LOKA.textMuted }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#5C8A3E', fontWeight: 600 }}>
                      <span style={{ width: 6, height: 6, borderRadius: 999, background: '#5C8A3E' }} />Open now
                    </span>
                    {store.distance && <span style={{ fontWeight: 600, color: LOKA.copper }}>· {store.distance}</span>}
                    {store.pickup_lead_minutes != null && <span>· Pickup in ~{store.pickup_lead_minutes} min</span>}
                  </div>
                </div>
                {isSelected && (
                  <div style={{ width: 28, height: 28, borderRadius: 999, background: LOKA.primary, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Check size={15} color="#FFFFFF" strokeWidth={3} />
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>
      </motion.div>
    </motion.div>
  );
}

const pageTransition = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
  transition: { duration: 0.25, ease: 'easeOut' as const },
};

// Bottom nav from HTML: Home / Menu / Rewards / Cart / Orders
const navItems: { id: PageId; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'menu', label: 'Menu', icon: Coffee },
  { id: 'rewards', label: 'Rewards', icon: Crown },
  { id: 'cart', label: 'Cart', icon: ShoppingBag },
  { id: 'orders', label: 'Orders', icon: Clock },
];

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

export default function AppShell() {
  const { token, user, isAuthenticated, isNewUser, phone, setToken, setRefreshToken, setUser, setIsNewUser, setPhone, logout } = useAuthStore();
  const { page, selectedStore, stores, toast, pageParams, setPage, setSelectedStore, setStores, showToast, hideToast, setIsLoading, showStorePicker, setShowStorePicker } = useUIStore();
  const getItemCount = useCartStore((s) => s.getItemCount);
  const { setBalance, setPoints, setTier, refreshWallet } = useWalletStore();
  const { loadConfig } = useConfigStore();

  const [authStep, setAuthStep] = useState<AuthStep>('splash');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showStoreModal, setShowStoreModal] = useState(false);
  const [storeSearch, setStoreSearch] = useState('');
  const [loadingAuth, setLoadingAuth] = useState(false);
  const [otpSessionId, setOtpSessionId] = useState<string | null>(null);
  const [otpRetryAfter, setOtpRetryAfter] = useState(60);
  const [storeDistances, setStoreDistances] = useState<Record<number, string>>({});
  const [selectedStoreDistance, setSelectedStoreDistance] = useState<string>('');
  const [showQRScanner, setShowQRScanner] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cartCount = getItemCount();

  const getApiErrorMessage = useCallback((error: unknown, fallback: string) => {
    const detail = (error as { response?: { data?: { detail?: unknown; message?: string } } })?.response?.data?.detail;
    if (typeof detail === 'string' && detail.trim()) return detail;
    const message = (error as { response?: { data?: { message?: string } } })?.response?.data?.message;
    if (typeof message === 'string' && message.trim()) return message;
    return fallback;
  }, []);

  // Calculate distances when stores or selectedStore changes
  useEffect(() => {
    const calcDistances = async () => {
      if (selectedStore && selectedStore.lat != null && selectedStore.lng != null) {
        const dist = await getDistanceToStore(selectedStore);
        setSelectedStoreDistance(dist || '');
      }
    };
    calcDistances();
  }, [selectedStore]);

  // Load stores when store modal opens (for guests or if not loaded yet)
  useEffect(() => {
    if (showStoreModal && stores.length === 0) {
      api.get('/stores')
        .then((res) => setStores(res.data))
        .catch(() => showToast('Failed to load stores', 'error'));
    }
  }, [showStoreModal, stores.length, setStores, showToast]);

  // Version checking for updates
  useVersionCheck();

  // Toast auto-hide
  useEffect(() => {
    if (toast) {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => hideToast(), 3000);
    }
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
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
          // Auto-detect nearest store via IP geolocation
          const detected = await autoDetectStore(list);
          setSelectedStore(detected); // null → shows "Select Store"
        }
      }
      refreshWallet();
      loadConfig();
    } catch {
      showToast('Failed to load app data', 'error');
    }
  }, [setUser, setPoints, setTier, setBalance, setStores, setSelectedStore, selectedStore, showToast, refreshWallet]);

  useEffect(() => {
    if (isAuthenticated && token && authStep === 'done') loadAppData();
  }, [isAuthenticated, token, authStep, loadAppData]);

  // Validate token on mount
  useEffect(() => {
    if (!token) { setAuthStep('splash'); return; }
    const abortCtrl = new AbortController();
    const validate = async () => {
      setIsLoading(true);
      try {
        const res = await api.get('/users/me', { signal: abortCtrl.signal });
        setUser(res.data);
        setAuthStep('done');
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        logout();
        setAuthStep('splash');
      } finally {
        setIsLoading(false);
      }
    };
    validate();
    return () => abortCtrl.abort();
  }, [logout, setIsLoading, setUser, token]);

  // Auth handlers
  const handleSplashFinish = useCallback(() => {
    if (token && isAuthenticated) setAuthStep('done');
    else setAuthStep('phone');
  }, [token, isAuthenticated]);

  const handlePhoneSubmit = useCallback(async (phoneValue: string) => {
    setLoadingAuth(true);
    try {
      const normalized = normalizePhone(phoneValue);
      const res = await api.post('/auth/send-otp', { phone: normalized });
      const nextPhone = res.data?.phone || normalized;
      setPhoneNumber(nextPhone);
      setPhone(nextPhone);
      setOtpSessionId(res.data?.session_id ?? null);
      setOtpRetryAfter(Number(res.data?.retry_after_seconds ?? 60));
      setAuthStep('otp');
    } catch (error) {
      showToast(getApiErrorMessage(error, 'Failed to send OTP. Please try again.'), 'error');
    } finally {
      setLoadingAuth(false);
    }
  }, [getApiErrorMessage, setPhone, showToast]);

  const handleOTPSubmit = useCallback(async (code: string) => {
    setLoadingAuth(true);
    try {
      const res = await api.post('/auth/verify-otp', { phone: phoneNumber, code, session_id: otpSessionId });
      const { access_token, refresh_token, is_new_user } = res.data;
      setToken(access_token);
      setRefreshToken(refresh_token ?? null);
      if (is_new_user) { setIsNewUser(true); setAuthStep('profile'); }
      else { setIsNewUser(false); setAuthStep('done'); }
    } catch (error) {
      const message = getApiErrorMessage(error, 'Invalid OTP. Please try again.');
      showToast(message, 'error');
      throw new Error(message);
    } finally {
      setLoadingAuth(false);
    }
  }, [getApiErrorMessage, otpSessionId, phoneNumber, setIsNewUser, setRefreshToken, setToken, showToast]);

  const handleResendOTP = useCallback(async () => {
    try {
      const res = await api.post('/auth/send-otp', { phone: phoneNumber });
      setOtpSessionId(res.data?.session_id ?? otpSessionId);
      setOtpRetryAfter(Number(res.data?.retry_after_seconds ?? 60));
      showToast('OTP resent successfully', 'success');
    } catch (error) {
      const message = getApiErrorMessage(error, 'Failed to resend OTP');
      showToast(message, 'error');
      throw new Error(message);
    }
  }, [getApiErrorMessage, otpSessionId, phoneNumber, showToast]);

  const handleProfileSubmit = useCallback(async (data: { name: string; email?: string }) => {
    setLoadingAuth(true);
    try {
      await api.post('/auth/register', { name: data.name, email: data.email }, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setIsNewUser(false);
      setAuthStep('done');
      showToast('Welcome to Loka Espresso!', 'success');
    } catch {
      showToast('Failed to save profile. Please try again.', 'error');
    } finally {
      setLoadingAuth(false);
    }
  }, [token, setIsNewUser, showToast]);

  const handleProfileSkip = useCallback(() => {
    setIsNewUser(false);
    setAuthStep('done');
  }, [setIsNewUser]);

  // Render auth flow (white bg, not green)
  const renderAuthFlow = () => {
    if (authStep === 'splash') return <SplashScreen onFinish={handleSplashFinish} />;

    return (
      <div className="flex-1 flex flex-col bg-white h-full">
        <div className="flex-1 overflow-y-auto scroll-container">
          <AnimatePresence mode="wait">
            {authStep === 'phone' && (
              <motion.div key="phone" {...pageTransition} className="h-full bg-white text-[#1B2023]">
                <PhoneInput onSubmit={handlePhoneSubmit} />
              </motion.div>
            )}
            {authStep === 'otp' && (
              <motion.div key="otp" {...pageTransition} className="h-full bg-white text-[#1B2023]">
                <OTPInput
                  phone={phoneNumber}
                  onSubmit={handleOTPSubmit}
                  onResend={handleResendOTP}
                  initialRetryAfterSeconds={otpRetryAfter}
                  onBack={() => setAuthStep('phone')}
                />
              </motion.div>
            )}
            {authStep === 'profile' && (
              <motion.div key="profile" {...pageTransition} className="h-full bg-white text-[#1B2023]">
                <ProfileSetup
                  phone={phoneNumber}
                  onSubmit={handleProfileSubmit}
                  onSkip={handleProfileSkip}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Loading overlay */}
        <AnimatePresence>
          {loadingAuth && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50"
            >
              <div className="bg-white rounded-2xl px-8 py-6 shadow-xl">
                <div className="w-8 h-8 border-3 border-[#384B16] border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm text-[#6A7A8A] mt-3">Please wait...</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  // Page routing
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

  const handleNavClick = (id: PageId) => {
    if (id === page) return;
    setPage(id);
  };

  // Active nav mapping
  const getActiveNavId = (): PageId => {
    if (page === 'checkout') return 'cart';
    if (page === 'order-detail') return 'orders';
    if (page === 'wallet' || page === 'history') return 'home';
    if (page === 'profile') return 'home';
    if (page === 'promotions' || page === 'information') return 'home';
    if (page === 'my-rewards' || page === 'account-details' || page === 'payment-methods' || page === 'saved-addresses' || page === 'notifications' || page === 'help-support') return 'home';
    return page;
  };

  const firstName = user?.name?.split(' ')[0] || 'Guest';

  // Dashboard header (only for main pages, not sub-pages)
  const showDashboardHeader = ['home'].includes(page);

  const toastColorMap = {
    success: 'bg-[#85B085]',
    error: 'bg-[#C75050]',
    info: 'bg-[#4A607A]',
  };

  // Main app render
  const renderMainApp = () => (
    <>
      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -60 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -60 }}
            className={`absolute top-0 left-0 right-0 z-50 px-4 pt-3 pb-3 safe-area-top ${toastColorMap[toast.type]}`}
            role="status"
            aria-live={toast.type === 'error' ? 'assertive' : 'polite'}
            aria-atomic="true"
          >
            <div className="flex items-center justify-between text-white pt-2">
              <span className="text-sm font-medium flex-1">{toast.message}</span>
              <button onClick={hideToast} className="ml-3 p-1 rounded-full hover:bg-white/20 touch-target">
                <X size={18} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Dashboard Top Bar (only on home) */}
      {showDashboardHeader && (
        <div
          style={{
            background: '#FFFFFF',
            padding: '16px 16px 14px',
            borderBottom: `1px solid ${LOKA.border}`,
          }}
        >
          {/* Top row – greeting + actions */}
          <div className="flex items-start justify-between" style={{ gap: 12 }}>
            <div className="flex-1 min-w-0">
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: LOKA.textMuted,
                  marginBottom: 4,
                }}
              >
                {getGreeting()}
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: LOKA.copper,
                  letterSpacing: '-0.01em',
                  lineHeight: 1.15,
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {user?.name || 'Guest'}
              </div>
              <div
                className="flex items-center"
                style={{ gap: 8, marginTop: 6, flexWrap: 'wrap' }}
              >
                {/* Tier badge */}
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '3px 8px',
                    borderRadius: 999,
                    background: LOKA.copperSoft,
                    color: LOKA.copper,
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    border: '1px solid rgba(209,142,56,0.25)',
                  }}
                >
                  <Crown size={11} strokeWidth={2.5} />
                  {(useWalletStore.getState().tier || 'Bronze').toUpperCase()}
                </span>
                <button
                  onClick={() => setShowStoreModal(true)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontSize: 12,
                    color: LOKA.textMuted,
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                  }}
                >
                  <MapPin size={11} style={{ color: LOKA.copper }} />
                  <span
                    style={{
                      maxWidth: 140,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {selectedStore?.name || 'Select store'}
                    {selectedStoreDistance && (
                      <span style={{ marginLeft: 4, opacity: 0.7 }}>· {selectedStoreDistance}</span>
                    )}
                  </span>
                  <ChevronDown size={10} />
                </button>
              </div>
            </div>

            {/* Action icons – 2x2 grid matching the mockup.
                QR Scanner is highlighted as the primary dine-in action. */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 40px)',
                gridTemplateRows: 'repeat(2, 40px)',
                gap: 8,
                flexShrink: 0,
              }}
            >
              {[
                {
                  icon: QrCode,
                  label: 'Scan table QR',
                  primary: true,
                  onClick: () => setShowQRScanner(true),
                },
                {
                  icon: Bell,
                  label: 'Notifications',
                  onClick: () => showToast('No new notifications', 'info'),
                },
                {
                  icon: Store,
                  label: 'Switch store',
                  onClick: () => setShowStoreModal(true),
                },
                {
                  icon: User,
                  label: 'Profile',
                  onClick: () => setPage('profile'),
                },
              ].map(({ icon: Icon, label, primary, onClick }) => (
                <motion.button
                  key={label}
                  whileTap={{ scale: 0.92 }}
                  onClick={onClick}
                  aria-label={label}
                  title={label}
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 12,
                    background: primary ? LOKA.copperSoft : LOKA.surface,
                    border: primary
                      ? '1px solid rgba(209,142,56,0.30)'
                      : 'none',
                    color: primary ? LOKA.copper : LOKA.textPrimary,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon size={17} strokeWidth={primary ? 2.2 : 1.8} />
                </motion.button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto scroll-container" style={{ background: '#E4EAEF' }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={page}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {renderPage()}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom Navigation */}
      <nav
        className="safe-area-bottom"
        style={{
          background: '#FFFFFF',
          borderTop: `1px solid ${LOKA.border}`,
          boxShadow: '0 -4px 16px rgba(15,19,23,0.04)',
        }}
      >
        <div
          className="flex items-stretch justify-around"
          style={{ padding: '8px 8px 16px' }}
        >
          {navItems.map(({ id, label, icon: Icon }) => {
            const activeNavId = getActiveNavId();
            const isActive = id === activeNavId;
            return (
              <motion.button
                key={id}
                onClick={() => handleNavClick(id)}
                whileTap={{ scale: 0.92 }}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 4,
                  padding: '6px 4px',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: isActive ? LOKA.primary : '#8A9AAA',
                  position: 'relative',
                }}
                aria-label={label}
                aria-current={isActive ? 'page' : undefined}
              >
                <div
                  style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 44,
                    height: 28,
                    borderRadius: 14,
                    background: isActive ? LOKA.copperSoft : 'transparent',
                    transition: 'background 0.2s ease',
                  }}
                >
                  <Icon
                    size={20}
                    strokeWidth={isActive ? 2.4 : 1.8}
                    style={{ color: isActive ? LOKA.primary : '#8A9AAA' }}
                  />
                  {id === 'cart' && cartCount > 0 && (
                    <span
                      style={{
                        position: 'absolute',
                        top: -2,
                        right: 2,
                        minWidth: 16,
                        height: 16,
                        background: '#C75050',
                        color: '#FFFFFF',
                        fontSize: 10,
                        fontWeight: 700,
                        borderRadius: 999,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '0 4px',
                        border: '2px solid #FFFFFF',
                      }}
                    >
                      {cartCount > 99 ? '99+' : cartCount}
                    </span>
                  )}
                </div>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: isActive ? 700 : 500,
                    letterSpacing: '0.01em',
                  }}
                >
                  {label}
                </span>
              </motion.button>
            );
          })}
        </div>
      </nav>

      {/* Store Selector Bottom Sheet – premium redesign */}
      <AnimatePresence>
        {(showStoreModal || showStorePicker) && (
            <StoreModal
              stores={stores}
              selectedStore={selectedStore}
              storeSearch={storeSearch}
              setStoreSearch={setStoreSearch}
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

      {/* QR Scanner Modal */}
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
  );

  return (
    <div className="app-container">
      {authStep === 'done' ? renderMainApp() : renderAuthFlow()}
      <div className="rotate-prompt">
        <div className="rotate-prompt-inner">
          <div className="rotate-prompt-icon">📱</div>
          <p className="rotate-prompt-text">Please rotate your device to portrait</p>
        </div>
      </div>
    </div>
  );
}
