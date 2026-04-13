'use client';

import { useState, useEffect, useCallback } from 'react';
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
  MerchantBroadcast,
  MerchantAuditEntry,
  MerchantFeedbackItem,
  MerchantFeedbackStats,
  MerchantLoyaltyTier,
} from '@/lib/merchant-types';
import LoginScreen from '@/components/LoginScreen';
import Sidebar from '@/components/Sidebar';
import {
  AddItemForm,
  AddTableForm,
  AddRewardForm,
  AddVoucherForm,
  AddStaffForm,
  AddBannerForm,
  AddBroadcastForm,
  FeedbackReplyForm,
  EditTierForm,
  StoreSettingsForm,
} from '@/components/Modals';
import DashboardPage from '@/components/pages/DashboardPage';
import OrdersPage from '@/components/pages/OrdersPage';
import MenuPage from '@/components/pages/MenuPage';
import TablesPage from '@/components/pages/TablesPage';
import CustomersPage from '@/components/pages/CustomersPage';

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
  const [broadcasts, setBroadcasts] = useState<MerchantBroadcast[]>([]);
  const [auditLog, setAuditLog] = useState<MerchantAuditEntry[]>([]);
  const [feedbackList, setFeedbackList] = useState<MerchantFeedbackItem[]>([]);
  const [feedbackStats, setFeedbackStats] = useState<MerchantFeedbackStats | null>(null);
  const [feedbackStoreFilter, setFeedbackStoreFilter] = useState<string>('');
  const [loyaltyTiers, setLoyaltyTiers] = useState<MerchantLoyaltyTier[]>([]);
  const [loading, setLoading] = useState(false);
  const [notifTab, setNotifTab] = useState<'inbox' | 'manage'>('inbox');

  const [revenueReport, setRevenueReport] = useState<any>(null);
  const [reportFrom, setReportFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
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
    else if (page === 'feedback') fetchFeedback();
    else if (page === 'reports') fetchRevenueReport();
    else if (page === 'notifications') fetchBroadcasts();
    else if (page === 'auditlog') fetchAuditLog();
    else if (page === 'loyaltyrules') fetchLoyaltyTiers();
  }, [page, token, selectedStore, reportFrom, reportTo, feedbackStoreFilter]);

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

  async function fetchBroadcasts() {
    setLoading(true);
    try {
      const res = await apiFetch('/admin/broadcasts', token);
      if (res.ok) {
        const data = await res.json();
        setBroadcasts(Array.isArray(data) ? data : (data.broadcasts || []));
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

  async function fetchFeedback() {
    setLoading(true);
    try {
      const storeParam = feedbackStoreFilter ? `?store_id=${feedbackStoreFilter}` : '';
      const [fbRes, statsRes] = await Promise.all([
        apiFetch(`/admin/feedback${storeParam}`, token),
        apiFetch(`/admin/feedback/stats${storeParam ? storeParam.replace('?', '?') : ''}`, token),
      ]);
      if (fbRes.ok) {
        const data = await fbRes.json();
        setFeedbackList(Array.isArray(data) ? data : (data.feedback || []));
      }
      if (statsRes.ok) {
        setFeedbackStats(await statsRes.json());
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
      const res = await apiFetch(`/admin/reports/revenue?from_date=${reportFrom}T00:00:00&to_date=${reportTo}T23:59:59${storeParam}`, token);
      if (res.ok) setRevenueReport(await res.json());
    } catch {} finally { setLoading(false); }
  }

  async function toggleBanner(banner: MerchantBanner) {
    try {
      await apiFetch(`/admin/banners/${banner.id}`, token, {
        method: 'PUT',
        body: JSON.stringify({ ...banner, is_active: !banner.is_active }),
      });
      fetchBanners();
    } catch {}
  }

  function openAddRewardModal() {
    setModalTitle('Create Reward');
    setModalContent(<AddRewardForm token={token} onClose={() => { setShowModal(false); fetchRewards(); }} />);
    setShowModal(true);
  }

  function openAddVoucherModal() {
    setModalTitle('Create Voucher');
    setModalContent(<AddVoucherForm token={token} onClose={() => { setShowModal(false); fetchVouchers(); }} />);
    setShowModal(true);
  }

  function openAddStaffModal() {
    setModalTitle('Add Staff');
    setModalContent(<AddStaffForm storeId={Number(selectedStore)} token={token} onClose={() => { setShowModal(false); fetchStaff(); }} />);
    setShowModal(true);
  }

  function openAddBannerModal() {
    setModalTitle('New Banner');
    setModalContent(<AddBannerForm token={token} onClose={() => { setShowModal(false); fetchBanners(); }} />);
    setShowModal(true);
  }

  function openBroadcastModal() {
    setModalTitle('New Broadcast');
    setModalContent(<AddBroadcastForm token={token} onClose={() => { setShowModal(false); fetchBroadcasts(); }} />);
    setShowModal(true);
  }

  function openFeedbackReplyModal(fb: MerchantFeedbackItem) {
    setModalTitle(`Reply to ${fb.customer_name}`);
    setModalContent(<FeedbackReplyForm feedbackId={fb.id} token={token} onClose={() => { setShowModal(false); fetchFeedback(); }} />);
    setShowModal(true);
  }

  function openEditTierModal(tier: MerchantLoyaltyTier) {
    setModalTitle(`Edit Tier: ${tier.name}`);
    setModalContent(<EditTierForm tier={tier} token={token} onClose={() => { setShowModal(false); fetchLoyaltyTiers(); }} />);
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
    reports: 'Reports',
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
              />
            )}

            {page === 'inventory' && (
              <div>
                {selectedStore === 'all' ? (
                  <div className="card" style={{ textAlign: 'center', padding: 60, color: '#64748B' }}>
                    <i className="fas fa-boxes-stacked" style={{ fontSize: 40, marginBottom: 16 }}></i>
                    <p>Select a specific store to manage inventory</p>
                  </div>
                ) : (
                  <>
                    <h3 style={{ marginBottom: 20 }}>Ingredient Stock &middot; {storeObj?.name}</h3>
                    <div style={{ overflowX: 'auto', borderRadius: 20, background: 'white', border: '1px solid #ECF1F7' }}>
                      <table>
                        <thead>
                          <tr><th>Ingredient</th><th>Current Stock</th><th>Unit</th><th>Reorder Level</th><th>Status</th></tr>
                        </thead>
                        <tbody>
                          {inventory.length === 0 ? (
                            <tr><td colSpan={5} style={{ textAlign: 'center', color: '#94A3B8', padding: 40 }}>No inventory items yet</td></tr>
                          ) : inventory.map(item => {
                            const isLow = item.current_stock <= item.reorder_level;
                            return (
                              <tr key={item.id}>
                                <td style={{ fontWeight: 500 }}>{item.name}</td>
                                <td>{item.current_stock}</td>
                                <td>{item.unit}</td>
                                <td>{item.reorder_level}</td>
                                <td><span className={`badge ${isLow ? 'badge-yellow' : 'badge-green'}`}>{isLow ? 'Low' : 'OK'}</span></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
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
              <div>
                {selectedStore === 'all' ? (
                  <div className="card" style={{ textAlign: 'center', padding: 60, color: '#64748B' }}>
                    <i className="fas fa-user-tie" style={{ fontSize: 40, marginBottom: 16 }}></i>
                    <p>Select a specific store to manage staff</p>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                      <h3>Staff &middot; {storeObj?.name}</h3>
                      <button className="btn btn-primary" onClick={openAddStaffModal}><i className="fas fa-plus"></i> Add Staff</button>
                    </div>
                    <div style={{ overflowX: 'auto', borderRadius: 20, background: 'white', border: '1px solid #ECF1F7' }}>
                      <table>
                        <thead>
                          <tr><th>Name</th><th>Role</th><th>Phone</th><th>Status</th></tr>
                        </thead>
                        <tbody>
                          {staff.length === 0 ? (
                            <tr><td colSpan={4} style={{ textAlign: 'center', color: '#94A3B8', padding: 40 }}>No staff members yet</td></tr>
                          ) : staff.map(s => (
                            <tr key={s.id}>
                              <td style={{ fontWeight: 500 }}>{s.name}</td>
                              <td><span className="badge badge-blue">{s.role}</span></td>
                              <td>{s.phone}</td>
                              <td><span className={`badge ${s.is_active ? 'badge-green' : 'badge-gray'}`}>{s.is_active ? 'Active' : 'Inactive'}</span></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}

            {page === 'rewards' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <h3>Rewards Catalog</h3>
                  <button className="btn btn-primary" onClick={openAddRewardModal}><i className="fas fa-plus"></i> New Reward</button>
                </div>
                <div style={{ overflowX: 'auto', borderRadius: 20, background: 'white', border: '1px solid #ECF1F7' }}>
                  <table>
                    <thead><tr><th>Reward</th><th>Points</th><th>Type</th><th>Stock</th><th>Redemptions</th><th>Status</th></tr></thead>
                    <tbody>
                      {rewards.length === 0 ? (
                        <tr><td colSpan={6} style={{ textAlign: 'center', color: '#94A3B8', padding: 40 }}>No rewards yet</td></tr>
                      ) : rewards.map(r => (
                        <tr key={r.id}>
                          <td><strong>{r.name}</strong><br /><span style={{ fontSize: 12, color: '#64748B' }}>{r.description}</span></td>
                          <td style={{ fontWeight: 600 }}>{r.points_cost} pts</td>
                          <td><span className="badge badge-blue">{r.reward_type}</span></td>
                          <td>{r.stock_limit ?? 'Unlimited'}</td>
                          <td>{r.total_redeemed}</td>
                          <td><span className={`badge ${r.is_active ? 'badge-green' : 'badge-gray'}`}>{r.is_active ? 'Active' : 'Inactive'}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {page === 'vouchers' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <h3>Global Vouchers</h3>
                  <button className="btn btn-primary" onClick={openAddVoucherModal}><i className="fas fa-plus"></i> Create</button>
                </div>
                <div style={{ overflowX: 'auto', borderRadius: 20, background: 'white', border: '1px solid #ECF1F7' }}>
                  <table>
                    <thead><tr><th>Code</th><th>Discount</th><th>Min Order</th><th>Usage</th><th>Valid Until</th><th>Status</th></tr></thead>
                    <tbody>
                      {vouchers.length === 0 ? (
                        <tr><td colSpan={6} style={{ textAlign: 'center', color: '#94A3B8', padding: 40 }}>No vouchers yet</td></tr>
                      ) : vouchers.map(v => (
                        <tr key={v.id}>
                          <td style={{ fontWeight: 600 }}>{v.code}</td>
                          <td>{v.discount_type === 'percent' ? `${v.discount_value}% off` : formatRM(v.discount_value)}</td>
                          <td>{v.min_order > 0 ? formatRM(v.min_order) : '-'}</td>
                          <td>{v.used_count}{v.max_uses ? `/${v.max_uses}` : '/∞'}</td>
                          <td>{v.valid_until ? new Date(v.valid_until).toLocaleDateString() : 'No expiry'}</td>
                          <td><span className={`badge ${v.is_active ? 'badge-green' : 'badge-gray'}`}>{v.is_active ? 'Active' : 'Inactive'}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {page === 'promotions' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <h3>Promotional Banners</h3>
                  <button className="btn btn-primary" onClick={openAddBannerModal}><i className="fas fa-plus"></i> New Banner</button>
                </div>
                {banners.length === 0 ? (
                  <div className="card" style={{ textAlign: 'center', padding: 60, color: '#64748B' }}>
                    <i className="fas fa-bullhorn" style={{ fontSize: 40, marginBottom: 16 }}></i>
                    <p>No banners yet. Create your first promotional banner.</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
                    {banners.map(b => (
                      <div key={b.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <div style={{ height: 120, background: 'linear-gradient(135deg, #002F6C, #1E4A7A)', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 16, fontWeight: 600, overflow: 'hidden' }}>
                          {b.image_url ? (
                            <img src={b.image_url} alt={b.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <span>{b.title}</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <strong>{b.title}</strong>
                          <span className={`badge ${b.is_active ? 'badge-green' : 'badge-gray'}`}>{b.is_active ? 'Active' : 'Inactive'}</span>
                        </div>
                        {b.target_url && <div style={{ fontSize: 12, color: '#64748B', wordBreak: 'break-all' }}>{b.target_url}</div>}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 12, color: '#94A3B8' }}>{new Date(b.created_at).toLocaleDateString()}</span>
                          <button className="btn btn-sm" onClick={() => toggleBanner(b)}>
                            {b.is_active ? 'Deactivate' : 'Activate'}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {page === 'feedback' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                  <h3>Customer Feedback</h3>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <label style={{ fontSize: 13, fontWeight: 600, color: '#334155' }}>Filter by Store:</label>
                    <select
                      value={feedbackStoreFilter}
                      onChange={e => setFeedbackStoreFilter(e.target.value)}
                      style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #DDE3E9', fontSize: 14 }}
                    >
                      <option value="">All Stores</option>
                      {stores.map(s => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
                    </select>
                  </div>
                </div>
                {feedbackStats && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
                    <div className="card" style={{ textAlign: 'center' }}>
                      <div style={{ color: '#64748B', fontSize: 13 }}>Average Rating</div>
                      <div style={{ fontSize: 32, fontWeight: 700, color: '#F59E0B' }}>
                        {'★'.repeat(Math.round(feedbackStats.average_rating))}{'☆'.repeat(5 - Math.round(feedbackStats.average_rating))}
                      </div>
                      <div style={{ fontSize: 14, color: '#64748B' }}>{feedbackStats.average_rating.toFixed(1)} / 5.0</div>
                    </div>
                    <div className="card" style={{ textAlign: 'center' }}>
                      <div style={{ color: '#64748B', fontSize: 13 }}>Total Reviews</div>
                      <div style={{ fontSize: 32, fontWeight: 700 }}>{feedbackStats.total_reviews}</div>
                    </div>
                    <div className="card">
                      <h4 style={{ fontSize: 14, marginBottom: 12 }}>Rating Distribution</h4>
                      {feedbackStats.rating_distribution && Object.entries(feedbackStats.rating_distribution).sort((a, b) => Number(b[0]) - Number(a[0])).map(([rating, count]: [string, any]) => (
                        <div key={rating} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 14 }}>
                          <span>{'★'.repeat(Number(rating))}</span>
                          <strong>{count}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {feedbackList.length === 0 ? (
                  <div className="card" style={{ textAlign: 'center', padding: 60, color: '#64748B' }}>
                    <i className="fas fa-star" style={{ fontSize: 40, marginBottom: 16 }}></i>
                    <p>No feedback yet</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 16 }}>
                    {feedbackList.map(fb => (
                      <div key={fb.id} className="card" style={{ padding: '20px 24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <strong style={{ fontSize: 15 }}>{fb.customer_name}</strong>
                            <span style={{ marginLeft: 12, color: '#F59E0B', fontSize: 14 }}>
                              {'★'.repeat(fb.rating)}{'☆'.repeat(5 - fb.rating)}
                            </span>
                            <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>
                              {fb.store_name} &middot; {new Date(fb.created_at).toLocaleDateString()}
                            </div>
                          </div>
                          {!fb.reply && (
                            <button className="btn btn-sm" onClick={() => openFeedbackReplyModal(fb)}>Reply</button>
                          )}
                        </div>
                        <p style={{ marginTop: 12, color: '#334155' }}>{fb.comment}</p>
                        {fb.reply && (
                          <div style={{ marginTop: 12, padding: '12px 16px', background: '#F0F9FF', borderRadius: 12, borderLeft: '3px solid #002F6C' }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: '#002F6C', marginBottom: 4 }}>Merchant Reply</div>
                            <div style={{ fontSize: 14, color: '#334155' }}>{fb.reply}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {page === 'reports' && (
              <div>
                <h3 style={{ marginBottom: 20 }}>Revenue Breakdown</h3>
                <div className="card" style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>From</label>
                      <input type="date" value={reportFrom} onChange={e => setReportFrom(e.target.value)} style={{ width: 180 }} />
                    </div>
                    <div>
                      <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>To</label>
                      <input type="date" value={reportTo} onChange={e => setReportTo(e.target.value)} style={{ width: 180 }} />
                    </div>
                    <div style={{ paddingBottom: 8, color: '#64748B' }}>Store: <strong>{selectedStore === 'all' ? 'All Stores' : storeObj?.name}</strong></div>
                  </div>
                </div>
                {loading ? (
                  <div style={{ textAlign: 'center', padding: 40, color: '#64748B' }}><i className="fas fa-spinner fa-spin"></i> Loading...</div>
                ) : revenueReport ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
                      <div className="card" style={{ textAlign: 'center' }}>
                        <div style={{ color: '#64748B', fontSize: 13 }}>Total Revenue</div>
                        <div style={{ fontSize: 28, fontWeight: 700, color: '#059669' }}>{formatRM(revenueReport.total || 0)}</div>
                      </div>
                      <div className="card">
                        <h4 style={{ fontSize: 14, marginBottom: 12 }}>By Order Type</h4>
                        {revenueReport.by_type && Object.entries(revenueReport.by_type).map(([type, rev]: [string, any]) => (
                          <div key={type} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14 }}>
                            <span style={{ textTransform: 'capitalize' }}>{type.replace('_', ' ')}</span>
                            <strong>{formatRM(rev)}</strong>
                          </div>
                        ))}
                      </div>
                      <div className="card">
                        <h4 style={{ fontSize: 14, marginBottom: 12 }}>By Store</h4>
                        {revenueReport.by_store && Object.entries(revenueReport.by_store).map(([sid, rev]: [string, any]) => {
                          const s = stores.find(st => st.id === Number(sid));
                          return (
                            <div key={sid} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 14 }}>
                              <span>{s?.name || `Store ${sid}`}</span>
                              <strong>{formatRM(rev)}</strong>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    {revenueReport.by_day && Object.keys(revenueReport.by_day).length > 0 && (
                      <div className="card">
                        <h4 style={{ marginBottom: 12 }}>Daily Revenue</h4>
                        <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                          <table>
                            <thead><tr><th>Date</th><th>Revenue</th></tr></thead>
                            <tbody>
                              {Object.entries(revenueReport.by_day).sort((a, b) => a[0].localeCompare(b[0])).map(([day, rev]: [string, any]) => (
                                <tr key={day}><td>{day}</td><td style={{ fontWeight: 600 }}>{formatRM(rev)}</td></tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="card" style={{ textAlign: 'center', padding: 60, color: '#64748B' }}>
                    <p>Select a date range to generate report</p>
                  </div>
                )}
              </div>
            )}

            {page === 'customers' && (
              <CustomersPage token={token} selectedStore={selectedStore} />
            )}

            {page === 'notifications' && (
              <div>
                <h3 style={{ marginBottom: 20 }}>Notifications</h3>
                <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
                  <button
                    className={`btn ${notifTab === 'inbox' ? 'btn-primary' : ''}`}
                    onClick={() => setNotifTab('inbox')}
                  >
                    <i className="fas fa-inbox"></i> Inbox
                  </button>
                  <button
                    className={`btn ${notifTab === 'manage' ? 'btn-primary' : ''}`}
                    onClick={() => setNotifTab('manage')}
                  >
                    <i className="fas fa-bullhorn"></i> Manage Broadcasts
                  </button>
                </div>

                {notifTab === 'inbox' && (
                  <div>
                    {broadcasts.length === 0 ? (
                      <div className="card" style={{ textAlign: 'center', padding: 60, color: '#64748B' }}>
                        <i className="fas fa-inbox" style={{ fontSize: 40, marginBottom: 16 }}></i>
                        <p>No notifications</p>
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gap: 12 }}>
                        {broadcasts.map(bc => (
                          <div key={bc.id} className="card" style={{ padding: '16px 20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div>
                                <strong style={{ fontSize: 15 }}>{bc.title}</strong>
                                <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>
                                  {bc.target_audience} &middot; {bc.sent_at ? new Date(bc.sent_at).toLocaleDateString() : 'Pending'}
                                </div>
                              </div>
                              <span className={`badge ${bc.status === 'sent' ? 'badge-green' : bc.status === 'pending' ? 'badge-yellow' : 'badge-gray'}`}>{bc.status}</span>
                            </div>
                            <p style={{ marginTop: 8, color: '#334155', fontSize: 14 }}>{bc.message}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {notifTab === 'manage' && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
                      <button className="btn btn-primary" onClick={openBroadcastModal}><i className="fas fa-plus"></i> New Broadcast</button>
                    </div>
                    {broadcasts.length === 0 ? (
                      <div className="card" style={{ textAlign: 'center', padding: 60, color: '#64748B' }}>
                        <i className="fas fa-bullhorn" style={{ fontSize: 40, marginBottom: 16 }}></i>
                        <p>No broadcasts sent yet</p>
                      </div>
                    ) : (
                      <div style={{ overflowX: 'auto', borderRadius: 20, background: 'white', border: '1px solid #ECF1F7' }}>
                        <table>
                          <thead>
                            <tr><th>Title</th><th>Target</th><th>Sent At</th><th>Status</th></tr>
                          </thead>
                          <tbody>
                            {broadcasts.map(bc => (
                              <tr key={bc.id}>
                                <td style={{ fontWeight: 500 }}>{bc.title}</td>
                                <td>{bc.target_audience}</td>
                                <td>{bc.sent_at ? new Date(bc.sent_at).toLocaleString() : '-'}</td>
                                <td><span className={`badge ${bc.status === 'sent' ? 'badge-green' : bc.status === 'pending' ? 'badge-yellow' : 'badge-gray'}`}>{bc.status}</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {page === 'auditlog' && (
              <div>
                <h3 style={{ marginBottom: 20 }}>Audit Log</h3>
                {auditLog.length === 0 ? (
                  <div className="card" style={{ textAlign: 'center', padding: 60, color: '#64748B' }}>
                    <i className="fas fa-history" style={{ fontSize: 40, marginBottom: 16 }}></i>
                    <p>No audit log entries</p>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto', borderRadius: 20, background: 'white', border: '1px solid #ECF1F7' }}>
                    <table>
                      <thead>
                        <tr><th>Timestamp</th><th>User</th><th>Action</th><th>IP</th><th>Store</th><th>Status</th></tr>
                      </thead>
                      <tbody>
                        {auditLog.map(entry => {
                          const store = stores.find(s => s.id === entry.store_id);
                          return (
                            <tr key={entry.id}>
                              <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{new Date(entry.timestamp).toLocaleString()}</td>
                              <td style={{ fontWeight: 500 }}>{entry.user_email}</td>
                              <td><span className="badge badge-blue">{entry.action}</span></td>
                              <td style={{ fontSize: 13, color: '#64748B', fontFamily: 'monospace' }}>{entry.ip_address}</td>
                              <td>{store?.name || (entry.store_id ? `Store ${entry.store_id}` : '-')}</td>
                              <td>
                                <span className={`badge ${entry.status === 'success' ? 'badge-green' : entry.status === 'failed' ? 'badge-red' : 'badge-yellow'}`}>
                                  {entry.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {page === 'loyaltyrules' && (
              <div>
                <h3 style={{ marginBottom: 20 }}>Loyalty Tiers</h3>
                {loyaltyTiers.length === 0 ? (
                  <div className="card" style={{ textAlign: 'center', padding: 60, color: '#64748B' }}>
                    <i className="fas fa-medal" style={{ fontSize: 40, marginBottom: 16 }}></i>
                    <p>No loyalty tiers configured</p>
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto', borderRadius: 20, background: 'white', border: '1px solid #ECF1F7' }}>
                    <table>
                      <thead>
                        <tr><th>Tier Name</th><th>Min Points</th><th>Multiplier</th><th>Benefits</th><th>Actions</th></tr>
                      </thead>
                      <tbody>
                        {loyaltyTiers.map(tier => (
                          <tr key={tier.id}>
                            <td style={{ fontWeight: 600 }}>{tier.name}</td>
                            <td>{tier.min_points} pts</td>
                            <td><span className="badge badge-blue">{tier.multiplier}x</span></td>
                            <td style={{ fontSize: 13, color: '#64748B', maxWidth: 300 }}>{tier.benefits || '-'}</td>
                            <td>
                              <button className="btn btn-sm" onClick={() => openEditTierModal(tier)}>
                                <i className="fas fa-edit"></i> Edit
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {page === 'store' && (
              <div>
                {selectedStore === 'all' ? (
                  <div className="card" style={{ textAlign: 'center', padding: 60, color: '#64748B' }}>
                    <i className="fas fa-store" style={{ fontSize: 40, marginBottom: 16 }}></i>
                    <p>Select a specific store to edit settings</p>
                  </div>
                ) : storeObj ? (
                  <StoreSettingsForm store={storeObj} token={token} />
                ) : null}
              </div>
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
    </div>
  );
}
