import { create } from 'zustand';
import { apiFetch } from '@/lib/merchant-api';
import type {
  MerchantStore,
  MerchantCategory,
  MerchantMenuItem,
  MerchantTableItem,
  MerchantInventoryItem,
  MerchantOrder,
  MerchantDashboardData,
  MerchantLoyaltyTier,
} from '@/lib/merchant-types';
import { useAuthStore } from './authStore';

function getDefaultDateRange() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const date = now.getDate();
  const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
  return { from, to };
}

interface MerchantDataState {
  stores: MerchantStore[];
  selectedStore: string;
  dashboard: MerchantDashboardData | null;
  orders: MerchantOrder[];
  ordersTotal: number;
  ordersPage: number;
  ordersPageSize: number;
  ordersStatus: string;
  ordersOrderType: string;
  ordersFromDate: string;
  ordersToDate: string;
  categories: MerchantCategory[];
  menuItems: MerchantMenuItem[];
  selectedCategory: number | null;
  tables: MerchantTableItem[];
  inventory: MerchantInventoryItem[];
  loyaltyTiers: MerchantLoyaltyTier[];
  loading: boolean;
  dateRange: { from: string; to: string };
  dashboardChartMode: string;

  setStores: (v: MerchantStore[]) => void;
  setSelectedStore: (v: string) => void;
  setOrdersPage: (v: number) => void;
  setOrdersStatus: (v: string) => void;
  setOrdersOrderType: (v: string) => void;
  setOrdersFromDate: (v: string) => void;
  setOrdersToDate: (v: string) => void;
  setSelectedCategory: (v: number | null) => void;
  handleDateRangeChange: (from: string, to: string, chartMode?: string) => void;

  fetchStores: (signal?: AbortSignal) => Promise<void>;
  fetchAdminStores: (signal?: AbortSignal) => Promise<void>;
  fetchDashboardWithRange: (storeId: string | undefined, from: string, to: string, chartMode?: string, signal?: AbortSignal) => Promise<void>;
  fetchOrders: (storeId?: string, signal?: AbortSignal) => Promise<void>;
  fetchMenu: (signal?: AbortSignal) => Promise<void>;
  fetchInventory: (signal?: AbortSignal) => Promise<void>;
  fetchTables: (signal?: AbortSignal) => Promise<void>;
  fetchLoyaltyTiers: (signal?: AbortSignal) => Promise<void>;
}

export const useMerchantDataStore = create<MerchantDataState>()((set, get) => ({
  stores: [],
  selectedStore: 'all',
  dashboard: null,
  orders: [],
  ordersTotal: 0,
  ordersPage: 1,
  ordersPageSize: 50,
  ordersStatus: '',
  ordersOrderType: '',
  ordersFromDate: '',
  ordersToDate: '',
  categories: [],
  menuItems: [],
  selectedCategory: null,
  tables: [],
  inventory: [],
  loyaltyTiers: [],
  loading: false,
  dateRange: getDefaultDateRange(),
  dashboardChartMode: '',

  setStores: (v) => set({ stores: v }),
  setSelectedStore: (v) => set({ selectedStore: v }),
  setOrdersPage: (v) => set({ ordersPage: v }),
  setOrdersStatus: (v) => set({ ordersStatus: v }),
  setOrdersOrderType: (v) => set({ ordersOrderType: v }),
  setOrdersFromDate: (v) => set({ ordersFromDate: v }),
  setOrdersToDate: (v) => set({ ordersToDate: v }),
  setSelectedCategory: (v) => set({ selectedCategory: v }),

  handleDateRangeChange: (from, to, chartMode) => {
    set({ dateRange: { from, to } });
    if (chartMode) set({ dashboardChartMode: chartMode });
  },

  fetchStores: async (signal) => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    try {
      const res = await apiFetch('/admin/stores', undefined, { signal });
      if (res.ok) {
        const data = await res.json();
        set({ stores: Array.isArray(data) ? data : (data.items || []) });
      }
    } catch (err) { if ((err as Error)?.name !== 'AbortError') console.error('Failed to fetch stores:', err); }
  },

  fetchAdminStores: async (signal) => {
    const token = useAuthStore.getState().token;
    if (!token) return;
    try {
      const res = await apiFetch('/admin/stores', undefined, { signal });
      if (res.ok) {
        const data = await res.json();
        set({ stores: Array.isArray(data) ? data : (data.items || []) });
      }
    } catch (err) { if ((err as Error)?.name !== 'AbortError') console.error('Failed to fetch admin stores:', err); }
  },

  fetchDashboardWithRange: async (storeId, from, to, chartMode, signal) => {
    set({ loading: true });
    try {
      const params = new URLSearchParams();
      if (storeId) params.append('store_id', storeId);
      if (from) params.append('from_date', from + 'T00:00:00');
      if (to) params.append('to_date', to + 'T23:59:59');
      if (chartMode) params.append('chart_mode', chartMode);
      const qs = params.toString();
      const res = await apiFetch(`/admin/dashboard${qs ? `?${qs}` : ''}`, undefined, { signal });
      if (res.ok) set({ dashboard: await res.json() });
    } catch (err) { if ((err as Error)?.name !== 'AbortError') console.error('Failed to fetch dashboard:', err); }
    finally { set({ loading: false }); }
  },

  fetchOrders: async (storeId, signal) => {
    const { ordersPage, ordersPageSize, ordersStatus, ordersOrderType, ordersFromDate, ordersToDate } = get();
    set({ loading: true });
    try {
      const params = new URLSearchParams();
      params.append('page', String(ordersPage));
      params.append('page_size', String(ordersPageSize));
      if (storeId) params.append('store_id', storeId);
      if (ordersStatus) params.append('status', ordersStatus);
      if (ordersOrderType) params.append('order_type', ordersOrderType);
      if (ordersFromDate) params.append('from_date', ordersFromDate + 'T00:00:00');
      if (ordersToDate) params.append('to_date', ordersToDate + 'T23:59:59');
      const res = await apiFetch(`/admin/orders?${params.toString()}`, undefined, { signal });
      if (res.ok) {
        const data = await res.json();
        set({ orders: Array.isArray(data) ? data : (data.items || []), ordersTotal: data.total || 0 });
      }
    } catch (err) { if ((err as Error)?.name !== 'AbortError') console.error('Failed to fetch orders:', err); }
    finally { set({ loading: false }); }
  },

  fetchMenu: async (signal) => {
    set({ loading: true });
    try {
      const [catRes, itemRes] = await Promise.all([
        apiFetch('/menu/categories', undefined, { signal }),
        apiFetch('/menu/items', undefined, { signal }),
      ]);
      if (catRes.ok) {
        const catsData = await catRes.json();
        const cats = Array.isArray(catsData) ? catsData : (catsData.items || []);
        set({ categories: cats });
        if (cats.length > 0) {
          set((state) => ({ selectedCategory: state.selectedCategory || cats[0].id }));
        }
      }
      if (itemRes.ok) {
        const itemsData = await itemRes.json();
        set({ menuItems: Array.isArray(itemsData) ? itemsData : (itemsData.items || []) });
      }
    } catch (err) { if ((err as Error)?.name !== 'AbortError') console.error('Failed to fetch menu:', err); }
    finally { set({ loading: false }); }
  },

  fetchInventory: async (signal) => {
    const { selectedStore } = get();
    if (selectedStore === 'all' || !selectedStore) return;
    set({ loading: true });
    try {
      const res = await apiFetch(`/admin/stores/${selectedStore}/inventory`, undefined, { signal });
      if (res.ok) {
        const data = await res.json();
        set({ inventory: Array.isArray(data) ? data : (data.items || []) });
      }
    } catch (err) { if ((err as Error)?.name !== 'AbortError') console.error('Failed to fetch inventory:', err); }
    finally { set({ loading: false }); }
  },

  fetchTables: async (signal) => {
    const { selectedStore } = get();
    if (selectedStore === 'all' || !selectedStore) return;
    set({ loading: true });
    try {
      const res = await apiFetch(`/admin/stores/${selectedStore}/tables`, undefined, { signal });
      if (res.ok) {
        const data = await res.json();
        set({ tables: Array.isArray(data) ? data : (data.items || []) });
      }
    } catch (err) { if ((err as Error)?.name !== 'AbortError') console.error('Failed to fetch tables:', err); }
    finally { set({ loading: false }); }
  },

  fetchLoyaltyTiers: async (signal) => {
    set({ loading: true });
    try {
      const res = await apiFetch('/admin/loyalty-tiers', undefined, { signal });
      if (res.ok) {
        const data = await res.json();
        set({ loyaltyTiers: Array.isArray(data) ? data : (data.items || []) });
      }
    } catch (err) { if ((err as Error)?.name !== 'AbortError') console.error('Failed to fetch loyalty tiers:', err); }
    finally { set({ loading: false }); }
  },
}));
