'use client';

import { useState, useEffect } from 'react';
import React from 'react';
import dynamic from 'next/dynamic';
import type { PageId, MerchantMenuItem } from '@/lib/merchant-types';
import Sidebar from '@/components/Sidebar';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import ChangePasswordModal from '@/components/ChangePasswordModal';
import ProfileUpdateModal from '@/components/ProfileUpdateModal';
import CustomizationManager from '@/components/CustomizationManager';
import MobileBottomNav from '@/components/MobileBottomNav';
import MobilePageGuard from '@/components/MobilePageGuard';
import AuthGuard from '@/components/AuthGuard';
import SkeletonPage from '@/components/SkeletonPage';
import { useAuth } from '@/hooks/useAuth';
import { useHashRouter } from '@/hooks/useHashRouter';
import { useMerchantData } from '@/hooks/useMerchantData';
import DashboardPage from '@/components/pages/overview/DashboardPage';
const OrdersPage = dynamic(() => import('@/components/pages/overview/OrdersPage'), { ssr: false });

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

function PageRenderer({ page, token, data, stores, selectedStore, setSelectedStore, storeObj, customerDetailId, setCustomerDetailId, handlePageChange, setOrdersStatus, ordersPage, setOrdersPage, ordersPageSize, ordersStatus, ordersOrderType, setOrdersOrderType, ordersFromDate, ordersToDate, setOrdersFromDate, setOrdersToDate, dateRange, dashboardChartMode, fetchOrders, fetchMenu, fetchInventory, fetchTables, fetchLoyaltyTiers, fetchAdminStores, handleDateRangeChange, notifRefreshKey, openBroadcastModal, setCustomizingItem, currentUserRole, currentUserType }: any) {
  const { loading, dashboard, orders, ordersTotal, categories, menuItems, selectedCategory, setSelectedCategory, tables, inventory, loyaltyTiers } = data;

  return (
    <>
      {loading && <SkeletonPage variant={page === 'orders' || page === 'auditlog' ? 'table' : page === 'dashboard' ? 'cards' : 'default'} />}

      {page === 'dashboard' && <DashboardPage dashboard={dashboard} loading={loading} selectedStore={selectedStore} stores={stores} onStoreChange={setSelectedStore} fromDate={dateRange.from} toDate={dateRange.to} onDateChange={handleDateRangeChange} chartMode={dashboardChartMode} />}

      {page === 'orders' && <OrdersPage orders={orders} loading={loading} token={token} selectedStore={selectedStore} stores={stores} total={ordersTotal} page={ordersPage} pageSize={ordersPageSize} status={ordersStatus} orderType={ordersOrderType} fromDate={ordersFromDate} toDate={ordersToDate} onUpdate={() => fetchOrders(selectedStore === 'all' ? undefined : selectedStore)} onPageChange={setOrdersPage} onStatusChange={setOrdersStatus} onOrderTypeChange={setOrdersOrderType} onStoreChange={setSelectedStore} onDateChange={(from, to) => { setOrdersFromDate(from); setOrdersToDate(to); }} />}

      {page === 'kitchen' && <KitchenDisplayPage token={token} selectedStore={selectedStore} stores={stores} onStoreChange={setSelectedStore} />}

      {page === 'menu' && <MenuPage categories={categories} menuItems={menuItems} selectedCategory={selectedCategory} setSelectedCategory={setSelectedCategory} selectedStore={selectedStore} storeObj={storeObj} token={token} onRefresh={fetchMenu} onCustomizeItem={(item) => setCustomizingItem(item)} userType={currentUserType} />}

      {page === 'inventory' && <InventoryPage inventory={inventory} selectedStore={selectedStore} storeObj={storeObj} token={token} onRefresh={fetchInventory} userRole={currentUserRole} userType={currentUserType} stores={stores} onStoreChange={setSelectedStore} />}

      {page === 'tables' && <TablesPage tables={tables} selectedStore={selectedStore} storeObj={storeObj} token={token} onRefresh={fetchTables} stores={stores} onStoreChange={setSelectedStore} onViewOrder={() => { setOrdersStatus(''); handlePageChange('orders'); }} />}

      {page === 'staff' && <StaffPage selectedStore={selectedStore} storeObj={storeObj} token={token} stores={stores} onStoreChange={setSelectedStore} />}

      {page === 'rewards' && <RewardsPage token={token} />}
      {page === 'vouchers' && <VouchersPage token={token} />}
      {page === 'promotions' && <PromotionsPage token={token} />}
      {page === 'information' && <InformationPage token={token} />}
      {page === 'feedback' && <FeedbackPage token={token} selectedStore={selectedStore} />}
      {page === 'reports' && <SalesReportsPage token={token} stores={stores} />}
      {page === 'marketingreports' && <MarketingReportsPage token={token} stores={stores} />}

      {page === 'customers' && (customerDetailId
        ? <CustomerDetailPage token={token} customerId={customerDetailId} onBack={() => window.history.back()} />
        : <CustomersPage token={token} stores={stores} selectedStore={selectedStore} onStoreChange={setSelectedStore} onEditCustomer={(id) => { window.history.pushState({ customerDetailId: id }, '', '#customers'); setCustomerDetailId(id); }} />
      )}

      {page === 'notifications' && <NotificationsPage token={token} refreshKey={notifRefreshKey} onNewBroadcast={openBroadcastModal} />}
      {page === 'auditlog' && <AuditLogPage stores={stores} token={token} />}
      {page === 'loyaltyrules' && <LoyaltyRulesPage tiers={loyaltyTiers} token={token} onRefresh={fetchLoyaltyTiers} />}
      {page === 'store' && <StoreSettingsPage stores={stores} token={token} onRefresh={fetchAdminStores} />}
      {page === 'settings' && <SettingsPage token={token} />}
      {page === 'pwa' && <PWASettingsPage token={token} />}
      {page === 'walletTopup' && <WalletTopUpPage token={token} />}
      {page === 'posterminal' && <POSTerminalPage token={token} />}
    </>
  );
}

function AdminModals({ showModal, setShowModal, modalTitle, modalContent, showChangePassword, setShowChangePassword, showProfile, setShowProfile, showStoreModal, setShowStoreModal, stores, selectedStore, setSelectedStore, customizingItem, setCustomizingItem, token, fetchMenu, currentUserName, currentUserPhone, currentUserEmail, setCurrentUserName, setCurrentUserPhone }: any) {
  return (
    <>
      {showStoreModal && (
        <div className="modal-overlay" onClick={() => setShowStoreModal(false)}>
          <div className="modal md-4" onClick={e => e.stopPropagation()}>
            <h3 className="md-5">Select Store</h3>
            <div className="md-6">
              <button className="btn md-7" onClick={() => { setSelectedStore('all'); setShowStoreModal(false); }}>All Stores (Global view)</button>
            </div>
            {stores.map((s: any) => (
              <button key={s.id} className="btn md-8" onClick={() => { setSelectedStore(String(s.id)); setShowStoreModal(false); }}>{s.name} &middot; {s.address}</button>
            ))}
            <button className="btn btn-primary md-9" onClick={() => setShowStoreModal(false)}>Done</button>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="md-10">
              <h3>{modalTitle}</h3>
              <button className="btn btn-sm" onClick={() => setShowModal(false)}><i className="fas fa-times"></i></button>
            </div>
            {modalContent}
          </div>
        </div>
      )}

      {customizingItem && (
        <div className="modal-overlay" onClick={() => setCustomizingItem(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="md-11">
              <h3>Customizations: {customizingItem.name}</h3>
              <button className="btn btn-sm" onClick={() => setCustomizingItem(null)}><i className="fas fa-times"></i></button>
            </div>
            <CustomizationManager storeId={0} item={customizingItem} token={token} onClose={() => { setCustomizingItem(null); fetchMenu(); }} />
          </div>
        </div>
      )}

      {showChangePassword && (
        <div className="modal-overlay" onClick={() => setShowChangePassword(false)}>
          <div className="modal md-12" onClick={e => e.stopPropagation()}>
            <ChangePasswordModal token={token} onClose={() => setShowChangePassword(false)} />
          </div>
        </div>
      )}

      {showProfile && (
        <div className="modal-overlay" onClick={() => setShowProfile(false)}>
          <div className="modal md-12" onClick={e => e.stopPropagation()}>
            <ProfileUpdateModal
              currentName={currentUserName}
              currentPhone={currentUserPhone}
              currentEmail={currentUserEmail}
              onClose={() => setShowProfile(false)}
              onSaved={(name: string, phone: string) => { setCurrentUserName(name); setCurrentUserPhone(phone); }}
            />
          </div>
        </div>
      )}
    </>
  );
}

export default function MerchantDashboard() {
  const { token, setToken, currentUserRole, currentUserType, currentUserName, currentUserPhone, currentUserEmail, setCurrentUserName, setCurrentUserPhone, handleLogout, fetchUserRole } = useAuth();
  const { page, customerDetailId, setCustomerDetailId, handlePageChange: baseHandlePageChange } = useHashRouter();

  const data = useMerchantData(token);
  const {
    stores, setStores, selectedStore, setSelectedStore,
    ordersTotal, ordersPage, setOrdersPage, ordersPageSize,
    ordersStatus, setOrdersStatus, ordersOrderType, setOrdersOrderType,
    ordersFromDate, setOrdersFromDate, ordersToDate, setOrdersToDate,
    setCategories, setSelectedCategory,
    loyaltyTiers, loading,
    dateRange, dashboardChartMode,
    fetchStores, fetchAdminStores, fetchDashboardWithRange, fetchOrders,
    fetchMenu, fetchInventory, fetchTables, fetchLoyaltyTiers, handleDateRangeChange,
  } = data;

  const [showStoreModal, setShowStoreModal] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalContent, setModalContent] = useState<React.ReactNode>(null);
  const [modalTitle, setModalTitle] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [sidebarOpen, setSidebarOpen] = useState(typeof window !== 'undefined' ? window.innerWidth > 1024 : false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [notifRefreshKey, setNotifRefreshKey] = useState(0);
  const [customizingItem, setCustomizingItem] = useState<MerchantMenuItem | null>(null);

  function openBroadcastModal() {
    const { AddBroadcastForm } = require('@/components/Modals');
    setModalTitle('New Broadcast');
    setModalContent(<AddBroadcastForm token={token} onClose={() => { setShowModal(false); setNotifRefreshKey(k => k + 1); }} />);
    setShowModal(true);
  }

  function handlePageChange(newPage: PageId) {
    baseHandlePageChange(newPage);
    if (window.innerWidth <= 1024) setSidebarOpen(false);
  }

  useEffect(() => {
    if (token) { fetchStores(); fetchUserRole(); }
  }, [token, fetchStores, fetchUserRole]);

  const storeId = selectedStore === 'all' ? '' : selectedStore;

  // Per-page data fetching — each effect only runs when its page is active
  useEffect(() => {
    if (!token || page !== 'dashboard') return;
    fetchDashboardWithRange(storeId, dateRange.from, dateRange.to, dashboardChartMode);
  }, [page, token, storeId, dateRange, dashboardChartMode, fetchDashboardWithRange]);

  useEffect(() => {
    if (!token || page !== 'orders') return;
    fetchOrders(storeId);
  }, [page, token, storeId, ordersPage, ordersStatus, ordersOrderType, ordersFromDate, ordersToDate, fetchOrders]);

  useEffect(() => {
    if (!token || page !== 'menu') return;
    fetchMenu();
  }, [page, token, fetchMenu]);

  useEffect(() => {
    if (!token || page !== 'inventory') return;
    fetchInventory();
  }, [page, token, fetchInventory]);

  useEffect(() => {
    if (!token || page !== 'tables') return;
    fetchTables();
  }, [page, token, fetchTables]);

  useEffect(() => {
    if (!token || page !== 'loyaltyrules') return;
    fetchLoyaltyTiers();
  }, [page, token, fetchLoyaltyTiers]);

  useEffect(() => {
    if (!token || page !== 'store') return;
    fetchAdminStores();
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
                token={token}
                data={data}
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

      <AdminModals
        showModal={showModal}
        setShowModal={setShowModal}
        modalTitle={modalTitle}
        modalContent={modalContent}
        showChangePassword={showChangePassword}
        setShowChangePassword={setShowChangePassword}
        showStoreModal={showStoreModal}
        setShowStoreModal={setShowStoreModal}
        stores={stores}
        selectedStore={selectedStore}
        setSelectedStore={setSelectedStore}
        customizingItem={customizingItem}
        setCustomizingItem={setCustomizingItem}
        token={token}
        fetchMenu={fetchMenu}
        showProfile={showProfile}
        setShowProfile={setShowProfile}
        currentUserName={currentUserName}
        currentUserPhone={currentUserPhone}
        currentUserEmail={currentUserEmail}
        setCurrentUserName={setCurrentUserName}
        setCurrentUserPhone={setCurrentUserPhone}
      />
    </div>

    <MobileBottomNav page={page} setPage={handlePageChange} />
    </AuthGuard>
    </ErrorBoundary>
  );
}
