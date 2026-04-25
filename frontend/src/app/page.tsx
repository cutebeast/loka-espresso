'use client';

import { useState, useEffect, useCallback } from 'react';
import React from 'react';
import dynamic from 'next/dynamic';
import { apiFetch } from '@/lib/merchant-api';
import { THEME } from '@/lib/theme';
import type {
  PageId,
  MerchantStore,
  MerchantCategory,
  MerchantMenuItem,
  MerchantTableItem,
  MerchantInventoryItem,
  MerchantOrder,
  MerchantDashboardData,
  MerchantLoyaltyTier,
} from '@/lib/merchant-types';
import LoginScreen from '@/components/LoginScreen';
import Sidebar from '@/components/Sidebar';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { AddBroadcastForm } from '@/components/Modals';
import ChangePasswordModal from '@/components/ChangePasswordModal';
import CustomizationManager from '@/components/CustomizationManager';
import MobileBottomNav from '@/components/MobileBottomNav';
import DashboardPage from '@/components/pages/overview/DashboardPage';
import OrdersPage from '@/components/pages/overview/OrdersPage';

const MenuPage = dynamic(() => import('@/components/pages/store-ops/MenuPage'), { ssr: false });
const TablesPage = dynamic(() => import('@/components/pages/store-ops/TablesPage'), { ssr: false });
const KitchenDisplayPage = dynamic(() => import('@/components/pages/store-ops/KitchenDisplayPage'), { ssr: false });
const InventoryPage = dynamic(() => import('@/components/pages/store-ops/InventoryPage'), { ssr: false });
const StaffPage = dynamic(() => import('@/components/pages/store-ops/StaffPage'), { ssr: false });
const RewardsPage = dynamic(() => import('@/components/pages/marketing/RewardsPage'), { ssr: false });
const VouchersPage = dynamic(() => import('@/components/pages/marketing/VouchersPage'), { ssr: false });
const CustomersPage = dynamic(() => import('@/components/pages/marketing/CustomersPage'), { ssr: false });
const SalesReportsPage = dynamic(() => import('@/components/pages/analytics/SalesReportsPage'), { ssr: false });
const MarketingReportsPage = dynamic(() => import('@/components/pages/analytics/MarketingReportsPage'), { ssr: false });
const SettingsPage = dynamic(() => import('@/components/pages/system/SettingsPage'), { ssr: false });
const AuditLogPage = dynamic(() => import('@/components/pages/system/AuditLogPage'), { ssr: false });
const LoyaltyRulesPage = dynamic(() => import('@/components/pages/system/LoyaltyRulesPage'), { ssr: false });
const CustomerDetailPage = dynamic(() => import('@/components/pages/system/CustomerDetailPage'), { ssr: false });
const StoreSettingsPage = dynamic(() => import('@/components/pages/system/StoreSettingsPage'), { ssr: false });
const NotificationsPage = dynamic(() => import('@/components/pages/marketing/NotificationsPage'), { ssr: false });
const PromotionsPage = dynamic(() => import('@/components/pages/marketing/PromotionsPage'), { ssr: false });
const InformationPage = dynamic(() => import('@/components/pages/marketing/InformationPage'), { ssr: false });
const WalletTopUpPage = dynamic(() => import('@/components/pages/store-ops/WalletTopUpPage'), { ssr: false });
const POSTerminalPage = dynamic(() => import('@/components/pages/store-ops/POSTerminalPage'), { ssr: false });
const FeedbackPage = dynamic(() => import('@/components/pages/marketing/FeedbackPage'), { ssr: false });
const PWASettingsPage = dynamic(() => import('@/components/pages/system/PWASettingsPage'), { ssr: false });

export default function MerchantDashboard() {
  const [token, setToken] = useState('');
  const [_refreshToken, setRefreshToken] = useState('');
  const [currentUserRole, setCurrentUserRole] = useState('Admin');
  const [currentUserType, setCurrentUserType] = useState<number>(1);
  function getHashPage(): PageId {
    if (typeof window === 'undefined') return 'dashboard';
    const hash = window.location.hash.replace('#', '');
    const valid: PageId[] = ['dashboard','orders','kitchen','menu','inventory','tables','staff','rewards','vouchers','promotions','information','feedback','reports','marketingreports','customers','notifications','auditlog','loyaltyrules','store','settings','pwa','walletTopup','posterminal'];
    if (valid.includes(hash as PageId)) return hash as PageId;
    const qp = new URLSearchParams(window.location.search).get('page');
    if (qp && valid.includes(qp as PageId)) return qp as PageId;
    return 'dashboard';
  }
  const [page, setPage] = useState<PageId>(getHashPage);

  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const urlCustomerId = searchParams.get('customerId');
  const [customerDetailId, setCustomerDetailId] = useState<number | null>(urlCustomerId ? parseInt(urlCustomerId) : null);

  useEffect(() => {
    const valid: PageId[] = ['dashboard','orders','kitchen','menu','inventory','tables','staff','rewards','vouchers','promotions','information','feedback','reports','marketingreports','customers','notifications','auditlog','loyaltyrules','store','settings','pwa','walletTopup','posterminal'];
    const syncPage = () => {
      const stateDetailId = (window.history.state as {customerDetailId?: number} | null)?.customerDetailId;
      if (stateDetailId != null) {
        setCustomerDetailId(stateDetailId);
        setPage('customers');
        return;
      }
      const hash = window.location.hash.replace('#', '');
      if (valid.includes(hash as PageId)) {
        setCustomerDetailId(null);
        setPage(hash as PageId);
        return;
      }
      const qp = new URLSearchParams(window.location.search).get('page');
      if (qp && valid.includes(qp as PageId)) {
        setPage(qp as PageId);
        return;
      }
      if (!hash && !qp) {
        setCustomerDetailId(null);
        setPage('dashboard');
      }
    };
    window.addEventListener('hashchange', syncPage);
    window.addEventListener('popstate', syncPage);
    return () => {
      window.removeEventListener('hashchange', syncPage);
      window.removeEventListener('popstate', syncPage);
    };
  }, []);
  const [selectedStore, setSelectedStore] = useState<string>('all');
  const [stores, setStores] = useState<MerchantStore[]>([]);
  const [showStoreModal, setShowStoreModal] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalContent, setModalContent] = useState<React.ReactNode>(null);
  const [modalTitle, setModalTitle] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [sidebarOpen, setSidebarOpen] = useState(typeof window !== 'undefined' ? window.innerWidth > 1024 : false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  const [dashboard, setDashboard] = useState<MerchantDashboardData | null>(null);
  const [orders, setOrders] = useState<MerchantOrder[]>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersPageSize] = useState(50);
  const [ordersStatus, setOrdersStatus] = useState<string>('');
  const [ordersOrderType, setOrdersOrderType] = useState<string>('');
  const [categories, setCategories] = useState<MerchantCategory[]>([]);
  const [menuItems, setMenuItems] = useState<MerchantMenuItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [tables, setTables] = useState<MerchantTableItem[]>([]);
  const [inventory, setInventory] = useState<MerchantInventoryItem[]>([]);

  const [loyaltyTiers, setLoyaltyTiers] = useState<MerchantLoyaltyTier[]>([]);
  const [loading, setLoading] = useState(false);
  const [notifRefreshKey, setNotifRefreshKey] = useState(0);
  const [customizingItem, setCustomizingItem] = useState<MerchantMenuItem | null>(null);
  
  const getDefaultDateRange = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const date = now.getDate();
    const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
    return { from, to };
  };
  
  const [dateRange, setDateRange] = useState<{ from: string; to: string }>(getDefaultDateRange());
  const [ordersFromDate, setOrdersFromDate] = useState('');
  const [ordersToDate, setOrdersToDate] = useState('');

  const [dashboardChartMode, setDashboardChartMode] = useState<string>('');

  // ── Callback definitions (must come before effects that reference them) ──

  const handleLogout = useCallback(async () => {
    try {
      await fetch(`${process.env.NEXT_PUBLIC_API_URL || '/api/v1'}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Best effort
    }
    setToken('');
    setRefreshToken('');
    setPage('dashboard');
    if (typeof window !== 'undefined') window.location.hash = 'dashboard';
    setSelectedStore('all');
    setDateRange({ from: '', to: '' });
  }, []);

  const fetchStores = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch('/stores');
      if (res.ok) {
        const data = await res.json();
        setStores(Array.isArray(data) ? data : (data.stores || []));
      }
    } catch (err) { console.error('Failed to fetch stores:', err); }
  }, [token]);

  const fetchAdminStores = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch('/admin/stores');
      if (res.ok) {
        const data = await res.json();
        setStores(Array.isArray(data) ? data : (data.stores || []));
      }
    } catch (err) { console.error('Failed to fetch admin stores:', err); }
  }, [token]);

  const fetchUserRole = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch('/users/me');
      if (res.ok) {
        const user = await res.json();
        setCurrentUserRole(user.role || 'Admin');
        setCurrentUserType(user.user_type_id || 1);
      } else if (res.status === 401) {
        handleLogout();
      }
    } catch (err) {
      console.error('Failed to fetch user role:', err);
      handleLogout();
    }
  }, [token, handleLogout]);

  const fetchDashboardWithRange = useCallback(async (storeId: string | undefined, from: string, to: string, chartMode?: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (storeId) params.append('store_id', storeId);
      if (from) params.append('from_date', from + 'T00:00:00');
      if (to) params.append('to_date', to + 'T23:59:59');
      if (chartMode) params.append('chart_mode', chartMode);
      const queryString = params.toString() ? `?${params.toString()}` : '';
      const res = await apiFetch(`/admin/dashboard${queryString}`);
      if (res.ok) setDashboard(await res.json());
    } catch (err) { console.error('Failed to fetch dashboard:', err); } finally { setLoading(false); }
  }, []);

  const fetchOrders = useCallback(async (storeId?: string) => {
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
      const res = await apiFetch(`/admin/orders?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setOrders(Array.isArray(data) ? data : (data.orders || []));
        setOrdersTotal(data.total || 0);
      }
    } catch (err) { console.error('Failed to fetch orders:', err); } finally { setLoading(false); }
  }, [ordersPage, ordersPageSize, ordersStatus, ordersOrderType, ordersFromDate, ordersToDate]);

  const fetchMenu = useCallback(async () => {
    setLoading(true);
    try {
      const [catRes, itemRes] = await Promise.all([
        apiFetch(`/menu/categories`),
        apiFetch(`/menu/items`),
      ]);
      if (catRes.ok) {
        const cats = await catRes.json();
        setCategories(cats);
        if (cats.length > 0) setSelectedCategory(prev => prev || cats[0].id);
      }
      if (itemRes.ok) {
        const items = await itemRes.json();
        setMenuItems(items);
      }
    } catch (err) { console.error('Failed to fetch menu:', err); } finally { setLoading(false); }
  }, []);

  const fetchInventory = useCallback(async () => {
    if (selectedStore === 'all') return;
    setLoading(true);
    try {
      const res = await apiFetch(`/stores/${selectedStore}/inventory`);
      if (res.ok) setInventory(await res.json());
    } catch (err) { console.error('Failed to fetch inventory:', err); } finally { setLoading(false); }
  }, [selectedStore]);

  const fetchTables = useCallback(async () => {
    if (selectedStore === 'all') return;
    setLoading(true);
    try {
      const res = await apiFetch(`/stores/${selectedStore}/tables`);
      if (res.ok) setTables(await res.json());
    } catch (err) { console.error('Failed to fetch tables:', err); } finally { setLoading(false); }
  }, [selectedStore]);

  async function fetchLoyaltyTiers() {
    setLoading(true);
    try {
      const res = await apiFetch('/admin/loyalty-tiers');
      if (res.ok) {
        const data = await res.json();
        setLoyaltyTiers(Array.isArray(data) ? data : (data.tiers || []));
      }
    } catch (err) { console.error('Failed to fetch loyalty tiers:', err); } finally { setLoading(false); }
  }

  function handleDateRangeChange(from: string, to: string, chartMode?: string) {
    setDateRange({ from, to });
    if (chartMode) setDashboardChartMode(chartMode);
  }

  function openBroadcastModal() {
    setModalTitle('New Broadcast');
    setModalContent(<AddBroadcastForm token={token} onClose={() => { setShowModal(false); setNotifRefreshKey(k => k + 1); }} />);
    setShowModal(true);
  }

  // ── Effects (all callbacks referenced are defined above) ──

  // Check auth status on mount using httpOnly cookie
  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || '/api/v1'}/users/me`, {
          credentials: 'include',
        });
        if (res.ok) {
          setToken('cookie-auth');
        }
      } catch {
        // Not authenticated
      }
    }
    checkAuth();
  }, []);

  useEffect(() => {
    if (token) {
      fetchStores();
      fetchUserRole();
    }
  }, [token, fetchStores, fetchUserRole]);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    const storeId = selectedStore === 'all' ? '' : selectedStore;
    if (page === 'dashboard') fetchDashboardWithRange(storeId, dateRange.from, dateRange.to, dashboardChartMode);
    else if (page === 'orders') fetchOrders(storeId);
    else if (page === 'menu') fetchMenu();
    else if (page === 'inventory') fetchInventory();
    else if (page === 'tables') fetchTables();
    else if (page === 'kitchen') { /* Kitchen page self-fetches + auto-refreshes */ }
    else if (page === 'staff') { /* Staff page now self-fetches */ }
    else if (page === 'rewards') { /* Rewards page self-fetches */ }
    else if (page === 'vouchers') { /* Vouchers page self-fetches */ }
    else if (page === 'promotions') { /* Promotions page self-fetches */ }
    else if (page === 'auditlog') { /* Audit Log page self-fetches */ }
    else if (page === 'loyaltyrules') fetchLoyaltyTiers();
    else if (page === 'store') fetchAdminStores();
    return () => controller.abort();
  }, [page, token, selectedStore, dateRange, ordersPage, ordersStatus, ordersOrderType, ordersFromDate, ordersToDate, dashboardChartMode, fetchDashboardWithRange, fetchAdminStores, fetchInventory, fetchMenu, fetchOrders, fetchTables]);

  useEffect(() => {
    const onAuthExpired = () => handleLogout();
    window.addEventListener('merchant-auth-expired', onAuthExpired);
    return () => window.removeEventListener('merchant-auth-expired', onAuthExpired);
  }, [handleLogout]);

  if (!token) {
    return <LoginScreen onLogin={() => { setToken('cookie-auth'); }} />;
  }

  const storeObj = stores.find(s => s.id === Number(selectedStore));

  function handlePageChange(newPage: PageId) {
    setCustomerDetailId(null);
    if (typeof window !== 'undefined') {
      window.location.hash = newPage;
    }
    setPage(newPage);
    if (window.innerWidth <= 1024) {
      setSidebarOpen(false);
    }
  }

  const pageTitle: Record<PageId, string> = {
    dashboard: 'Dashboard',
    orders: 'Orders',
    kitchen: 'Order Station',
    menu: 'Menu Management',
    inventory: 'Inventory',
    tables: 'Tables',
    staff: 'Staff',
    rewards: 'Rewards',
    vouchers: 'Vouchers',
    promotions: 'Promotions',
    information: 'Information',
    feedback: 'Feedback',
    reports: 'Sales Reports',
    marketingreports: 'Marketing ROI',
    customers: 'Customers',
    notifications: 'Push Notifications',
    loyaltyrules: 'Loyalty Rules',
    auditlog: 'Audit Log',
    store: 'Store Settings',
    settings: 'App Settings',
    pwa: 'PWA Settings',
    walletTopup: 'Wallet Top-Up',
    posterminal: 'POS Terminal',

  };

  return (
    <ErrorBoundary>
    <div style={{ height: '100vh', display: 'flex', overflow: 'hidden', background: '#F5F7FA' }}>
      <Sidebar
        page={page}
        setPage={handlePageChange}
        collapsedGroups={collapsedGroups}
        setCollapsedGroups={setCollapsedGroups}
        stores={stores}
        selectedStore={selectedStore}
        onLogout={handleLogout}
        userType={currentUserType}
        isOpen={sidebarOpen}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <div className="admin-main-content">
        <header className="admin-header">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="mobile-menu-btn"
          >
            <i className="fas fa-bars" style={{ fontSize: 18 }}></i>
          </button>
          {customerDetailId ? (
            <div className="admin-header-left">
              <button className="btn btn-sm" onClick={() => window.history.back()}>
                <i className="fas fa-arrow-left"></i> Back to Customers
              </button>
              <div style={{ fontSize: 14, color: '#64748B' }}>Customer Detail</div>
            </div>
          ) : (
            <div style={{ fontSize: 24, fontWeight: 700, color: THEME.textPrimary, letterSpacing: -0.5 }}>{pageTitle[page]}</div>
          )}
          <div className="admin-header-actions">
            <div
              onClick={() => handlePageChange('notifications')}
              className="admin-bell-icon"
            >
              <i className="far fa-bell"></i>
              <span className="admin-bell-dot"></span>
            </div>

            <button className="btn" onClick={() => setShowChangePassword(true)}><i className="fas fa-key"></i></button>
            <button className="btn" onClick={handleLogout}><i className="fas fa-sign-out-alt"></i> Logout</button>
          </div>
        </header>

        <main className="admin-main">
          <ErrorBoundary>
            <div className="page-enter">
              {loading && <div style={{ textAlign: 'center', padding: 40, color: '#64748B' }}><i className="fas fa-spinner fa-spin"></i> Loading...</div>}

              {page === 'dashboard' && <DashboardPage dashboard={dashboard} loading={loading} selectedStore={selectedStore} stores={stores} onStoreChange={setSelectedStore} fromDate={dateRange.from} toDate={dateRange.to} onDateChange={handleDateRangeChange} chartMode={dashboardChartMode} />}

              {page === 'orders' && (
                <OrdersPage
                  orders={orders}
                  loading={loading}
                  token={token}
                  selectedStore={selectedStore}
                  stores={stores}
                  total={ordersTotal}
                  page={ordersPage}
                  pageSize={ordersPageSize}
                  status={ordersStatus}
                  orderType={ordersOrderType}
                  fromDate={ordersFromDate}
                  toDate={ordersToDate}
                  onUpdate={() => fetchOrders(selectedStore === 'all' ? undefined : selectedStore)}
                  onPageChange={setOrdersPage}
                  onStatusChange={setOrdersStatus}
                  onOrderTypeChange={setOrdersOrderType}
                  onStoreChange={setSelectedStore}
                  onDateChange={(from, to) => { setOrdersFromDate(from); setOrdersToDate(to); }}
                />
              )}

              {page === 'kitchen' && (
                <KitchenDisplayPage
                  token={token}
                  selectedStore={selectedStore}
                  stores={stores}
                  onStoreChange={setSelectedStore}
                />
              )}

              {page === 'menu' && (
                <MenuPage
                  categories={categories}
                  menuItems={menuItems}
                  selectedCategory={selectedCategory}
                  setSelectedCategory={setSelectedCategory}
                  selectedStore={selectedStore}
                  storeObj={storeObj}
                  token={token}
                  onRefresh={fetchMenu}
                  onCustomizeItem={(item) => setCustomizingItem(item)}
                  userType={currentUserType}
                />
              )}

              {page === 'inventory' && (
                <InventoryPage
                  inventory={inventory}
                  selectedStore={selectedStore}
                  storeObj={storeObj}
                  token={token}
                  onRefresh={fetchInventory}
                  userRole={currentUserRole}
                  userType={currentUserType}
                  stores={stores}
                  onStoreChange={setSelectedStore}
                />
              )}

              {page === 'tables' && (
                <TablesPage
                  tables={tables}
                  selectedStore={selectedStore}
                  storeObj={storeObj}
                  token={token}
                  onRefresh={fetchTables}
                  stores={stores}
                  onStoreChange={setSelectedStore}
                  onViewOrder={(_orderId: number) => {
                    setOrdersStatus('');
                    handlePageChange('orders');
                  }}
                />
              )}

              {page === 'staff' && (
                <StaffPage
                  selectedStore={selectedStore}
                  storeObj={storeObj}
                  token={token}
                  stores={stores}
                  onStoreChange={setSelectedStore}
                />
              )}

              {page === 'rewards' && (
                <RewardsPage token={token} />
              )}

              {page === 'vouchers' && (
              <VouchersPage token={token} />
            )}

            {page === 'promotions' && (
              <PromotionsPage token={token} />
            )}

            {page === 'information' && (
              <InformationPage token={token} />
            )}

            {page === 'feedback' && (
              <FeedbackPage token={token} selectedStore={selectedStore} />
            )}

            {page === 'reports' && (
              <SalesReportsPage token={token} stores={stores} />
            )}

            {page === 'marketingreports' && (
              <MarketingReportsPage token={token} stores={stores} />
            )}

            {page === 'customers' && (
              customerDetailId ? (
                <CustomerDetailPage token={token} customerId={customerDetailId} onBack={() => window.history.back()} />
              ) : (
                <CustomersPage token={token} stores={stores} selectedStore={selectedStore} onStoreChange={setSelectedStore} onEditCustomer={(id) => { window.history.pushState({customerDetailId: id}, '', '#customers'); setCustomerDetailId(id); }} />
              )
            )}

            {page === 'notifications' && (
              <NotificationsPage
                token={token}
                refreshKey={notifRefreshKey}
                onNewBroadcast={openBroadcastModal}
              />
            )}

            {page === 'auditlog' && (
              <AuditLogPage stores={stores} token={token} />
            )}

            {page === 'loyaltyrules' && (
              <LoyaltyRulesPage tiers={loyaltyTiers} token={token} onRefresh={fetchLoyaltyTiers} />
            )}

            {page === 'store' && (
              <StoreSettingsPage stores={stores} token={token} onRefresh={fetchAdminStores} />
            )}

            {page === 'settings' && (
              <SettingsPage token={token} />
            )}

            {page === 'pwa' && (
              <PWASettingsPage token={token} />
            )}

            {page === 'walletTopup' && (
              <WalletTopUpPage token={token} />
            )}

            {page === 'posterminal' && (
              <POSTerminalPage token={token} />
            )}
            </div>
          </ErrorBoundary>
        </main>
      </div>

      {sidebarOpen && typeof window !== 'undefined' && window.innerWidth <= 1024 && (
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      )}

      {showStoreModal && (
        <div className="modal-overlay" onClick={() => setShowStoreModal(false)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ marginBottom: 20 }}>Select Store</h3>
            <div style={{ marginBottom: 20 }}>
              <button
                className="btn"
                style={{ width: '100%', marginBottom: 8, justifyContent: 'center' }}
                onClick={() => { setSelectedStore('all'); setShowStoreModal(false); }}
              >
                All Stores (Global view)
              </button>
            </div>
            {stores.map(s => (
              <button
                key={s.id}
                className="btn"
                style={{ width: '100%', marginBottom: 8, justifyContent: 'center' }}
                onClick={() => { setSelectedStore(String(s.id)); setShowStoreModal(false); }}
              >
                {s.name} &middot; {s.address}
              </button>
            ))}
            <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 16 }} onClick={() => setShowStoreModal(false)}>Done</button>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3>{modalTitle}</h3>
              <button className="btn btn-sm" onClick={() => setShowModal(false)}><i className="fas fa-times"></i></button>
            </div>
            {modalContent}
          </div>
        </div>
      )}

      {/* Customize Item Modal */}
      {customizingItem && (
        <div className="modal-overlay" onClick={() => setCustomizingItem(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3>Customizations: {customizingItem.name}</h3>
              <button className="btn btn-sm" onClick={() => setCustomizingItem(null)}><i className="fas fa-times"></i></button>
            </div>
            <CustomizationManager storeId={0} item={customizingItem} token={token} onClose={() => { setCustomizingItem(null); fetchMenu(); }} />
          </div>
        </div>
      )}

      {/* Change Password Modal */}
      {showChangePassword && (
        <div className="modal-overlay" onClick={() => setShowChangePassword(false)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={e => e.stopPropagation()}>
            <ChangePasswordModal token={token} onClose={() => setShowChangePassword(false)} />
          </div>
        </div>
      )}
    </div>

    <MobileBottomNav page={page} setPage={handlePageChange} />
    </ErrorBoundary>
  );
}
