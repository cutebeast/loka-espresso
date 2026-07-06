import { create } from 'zustand';
import type { UserProfile } from '@/lib/api';
import api from '@/lib/api';
import { useCartStore } from '@/stores/cartStore';
import { useUIStore } from '@/stores/uiStore';
import { useWalletStore } from '@/stores/walletStore';
import { useOrderStore } from '@/stores/orderStore';
import { unsubscribeAndDeregisterWebPush } from '@/hooks/useWebPush';

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
    logout: async () => {
      try {
        await unsubscribeAndDeregisterWebPush();
      } catch (err) {
        console.error('[AuthStore] Web push deregister failed:', err);
      }
      try {
        await api.post('/auth/logout');
      } catch (err) {
        // ignore logout failures — still clear local state
        console.error('[AuthStore] Logout API call failed:', err);
      }
      useCartStore.getState().clearCart();
      useUIStore.getState().resetAll();
      useWalletStore.getState().resetAll();
      useOrderStore.getState().resetAll();
      set({ user: null, isAuthenticated: false, isNewUser: false, phone: '', authDone: false });
    },
    resetAllExceptCart: () => {
      useUIStore.getState().setIsGuest(false);
      useWalletStore.getState().resetAll();
      useOrderStore.getState().resetAll();
      set({ user: null, isAuthenticated: false, isNewUser: false, phone: '', authDone: false });
    },
  })
);
