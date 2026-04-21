'use client';

import { useState, useEffect, useCallback } from 'react';
import React from 'react';
import dynamic from 'next/dynamic';
import { apiFetch, clearMerchantTokens } from '@/lib/merchant-api';
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
  MerchantReward,
  MerchantVoucher,
  MerchantBanner,
  MerchantAuditEntry,
  MerchantLoyaltyTier,
} from '@/lib/merchant-types';
import LoginScreen from '@/components/LoginScreen';
import Sidebar from '@/components/Sidebar';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  AddBroadcastForm,
  AddCustomizationForm,
} from '@/components/Modals';
import DashboardPage from '@/components/pages/overview/DashboardPage';
import OrdersPage from '@/components/pages/overview/OrdersPage';

const MenuPage = dynamic(() => import('@/components/pages/store-ops/MenuPage'), { ssr: false });
const TablesPage = dynamic(() => import('@/components/pages/store-ops/TablesPage'), { ssr: false });
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
const FeedbackPage = dynamic(() => import('@/components/pages/marketing/FeedbackPage'), { ssr: false });
const PWASettingsPage = dynamic(() => import('@/components/pages/system/PWASettingsPage'), { ssr: false });

export default function MerchantDashboard() {
  const [token, setToken] = useState('');
  const [refreshToken, setRefreshToken] = useState('');
  const [currentUserRole, setCurrentUserRole] = useState('Admin');
  const [currentUserType, setCurrentUserType] = useState<number>(1);
  const [page, setPage] = useState<PageId>('dashboard');
  const [selectedStore, setSelectedStore] = useState<string>('all');
  const [stores, setStores] = useState<MerchantStore[]>([]);
  const [showStoreModal, setShowStoreModal] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalContent, setModalContent] = useState<React.ReactNode>(null);
  const [modalTitle, setModalTitle] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);

  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const urlCustomerId = searchParams.get('customerId');
  const urlPage = searchParams.get('page');
  const [customerDetailId, setCustomerDetailId] = useState<number | null>(urlCustomerId ? parseInt(urlCustomerId) : null);

  const [dashboard, setDashboard] = useState<MerchantDashboardData | null>(null);
  const [orders, setOrders] = useState<MerchantOrder[]>([]);
  const [ordersTotal, setOrdersTotal] = useState(0);
  const [ordersPage, setOrdersPage] = useState(1);
  const [ordersPageSize] = useState(50);
  const [ordersStatus, setOrdersStatus] = useState<string>('');
  const [categories, setCategories] = useState<MerchantCategory[]>([]);
  const [menuItems, setMenuItems] = useState<MerchantMenuItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [tables, setTables] = useState<MerchantTableItem[]>([]);
  const [inventory, setInventory] = useState<MerchantInventoryItem[]>([]);
  const [rewards, setRewards] = useState<MerchantReward[]>([]);
  const [vouchers, setVouchers] = useState<MerchantVoucher[]>([]);
  const [banners, setBanners] = useState<MerchantBanner[]>([]);
  const [auditLog, setAuditLog] = useState<MerchantAuditEntry[]>([]);
  const [loyaltyTiers, setLoyaltyTiers] = useState<MerchantLoyaltyTier[]>([]);
  const [loading, setLoading] = useState(false);
  const [notifRefreshKey, setNotifRefreshKey] = useState(0);
  const [customizingItem, setCustomizingItem] = useState<MerchantMenuItem | null>(null);
  
  // Helper to get default MTD date range
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

  useEffect(() => {
    const saved = localStorage.getItem('fnb_token');
    const savedRefresh = localStorage.getItem('fnb_refresh_token');
    if (saved) setToken(saved);
    if (savedRefresh) setRefreshToken(savedRefresh);
  }, []);

  useEffect(() => {
    if (token) {
      localStorage.setItem('fnb_token', token);
      if (refreshToken) localStorage.setItem('fnb_refresh_token', refreshToken);
      fetchStores();
      fetchUserRole();
    }
  }, [token, refreshToken]);

  // Mobile sidebar toggle handling
  useEffect(() => {
    function handleResize() {
      const mobileBtn = document.querySelector('.mobile-menu-btn') as HTMLElement;
      if (mobileBtn) {
        mobileBtn.style.display = window.innerWidth <= 768 ? 'flex' : 'none';
      }
    }
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const fetchStores = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch('/stores', token);
      if (res.ok) {
        const data = await res.json();
        setStores(Array.isArray(data) ? data : (data.stores || []));
      }
    } catch (err) { console.error('Failed to fetch stores:', err); }
  }, [token]);

  async function fetchAdminStores() {
    if (!token) return;
    try {
      const res = await apiFetch('/admin/stores', token);
      if (res.ok) {
        const data = await res.json();
        setStores(Array.isArray(data) ? data : (data.stores || []));
      }
    } catch (err) { console.error('Failed to fetch admin stores:', err); }
  }

  async function fetchUserRole() {
    if (!token) return;
    try {
      const res = await apiFetch('/users/me', token);
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
  }

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    const storeId = selectedStore === 'all' ? '' : selectedStore;
    if (page === 'dashboard') fetchDashboardWithRange(storeId, dateRange.from, dateRange.to, dashboardChartMode);
    else if (page === 'orders') fetchOrders(storeId);
    else if (page === 'menu') fetchMenu();
    else if (page === 'inventory') fetchInventory();
    else if (page === 'tables') fetchTables();
    else if (page === 'staff') { /* Staff page now self-fetches */ }
      else if (page === 'rewards') fetchRewards();
     else if (page === 'vouchers') fetchVouchers();
     else if (page === 'promotions') fetchBanners();
     else if (page === 'auditlog') fetchAuditLog();
    else if (page === 'loyaltyrules') fetchLoyaltyTiers();
    else if (page === 'store') fetchAdminStores();
    return () => controller.abort();
  }, [page, token, selectedStore, dateRange, ordersPage, ordersStatus, ordersFromDate, ordersToDate]);

  function handleLogout() {
    setToken('');
    setRefreshToken('');
    clearMerchantTokens();
    setPage('dashboard');
    setSelectedStore('all');
    setDateRange({ from: '', to: '' });
  }

  useEffect(() => {
    const onAuthExpired = () => handleLogout();
    window.addEventListener('merchant-auth-expired', onAuthExpired);
    return () => window.removeEventListener('merchant-auth-expired', onAuthExpired);
  }, []);

  const [dashboardChartMode, setDashboardChartMode] = useState<string>('');

  function handleDateRangeChange(from: string, to: string, chartMode?: string) {
    setDateRange({ from, to });
    if (chartMode) setDashboardChartMode(chartMode);
  }

  async function fetchDashboardWithRange(storeId: string | undefined, from: string, to: string, chartMode?: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (storeId) params.append('store_id', storeId);
      if (from) params.append('from_date', from + 'T00:00:00');
      if (to) params.append('to_date', to + 'T23:59:59');
      if (chartMode) params.append('chart_mode', chartMode);
      const queryString = params.toString() ? `?${params.toString()}` : '';
      const res = await apiFetch(`/admin/dashboard${queryString}`, token);
      if (res.ok) setDashboard(await res.json());
    } catch (err) { console.error('Failed to fetch dashboard:', err); } finally { setLoading(false); }
  }

  async function fetchDashboard(storeId?: string, chartMode?: string) {
    // Use current dateRange state
    fetchDashboardWithRange(storeId, dateRange.from, dateRange.to, chartMode);
  }

  async function fetchOrders(storeId?: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', String(ordersPage));
      params.append('page_size', String(ordersPageSize));
      if (storeId) params.append('store_id', storeId);
      if (ordersStatus) params.append('status', ordersStatus);
      if (ordersFromDate) params.append('from_date', ordersFromDate + 'T00:00:00');
      if (ordersToDate) params.append('to_date', ordersToDate + 'T23:59:59');
      const res = await apiFetch(`/admin/orders?${params.toString()}`, token);
      if (res.ok) {
        const data = await res.json();
        setOrders(Array.isArray(data) ? data : (data.orders || []));
        setOrdersTotal(data.total || 0);
      }
    } catch (err) { console.error('Failed to fetch orders:', err); } finally { setLoading(false); }
  }

  async function fetchMenu() {
    setLoading(true);
    try {
      const [catRes, itemRes] = await Promise.all([
        apiFetch(`/stores/0/categories`, token),
        apiFetch(`/stores/0/items`, token),
      ]);
      if (catRes.ok) {
        const cats = await catRes.json();
        setCategories(cats);
        if (cats.length > 0 && !selectedCategory) setSelectedCategory(cats[0].id);
      }
      if (itemRes.ok) {
        const items = await itemRes.json();
        setMenuItems(items);
      }
    } catch (err) { console.error('Failed to fetch menu:', err); } finally { setLoading(false); }
  }

  async function fetchInventory() {
    if (selectedStore === 'all') return;
    setLoading(true);
    try {
      const res = await apiFetch(`/stores/${selectedStore}/inventory`, token);
      if (res.ok) setInventory(await res.json());
    } catch (err) { console.error('Failed to fetch inventory:', err); } finally { setLoading(false); }
  }

  async function fetchTables() {
    if (selectedStore === 'all') return;
    setLoading(true);
    try {
      const res = await apiFetch(`/stores/${selectedStore}/tables`, token);
      if (res.ok) setTables(await res.json());
    } catch (err) { console.error('Failed to fetch tables:', err); } finally { setLoading(false); }
  }

  async function fetchRewards() {
    // Rewards page now self-fetches with pagination
  }

  async function fetchVouchers() {
    // Vouchers page now self-fetches with pagination
  }

  async function fetchBanners() {
    // Promotions page now self-fetches with pagination
  }

  async function fetchAuditLog() {
    // Audit Log page now self-fetches with pagination
  }

  async function fetchLoyaltyTiers() {
    setLoading(true);
    try {
      const res = await apiFetch('/admin/loyalty-tiers', token);
      if (res.ok) {
        const data = await res.json();
        setLoyaltyTiers(Array.isArray(data) ? data : (data.tiers || []));
      }
    } catch (err) { console.error('Failed to fetch loyalty tiers:', err); } finally { setLoading(false); }
  }

  function openBroadcastModal() {
    setModalTitle('New Broadcast');
    setModalContent(<AddBroadcastForm token={token} onClose={() => { setShowModal(false); setNotifRefreshKey(k => k + 1); }} />);
    setShowModal(true);
  }

  if (!token) {
    return <LoginScreen onLogin={(nextToken, nextRefreshToken) => { setToken(nextToken); setRefreshToken(nextRefreshToken || ''); }} />;
  }

  const storeObj = stores.find(s => s.id === Number(selectedStore));

  function handlePageChange(newPage: PageId) {
    setCustomerDetailId(null);
    setPage(newPage);
  }

  const pageTitle: Record<PageId, string> = {
    dashboard: 'Dashboard',
    orders: 'Orders',
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
    customerDetail: 'Customer Profile',
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

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', marginLeft: sidebarCollapsed ? 70 : 260 }}>
        <header style={{ background: 'white', padding: '12px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #E9ECF2', boxShadow: '0 2px 6px rgba(0,0,0,0.01)' }}>
          {/* Mobile hamburger menu */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{
              display: 'none',
              width: 40,
              height: 40,
              borderRadius: 10,
              border: '1px solid #e2e8f0',
              background: 'white',
              color: '#64748b',
              cursor: 'pointer',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            className="mobile-menu-btn"
          >
            <i className="fas fa-bars" style={{ fontSize: 18 }}></i>
          </button>
          {customerDetailId ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button className="btn btn-sm" onClick={() => { setCustomerDetailId(null); window.history.pushState({}, '', window.location.pathname); }}>
                <i className="fas fa-arrow-left"></i> Back to Customers
              </button>
              <div style={{ fontSize: 14, color: '#64748B' }}>Customer Detail</div>
            </div>
          ) : (
            <div style={{ fontSize: 24, fontWeight: 700, color: THEME.textPrimary, letterSpacing: -0.5 }}>{pageTitle[page]}</div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <div
              onClick={() => setPage('notifications')}
              style={{ position: 'relative', fontSize: 20, color: '#475569', cursor: 'pointer' }}
            >
              <i className="far fa-bell"></i>
              <span style={{ position: 'absolute', top: -2, right: -2, width: 10, height: 10, background: '#EF4444', border: '2px solid white', borderRadius: '50%' }}></span>
            </div>

            <button className="btn" onClick={() => setShowChangePassword(true)}><i className="fas fa-key"></i></button>
            <button className="btn" onClick={handleLogout}><i className="fas fa-sign-out-alt"></i> Logout</button>
          </div>
        </header>

        <main style={{ flex: 1, padding: '28px 32px', overflowY: 'auto' }}>
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
                  fromDate={ordersFromDate}
                  toDate={ordersToDate}
                  onUpdate={() => fetchOrders(selectedStore === 'all' ? undefined : selectedStore)}
                  onPageChange={setOrdersPage}
                  onStatusChange={setOrdersStatus}
                  onStoreChange={setSelectedStore}
                  onDateChange={(from, to) => { setOrdersFromDate(from); setOrdersToDate(to); }}
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
                <CustomerDetailPage token={token} customerId={customerDetailId} onBack={() => { setCustomerDetailId(null); window.history.pushState({}, '', window.location.pathname); }} />
              ) : (
                <CustomersPage token={token} stores={stores} selectedStore={selectedStore} onStoreChange={setSelectedStore} onEditCustomer={(id) => { setCustomerDetailId(id); window.history.pushState({}, '', `?page=customers&customerId=${id}`); }} />
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
            </div>
          </ErrorBoundary>
        </main>
      </div>

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
    </ErrorBoundary>
  );
}

// --- Change Password Modal ---
function ChangePasswordModal({ token, onClose }: { token: string; onClose: () => void }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch('/auth/change-password', token, {
        method: 'POST',
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || 'Failed to change password');
        return;
      }
      setSuccess(true);
    } catch (err) { console.error('Password change failed:', err); setError('Network error'); }
    finally { setSaving(false); }
  }

  if (success) {
    return (
      <div style={{ textAlign: 'center', padding: 20 }}>
        <i className="fas fa-check-circle" style={{ fontSize: 40, color: '#059669', marginBottom: 16 }}></i>
        <h4>Password changed successfully</h4>
        <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={onClose}>Done</button>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ margin: 0 }}>Change Password</h3>
        <button className="btn btn-sm" onClick={onClose}><i className="fas fa-times"></i></button>
      </div>
      {error && (
        <div style={{ background: '#FEF2F2', color: '#991B1B', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          <i className="fas fa-exclamation-circle"></i> {error}
        </div>
      )}
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Current Password *</label>
          <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>New Password *</label>
          <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} />
          <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>Minimum 6 characters</div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Confirm New Password *</label>
          <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
        </div>
        <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={saving}>
          {saving ? 'Changing...' : 'Change Password'}
        </button>
      </form>
    </>
  );
}

// --- Customization Manager per Item ---
function CustomizationManager({ storeId, item, token, onClose }: { storeId: number; item: MerchantMenuItem; token: string; onClose: () => void }) {
  const [options, setOptions] = useState<Array<{ id: number; name: string; price_adjustment: number; is_active: boolean }>>([]);
  const [loading, setLoading] = useState(true);

  async function loadOptions() {
    setLoading(true);
    try {
      const res = await apiFetch(`/admin/stores/${storeId}/items/${item.id}/customizations`, token);
      if (res.ok) setOptions(await res.json());
    } catch (err) { console.error('Failed to fetch customizations:', err); } finally { setLoading(false); }
  }

  React.useEffect(() => { loadOptions(); }, [item.id]);

  async function deleteOption(optId: number) {
    await apiFetch(`/admin/stores/${storeId}/customizations/${optId}`, token, { method: 'DELETE' });
    loadOptions();
  }

  return (
    <div>
      <AddCustomizationForm storeId={storeId} itemId={item.id} token={token} onClose={loadOptions} />
      <div style={{ marginTop: 20, borderTop: '1px solid #EDF2F8', paddingTop: 16 }}>
        <h4 style={{ marginBottom: 12 }}>Current Options ({options.length})</h4>
        {loading ? <div style={{ color: '#64748B' }}>Loading...</div> : options.length === 0 ? (
          <div style={{ color: '#94A3B8', textAlign: 'center', padding: 20 }}>No customization options yet</div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {options.map(opt => (
              <div key={opt.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#F8FAFC', borderRadius: 10 }}>
                <div>
                  <span style={{ fontWeight: 500 }}>{opt.name}</span>
                  {opt.price_adjustment > 0 && <span style={{ marginLeft: 8, color: '#059669', fontWeight: 600 }}>+RM {opt.price_adjustment.toFixed(2)}</span>}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className={`badge ${opt.is_active ? 'badge-green' : 'badge-gray'}`}>{opt.is_active ? 'Active' : 'Inactive'}</span>
                  <button className="btn btn-sm" style={{ color: '#EF4444' }} onClick={() => deleteOption(opt.id)}><i className="fas fa-trash"></i></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn" onClick={onClose}>Done</button>
      </div>
    </div>
  );
}
