import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserProfile } from '@/lib/api';

interface AuthState {
  token: string | null;
  user: UserProfile | null;
  isAuthenticated: boolean;
  isNewUser: boolean;
  phone: string;
  setToken: (token: string | null) => void;
  setUser: (user: UserProfile | null) => void;
  setIsNewUser: (value: boolean) => void;
  setPhone: (phone: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      isAuthenticated: false,
      isNewUser: false,
      phone: '',
      setToken: (token) => set({ token, isAuthenticated: !!token }),
      setUser: (user) => set({ user }),
      setIsNewUser: (isNewUser) => set({ isNewUser }),
      setPhone: (phone) => set({ phone }),
      logout: () => set({ token: null, user: null, isAuthenticated: false, isNewUser: false }),
    }),
    {
      name: 'loka-auth',
      partialize: (state) => ({ token: state.token }),
    }
  )
);
