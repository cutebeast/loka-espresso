'use client';

import { useState, useCallback } from 'react';
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

export function useMerchantData(token: string) {
  const [stores, setStores] = useState<MerchantStore[]>([]);
  const [selectedStore, setSelectedStore] = useState<string>('all');
  const [dashboard, setDashboard] = useState<MerchantDashboardData | null>(null);
  const [orders, setOrders] = useState<MerchantOrder[]>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersPageSize] = useState(50);
  const [ordersStatus, setOrdersStatus] = useState('');
  const [ordersOrderType, setOrdersOrderType] = useState('');
  const [ordersFromDate, setOrdersFromDate] = useState('');
  const [ordersToDate, setOrdersToDate] = useState('');
  const [categories, setCategories] = useState<MerchantCategory[]>([]);
  const [menuItems, setMenuItems] = useState<MerchantMenuItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [tables, setTables] = useState<MerchantTableItem[]>([]);
  const [inventory, setInventory] = useState<MerchantInventoryItem[]>([]);
  const [loyaltyTiers, setLoyaltyTiers] = useState<MerchantLoyaltyTier[]>([]);
  const [loading, setLoading] = useState(false);

  const getDefaultDateRange = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const date = now.getDate();
    const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
    return { from, to };
  };

  const [dateRange, setDateRange] = useState<{ from: string; to: string }>(getDefaultDateRange);
  const [dashboardChartMode, setDashboardChartMode] = useState('');

  const fetchStores = useCallback(async (signal?: AbortSignal) => {
    if (!token) return;
    try {
      const res = await apiFetch('/admin/stores', undefined, { signal });
      if (res.ok) {
        const data = await res.json();
        setStores(Array.isArray(data) ? data : (data.items || []));
      }
    } catch (err) { if ((err as Error)?.name !== 'AbortError') console.error('Failed to fetch stores:', err); }
  }, [token]);

  const fetchAdminStores = useCallback(async (signal?: AbortSignal) => {
    if (!token) return;
    try {
      const res = await apiFetch('/admin/stores', undefined, { signal });
      if (res.ok) {
        const data = await res.json();
        setStores(Array.isArray(data) ? data : (data.items || []));
      }
    } catch (err) { if ((err as Error)?.name !== 'AbortError') console.error('Failed to fetch admin stores:', err); }
  }, [token]);

  const fetchDashboardWithRange = useCallback(async (storeId: string | undefined, from: string, to: string, chartMode?: string, signal?: AbortSignal) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (storeId) params.append('store_id', storeId);
      if (from) params.append('from_date', from + 'T00:00:00');
      if (to) params.append('to_date', to + 'T23:59:59');
      if (chartMode) params.append('chart_mode', chartMode);
      const qs = params.toString();
      const res = await apiFetch(`/admin/dashboard${qs ? `?${qs}` : ''}`, undefined, { signal });
      if (res.ok) setDashboard(await res.json());
    } catch (err) { if ((err as Error)?.name !== 'AbortError') console.error('Failed to fetch dashboard:', err); } finally { setLoading(false); }
  }, []);

  const fetchOrders = useCallback(async (storeId?: string, signal?: AbortSignal) => {
    setLoading(true);
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
        setOrders(Array.isArray(data) ? data : (data.items || []));
        setOrdersTotal(data.total || 0);
      }
    } catch (err) { if ((err as Error)?.name !== 'AbortError') console.error('Failed to fetch orders:', err); } finally { setLoading(false); }
  }, [ordersPage, ordersPageSize, ordersStatus, ordersOrderType, ordersFromDate, ordersToDate]);

  const fetchMenu = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const [catRes, itemRes] = await Promise.all([
        apiFetch('/menu/categories', undefined, { signal }),
        apiFetch('/menu/items', undefined, { signal }),
      ]);
      if (catRes.ok) {
        const catsData = await catRes.json();
        const cats = Array.isArray(catsData) ? catsData : (catsData.items || []);
        setCategories(cats);
        if (cats.length > 0) setSelectedCategory(prev => prev || cats[0].id);
      }
      if (itemRes.ok) {
        const itemsData = await itemRes.json();
        setMenuItems(Array.isArray(itemsData) ? itemsData : (itemsData.items || []));
      }
    } catch (err) { if ((err as Error)?.name !== 'AbortError') console.error('Failed to fetch menu:', err); } finally { setLoading(false); }
  }, []);

  const fetchInventory = useCallback(async (signal?: AbortSignal) => {
    if (selectedStore === 'all' || !selectedStore) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/admin/stores/${selectedStore}/inventory`, undefined, { signal });
      if (res.ok) {
        const data = await res.json();
        setInventory(Array.isArray(data) ? data : (data.items || []));
      }
    } catch (err) { if ((err as Error)?.name !== 'AbortError') console.error('Failed to fetch inventory:', err); } finally { setLoading(false); }
  }, [selectedStore]);

  const fetchTables = useCallback(async (signal?: AbortSignal) => {
    if (selectedStore === 'all' || !selectedStore) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/admin/stores/${selectedStore}/tables`, undefined, { signal });
      if (res.ok) {
        const data = await res.json();
        setTables(Array.isArray(data) ? data : (data.items || []));
      }
    } catch (err) { if ((err as Error)?.name !== 'AbortError') console.error('Failed to fetch tables:', err); } finally { setLoading(false); }
  }, [selectedStore]);

  const fetchLoyaltyTiers = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const res = await apiFetch('/admin/loyalty-tiers', undefined, { signal });
      if (res.ok) {
        const data = await res.json();
        setLoyaltyTiers(Array.isArray(data) ? data : (data.items || []));
      }
    } catch (err) { if ((err as Error)?.name !== 'AbortError') console.error('Failed to fetch loyalty tiers:', err); } finally { setLoading(false); }
  }, []);

  const handleDateRangeChange = useCallback((from: string, to: string, chartMode?: string) => {
    setDateRange({ from, to });
    if (chartMode) setDashboardChartMode(chartMode);
  }, []);

  return {
    stores, setStores, selectedStore, setSelectedStore,
    dashboard, setDashboard,
    orders, setOrders, ordersTotal, setOrdersTotal,
    ordersPage, setOrdersPage, ordersPageSize,
    ordersStatus, setOrdersStatus,
    ordersOrderType, setOrdersOrderType,
    ordersFromDate, setOrdersFromDate,
    ordersToDate, setOrdersToDate,
    categories, setCategories,
    menuItems, setMenuItems,
    selectedCategory, setSelectedCategory,
    tables, setTables,
    inventory, setInventory,
    loyaltyTiers, setLoyaltyTiers,
    loading, setLoading,
    dateRange, setDateRange,
    dashboardChartMode, setDashboardChartMode,
    fetchStores, fetchAdminStores,
    fetchDashboardWithRange, fetchOrders,
    fetchMenu, fetchInventory, fetchTables,
    fetchLoyaltyTiers, handleDateRangeChange,
  };
}
