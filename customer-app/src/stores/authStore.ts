import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserProfile } from '@/lib/api';
import { useCartStore } from '@/stores/cartStore';
import { useUIStore } from '@/stores/uiStore';
import { useWalletStore } from '@/stores/walletStore';
import { useOrderStore } from '@/stores/orderStore';

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: UserProfile | null;
  isAuthenticated: boolean;
  isNewUser: boolean;
  phone: string;
  setToken: (token: string | null) => void;
  setRefreshToken: (refreshToken: string | null) => void;
  setUser: (user: UserProfile | null) => void;
  setIsNewUser: (value: boolean) => void;
  setPhone: (phone: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      refreshToken: null,
      user: null,
      isAuthenticated: false,
      isNewUser: false,
      phone: '',
      setToken: (token) => set({ token, isAuthenticated: !!token }),
      setRefreshToken: (refreshToken) => set({ refreshToken }),
      setUser: (user) => set({ user }),
      setIsNewUser: (isNewUser) => set({ isNewUser }),
      setPhone: (phone) => set({ phone }),
      logout: () => {
        useCartStore.getState().clearCart();
        useUIStore.getState().setDineInSession(null);
        useUIStore.getState().setSelectedStore(null);
        useUIStore.getState().setOrderMode('pickup');
        useUIStore.getState().setPage('home');
        useWalletStore.getState().setBalance(0);
        useWalletStore.getState().setPoints(0);
        useWalletStore.getState().setTier('Bronze');
        useWalletStore.getState().setRewards([]);
        useWalletStore.getState().setVouchers([]);
        useWalletStore.getState().setTransactions([]);
        useOrderStore.getState().setOrders([]);
        useOrderStore.getState().setCurrentOrder(null);
        if (typeof window !== 'undefined') {
          localStorage.removeItem('loka-auth');
          localStorage.removeItem('loka-cart');
        }
        set({ token: null, refreshToken: null, user: null, isAuthenticated: false, isNewUser: false, phone: '' });
      },
    }),
    {
      name: 'loka-auth',
      partialize: (state) => ({ token: state.token, refreshToken: state.refreshToken }),
    }
  )
);
