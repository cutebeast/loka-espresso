'use client';

import { useEffect } from 'react';
import dynamic from 'next/dynamic';
import type { PageId } from '@/lib/merchant-types';
import Sidebar from '@/components/Sidebar';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import AdminModals from '@/components/AdminModals';
import ToastContainer from '@/components/ui/Toast';
import MobileBottomNav from '@/components/MobileBottomNav';
import MobilePageGuard from '@/components/MobilePageGuard';
import AuthGuard from '@/components/AuthGuard';
import SkeletonPage from '@/components/SkeletonPage';
import { useAuthStore, useRouterStore, useUIStore, useMerchantDataStore } from '@/stores';
import DashboardPage from '@/components/pages/overview/DashboardPage';
const OrdersPage = dynamic(() => import('@/components/pages/overview/OrdersPage'), { ssr: false });

const MenuPage = dynamic(() => import('@/components/pages/store-ops/MenuPage'), { ssr: false });
const TablesPage = dynamic(() => import('@/components/pages/store-ops/TablesPage'), { ssr: false });
const KitchenDisplayPage = dynamic(() => import('@/components/pages/store-ops/KitchenDisplayPage'), { ssr: false });
const InventoryPage = dynamic(() => import('@/components/pages/store-ops/InventoryPage'), { ssr: false });
const StaffPage = dynamic(() => import('@/components/pages/store-ops/StaffPage'), { ssr: false });
const ShiftsPage = dynamic(() => import('@/components/pages/store-ops/ShiftsPage'), { ssr: false });
const RewardsPage = dynamic(() => import('@/components/pages/marketing/RewardsPage'), { ssr: false });
const VouchersPage = dynamic(() => import('@/components/pages/marketing/VouchersPage'), { ssr: false });
const CustomersPage = dynamic(() => import('@/components/pages/marketing/CustomersPage'), { ssr: false });
const SalesReportsPage = dynamic(() => import('@/components/pages/analytics/SalesReportsPage'), { ssr: false });
const MarketingReportsPage = dynamic(() => import('@/components/pages/analytics/MarketingReportsPage'), { ssr: false });
const SettingsPage = dynamic(() => import('@/components/pages/system/SettingsPage'), { ssr: false });
const AuditLogPage = dynamic(() => import('@/components/pages/system/AuditLogPage'), {ssr: false });
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

const PAGE_TITLES: Record<PageId, string> = {
  dashboard: 'Dashboard',
  orders: 'Orders',
  kitchen: 'Order Station',
  menu: 'Menu Management',
  inventory: 'Inventory',
  tables: 'Tables',
  staff: 'Staff',
  shifts: 'Shifts',
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

function PageRenderer({ page, loading, dashboard, orders, ordersTotal, tables, loyaltyTiers, stores, selectedStore, setSelectedStore, storeObj, customerDetailId, setCustomerDetailId, handlePageChange, setOrdersStatus, ordersPage, setOrdersPage, ordersPageSize, ordersStatus, ordersOrderType, setOrdersOrderType, ordersFromDate, ordersToDate, setOrdersFromDate, setOrdersToDate, dateRange, dashboardChartMode, fetchOrders, fetchTables, fetchLoyaltyTiers, fetchAdminStores, handleDateRangeChange, notifRefreshKey, openBroadcastModal }: any) {

  return (
    <>
      {loading && <SkeletonPage variant={page === 'orders' || page === 'auditlog' ? 'table' : page === 'dashboard' ? 'cards' : 'default'} />}

      {page === 'dashboard' && <DashboardPage dashboard={dashboard} loading={loading} selectedStore={selectedStore} stores={stores} onStoreChange={setSelectedStore} fromDate={dateRange.from} toDate={dateRange.to} onDateChange={handleDateRangeChange} chartMode={dashboardChartMode} />}

      {page === 'orders' && <OrdersPage orders={orders} loading={loading} selectedStore={selectedStore} stores={stores} total={ordersTotal} page={ordersPage} pageSize={ordersPageSize} status={ordersStatus} orderType={ordersOrderType} fromDate={ordersFromDate} toDate={ordersToDate} onUpdate={() => fetchOrders(selectedStore === 'all' ? undefined : selectedStore)} onPageChange={setOrdersPage} onStatusChange={setOrdersStatus} onOrderTypeChange={setOrdersOrderType} onStoreChange={setSelectedStore} onDateChange={(from: string, to: string) => { setOrdersFromDate(from); setOrdersToDate(to); }} />}

      {page === 'kitchen' && <KitchenDisplayPage selectedStore={selectedStore} stores={stores} onStoreChange={setSelectedStore} />}

      {page === 'menu' && <MenuPage />}

      {page === 'inventory' && <InventoryPage />}

      {page === 'tables' && <TablesPage tables={tables} selectedStore={selectedStore} storeObj={storeObj} onRefresh={fetchTables} stores={stores} onStoreChange={setSelectedStore} onViewOrder={() => { setOrdersStatus(''); handlePageChange('orders'); }} />}

      {page === 'staff' && <ErrorBoundary><StaffPage /></ErrorBoundary>}
      {page === 'shifts' && <ShiftsPage />}

      {page === 'rewards' && <RewardsPage />}
      {page === 'vouchers' && <VouchersPage />}
      {page === 'promotions' && <PromotionsPage />}
      {page === 'information' && <InformationPage />}
      {page === 'feedback' && <FeedbackPage selectedStore={selectedStore} />}
      {page === 'reports' && <SalesReportsPage stores={stores} />}
      {page === 'marketingreports' && <MarketingReportsPage stores={stores} />}

      {page === 'customers' && (customerDetailId
        ? <CustomerDetailPage customerId={customerDetailId} onBack={() => window.history.back()} />
        : <CustomersPage stores={stores} selectedStore={selectedStore} onStoreChange={setSelectedStore} onEditCustomer={(id: number) => { window.history.pushState({ customerDetailId: id }, '', '#customers'); setCustomerDetailId(id); }} />
      )}

      {page === 'notifications' && <NotificationsPage refreshKey={notifRefreshKey} onNewBroadcast={openBroadcastModal} />}
      {page === 'auditlog' && <AuditLogPage stores={stores} />}
      {page === 'loyaltyrules' && <LoyaltyRulesPage tiers={loyaltyTiers} onRefresh={fetchLoyaltyTiers} />}
      {page === 'store' && <StoreSettingsPage stores={stores} onRefresh={fetchAdminStores} />}
      {page === 'settings' && <SettingsPage />}
      {page === 'pwa' && <PWASettingsPage />}
      {page === 'walletTopup' && <WalletTopUpPage />}
      {page === 'posterminal' && <POSTerminalPage />}
    </>
  );
}

export default function MerchantDashboard() {
  const token = useAuthStore((s) => s.token);
  const setToken = useAuthStore((s) => s.setToken);
  const currentUserRole = useAuthStore((s) => s.currentUserRole);
  const currentUserType = useAuthStore((s) => s.currentUserType);
  const handleLogout = useAuthStore((s) => s.handleLogout);
  const fetchUserRole = useAuthStore((s) => s.fetchUserRole);

  const page = useRouterStore((s) => s.page);
  const customerDetailId = useRouterStore((s) => s.customerDetailId);
  const setCustomerDetailId = useRouterStore((s) => s.setCustomerDetailId);
  const baseHandlePageChange = useRouterStore((s) => s.handlePageChange);

  const collapsedGroups = useUIStore((s) => s.collapsedGroups);
  const setCollapsedGroups = useUIStore((s) => s.setCollapsedGroups);
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const setSidebarCollapsed = useUIStore((s) => s.setSidebarCollapsed);
  const setShowChangePassword = useUIStore((s) => s.setShowChangePassword);
  const setShowProfile = useUIStore((s) => s.setShowProfile);
  const notifRefreshKey = useUIStore((s) => s.notifRefreshKey);
  const setCustomizingItem = useUIStore((s) => s.setCustomizingItem);
  const openBroadcastModal = useUIStore((s) => s.openBroadcastModal);

  const stores = useMerchantDataStore((s) => s.stores);
  const selectedStore = useMerchantDataStore((s) => s.selectedStore);
  const setSelectedStore = useMerchantDataStore((s) => s.setSelectedStore);
  const ordersPage = useMerchantDataStore((s) => s.ordersPage);
  const setOrdersPage = useMerchantDataStore((s) => s.setOrdersPage);
  const ordersPageSize = useMerchantDataStore((s) => s.ordersPageSize);
  const ordersStatus = useMerchantDataStore((s) => s.ordersStatus);
  const setOrdersStatus = useMerchantDataStore((s) => s.setOrdersStatus);
  const ordersOrderType = useMerchantDataStore((s) => s.ordersOrderType);
  const setOrdersOrderType = useMerchantDataStore((s) => s.setOrdersOrderType);
  const ordersFromDate = useMerchantDataStore((s) => s.ordersFromDate);
  const setOrdersFromDate = useMerchantDataStore((s) => s.setOrdersFromDate);
  const ordersToDate = useMerchantDataStore((s) => s.ordersToDate);
  const setOrdersToDate = useMerchantDataStore((s) => s.setOrdersToDate);
  const dateRange = useMerchantDataStore((s) => s.dateRange);
  const dashboardChartMode = useMerchantDataStore((s) => s.dashboardChartMode);
  const fetchStores = useMerchantDataStore((s) => s.fetchStores);
  const fetchAdminStores = useMerchantDataStore((s) => s.fetchAdminStores);
  const fetchDashboardWithRange = useMerchantDataStore((s) => s.fetchDashboardWithRange);
  const fetchOrders = useMerchantDataStore((s) => s.fetchOrders);
  const fetchMenu = useMerchantDataStore((s) => s.fetchMenu);
  const fetchInventory = useMerchantDataStore((s) => s.fetchInventory);
  const fetchTables = useMerchantDataStore((s) => s.fetchTables);
  const fetchLoyaltyTiers = useMerchantDataStore((s) => s.fetchLoyaltyTiers);
  const handleDateRangeChange = useMerchantDataStore((s) => s.handleDateRangeChange);

  const loading = useMerchantDataStore((s) => s.loading);
  const dashboard = useMerchantDataStore((s) => s.dashboard);
  const orders = useMerchantDataStore((s) => s.orders);
  const ordersTotal = useMerchantDataStore((s) => s.ordersTotal);
  const tables = useMerchantDataStore((s) => s.tables);
  const loyaltyTiers = useMerchantDataStore((s) => s.loyaltyTiers);

  function handlePageChange(newPage: PageId) {
    baseHandlePageChange(newPage);
    if (window.innerWidth <= 1024) setSidebarOpen(false);
  }

  useEffect(() => {
    if (!token) return;
    const abortCtrl = new AbortController();
    fetchStores(abortCtrl.signal);
    fetchUserRole();
    return () => abortCtrl.abort();
  }, [token, fetchStores, fetchUserRole]);

  const storeId = selectedStore === 'all' ? '' : selectedStore;

  // Per-page data fetching — each effect only runs when its page is active
  useEffect(() => {
    if (!token || page !== 'dashboard') return;
    const abortCtrl = new AbortController();
    fetchDashboardWithRange(storeId, dateRange.from, dateRange.to, dashboardChartMode, abortCtrl.signal);
    return () => abortCtrl.abort();
  }, [page, token, storeId, dateRange, dashboardChartMode, fetchDashboardWithRange]);

  useEffect(() => {
    if (!token || page !== 'orders') return;
    const abortCtrl = new AbortController();
    fetchOrders(storeId, abortCtrl.signal);
    return () => abortCtrl.abort();
  }, [page, token, storeId, ordersPage, ordersStatus, ordersOrderType, ordersFromDate, ordersToDate, fetchOrders]);

  useEffect(() => {
    if (!token || page !== 'menu') return;
    const abortCtrl = new AbortController();
    fetchMenu(abortCtrl.signal);
    return () => abortCtrl.abort();
  }, [page, token, fetchMenu]);

  useEffect(() => {
    if (!token || page !== 'inventory') return;
    const abortCtrl = new AbortController();
    fetchInventory(abortCtrl.signal);
    return () => abortCtrl.abort();
  }, [page, token, storeId, fetchInventory]);

  useEffect(() => {
    if (!token || page !== 'tables') return;
    const abortCtrl = new AbortController();
    fetchTables(abortCtrl.signal);
    return () => abortCtrl.abort();
  }, [page, token, storeId, fetchTables]);

  useEffect(() => {
    if (!token || page !== 'loyaltyrules') return;
    const abortCtrl = new AbortController();
    fetchLoyaltyTiers(abortCtrl.signal);
    return () => abortCtrl.abort();
  }, [page, token, fetchLoyaltyTiers]);

  useEffect(() => {
    if (!token || page !== 'store') return;
    const abortCtrl = new AbortController();
    fetchAdminStores(abortCtrl.signal);
    return () => abortCtrl.abort();
  }, [page, token, fetchAdminStores]);

  const storeObj = stores.find((s: any) => s.id === Number(selectedStore));

  return (
    <ErrorBoundary>
    <AuthGuard token={token} onLogin={() => { setToken('cookie-auth'); }}>
    <div className="md-0">
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

      <div className={`admin-main-content ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <header className="admin-header">
          {customerDetailId ? (
            <div className="admin-header-left">
              <button className="btn btn-sm" onClick={() => window.history.back()}><i className="fas fa-arrow-left"></i> Back to Customers</button>
              <div className="md-2">Customer Detail</div>
            </div>
          ) : (
            <div className="page-title">{PAGE_TITLES[page]}</div>
          )}
          <div className="admin-header-actions">
            <button className="btn header-icon-btn" onClick={() => setShowProfile(true)} title="Profile"><i className="fas fa-user-circle"></i></button>
            <button className="btn header-icon-btn" onClick={() => setShowChangePassword(true)} title="Change Password"><i className="fas fa-key"></i></button>
            <button className="btn header-icon-btn" onClick={handleLogout} title="Logout"><i className="fas fa-sign-out-alt"></i></button>
          </div>
        </header>

        <main className="admin-main">
          <ErrorBoundary>
            <div className="page-enter">
              <MobilePageGuard page={page}>
              <PageRenderer
                page={page}
                loading={loading}
                dashboard={dashboard}
                orders={orders}
                ordersTotal={ordersTotal}
                tables={tables}
                loyaltyTiers={loyaltyTiers}
                stores={stores}
                selectedStore={selectedStore}
                setSelectedStore={setSelectedStore}
                storeObj={storeObj}
                customerDetailId={customerDetailId}
                setCustomerDetailId={setCustomerDetailId}
                handlePageChange={handlePageChange}
                setOrdersStatus={setOrdersStatus}
                ordersPage={ordersPage}
                setOrdersPage={setOrdersPage}
                ordersPageSize={ordersPageSize}
                ordersStatus={ordersStatus}
                ordersOrderType={ordersOrderType}
                setOrdersOrderType={setOrdersOrderType}
                ordersFromDate={ordersFromDate}
                ordersToDate={ordersToDate}
                setOrdersFromDate={setOrdersFromDate}
                setOrdersToDate={setOrdersToDate}
                dateRange={dateRange}
                dashboardChartMode={dashboardChartMode}
                fetchOrders={fetchOrders}
                fetchMenu={fetchMenu}
                fetchInventory={fetchInventory}
                fetchTables={fetchTables}
                fetchLoyaltyTiers={fetchLoyaltyTiers}
                fetchAdminStores={fetchAdminStores}
                handleDateRangeChange={handleDateRangeChange}
                notifRefreshKey={notifRefreshKey}
                openBroadcastModal={openBroadcastModal}
                setCustomizingItem={setCustomizingItem}
                currentUserRole={currentUserRole}
                currentUserType={currentUserType}
              />
              </MobilePageGuard>
            </div>
          </ErrorBoundary>
        </main>
      </div>

      {sidebarOpen && typeof window !== 'undefined' && window.innerWidth <= 1024 && (
        <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />
      )}

      <ToastContainer />
      <AdminModals />
    </div>

    <MobileBottomNav page={page} setPage={handlePageChange} />
    </AuthGuard>
    </ErrorBoundary>
  );
}
