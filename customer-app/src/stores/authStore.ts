import { create } from 'zustand';
import type { UserProfile } from '@/lib/api';

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
        const { default: api } = await import('@/lib/api');
        await api.post('/auth/logout');
      } catch {
        // ignore — cookie will expire naturally
      }
      // Reset all domain stores without direct coupling
      const { useCartStore } = await import('@/stores/cartStore');
      const { useUIStore } = await import('@/stores/uiStore');
      const { useWalletStore } = await import('@/stores/walletStore');
      const { useOrderStore } = await import('@/stores/orderStore');
      useCartStore.getState().clearCart();
      useUIStore.getState().resetAll();
      useWalletStore.getState().resetAll();
      useOrderStore.getState().resetAll();
      set({ user: null, isAuthenticated: false, isNewUser: false, phone: '', authDone: false });
    },
    resetAllExceptCart: async () => {
      try {
        const { default: api } = await import('@/lib/api');
        await api.post('/auth/logout');
      } catch {
        // ignore
      }
      const { useUIStore } = await import('@/stores/uiStore');
      const { useWalletStore } = await import('@/stores/walletStore');
      const { useOrderStore } = await import('@/stores/orderStore');
      useUIStore.getState().setIsGuest(false);
      useWalletStore.getState().resetAll();
      useOrderStore.getState().resetAll();
      set({ user: null, isAuthenticated: false, isNewUser: false, phone: '', authDone: false });
    },
  })
);
