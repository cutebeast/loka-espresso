import { create } from 'zustand';
import type { PageId, Store, Category, MenuItem, OrderMode } from '@/lib/api';

interface UIState {
  page: PageId;
  orderMode: OrderMode;
  selectedStore: Store | null;
  stores: Store[];
  categories: Category[];
  menuItems: MenuItem[];
  selectedCategoryId: number | null;
  searchQuery: string;
  isLoading: boolean;
  toast: { message: string; type: 'success' | 'error' | 'info' } | null;
  setPage: (page: PageId) => void;
  setOrderMode: (mode: OrderMode) => void;
  setSelectedStore: (store: Store | null) => void;
  setStores: (stores: Store[]) => void;
  setCategories: (categories: Category[]) => void;
  setMenuItems: (items: MenuItem[]) => void;
  setSelectedCategoryId: (id: number | null) => void;
  setSearchQuery: (query: string) => void;
  setIsLoading: (loading: boolean) => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
  hideToast: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  page: 'home',
  orderMode: 'pickup',
  selectedStore: null,
  stores: [],
  categories: [],
  menuItems: [],
  selectedCategoryId: null,
  searchQuery: '',
  isLoading: false,
  toast: null,
  setPage: (page) => set({ page }),
  setOrderMode: (orderMode) => set({ orderMode }),
  setSelectedStore: (selectedStore) => set({ selectedStore }),
  setStores: (stores) => set({ stores }),
  setCategories: (categories) => set({ categories }),
  setMenuItems: (menuItems) => set({ menuItems }),
  setSelectedCategoryId: (selectedCategoryId) => set({ selectedCategoryId }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setIsLoading: (isLoading) => set({ isLoading }),
  showToast: (message, type) => set({ toast: { message, type } }),
  hideToast: () => set({ toast: null }),
}));
