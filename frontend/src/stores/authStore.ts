import { create } from 'zustand';
import { apiFetch } from '@/lib/merchant-api';
import { API_BASE_URL } from '@/lib/config';

interface AuthState {
  token: string;
  currentUserRole: string;
  currentUserType: number;
  currentUserName: string;
  currentUserPhone: string;
  currentUserEmail: string;
  setToken: (token: string) => void;
  setCurrentUserName: (name: string) => void;
  setCurrentUserPhone: (phone: string) => void;
  handleLogout: () => Promise<void>;
  fetchUserRole: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  token: '',
  currentUserRole: 'Admin',
  currentUserType: 1,
  currentUserName: '',
  currentUserPhone: '',
  currentUserEmail: '',

  setToken: (token) => set({ token }),
  setCurrentUserName: (name) => set({ currentUserName: name }),
  setCurrentUserPhone: (phone) => set({ currentUserPhone: phone }),

  handleLogout: async () => {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Best effort
    }
    set({ token: '', currentUserRole: 'Admin', currentUserType: 1, currentUserName: '', currentUserPhone: '', currentUserEmail: '' });
    if (typeof window !== 'undefined') window.location.hash = 'dashboard';
  },

  fetchUserRole: async () => {
    const { token, handleLogout } = get();
    if (!token) return;
    try {
      const res = await apiFetch('/users/me');
      if (res.ok) {
        const user = await res.json();
        set({
          currentUserRole: user.role || 'Admin',
          currentUserType: user.user_type_id || 1,
          currentUserName: user.name || '',
          currentUserPhone: user.phone || '',
          currentUserEmail: user.email || '',
        });
      } else if (res.status === 401) {
        await handleLogout();
      }
    } catch (err) {
      console.error('Failed to fetch user role:', err);
      await handleLogout();
    }
  },
}));
