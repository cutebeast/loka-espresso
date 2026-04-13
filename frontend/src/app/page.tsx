'use client';

import { useState, useEffect, useCallback, FormEvent } from 'react';

const API = '/api/v1';

interface Store {
  id: number;
  name: string;
  slug: string;
  address: string;
  phone: string;
  opening_hours: Record<string, string>;
  pickup_lead_minutes: number;
  is_active: boolean;
}

interface Category {
  id: number;
  name: string;
  slug: string;
  display_order: number;
  is_active: boolean;
}

interface MenuItem {
  id: number;
  store_id: number;
  category_id: number;
  name: string;
  description: string;
  base_price: number;
  image_url: string | null;
  is_available: boolean;
  display_order: number;
}

interface TableItem {
  id: number;
  table_number: string;
  qr_code_url: string;
  capacity: number;
  is_active: boolean;
}

interface Reward {
  id: number;
  name: string;
  description: string;
  points_cost: number;
  reward_type: string;
  stock_limit: number | null;
  total_redeemed: number;
  is_active: boolean;
}

interface Voucher {
  id: number;
  code: string;
  description: string;
  discount_type: string;
  discount_value: number;
  min_order: number;
  max_uses: number | null;
  used_count: number;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
}

interface InventoryItem {
  id: number;
  name: string;
  current_stock: number;
  unit: string;
  reorder_level: number;
  cost_per_unit: number | null;
}

interface Order {
  id: number;
  order_number: string;
  order_type: string;
  status: string;
  total: number;
  items: Array<Record<string, unknown>>;
  created_at: string;
  store_id: number;
  table_id: number | null;
  pickup_time: string | null;
  user_id: number;
}

interface DashboardData {
  total_orders: number;
  total_revenue: number;
  total_customers: number;
  orders_today: number;
  revenue_today: number;
  orders_by_type: Record<string, number>;
}

type PageId = 'dashboard' | 'orders' | 'menu' | 'inventory' | 'tables' | 'rewards' | 'vouchers' | 'reports' | 'customers' | 'store';

function apiFetch(path: string, token: string, options?: RequestInit) {
  return fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options?.headers,
    },
  });
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending: 'badge-yellow',
    confirmed: 'badge-blue',
    preparing: 'badge-yellow',
    ready: 'badge-green',
    completed: 'badge-green',
    cancelled: 'badge-red',
  };
  return <span className={`badge ${map[status] || 'badge-gray'}`}>{status}</span>;
}

function formatRM(amount: number) {
  return `RM ${Number(amount).toFixed(2)}`;
}

export default function MerchantDashboard() {
  const [token, setToken] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [page, setPage] = useState<PageId>('dashboard');
  const [selectedStore, setSelectedStore] = useState<string>('all');
  const [stores, setStores] = useState<Store[]>([]);
  const [showStoreModal, setShowStoreModal] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [modalContent, setModalContent] = useState<React.ReactNode>(null);
  const [modalTitle, setModalTitle] = useState('');

  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [tables, setTables] = useState<TableItem[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(false);

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
    else if (page === 'rewards') fetchRewards();
    else if (page === 'vouchers') fetchVouchers();
    else if (page === 'reports') fetchRevenueReport();
  }, [page, token, selectedStore, reportFrom, reportTo]);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await fetch(`${API}/auth/login-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (res.ok && data.access_token) {
        setToken(data.access_token);
      } else {
        setLoginError(data.detail || 'Login failed');
      }
    } catch {
      setLoginError('Network error');
    }
  }

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
      const res = await apiFetch(`/orders${params}`, token);
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

  async function fetchRevenueReport() {
    setLoading(true);
    try {
      const storeParam = selectedStore !== 'all' ? `&store_id=${selectedStore}` : '';
      const res = await apiFetch(`/admin/reports/revenue?from_date=${reportFrom}T00:00:00&to_date=${reportTo}T23:59:59${storeParam}`, token);
      if (res.ok) setRevenueReport(await res.json());
    } catch {} finally { setLoading(false); }
  }

  async function updateOrderStatus(orderId: number, newStatus: string) {
    try {
      const res = await apiFetch(`/orders/${orderId}/status`, token, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) fetchOrders(selectedStore === 'all' ? undefined : selectedStore);
    } catch {}
  }

  async function toggleMenuItem(item: MenuItem) {
    try {
      await apiFetch(`/admin/stores/${item.store_id}/items/${item.id}`, token, {
        method: 'PUT',
        body: JSON.stringify({ ...item, is_available: !item.is_available }),
      });
      fetchMenu();
    } catch {}
  }

  function openAddItemModal() {
    setModalTitle('Add Menu Item');
    setModalContent(
      <AddItemForm storeId={Number(selectedStore)} categories={categories} token={token} onClose={() => { setShowModal(false); fetchMenu(); }} />
    );
    setShowModal(true);
  }

  function openAddTableModal() {
    setModalTitle('Add Table');
    setModalContent(
      <AddTableForm storeId={Number(selectedStore)} token={token} onClose={() => { setShowModal(false); fetchTables(); }} />
    );
    setShowModal(true);
  }

  function openAddRewardModal() {
    setModalTitle('Create Reward');
    setModalContent(
      <AddRewardForm token={token} onClose={() => { setShowModal(false); fetchRewards(); }} />
    );
    setShowModal(true);
  }

  function openAddVoucherModal() {
    setModalTitle('Create Voucher');
    setModalContent(
      <AddVoucherForm token={token} onClose={() => { setShowModal(false); fetchVouchers(); }} />
    );
    setShowModal(true);
  }

  function openOrderDetail(order: Order) {
    setModalTitle(`Order ${order.order_number}`);
    setModalContent(
      <div>
        <p><strong>Type:</strong> {order.order_type}</p>
        <p><strong>Status:</strong> {statusBadge(order.status)}</p>
        <p><strong>Total:</strong> {formatRM(order.total)}</p>
        <p><strong>Created:</strong> {new Date(order.created_at).toLocaleString()}</p>
        {order.table_id && <p><strong>Table:</strong> {order.table_id}</p>}
        {order.pickup_time && <p><strong>Pickup:</strong> {new Date(order.pickup_time).toLocaleString()}</p>}
        <div style={{ marginTop: 16 }}>
          <strong>Update Status:</strong>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
            {['confirmed', 'preparing', 'ready', 'completed', 'cancelled'].map(s => (
              <button key={s} className="btn btn-sm" onClick={() => { updateOrderStatus(order.id, s); setShowModal(false); }}>{s}</button>
            ))}
          </div>
        </div>
      </div>
    );
    setShowModal(true);
  }

  if (!token) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F5F7FA' }}>
        <div className="card" style={{ maxWidth: 400, width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <i className="fas fa-mug-saucer" style={{ fontSize: 40, color: '#002F6C' }}></i>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#002F6C', marginTop: 8 }}>ZUS Merchant</h1>
            <p style={{ color: '#64748B', fontSize: 14 }}>Sign in to your dashboard</p>
          </div>
          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="admin@example.com" required />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 4 }}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
            </div>
            {loginError && <p style={{ color: '#EF4444', fontSize: 13, marginBottom: 12 }}>{loginError}</p>}
            <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '12px 16px' }}>Sign In</button>
          </form>
        </div>
      </div>
    );
  }

  const filteredItems = selectedCategory ? menuItems.filter(i => i.category_id === selectedCategory) : menuItems;
  const storeObj = stores.find(s => s.id === Number(selectedStore));

  const navItems: Array<{ id: PageId; icon: string; label: string }> = [
    { id: 'dashboard', icon: 'fa-chart-pie', label: 'Dashboard' },
    { id: 'orders', icon: 'fa-clipboard-list', label: 'Orders' },
    { id: 'menu', icon: 'fa-mug-hot', label: 'Menu' },
    { id: 'inventory', icon: 'fa-boxes-stacked', label: 'Inventory' },
    { id: 'tables', icon: 'fa-chair', label: 'Tables' },
    { id: 'rewards', icon: 'fa-gift', label: 'Rewards' },
    { id: 'vouchers', icon: 'fa-ticket', label: 'Vouchers' },
    { id: 'reports', icon: 'fa-chart-line', label: 'Reports' },
    { id: 'customers', icon: 'fa-users', label: 'Customers' },
    { id: 'store', icon: 'fa-store', label: 'Store Settings' },
  ];

  const pageTitle: Record<PageId, string> = {
    dashboard: 'Dashboard',
    orders: 'Orders',
    menu: 'Menu Management',
    inventory: 'Inventory',
    tables: 'Tables',
    rewards: 'Rewards',
    vouchers: 'Vouchers',
    reports: 'Reports',
    customers: 'Customers',
    store: 'Store Settings',
  };

  return (
    <div style={{ height: '100vh', display: 'flex', overflow: 'hidden', background: '#F5F7FA' }}>
      {/* Sidebar */}
      <aside style={{ width: 280, background: '#002F6C', color: 'white', display: 'flex', flexDirection: 'column', flexShrink: 0, overflowY: 'auto' }}>
        <div style={{ padding: '24px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
          <i className="fas fa-mug-saucer" style={{ color: '#FFD166', fontSize: 28 }}></i>
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5 }}>ZUS Merchant</span>
        </div>
        <nav style={{ flex: 1, padding: '0 12px' }}>
          {navItems.map(n => (
            <div
              key={n.id}
              onClick={() => setPage(n.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px',
                borderRadius: 14, fontWeight: page === n.id ? 600 : 500, marginBottom: 4,
                cursor: 'pointer', fontSize: 15,
                background: page === n.id ? 'rgba(255,255,255,0.18)' : 'transparent',
                color: page === n.id ? 'white' : 'rgba(255,255,255,0.85)',
                transition: 'all 0.15s',
              }}
            >
              <i className={`fas ${n.icon}`} style={{ width: 22, fontSize: 18, textAlign: 'center' }}></i>
              {n.label}
            </div>
          ))}
        </nav>
        <div style={{ padding: '24px 16px 28px', borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, background: '#1E4A7A', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 18, border: '1.5px solid rgba(255,255,255,0.2)' }}>ZH</div>
            <div>
              <div style={{ fontWeight: 500, fontSize: 15 }}>ZUS HQ</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>Admin</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Top Bar */}
        <header style={{ background: 'white', padding: '12px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #E9ECF2', boxShadow: '0 2px 6px rgba(0,0,0,0.01)' }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: '#002F6C', letterSpacing: -0.5 }}>{pageTitle[page]}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <div style={{ position: 'relative', fontSize: 20, color: '#475569', cursor: 'pointer' }}>
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

        {/* Content */}
        <main style={{ flex: 1, padding: '28px 32px', overflowY: 'auto' }}>
          <div className="page-enter">
            {loading && <div style={{ textAlign: 'center', padding: 40, color: '#64748B' }}><i className="fas fa-spinner fa-spin"></i> Loading...</div>}

            {/* DASHBOARD */}
            {page === 'dashboard' && dashboard && (
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20, marginBottom: 28 }}>
                  <StatCard icon="fa-clipboard" color="#002F6C" label="Orders Today" value={String(dashboard.orders_today)} />
                  <StatCard icon="fa-dollar-sign" color="#059669" label="Revenue Today" value={formatRM(dashboard.revenue_today)} />
                  <StatCard icon="fa-fire" color="#EA580C" label="Active Orders" value={String(dashboard.total_orders)} />
                  <StatCard icon="fa-clock" color="#7C3AED" label="Total Customers" value={String(dashboard.total_customers)} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 24 }}>
                  <div className="card">
                    <h3 style={{ marginBottom: 16 }}><i className="fas fa-bolt"></i> Orders by Type</h3>
                    {Object.keys(dashboard.orders_by_type).length === 0 ? (
                      <p style={{ color: '#94A3B8' }}>No orders yet</p>
                    ) : (
                      Object.entries(dashboard.orders_by_type).map(([type, count]) => (
                        <div key={type} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #EDF2F8' }}>
                          <span style={{ textTransform: 'capitalize' }}>{type.replace('_', ' ')}</span>
                          <strong>{String(count)}</strong>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="card">
                    <h3 style={{ marginBottom: 16 }}>Revenue</h3>
                    <div style={{ fontSize: 36, fontWeight: 700, color: '#059669' }}>{formatRM(dashboard.total_revenue)}</div>
                    <p style={{ color: '#64748B', marginTop: 8 }}>Total all-time revenue</p>
                  </div>
                </div>
                <div style={{ marginTop: 20, background: '#EFF6FF', borderRadius: 40, padding: '14px 24px', color: '#002F6C' }}>
                  Total orders: {dashboard.total_orders} | Total revenue: {formatRM(dashboard.total_revenue)} | Customers: {dashboard.total_customers}
                </div>
              </div>
            )}

            {/* ORDERS */}
            {page === 'orders' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h3>Order Management</h3>
                </div>
                <div className="table-wrapper" style={{ overflowX: 'auto', borderRadius: 20, background: 'white', border: '1px solid #ECF1F7' }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Order #</th>
                        <th>Type</th>
                        <th>Total</th>
                        <th>Status</th>
                        <th>Created</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.length === 0 ? (
                        <tr><td colSpan={6} style={{ textAlign: 'center', color: '#94A3B8', padding: 40 }}>No orders yet</td></tr>
                      ) : orders.map(o => (
                        <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => openOrderDetail(o)}>
                          <td style={{ fontWeight: 600 }}>{o.order_number}</td>
                          <td><span style={{ textTransform: 'capitalize' }}>{o.order_type?.replace('_', ' ')}</span></td>
                          <td>{formatRM(o.total)}</td>
                          <td>{statusBadge(o.status)}</td>
                          <td>{new Date(o.created_at).toLocaleDateString()}</td>
                          <td>
                            <button className="btn btn-sm" onClick={e => { e.stopPropagation(); openOrderDetail(o); }}>View</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* MENU */}
            {page === 'menu' && (
              <div>
                {selectedStore === 'all' ? (
                  <div className="card" style={{ textAlign: 'center', padding: 60, color: '#64748B' }}>
                    <i className="fas fa-store" style={{ fontSize: 40, marginBottom: 16 }}></i>
                    <p>Select a specific store to manage its menu</p>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                      <h3>Menu &middot; {storeObj?.name}</h3>
                      <button className="btn btn-primary" onClick={openAddItemModal}><i className="fas fa-plus"></i> New Item</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 24 }}>
                      <div className="card">
                        <h4 style={{ marginBottom: 12 }}>Categories</h4>
                        <ul style={{ listStyle: 'none' }}>
                          {categories.map(c => (
                            <li
                              key={c.id}
                              onClick={() => setSelectedCategory(c.id)}
                              style={{
                                padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                                background: selectedCategory === c.id ? '#EFF6FF' : 'transparent',
                                fontWeight: selectedCategory === c.id ? 600 : 400, color: selectedCategory === c.id ? '#002F6C' : '#334155',
                                marginBottom: 4,
                              }}
                            >
                              {c.name}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="card">
                        <h4 style={{ marginBottom: 16 }}>Items ({filteredItems.length})</h4>
                        <div style={{ display: 'grid', gap: 12 }}>
                          {filteredItems.map(item => (
                            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #EDF2F8' }}>
                              <div>
                                <strong>{item.name}</strong>
                                <span style={{ marginLeft: 12, color: '#059669', fontWeight: 600 }}>{formatRM(item.base_price)}</span>
                                {item.description && <p style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>{item.description}</p>}
                              </div>
                              <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={item.is_available}
                                  onChange={() => toggleMenuItem(item)}
                                  style={{ opacity: 0, width: 0, height: 0 }}
                                />
                                <span style={{
                                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                  backgroundColor: item.is_available ? '#002F6C' : '#CBD5E1',
                                  borderRadius: 34, transition: '.2s',
                                }}>
                                  <span style={{
                                    position: 'absolute', height: 18, width: 18, left: 3, bottom: 3,
                                    backgroundColor: 'white', borderRadius: '50%',
                                    transform: item.is_available ? 'translateX(20px)' : 'translateX(0)',
                                    transition: '.2s',
                                  }}></span>
                                </span>
                              </label>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* INVENTORY */}
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

            {/* TABLES */}
            {page === 'tables' && (
              <div>
                {selectedStore === 'all' ? (
                  <div className="card" style={{ textAlign: 'center', padding: 60, color: '#64748B' }}>
                    <i className="fas fa-chair" style={{ fontSize: 40, marginBottom: 16 }}></i>
                    <p>Select a specific store to manage tables</p>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                      <h3>Floor Plan &middot; {storeObj?.name}</h3>
                      <button className="btn btn-primary" onClick={openAddTableModal}><i className="fas fa-plus"></i> Add Table</button>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
                      {tables.map(t => (
                        <div key={t.id} className="card" style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>T{t.table_number}</div>
                          <div style={{ marginBottom: 8 }}>{t.capacity} seats</div>
                          <span className={`badge ${t.is_active ? 'badge-green' : 'badge-gray'}`}>{t.is_active ? 'Active' : 'Inactive'}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* REWARDS */}
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

            {/* VOUCHERS */}
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

            {/* REPORTS */}
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

            {/* CUSTOMERS */}
            {page === 'customers' && (
              <div>
                <h3 style={{ marginBottom: 20 }}>All Customers</h3>
                {dashboard ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
                      <div className="card" style={{ textAlign: 'center' }}>
                        <div style={{ color: '#64748B', fontSize: 13 }}>Total Customers</div>
                        <div style={{ fontSize: 28, fontWeight: 700 }}>{dashboard.total_customers}</div>
                      </div>
                      <div className="card" style={{ textAlign: 'center' }}>
                        <div style={{ color: '#64748B', fontSize: 13 }}>Total Orders</div>
                        <div style={{ fontSize: 28, fontWeight: 700 }}>{dashboard.total_orders}</div>
                      </div>
                      <div className="card" style={{ textAlign: 'center' }}>
                        <div style={{ color: '#64748B', fontSize: 13 }}>Total Revenue</div>
                        <div style={{ fontSize: 28, fontWeight: 700, color: '#059669' }}>{formatRM(dashboard.total_revenue)}</div>
                      </div>
                    </div>
                    <div className="card" style={{ textAlign: 'center', padding: 40 }}>
                      <i className="fas fa-users" style={{ fontSize: 32, color: '#94A3B8', marginBottom: 12 }}></i>
                      <p style={{ color: '#64748B' }}>Individual customer profiles require a dedicated admin customers endpoint.</p>
                    </div>
                  </>
                ) : (
                  <div className="card" style={{ textAlign: 'center', padding: 60, color: '#64748B' }}>
                    <i className="fas fa-users" style={{ fontSize: 40, marginBottom: 16 }}></i>
                    <p>No customer data available</p>
                  </div>
                )}
              </div>
            )}

            {/* STORE SETTINGS */}
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

      {/* Store Selector Modal */}
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

      {/* Generic Modal */}
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

function StatCard({ icon, color, label, value }: { icon: string; color: string; label: string; value: string }) {
  return (
    <div style={{ background: 'white', borderRadius: 24, padding: '22px 20px', border: '1px solid #EDF2F7', boxShadow: '0 6px 12px -6px rgba(0,47,108,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <div style={{ fontSize: 13, color: '#64748B', marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div>
      </div>
      <i className={`fas ${icon}`} style={{ fontSize: 28, color }}></i>
    </div>
  );
}

function AddItemForm({ storeId, categories, token, onClose }: { storeId: number; categories: Category[]; token: string; onClose: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id || 0);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch(`/admin/stores/${storeId}/items`, token, {
        method: 'POST',
        body: JSON.stringify({
          name, description, base_price: parseFloat(price),
          category_id: categoryId, is_available: true, display_order: 0,
        }),
      });
      onClose();
    } catch {} finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Name</label>
        <input value={name} onChange={e => setName(e.target.value)} required />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Description</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{ outline: 'none', border: '1px solid #DDE3E9', borderRadius: 12, padding: '8px 14px', fontSize: 14, width: '100%' }} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Price (RM)</label>
        <input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} required />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Category</label>
        <select value={categoryId} onChange={e => setCategoryId(Number(e.target.value))}>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={saving}>
        {saving ? 'Saving...' : 'Create Item'}
      </button>
    </form>
  );
}

function AddTableForm({ storeId, token, onClose }: { storeId: number; token: string; onClose: () => void }) {
  const [number, setNumber] = useState('');
  const [capacity, setCapacity] = useState('4');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch(`/admin/stores/${storeId}/tables`, token, {
        method: 'POST',
        body: JSON.stringify({ table_number: number, capacity: parseInt(capacity) }),
      });
      onClose();
    } catch {} finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Table Number</label>
        <input value={number} onChange={e => setNumber(e.target.value)} required placeholder="e.g. 11" />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Capacity</label>
        <input type="number" value={capacity} onChange={e => setCapacity(e.target.value)} required />
      </div>
      <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={saving}>
        {saving ? 'Saving...' : 'Add Table'}
      </button>
    </form>
  );
}

function AddRewardForm({ token, onClose }: { token: string; onClose: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [pointsCost, setPointsCost] = useState('');
  const [rewardType, setRewardType] = useState('free_item');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/admin/rewards', token, {
        method: 'POST',
        body: JSON.stringify({
          name, description, points_cost: parseInt(pointsCost),
          reward_type: rewardType, is_active: true,
        }),
      });
      onClose();
    } catch {} finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Name</label>
        <input value={name} onChange={e => setName(e.target.value)} required />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Description</label>
        <input value={description} onChange={e => setDescription(e.target.value)} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Points Cost</label>
        <input type="number" value={pointsCost} onChange={e => setPointsCost(e.target.value)} required />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Type</label>
        <select value={rewardType} onChange={e => setRewardType(e.target.value)}>
          <option value="free_item">Free Item</option>
          <option value="discount_voucher">Discount Voucher</option>
          <option value="custom">Custom</option>
        </select>
      </div>
      <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={saving}>
        {saving ? 'Creating...' : 'Create Reward'}
      </button>
    </form>
  );
}

function AddVoucherForm({ token, onClose }: { token: string; onClose: () => void }) {
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [discountType, setDiscountType] = useState('fixed');
  const [discountValue, setDiscountValue] = useState('');
  const [minOrder, setMinOrder] = useState('0');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/admin/vouchers', token, {
        method: 'POST',
        body: JSON.stringify({
          code: code.toUpperCase(), description,
          discount_type: discountType,
          discount_value: parseFloat(discountValue),
          min_order: parseFloat(minOrder),
          is_active: true,
        }),
      });
      onClose();
    } catch {} finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Code</label>
        <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} required placeholder="e.g. SUMMER20" />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Description</label>
        <input value={description} onChange={e => setDescription(e.target.value)} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Type</label>
          <select value={discountType} onChange={e => setDiscountType(e.target.value)}>
            <option value="fixed">Fixed (RM)</option>
            <option value="percent">Percent (%)</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Value</label>
          <input type="number" step="0.01" value={discountValue} onChange={e => setDiscountValue(e.target.value)} required />
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Min Order (RM)</label>
        <input type="number" step="0.01" value={minOrder} onChange={e => setMinOrder(e.target.value)} />
      </div>
      <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={saving}>
        {saving ? 'Creating...' : 'Create Voucher'}
      </button>
    </form>
  );
}

function StoreSettingsForm({ store, token }: { store: Store; token: string }) {
  const [name, setName] = useState(store.name);
  const [address, setAddress] = useState(store.address);
  const [phone, setPhone] = useState(store.phone);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const res = await apiFetch(`/stores/${store.id}`, token, {
        method: 'PUT',
        body: JSON.stringify({ name, address, phone }),
      });
      if (res.ok) setSaved(true);
    } catch {} finally { setSaving(false); }
  }

  return (
    <div className="card">
      <h3 style={{ marginBottom: 20 }}>Store Configuration</h3>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Store Name</label>
          <input value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Address</label>
          <input value={address} onChange={e => setAddress(e.target.value)} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Phone</label>
          <input value={phone} onChange={e => setPhone(e.target.value)} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Slug</label>
          <input value={store.slug} disabled style={{ background: '#F1F5F9' }} />
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          {saved && <span style={{ color: '#059669', fontWeight: 500 }}><i className="fas fa-check"></i> Saved!</span>}
        </div>
      </form>
    </div>
  );
}
