import { create } from 'zustand';
import type { UserProfile } from '@/lib/api';
import { useCartStore } from '@/stores/cartStore';
import { useUIStore } from '@/stores/uiStore';
import { useWalletStore } from '@/stores/walletStore';
import { useOrderStore } from '@/stores/orderStore';

interface AuthState {
  user: UserProfile | null;
  isAuthenticated: boolean;
  isNewUser: boolean;
  phone: string;
  authDone: boolean;
  setUser: (user: UserProfile | null) => void;
  setIsNewUser: (value: boolean) => void;
  setPhone: (phone: string) => void;
  setAuthDone: (done: boolean) => void;
  logout: () => void;
  resetAllExceptCart: () => void;
}

export const useAuthStore = create<AuthState>()(
  (set) => ({
    user: null,
    isAuthenticated: false,
    isNewUser: false,
    phone: '',
    authDone: false,
    setUser: (user) => set({ user, isAuthenticated: !!user }),
    setIsNewUser: (isNewUser) => set({ isNewUser }),
    setPhone: (phone) => set({ phone }),
    setAuthDone: (authDone) => set({ authDone }),
    logout: () => {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      useCartStore.getState().clearCart();
      useUIStore.getState().resetAll();
      useWalletStore.getState().resetAll();
      useOrderStore.getState().resetAll();
      set({ user: null, isAuthenticated: false, isNewUser: false, phone: '', authDone: false });
    },
    resetAllExceptCart: () => {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      useUIStore.getState().setIsGuest(false);
      useWalletStore.getState().resetAll();
      useOrderStore.getState().resetAll();
      set({ user: null, isAuthenticated: false, isNewUser: false, phone: '', authDone: false });
    },
  })
);
