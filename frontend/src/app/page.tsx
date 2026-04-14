'use client';

import { useState, useEffect, useCallback } from 'react';
import React from 'react';
import { apiFetch, formatRM, statusBadge } from '@/lib/merchant-api';
import type {
  PageId,
  MerchantStore,
  MerchantCategory,
  MerchantMenuItem,
  MerchantTableItem,
  MerchantInventoryItem,
  MerchantOrder,
  MerchantDashboardData,
  MerchantStaffMember,
  MerchantReward,
  MerchantVoucher,
  MerchantBanner,
  MerchantAuditEntry,
  MerchantLoyaltyTier,
} from '@/lib/merchant-types';
import LoginScreen from '@/components/LoginScreen';
import Sidebar from '@/components/Sidebar';
import {
  AddBroadcastForm,
  AddCustomizationForm,
} from '@/components/Modals';
import DashboardPage from '@/components/pages/DashboardPage';
import OrdersPage from '@/components/pages/OrdersPage';
import MenuPage from '@/components/pages/MenuPage';
import TablesPage from '@/components/pages/TablesPage';
import InventoryPage from '@/components/pages/InventoryPage';
import StaffPage from '@/components/pages/StaffPage';
import CustomersPage from '@/components/pages/CustomersPage';
import StoreSettingsPage from '@/components/pages/StoreSettingsPage';
import LoyaltyRulesPage from '@/components/pages/LoyaltyRulesPage';
import AuditLogPage from '@/components/pages/AuditLogPage';
import NotificationsPage from '@/components/pages/NotificationsPage';
import RewardsPage from '@/components/pages/RewardsPage';
import VouchersPage from '@/components/pages/VouchersPage';
import PromotionsPage from '@/components/pages/PromotionsPage';
import FeedbackPage from '@/components/pages/FeedbackPage';
import SurveysPage from '@/components/pages/SurveysPage';
import MarketingReportsPage from '@/components/pages/MarketingReportsPage';
import { BarChart, DonutChart, SparkLine, LineGridChart } from '@/components/charts';

export default function MerchantDashboard() {
  const [token, setToken] = useState('');
  const [page, setPage] = useState<PageId>('dashboard');
  const [selectedStore, setSelectedStore] = useState<string>('all');
  const [stores, setStores] = useState<MerchantStore[]>([]);
  const [showStoreModal, setShowStoreModal] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalContent, setModalContent] = useState<React.ReactNode>(null);
  const [modalTitle, setModalTitle] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const [dashboard, setDashboard] = useState<MerchantDashboardData | null>(null);
  const [orders, setOrders] = useState<MerchantOrder[]>([]);
  const [categories, setCategories] = useState<MerchantCategory[]>([]);
  const [menuItems, setMenuItems] = useState<MerchantMenuItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [tables, setTables] = useState<MerchantTableItem[]>([]);
  const [inventory, setInventory] = useState<MerchantInventoryItem[]>([]);
  const [rewards, setRewards] = useState<MerchantReward[]>([]);
  const [vouchers, setVouchers] = useState<MerchantVoucher[]>([]);
  const [staff, setStaff] = useState<MerchantStaffMember[]>([]);
  const [banners, setBanners] = useState<MerchantBanner[]>([]);
  const [auditLog, setAuditLog] = useState<MerchantAuditEntry[]>([]);
  const [loyaltyTiers, setLoyaltyTiers] = useState<MerchantLoyaltyTier[]>([]);
  const [loading, setLoading] = useState(false);
  const [notifRefreshKey, setNotifRefreshKey] = useState(0);
  const [showStoreRevenueModal, setShowStoreRevenueModal] = useState(false);
  const [customizingItem, setCustomizingItem] = useState<MerchantMenuItem | null>(null);

  const [revenueReport, setRevenueReport] = useState<any>(null);
  const [reportFrom, setReportFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    return d.toISOString().slice(0, 10);
  });
  const [reportTo, setReportTo] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    const saved = localStorage.getItem('fnb_token');
    if (saved) setToken(saved);
  }, []);

  useEffect(() => {
    if (token) {
      localStorage.setItem('fnb_token', token);
      fetchStores();
    }
  }, [token]);

  const fetchStores = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch('/stores', token);
      if (res.ok) {
        const data = await res.json();
        setStores(data);
      }
    } catch {}
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const storeId = selectedStore === 'all' ? '' : selectedStore;
    if (page === 'dashboard') fetchDashboard(storeId);
    else if (page === 'orders') fetchOrders(storeId);
    else if (page === 'menu') fetchMenu();
    else if (page === 'inventory') fetchInventory();
    else if (page === 'tables') fetchTables();
    else if (page === 'staff') fetchStaff();
     else if (page === 'rewards') fetchRewards();
     else if (page === 'vouchers') fetchVouchers();
     else if (page === 'promotions') fetchBanners();
     else if (page === 'reports') fetchRevenueReport();
     else if (page === 'auditlog') fetchAuditLog();
    else if (page === 'loyaltyrules') fetchLoyaltyTiers();
  }, [page, token, selectedStore, reportFrom, reportTo]);

  function handleLogout() {
    setToken('');
    localStorage.removeItem('fnb_token');
    setPage('dashboard');
    setSelectedStore('all');
  }

  async function fetchDashboard(storeId?: string) {
    setLoading(true);
    try {
      const params = storeId ? `?store_id=${storeId}` : '';
      const res = await apiFetch(`/admin/dashboard${params}`, token);
      if (res.ok) setDashboard(await res.json());
    } catch {} finally { setLoading(false); }
  }

  async function fetchOrders(storeId?: string) {
    setLoading(true);
    try {
      const params = storeId ? `?store_id=${storeId}&page_size=50` : '?page_size=50';
      const res = await apiFetch(`/admin/orders${params}`, token);
      if (res.ok) {
        const data = await res.json();
        setOrders(Array.isArray(data) ? data : (data.orders || []));
      }
    } catch {} finally { setLoading(false); }
  }

  async function fetchMenu() {
    if (selectedStore === 'all') return;
    setLoading(true);
    try {
      const [catRes, itemRes] = await Promise.all([
        apiFetch(`/stores/${selectedStore}/categories`, token),
        apiFetch(`/stores/${selectedStore}/items`, token),
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
    } catch {} finally { setLoading(false); }
  }

  async function fetchInventory() {
    if (selectedStore === 'all') return;
    setLoading(true);
    try {
      const res = await apiFetch(`/stores/${selectedStore}/inventory`, token);
      if (res.ok) setInventory(await res.json());
    } catch {} finally { setLoading(false); }
  }

  async function fetchTables() {
    if (selectedStore === 'all') return;
    setLoading(true);
    try {
      const res = await apiFetch(`/stores/${selectedStore}/tables`, token);
      if (res.ok) setTables(await res.json());
    } catch {} finally { setLoading(false); }
  }

  async function fetchStaff() {
    if (selectedStore === 'all') return;
    setLoading(true);
    try {
      const res = await apiFetch(`/admin/stores/${selectedStore}/staff`, token);
      if (res.ok) {
        const data = await res.json();
        setStaff(Array.isArray(data) ? data : (data.staff || []));
      }
    } catch {} finally { setLoading(false); }
  }

  async function fetchRewards() {
    setLoading(true);
    try {
      const res = await apiFetch('/admin/rewards', token);
      if (res.ok) setRewards(await res.json());
    } catch {} finally { setLoading(false); }
  }

  async function fetchVouchers() {
    setLoading(true);
    try {
      const res = await apiFetch('/admin/vouchers', token);
      if (res.ok) setVouchers(await res.json());
    } catch {} finally { setLoading(false); }
  }

  async function fetchBanners() {
    setLoading(true);
    try {
      const res = await apiFetch('/admin/banners', token);
      if (res.ok) {
        const data = await res.json();
        setBanners(Array.isArray(data) ? data : (data.banners || []));
      }
    } catch {} finally { setLoading(false); }
  }

  async function fetchAuditLog() {
    setLoading(true);
    try {
      const res = await apiFetch('/admin/audit-log?page_size=50', token);
      if (res.ok) {
        const data = await res.json();
        setAuditLog(Array.isArray(data) ? data : (data.entries || data.items || []));
      }
    } catch {} finally { setLoading(false); }
  }

  async function fetchLoyaltyTiers() {
    setLoading(true);
    try {
      const res = await apiFetch('/admin/loyalty-tiers', token);
      if (res.ok) {
        const data = await res.json();
        setLoyaltyTiers(Array.isArray(data) ? data : (data.tiers || []));
      }
    } catch {} finally { setLoading(false); }
  }

  async function fetchRevenueReport() {
    setLoading(true);
    try {
      const storeParam = selectedStore !== 'all' ? `&store_id=${selectedStore}` : '';
      // Detect monthly mode: if the "Monthly Sales" preset is active
      const monthStart = (() => { const d = new Date(); d.setMonth(d.getMonth() - 5, 1); return d.toISOString().slice(0, 10); })();
      const isMonthlyMode = reportFrom === monthStart;
      const groupParam = isMonthlyMode ? '&group_by=month' : '';
      const res = await apiFetch(`/admin/reports/revenue?from_date=${reportFrom}T00:00:00&to_date=${reportTo}T23:59:59${storeParam}${groupParam}`, token);
      if (res.ok) setRevenueReport(await res.json());
    } catch {} finally { setLoading(false); }
  }

  function openBroadcastModal() {
    setModalTitle('New Broadcast');
    setModalContent(<AddBroadcastForm token={token} onClose={() => { setShowModal(false); setNotifRefreshKey(k => k + 1); }} />);
    setShowModal(true);
  }

  if (!token) {
    return <LoginScreen onLogin={setToken} />;
  }

  const storeObj = stores.find(s => s.id === Number(selectedStore));

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
    feedback: 'Feedback',
    surveys: 'Surveys',
    reports: 'Sales Reports',
    marketingreports: 'Marketing Reports',
    customers: 'Customers',
    notifications: 'Notifications',
    auditlog: 'Audit Log',
    loyaltyrules: 'Loyalty Rules',
    store: 'Store Settings',
  };

  return (
    <div style={{ height: '100vh', display: 'flex', overflow: 'hidden', background: '#F5F7FA' }}>
      <Sidebar
        page={page}
        setPage={setPage}
        collapsedGroups={collapsedGroups}
        setCollapsedGroups={setCollapsedGroups}
        stores={stores}
        selectedStore={selectedStore}
        onLogout={handleLogout}
      />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ background: 'white', padding: '12px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #E9ECF2', boxShadow: '0 2px 6px rgba(0,0,0,0.01)' }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#002F6C', letterSpacing: -0.5 }}>{pageTitle[page]}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <div
              onClick={() => setPage('notifications')}
              style={{ position: 'relative', fontSize: 20, color: '#475569', cursor: 'pointer' }}
            >
              <i className="far fa-bell"></i>
              <span style={{ position: 'absolute', top: -2, right: -2, width: 10, height: 10, background: '#EF4444', border: '2px solid white', borderRadius: '50%' }}></span>
            </div>
            <div
              onClick={() => setShowStoreModal(true)}
              style={{ background: '#F1F5F9', padding: '6px 16px', borderRadius: 40, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}
            >
              <i className="fas fa-map-pin"></i>
              <span>{selectedStore === 'all' ? 'All Stores' : storeObj?.name || 'Select Store'}</span>
              <i className="fas fa-chevron-down" style={{ fontSize: 12 }}></i>
            </div>
            <button className="btn" onClick={handleLogout}><i className="fas fa-sign-out-alt"></i> Logout</button>
          </div>
        </header>

        <main style={{ flex: 1, padding: '28px 32px', overflowY: 'auto' }}>
          <div className="page-enter">
            {loading && <div style={{ textAlign: 'center', padding: 40, color: '#64748B' }}><i className="fas fa-spinner fa-spin"></i> Loading...</div>}

            {page === 'dashboard' && <DashboardPage dashboard={dashboard} loading={loading} />}

            {page === 'orders' && (
              <OrdersPage
                orders={orders}
                loading={loading}
                token={token}
                selectedStore={selectedStore}
                onUpdate={() => fetchOrders(selectedStore === 'all' ? undefined : selectedStore)}
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
              />
            )}

            {page === 'inventory' && (
              <InventoryPage
                inventory={inventory}
                selectedStore={selectedStore}
                storeObj={storeObj}
                token={token}
                onRefresh={fetchInventory}
              />
            )}

            {page === 'tables' && (
              <TablesPage
                tables={tables}
                selectedStore={selectedStore}
                storeObj={storeObj}
                token={token}
                onRefresh={fetchTables}
              />
            )}

            {page === 'staff' && (
              <StaffPage
                staff={staff}
                selectedStore={selectedStore}
                storeObj={storeObj}
                token={token}
                onRefresh={fetchStaff}
              />
            )}

            {page === 'rewards' && (
              <RewardsPage rewards={rewards} token={token} onRefresh={fetchRewards} />
            )}

            {page === 'vouchers' && (
              <VouchersPage vouchers={vouchers} token={token} onRefresh={fetchVouchers} />
            )}

            {page === 'promotions' && (
              <PromotionsPage banners={banners} token={token} onRefresh={fetchBanners} />
            )}

            {page === 'feedback' && (
              <FeedbackPage token={token} selectedStore={selectedStore} />
            )}

            {page === 'surveys' && (
              <SurveysPage token={token} />
            )}

            {page === 'reports' && (
              <div>
                <h3 style={{ marginBottom: 20 }}>Revenue Breakdown</h3>
                <div className="card" style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {(() => {
                        const today = new Date().toISOString().slice(0, 10);
                        const d7 = (() => { const d = new Date(); d.setDate(d.getDate() - 6); return d.toISOString().slice(0, 10); })();
                        const d30 = (() => { const d = new Date(); d.setDate(d.getDate() - 29); return d.toISOString().slice(0, 10); })();
                        const mtdStart = (() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); })();
                        const lastMonthStart = (() => { const d = new Date(); d.setMonth(d.getMonth() - 1, 1); return d.toISOString().slice(0, 10); })();
                        const lastMonthEnd = (() => { const d = new Date(); d.setDate(0); return d.toISOString().slice(0, 10); })();
                        const monthStart = (() => { const d = new Date(); d.setMonth(d.getMonth() - 5, 1); return d.toISOString().slice(0, 10); })();

                        const presets = [
                          { label: '7D', from: d7, to: today },
                          { label: '30D', from: d30, to: today },
                          { label: 'MTD', from: mtdStart, to: today },
                          { label: 'Last Month', from: lastMonthStart, to: lastMonthEnd },
                          { label: 'Monthly Sales', from: monthStart, to: today },
                        ];
                        return presets.map(preset => {
                          const isActive = reportFrom === preset.from && reportTo === preset.to;
                          return (
                            <button
                              key={preset.label}
                              className={`btn btn-sm ${isActive ? 'btn-primary' : ''}`}
                              onClick={() => { setReportFrom(preset.from); setReportTo(preset.to); }}
                            >
                              {preset.label}
                            </button>
                          );
                        });
                      })()}
                    </div>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>From</label>
                      <input type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)} style={{ width: 160 }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>To</label>
                      <input type="date" value={reportTo} onChange={e => setReportTo(e.target.value)} style={{ width: 160 }} />
                    </div>
                    <div style={{ paddingBottom: 8, color: '#64748B' }}>Store: <strong>{selectedStore === 'all' ? 'All Stores' : storeObj?.name}</strong></div>
                  </div>
                </div>
                {loading ? (
                  <div style={{ textAlign: 'center', padding: 40, color: '#64748B' }}><i className="fas fa-spinner fa-spin"></i> Loading...</div>
                ) : revenueReport ? (
                  <>
                    {/* ── KPI + By Order Type + By Store ── */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
                      <div className="card" style={{ textAlign: 'center' }}>
                        <div style={{ color: '#64748B', fontSize: 13 }}>Total Revenue</div>
                        <div style={{ fontSize: 28, fontWeight: 700, color: '#059669' }}>{formatRM(revenueReport.total || 0)}</div>
                        <div style={{ marginTop: 8 }}>
                          <SparkLine
                            data={(() => {
                              const raw = revenueReport.by_day || {};
                              const monthStart = (() => { const d = new Date(); d.setMonth(d.getMonth() - 5, 1); return d.toISOString().slice(0, 10); })();
                              if (reportFrom === monthStart) {
                                return Object.entries(raw).sort(([a],[b]) => a.localeCompare(b)).map(([, v]) => Number(v));
                              }
                              const days: string[] = [];
                              const from = new Date(reportFrom);
                              const to = new Date(reportTo);
                              for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
                                days.push(d.toISOString().slice(0, 10));
                              }
                              return days.map(day => Number(raw[day] || 0));
                            })()}
                            width={180}
                            height={36}
                            color="#059669"
                          />
                        </div>
                      </div>
                      <div className="card">
                        <h4 style={{ fontSize: 14, marginBottom: 12 }}>By Order Type</h4>
                        <DonutChart
                          data={Object.entries(revenueReport.by_type || {}).map(([type, rev]: [string, any]) => ({ label: type.replace('_', ' '), value: Number(rev) }))}
                          size={140}
                          formatValue={(v) => formatRM(v)}
                        />
                      </div>
                      <div className="card">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                          <h4 style={{ fontSize: 14, margin: 0 }}>By Store</h4>
                          {Object.keys(revenueReport.by_store || {}).length > 5 && (
                            <button className="btn btn-sm" onClick={() => setShowStoreRevenueModal(true)}>
                              <i className="fas fa-expand"></i> View All ({Object.keys(revenueReport.by_store).length})
                            </button>
                          )}
                        </div>
                        {(() => {
                          const byStore = Object.entries(revenueReport.by_store || {})
                            .map(([sid, rev]: [string, any]) => {
                              const s = stores.find(st => st.id === Number(sid));
                              return { name: s?.name || `Store ${sid}`, value: Number(rev) };
                            })
                            .sort((a, b) => b.value - a.value);
                          if (byStore.length === 0) return <span style={{ color: '#94A3B8' }}>No data</span>;
                          const total = byStore.reduce((s, d) => s + d.value, 0) || 1;
                          const topStores = byStore.slice(0, 5);
                          const colors = ['#002F6C', '#059669', '#EA580C', '#7C3AED', '#DB2777'];
                          return (
                            <div>
                              {topStores.map((s, i) => (
                                <div key={i} style={{ marginBottom: 10 }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                                    <span style={{ fontWeight: 500, color: '#334155' }}>{s.name}</span>
                                    <span style={{ color: '#64748B' }}>{formatRM(s.value)} <span style={{ fontSize: 11, color: '#94A3B8' }}>({((s.value / total) * 100).toFixed(0)}%)</span></span>
                                  </div>
                                  <div style={{ height: 6, background: '#F1F5F9', borderRadius: 10 }}>
                                    <div style={{ height: 6, background: colors[i % colors.length], borderRadius: 10, width: `${(s.value / total) * 100}%`, transition: 'width 0.3s' }} />
                                  </div>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* ── Time Series Chart ── */}
                    <div className="card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                        <h4 style={{ margin: 0 }}>{(() => {
                          const monthStart = (() => { const d = new Date(); d.setMonth(d.getMonth() - 5, 1); return d.toISOString().slice(0, 10); })();
                          return reportFrom === monthStart ? 'Monthly Revenue' : 'Revenue Trend';
                        })()}</h4>
                        <div style={{ display: 'flex', gap: 16, fontSize: 13, color: '#64748B' }}>
                          <span><strong style={{ color: '#0F172A' }}>{formatRM(revenueReport.total || 0)}</strong> total</span>
                          {(() => {
                            const raw = revenueReport.by_day || {};
                            const vals = Object.values(raw).map(Number);
                            const days = Object.keys(raw).length || 1;
                            return <span><strong style={{ color: '#0F172A' }}>{formatRM(vals.reduce((a, b) => a + b, 0) / days)}</strong> avg/day</span>;
                          })()}
                        </div>
                      </div>
                      {(() => {
                        const raw = revenueReport.by_day || {};
                        const from = new Date(reportFrom);
                        const to = new Date(reportTo);
                        const monthStart = (() => { const d = new Date(); d.setMonth(d.getMonth() - 5, 1); return d.toISOString().slice(0, 10); })();
                        const isMonthly = reportFrom === monthStart;

                        if (isMonthly) {
                          // Monthly: use BarChart (fewer items)
                          const result: { label: string; value: number }[] = [];
                          const d = new Date(from.getFullYear(), from.getMonth(), 1);
                          const end = new Date(to.getFullYear(), to.getMonth(), 1);
                          while (d <= end) {
                            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                            const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                            result.push({ label: `${monthNames[d.getMonth()]} ${d.getFullYear()}`, value: Number(raw[key] || 0) });
                            d.setMonth(d.getMonth() + 1);
                          }
                          return <BarChart data={result} height={180} formatValue={(v) => formatRM(v)} />;
                        } else {
                          // Daily: use LineGridChart (handles 7-31 days cleanly)
                          const result: { label: string; value: number }[] = [];
                          for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
                            const key = d.toISOString().slice(0, 10);
                            result.push({ label: key.slice(5), value: Number(raw[key] || 0) });
                          }
                          return <LineGridChart data={result} height={240} formatValue={(v) => formatRM(v)} color="#002F6C" />;
                        }
                      })()}
                    </div>
                  </>
                ) : (
                  <div className="card" style={{ textAlign: 'center', padding: 60, color: '#64748B' }}>
                    <p>Select a date range to generate report</p>
                  </div>
                )}
              </div>
            )}

            {/* Store Revenue Breakdown Modal (outside reports conditional, inside main) */}
            {showStoreRevenueModal && revenueReport && (
              <div className="modal-overlay" onClick={() => setShowStoreRevenueModal(false)}>
                <div className="modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                    <h3 style={{ margin: 0 }}>Revenue by Store</h3>
                    <button className="btn btn-sm" onClick={() => setShowStoreRevenueModal(false)}><i className="fas fa-times"></i></button>
                  </div>
                  {(() => {
                    const byStore = Object.entries(revenueReport.by_store || {})
                      .map(([sid, rev]: [string, any]) => {
                        const s = stores.find(st => st.id === Number(sid));
                        return { name: s?.name || `Store ${sid}`, value: Number(rev) };
                      })
                      .sort((a, b) => b.value - a.value);
                    const total = byStore.reduce((s, d) => s + d.value, 0) || 1;
                    const colors = ['#002F6C', '#059669', '#EA580C', '#7C3AED', '#DB2777', '#0891B2', '#4F46E5', '#DC2626', '#65A30D', '#CA8A04'];
                    return (
                      <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                        {byStore.map((s, i) => (
                          <div key={i} style={{ marginBottom: 14, paddingBottom: 14, borderBottom: i < byStore.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}>
                              <span style={{ fontWeight: 600, color: '#334155' }}>
                                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: colors[i % colors.length], marginRight: 8 }}></span>
                                {s.name}
                              </span>
                              <span style={{ fontWeight: 600, color: '#0F172A' }}>{formatRM(s.value)}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{ flex: 1, height: 8, background: '#F1F5F9', borderRadius: 10 }}>
                                <div style={{ height: 8, background: colors[i % colors.length], borderRadius: 10, width: `${(s.value / total) * 100}%`, transition: 'width 0.3s' }} />
                              </div>
                              <span style={{ fontSize: 12, color: '#64748B', minWidth: 40, textAlign: 'right' }}>{((s.value / total) * 100).toFixed(1)}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {page === 'marketingreports' && (
              <MarketingReportsPage token={token} stores={stores} selectedStore={selectedStore} />
            )}

            {page === 'customers' && (
              <CustomersPage token={token} selectedStore={selectedStore} />
            )}

            {page === 'notifications' && (
              <NotificationsPage
                token={token}
                refreshKey={notifRefreshKey}
                onNewBroadcast={openBroadcastModal}
              />
            )}

            {page === 'auditlog' && (
              <AuditLogPage auditLog={auditLog} stores={stores} />
            )}

            {page === 'loyaltyrules' && (
              <LoyaltyRulesPage tiers={loyaltyTiers} token={token} onRefresh={fetchLoyaltyTiers} />
            )}

            {page === 'store' && (
              <StoreSettingsPage stores={stores} token={token} onRefresh={fetchStores} />
            )}
          </div>
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
            <CustomizationManager storeId={Number(selectedStore)} item={customizingItem} token={token} onClose={() => { setCustomizingItem(null); fetchMenu(); }} />
          </div>
        </div>
      )}
    </div>
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
    } catch {} finally { setLoading(false); }
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
