import { create } from 'zustand';
import type { PageId, Store, Category, MenuItem, OrderMode } from '@/lib/api';

export interface PageParams {
  initialTab?: string;
  selectedInfoId?: number;
  [key: string]: unknown;
}

export interface DineInSession {
  storeId: number;
  storeName: string;
  storeSlug: string;
  tableId: number;
  tableNumber: string;
}

interface UIState {
  page: PageId;
  orderMode: OrderMode;
  dineInSession: DineInSession | null;
  selectedStore: Store | null;
  stores: Store[];
  categories: Category[];
  menuItems: MenuItem[];
  selectedCategoryId: number | null;
  searchQuery: string;
  isLoading: boolean;
  toast: { message: string; type: 'success' | 'error' | 'info' } | null;
  pageParams: PageParams;
  showStorePicker: boolean;
  setPage: (page: PageId, params?: PageParams) => void;
  setOrderMode: (mode: OrderMode) => void;
  setDineInSession: (session: DineInSession | null) => void;
  setSelectedStore: (store: Store | null) => void;
  setStores: (stores: Store[]) => void;
  setCategories: (categories: Category[]) => void;
  setMenuItems: (items: MenuItem[]) => void;
  setSelectedCategoryId: (id: number | null) => void;
  setSearchQuery: (query: string) => void;
  setIsLoading: (loading: boolean) => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
  hideToast: () => void;
  setShowStorePicker: (show: boolean) => void;
}

// Hash-based routing: sync page state with URL hash
function getHashPage(): PageId {
  if (typeof window === 'undefined') return 'home';
  const hash = window.location.hash.replace('#', '');
  const validPages: PageId[] = [
    'home', 'menu', 'rewards', 'cart', 'orders', 'checkout', 'profile',
    'wallet', 'history', 'promotions', 'information', 'my-rewards',
    'account-details', 'payment-methods', 'saved-addresses', 'notifications', 'help-support',
  ];
  return validPages.includes(hash as PageId) ? (hash as PageId) : 'home';
}

export const useUIStore = create<UIState>((set) => ({
  page: getHashPage(),
  orderMode: 'pickup',
  dineInSession: null,
  selectedStore: null,
  stores: [],
  categories: [],
  menuItems: [],
  selectedCategoryId: null,
  searchQuery: '',
  isLoading: false,
  toast: null,
  pageParams: {},
  showStorePicker: false,
  setPage: (page, params) => {
    if (typeof window !== 'undefined') {
      window.location.hash = page;
    }
    set({ page, pageParams: params ?? {} });
  },
  setOrderMode: (orderMode) => set({ orderMode }),
  setDineInSession: (dineInSession) => set({ dineInSession }),
  setSelectedStore: (selectedStore) => set({ selectedStore }),
  setStores: (stores) => set({ stores }),
  setCategories: (categories) => set({ categories }),
  setMenuItems: (menuItems) => set({ menuItems }),
  setSelectedCategoryId: (selectedCategoryId) => set({ selectedCategoryId }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setIsLoading: (isLoading) => set({ isLoading }),
  showToast: (message, type) => set({ toast: { message, type } }),
  hideToast: () => set({ toast: null }),
  setShowStorePicker: (showStorePicker) => set({ showStorePicker }),
}));
