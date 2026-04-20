'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home,
  Coffee,
  Crown,
  ShoppingBag,
  User,
  Bell,
  QrCode,
  ChevronDown,
  MapPin,
  Check,
  X,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { useCartStore } from '@/stores/cartStore';
import { useWalletStore } from '@/stores/walletStore';
import api from '@/lib/api';
import type { PageId, Store } from '@/lib/api';
import { SplashScreen } from '@/components/auth/SplashScreen';
import { PhoneInput } from '@/components/auth/PhoneInput';
import { OTPInput } from '@/components/auth/OTPInput';
import { ProfileSetup } from '@/components/auth/ProfileSetup';
import HomePage from './HomePage';
import MenuPage from './MenuPage';
import RewardsPage from './RewardsPage';
import CartPage from './CartPage';
import OrdersPage from './OrdersPage';
import ProfilePage from './ProfilePage';
import HistoryPage from './HistoryPage';

type AuthStep = 'splash' | 'phone' | 'otp' | 'profile' | 'done';

const pageTransition = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
  transition: { duration: 0.25, ease: 'easeOut' as const },
};

const navItems: { id: PageId; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'menu', label: 'Menu', icon: Coffee },
  { id: 'rewards', label: 'Rewards', icon: Crown },
  { id: 'cart', label: 'Cart', icon: ShoppingBag },
  { id: 'profile', label: 'Profile', icon: User },
];

export default function AppShell() {
  const { token, user, isAuthenticated, isNewUser, phone, setToken, setUser, setIsNewUser, setPhone, logout } = useAuthStore();
  const { page, selectedStore, stores, toast, setPage, setSelectedStore, setStores, showToast, hideToast, setIsLoading } = useUIStore();
  const getItemCount = useCartStore((s) => s.getItemCount);
  const { setBalance, setPoints, setTier } = useWalletStore();

  const [authStep, setAuthStep] = useState<AuthStep>('splash');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showStoreModal, setShowStoreModal] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cartCount = getItemCount();

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

      if (profileRes.status === 'fulfilled') {
        setUser(profileRes.value.data);
      }

      if (loyaltyRes.status === 'fulfilled') {
        const d = loyaltyRes.value.data;
        if (d?.points_balance != null) setPoints(d.points_balance);
        if (d?.tier) setTier(d.tier);
      }

      if (walletRes.status === 'fulfilled') {
        const d = walletRes.value.data;
        if (d?.balance != null) setBalance(d.balance);
      }

      if (storesRes.status === 'fulfilled') {
        const list: Store[] = storesRes.value.data;
        setStores(list);
        if (!selectedStore && list.length > 0) {
          setSelectedStore(list[0]);
        }
      }
    } catch {
      showToast('Failed to load app data', 'error');
    }
  }, [setUser, setPoints, setTier, setBalance, setStores, setSelectedStore, selectedStore, showToast]);

  useEffect(() => {
    if (isAuthenticated && token && authStep === 'done') {
      loadAppData();
    }
  }, [isAuthenticated, token, authStep, loadAppData]);

  // Validate token on mount
  useEffect(() => {
    if (!token) {
      setAuthStep('splash');
      return;
    }

    const validate = async () => {
      setIsLoading(true);
      try {
        const res = await api.get('/users/me');
        setUser(res.data);
        setAuthStep('done');
      } catch {
        logout();
        setAuthStep('splash');
      } finally {
        setIsLoading(false);
      }
    };

    validate();
  }, [logout, setIsLoading, setUser, token]);

  // Auth handlers
  const handleSplashFinish = useCallback(() => {
    if (token && isAuthenticated) {
      setAuthStep('done');
    } else {
      setAuthStep('phone');
    }
  }, [token, isAuthenticated]);

  const normalizePhone = (raw: string): string => {
    const digits = raw.replace(/[^0-9]/g, '');
    if (raw.startsWith('+')) {
      if (digits.startsWith('60')) return '+' + digits;
      if (digits.startsWith('01')) return '+6' + digits;
      return '+' + digits;
    }
    if (digits.startsWith('60')) return '+' + digits;
    if (digits.startsWith('01')) return '+6' + digits;
    if (digits.startsWith('1')) return '+60' + digits;
    return '+60' + digits;
  };

  const handlePhoneSubmit = useCallback(async (phoneValue: string) => {
    setLoadingAuth(true);
    try {
      const normalized = normalizePhone(phoneValue);
      await api.post('/auth/send-otp', { phone: normalized });
      setPhoneNumber(normalized);
      setPhone(normalized);
      setAuthStep('otp');
    } catch {
      showToast('Failed to send OTP. Please try again.', 'error');
    } finally {
      setLoadingAuth(false);
    }
  }, [setPhone, showToast]);

  const handleOTPSubmit = useCallback(async (code: string) => {
    setLoadingAuth(true);
    try {
      const res = await api.post('/auth/verify-otp', { phone: phoneNumber, code });
      const { access_token, is_new_user } = res.data;
      setToken(access_token);
      if (is_new_user) {
        setIsNewUser(true);
        setAuthStep('profile');
      } else {
        setIsNewUser(false);
        setAuthStep('done');
      }
    } catch {
      showToast('Invalid OTP. Please try again.', 'error');
    } finally {
      setLoadingAuth(false);
    }
  }, [phoneNumber, setToken, setIsNewUser, showToast]);

  const handleResendOTP = useCallback(async () => {
    try {
      await api.post('/auth/send-otp', { phone: phoneNumber });
      showToast('OTP resent successfully', 'success');
    } catch {
      showToast('Failed to resend OTP', 'error');
    }
  }, [phoneNumber, showToast]);

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

  // Render auth flow
  const renderAuthFlow = () => {
    if (authStep === 'splash') {
      return <SplashScreen onFinish={handleSplashFinish} />;
    }

    return (
      <div className="flex-1 flex flex-col bg-primary">
        <div className="flex-1 overflow-y-auto scroll-container">
          <div className="min-h-full flex items-center justify-center px-6 py-8">
            <AnimatePresence mode="wait">
              {authStep === 'phone' && (
                <motion.div key="phone" {...pageTransition} className="w-full max-w-sm">
                  <PhoneInput onSubmit={handlePhoneSubmit} />
                </motion.div>
              )}
              {authStep === 'otp' && (
                <motion.div key="otp" {...pageTransition} className="w-full max-w-sm">
                  <OTPInput
                    phone={phoneNumber}
                    onSubmit={handleOTPSubmit}
                    onResend={handleResendOTP}
                    onBack={() => setAuthStep('phone')}
                  />
                </motion.div>
              )}
              {authStep === 'profile' && (
                <motion.div key="profile" {...pageTransition} className="w-full max-w-sm">
                  <ProfileSetup
                    phone={phoneNumber}
                    onSubmit={handleProfileSubmit}
                    onSkip={handleProfileSkip}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
        
        {/* Loading overlay */}
        <AnimatePresence>
          {loadingAuth && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50"
            >
              <div className="bg-white rounded-2xl px-8 py-6 shadow-xl">
                <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm text-gray-600 mt-3">Please wait...</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  // Render main app
  const handleNavClick = (id: PageId) => {
    if (id === page) return;
    setPage(id);
  };

  const renderPage = () => {
    switch (page) {
      case 'home':
        return <HomePage />;
      case 'menu':
        return <MenuPage />;
      case 'rewards':
        return <RewardsPage />;
      case 'cart':
        return <CartPage />;
      case 'checkout':
        return <CartPage />;
      case 'orders':
        return <OrdersPage />;
      case 'order-detail':
        return <OrdersPage />;
      case 'profile':
        return <ProfilePage />;
      case 'wallet':
        return <ProfilePage />;
      case 'history':
        return <HistoryPage />;
      default:
        return <HomePage />;
    }
  };

  const toastColorMap = {
    success: 'bg-success',
    error: 'bg-danger',
    info: 'bg-info',
  };

  // Main app render
  const renderMainApp = () => (
    <>
      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -60 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -60 }}
            className={`absolute top-0 left-0 right-0 z-50 px-4 pt-safe-top pb-3 ${toastColorMap[toast.type]}`}
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

      {/* Header */}
      <header className="sticky top-0 z-40 bg-primary text-white safe-area-top">
        <div className="flex items-center justify-between px-4 py-3">
          <button
            onClick={() => setShowStoreModal(true)}
            className="flex items-center gap-2 bg-white/15 rounded-full px-3 py-1.5 max-w-[180px] touch-target"
          >
            <MapPin size={14} className="shrink-0" />
            <span className="text-xs font-medium truncate">
              {selectedStore?.name || 'Select store'}
            </span>
            <ChevronDown size={14} className="shrink-0" />
          </button>

          <div className="flex items-center gap-2">
            <button className="p-2 rounded-full hover:bg-white/10 transition-colors touch-target">
              <QrCode size={20} />
            </button>
            <button className="p-2 rounded-full hover:bg-white/10 transition-colors relative touch-target">
              <Bell size={20} />
              <span className="absolute top-1 right-1 w-2 h-2 bg-danger rounded-full" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto scroll-container">
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
      <nav className="sticky bottom-0 z-40 bg-white border-t border-gray-200 safe-area-bottom shadow-nav">
        <div className="flex items-center justify-around h-16 px-2">
          {navItems.map(({ id, label, icon: Icon }) => {
            const isActive = page === id || (id === 'home' && page === 'order-detail') || (id === 'cart' && page === 'checkout');
            return (
              <button
                key={id}
                onClick={() => handleNavClick(id)}
                className={`flex flex-col items-center justify-center gap-0.5 w-16 h-full transition-colors relative touch-target ${
                  isActive ? 'text-primary' : 'text-gray-400'
                }`}
              >
                <div className="relative">
                  <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
                  {id === 'cart' && cartCount > 0 && (
                    <span className="absolute -top-2 -right-3 min-w-[18px] h-[18px] bg-danger text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                      {cartCount > 99 ? '99+' : cartCount}
                    </span>
                  )}
                </div>
                <span className={`text-[10px] ${isActive ? 'font-semibold' : 'font-medium'}`}>
                  {label}
                </span>
                {isActive && (
                  <motion.div
                    layoutId="nav-indicator"
                    className="absolute -top-px left-3 right-3 h-0.5 bg-primary rounded-full"
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Store Selector Modal */}
      <AnimatePresence>
        {showStoreModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end justify-center"
            onClick={() => setShowStoreModal(false)}
          >
            <div className="absolute inset-0 bg-black/40" />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative bg-white w-full max-w-[430px] rounded-t-3xl max-h-[70vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-100">
                <h2 className="text-lg font-bold text-gray-900">Select Store</h2>
                <button
                  onClick={() => setShowStoreModal(false)}
                  className="p-2 rounded-full hover:bg-gray-100 touch-target"
                >
                  <X size={20} className="text-gray-500" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-2 scroll-container">
                {stores.length === 0 && (
                  <p className="text-center text-gray-400 py-8">No stores available</p>
                )}
                {stores.map((store) => (
                  <button
                    key={store.id}
                    onClick={() => {
                      setSelectedStore(store);
                      setShowStoreModal(false);
                      showToast(`Switched to ${store.name}`, 'success');
                    }}
                    className={`w-full text-left p-4 rounded-2xl border-2 transition-all ${
                      selectedStore?.id === store.id
                        ? 'border-primary bg-primary/5'
                        : 'border-gray-100 bg-white hover:border-gray-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900 truncate">
                            {store.name}
                          </span>
                          {selectedStore?.id === store.id && (
                            <Check size={16} className="text-primary shrink-0" />
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mt-0.5 truncate">{store.address}</p>
                      </div>
                      <MapPin size={16} className="text-gray-400 shrink-0 ml-2 mt-0.5" />
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );

  return (
    <div className="app-container">
      {authStep === 'done' ? renderMainApp() : renderAuthFlow()}
    </div>
  );
}
