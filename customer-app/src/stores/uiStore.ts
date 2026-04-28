import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PageId, Store, Category, MenuItem, OrderMode } from '@/lib/api';

export interface PageParams {
  initialTab?: string;
  selectedInfoId?: number;
  selectedInfoSlug?: string;
  selectedPromoId?: number;
  legalKey?: 'terms' | 'privacy';
  orderId?: number;
  [key: string]: unknown;
}

export interface DineInSession {
  storeId: number;
  storeName: string;
  storeSlug: string;
  tableId: number;
  tableNumber: string;
}

export interface CheckoutDraft {
  orderMode?: OrderMode;
  selectedStore?: Store | null;
  deliveryAddress?: { address: string; lat?: number; lng?: number } | null;
  pickupTime?: string | null;
  paymentMethod?: 'wallet' | 'pay_at_store' | 'cod' | 'cash';
  notes?: string;
  voucherCode?: string;
  rewardCode?: string;
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
  isGuest: boolean;
  requestSignIn: number;
  previousPage: PageId | null;
  checkoutDraft: CheckoutDraft;
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
  setIsGuest: (guest: boolean) => void;
  triggerSignIn: () => void;
  setPreviousPage: (page: PageId | null) => void;
  setCheckoutDraft: (draft: Partial<CheckoutDraft>) => void;
  clearCheckoutDraft: () => void;
  resetAll: () => void;
}

// Hash-based routing: sync page state with URL hash
function getHashPage(): PageId {
  if (typeof window === 'undefined') return 'home';
  const raw = window.location.hash.replace('#', '');
  const pagePart = raw.split('?')[0];
  const validPages: PageId[] = [
    'home', 'menu', 'rewards', 'cart', 'orders', 'checkout', 'profile',
    'wallet', 'history', 'promotions', 'information', 'my-rewards',
    'account-details', 'payment-methods', 'saved-addresses', 'notifications', 'help-support', 'legal', 'settings', 'my-card', 'order-detail',
  ];
  return validPages.includes(pagePart as PageId) ? (pagePart as PageId) : 'home';
}

function getHashParams(): PageParams {
  if (typeof window === 'undefined') return {};
  const raw = window.location.hash.replace('#', '');
  const queryPart = raw.split('?')[1];
  if (!queryPart) return {};
  const params = new URLSearchParams(queryPart);
  const result: PageParams = {};
  for (const [key, value] of params.entries()) {
    if (key === 'orderId') result.orderId = parseInt(value, 10);
    else if (key === 'selectedInfoId') result.selectedInfoId = parseInt(value, 10);
    else if (key === 'selectedPromoId') result.selectedPromoId = parseInt(value, 10);
    else (result as Record<string, unknown>)[key] = value;
  }
  return result;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
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
      pageParams: getHashParams(),
      showStorePicker: false,
      isGuest: false,
      requestSignIn: 0,
      previousPage: null,
      checkoutDraft: {},
      setPage: (page, params) => {
        if (typeof window !== 'undefined') {
          const paramStr = params ? new URLSearchParams(
            Object.entries(params).filter(([_, v]) => v != null).map(([k, v]) => [k, String(v)])
          ).toString() : '';
          window.location.hash = paramStr ? `${page}?${paramStr}` : page;
        }
        set((state) => ({ page, pageParams: params ?? {}, previousPage: state.page }));
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
      setIsGuest: (isGuest) => set({ isGuest }),
      triggerSignIn: () => set((s) => ({ requestSignIn: s.requestSignIn + 1, isGuest: false })),
      setPreviousPage: (previousPage) => set({ previousPage }),
      setCheckoutDraft: (draft) => set((state) => ({
        checkoutDraft: { ...state.checkoutDraft, ...draft },
      })),
      clearCheckoutDraft: () => set({ checkoutDraft: {} }),
      resetAll: () => set({
        dineInSession: null,
        selectedStore: null,
        orderMode: 'pickup',
        page: 'home',
        pageParams: {},
        isGuest: false,
        previousPage: null,
        checkoutDraft: {},
      }),
    }),
    {
      name: 'ui-store',
      partialize: (state) => ({
        checkoutDraft: state.checkoutDraft,
        previousPage: state.previousPage,
      }),
    }
  )
);
