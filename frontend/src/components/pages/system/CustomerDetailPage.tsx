'use client';

import { useState, useEffect, FormEvent } from 'react';
import { apiFetch, formatRM } from '@/lib/merchant-api';
import type { CustomerDetail, CustomerWalletTransaction, CustomerLoyaltyTransaction, MerchantOrder } from '@/lib/merchant-types';
import { THEME } from '@/lib/theme';
import { DataTable, Pagination, ColumnDef } from '@/components/ui';

interface PaginatedResponse<T> {
  total: number;
  page: number;
  page_size: number;
  items: T[];
}

type TabId = 'profile' | 'orders' | 'loyalty' | 'wallet';

interface CustomerDetailPageProps {
  token: string;
  customerId: number;
  onBack: () => void;
}

export default function CustomerDetailPage({ token, customerId, onBack }: CustomerDetailPageProps) {
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('profile');

  const [orders, setOrders] = useState<PaginatedResponse<MerchantOrder> | null>(null);
  const [ordersPage, setOrdersPage] = useState(1);
  const [loyalty, setLoyalty] = useState<PaginatedResponse<CustomerLoyaltyTransaction> | null>(null);
  const [loyaltyPage, setLoyaltyPage] = useState(1);
  const [wallet, setWallet] = useState<PaginatedResponse<CustomerWalletTransaction> | null>(null);
  const [walletPage, setWalletPage] = useState(1);

  const [editingCustomer, setEditingCustomer] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const PAGE_SIZE = 10;

  useEffect(() => {
    fetchDetail();
  }, [customerId]);

  async function fetchDetail() {
    setLoading(true);
    try {
      const res = await apiFetch(`/admin/customers/${customerId}`, token);
      if (res.ok) {
        const d = await res.json();
        setDetail(d);
        setEditName(d.name || '');
        setEditPhone(d.phone || '');
        setEditEmail(d.email || '');
      }
    } catch {} finally { setLoading(false); }
  }

  async function fetchOrders(page: number) {
    try {
      const res = await apiFetch(`/admin/customers/${customerId}/orders?page=${page}&page_size=${PAGE_SIZE}`, token);
      if (res.ok) {
        const data = await res.json();
        setOrders(typeof data.total === 'number' ? data : { total: Array.isArray(data) ? data.length : 0, page, page_size: PAGE_SIZE, items: Array.isArray(data) ? data : (data.orders || []) });
      }
    } catch {}
  }

  async function fetchLoyalty(page: number) {
    try {
      const res = await apiFetch(`/admin/customers/${customerId}/loyalty-history?page=${page}&page_size=${PAGE_SIZE}`, token);
      if (res.ok) {
        const data = await res.json();
        setLoyalty(typeof data.total === 'number' ? data : { total: Array.isArray(data) ? data.length : 0, page, page_size: PAGE_SIZE, items: Array.isArray(data) ? data : (data.history || []) });
      }
    } catch {}
  }

  async function fetchWallet(page: number) {
    try {
      const res = await apiFetch(`/admin/customers/${customerId}/wallet-history?page=${page}&page_size=${PAGE_SIZE}`, token);
      if (res.ok) {
        const data = await res.json();
        setWallet(typeof data.total === 'number' ? data : { total: Array.isArray(data) ? data.length : 0, page, page_size: PAGE_SIZE, items: Array.isArray(data) ? data : (data.transactions || []) });
      }
    } catch {}
  }

  useEffect(() => {
    if (activeTab === 'orders') fetchOrders(ordersPage);
    else if (activeTab === 'loyalty') fetchLoyalty(loyaltyPage);
    else if (activeTab === 'wallet') fetchWallet(walletPage);
  }, [activeTab, ordersPage, loyaltyPage, walletPage]);

  async function handleEditSubmit(e: FormEvent) {
    e.preventDefault();
    if (!detail) return;
    setEditSaving(true);
    setEditError('');
    try {
      const res = await apiFetch(`/admin/customers/${detail.id}`, token, {
        method: 'PUT',
        body: JSON.stringify({ name: editName, phone: editPhone, email: editEmail }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setEditError(data.detail || `Failed (${res.status})`);
        return;
      }
      setEditingCustomer(false);
      await fetchDetail();
    } catch { setEditError('Network error'); } finally { setEditSaving(false); }
  }

  const tabs: { id: TabId; label: string; icon: string }[] = [
    { id: 'profile', label: 'Profile', icon: 'fas fa-user' },
    { id: 'orders', label: 'Orders', icon: 'fas fa-receipt' },
    { id: 'loyalty', label: 'Loyalty', icon: 'fas fa-star' },
    { id: 'wallet', label: 'Wallet', icon: 'fas fa-wallet' },
  ];

  // Column definitions for Orders table
  const ordersColumns: ColumnDef<MerchantOrder>[] = [
    { key: 'order_number', header: 'Order #' },
    { key: 'order_type', header: 'Type', render: (o) => <span style={{ textTransform: 'capitalize' }}>{o.order_type?.replace('_', ' ')}</span> },
    { key: 'total', header: 'Total', render: (o) => formatRM(o.total) },
    { key: 'status', header: 'Status', render: (o) => (
      <span className={`badge ${o.status === 'completed' ? 'badge-green' : o.status === 'cancelled' ? 'badge-red' : 'badge-yellow'}`}>
        {o.status}
      </span>
    )},
    { key: 'created_at', header: 'Date', render: (o) => new Date(o.created_at).toLocaleDateString() },
  ];

  // Column definitions for Loyalty table
  const loyaltyColumns: ColumnDef<CustomerLoyaltyTransaction>[] = [
    { key: 'created_at', header: 'Date', render: (t) => new Date(t.created_at).toLocaleDateString() },
    { key: 'description', header: 'Description', render: (t) => t.description || t.type },
    { key: 'type', header: 'Type', render: (t) => (
      <span className={`badge ${t.type === 'earn' ? 'badge-green' : 'badge-red'}`}>{t.type}</span>
    )},
    { key: 'points', header: 'Points', render: (t) => (
      <span style={{ color: t.type === 'earn' ? '#059669' : '#EF4444', fontWeight: 600 }}>
        {t.type === 'earn' ? '+' : '-'}{Math.abs(t.points)} pts
      </span>
    )},
  ];

  // Column definitions for Wallet table
  const walletColumns: ColumnDef<CustomerWalletTransaction>[] = [
    { key: 'created_at', header: 'Date', render: (t) => new Date(t.created_at).toLocaleDateString() },
    { key: 'description', header: 'Description', render: (t) => t.description || t.type },
    { key: 'type', header: 'Type', render: (t) => (
      <span className={`badge ${t.type === 'top_up' || t.type === 'refund' ? 'badge-green' : 'badge-red'}`}>{t.type}</span>
    )},
    { key: 'amount', header: 'Amount', render: (t) => (
      <span style={{ color: t.type === 'top_up' || t.type === 'refund' ? '#059669' : '#EF4444', fontWeight: 600 }}>
        {t.type === 'top_up' || t.type === 'refund' ? '+' : '-'}{formatRM(t.amount)}
      </span>
    )},
  ];

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: THEME.textMuted }}>
        <i className="fas fa-spinner fa-spin" style={{ fontSize: 40 }}></i>
        <p style={{ marginTop: 16 }}>Loading customer...</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: THEME.textMuted }}>
        <p>Customer not found</p>
        <button className="btn btn-primary" onClick={onBack}>Back to Customers</button>
      </div>
    );
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#DBEAFE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700, color: '#1E3A8A' }}>
              {(detail.name || '?')[0].toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 20 }}>{detail.name || '-'}</div>
              <div style={{ fontSize: 13, color: THEME.textMuted }}>{detail.email || detail.phone || '-'}</div>
            </div>
            <span className="badge badge-blue">{detail.tier || 'Standard'}</span>
            <span className="badge badge-yellow">{detail.points_balance} pts</span>
            <span className="badge badge-green">{formatRM(detail.wallet_balance || 0)} wallet</span>
          </div>
          <button className="btn btn-sm" onClick={onBack}>
            <i className="fas fa-arrow-left"></i> Back
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${THEME.borderLight}`, marginBottom: 24 }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`btn btn-sm ${activeTab === tab.id ? 'btn-primary' : ''}`}
            onClick={() => setActiveTab(tab.id)}
            style={{ borderRadius: '8px 8px 0 0' }}
          >
            <i className={tab.icon}></i> {tab.label}
          </button>
        ))}
      </div>

      <div className="card">
        {activeTab === 'profile' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            <div>
              <h4 style={{ marginBottom: 12, fontSize: 14, fontWeight: 600, color: THEME.textSecondary }}>Profile</h4>
              {editingCustomer ? (
                <form onSubmit={handleEditSubmit}>
                  {editError && (
                    <div style={{ background: '#FEF2F2', color: '#991B1B', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
                      <i className="fas fa-exclamation-circle"></i> {editError}
                    </div>
                  )}
                  <div style={{ marginBottom: 10 }}>
                    <label style={labelStyle}>Name</label>
                    <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Customer name" />
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <label style={labelStyle}>Phone</label>
                    <input value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="+60 12-345 6789" />
                    <div style={hintStyle}>Used for passwordless login.</div>
                  </div>
                  <div style={{ marginBottom: 10 }}>
                    <label style={labelStyle}>Email</label>
                    <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="customer@email.com" />
                    <div style={hintStyle}>Recovery channel.</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="submit" className="btn btn-primary" disabled={editSaving}>{editSaving ? 'Saving...' : 'Save Changes'}</button>
                    <button type="button" className="btn" onClick={() => setEditingCustomer(false)}>Cancel</button>
                  </div>
                </form>
              ) : (
                <>
                  <p style={{ marginBottom: 8 }}><strong>Name:</strong> {detail.name || '-'}</p>
                  <p style={{ marginBottom: 8 }}><strong>Phone:</strong> {detail.phone || '-'}</p>
                  <p style={{ marginBottom: 8 }}><strong>Email:</strong> {detail.email || (
                    <span style={{ color: '#D97706', fontWeight: 500 }}>Not set</span>
                  )}</p>
                  <p style={{ marginBottom: 8 }}><strong>Tier:</strong> <span className="badge badge-blue">{detail.tier || 'Standard'}</span></p>
                  <p style={{ marginBottom: 12 }}><strong>Joined:</strong> {detail.created_at ? new Date(detail.created_at).toLocaleDateString() : '-'}</p>
                  <button className="btn btn-sm" onClick={() => setEditingCustomer(true)}>
                    <i className="fas fa-edit"></i> Edit
                  </button>
                </>
              )}
            </div>
            <div>
              <h4 style={{ marginBottom: 12, fontSize: 14, fontWeight: 600, color: THEME.textSecondary }}>Balances</h4>
              <p style={{ marginBottom: 8 }}><strong>Loyalty Points:</strong> {detail.points_balance} pts</p>
              <p style={{ marginBottom: 8 }}><strong>Wallet Balance:</strong> {formatRM(detail.wallet_balance || 0)}</p>
              <p style={{ marginBottom: 8 }}><strong>Total Orders:</strong> {detail.total_orders}</p>
              <p><strong>Total Spent:</strong> {formatRM(detail.total_spent)}</p>
            </div>
          </div>
        )}

        {activeTab === 'orders' && (
          <>
            {!orders ? (
              <div style={{ textAlign: 'center', padding: 20, color: THEME.textMuted }}><i className="fas fa-spinner fa-spin"></i></div>
            ) : (
              <>
                <DataTable
                  data={orders.items}
                  columns={ordersColumns}
                  emptyMessage="No orders found"
                />
                <Pagination
                  page={ordersPage}
                  totalPages={Math.max(1, Math.ceil(orders.total / PAGE_SIZE))}
                  onPageChange={setOrdersPage}
                />
              </>
            )}
          </>
        )}

        {activeTab === 'loyalty' && (
          <>
            {!loyalty ? (
              <div style={{ textAlign: 'center', padding: 20, color: THEME.textMuted }}><i className="fas fa-spinner fa-spin"></i></div>
            ) : (
              <>
                <DataTable
                  data={loyalty.items}
                  columns={loyaltyColumns}
                  emptyMessage="No loyalty transactions found"
                />
                <Pagination
                  page={loyaltyPage}
                  totalPages={Math.max(1, Math.ceil(loyalty.total / PAGE_SIZE))}
                  onPageChange={setLoyaltyPage}
                />
              </>
            )}
          </>
        )}

        {activeTab === 'wallet' && (
          <>
            {!wallet ? (
              <div style={{ textAlign: 'center', padding: 20, color: THEME.textMuted }}><i className="fas fa-spinner fa-spin"></i></div>
            ) : (
              <>
                <DataTable
                  data={wallet.items}
                  columns={walletColumns}
                  emptyMessage="No wallet transactions found"
                />
                <Pagination
                  page={walletPage}
                  totalPages={Math.max(1, Math.ceil(wallet.total / PAGE_SIZE))}
                  onPageChange={setWalletPage}
                />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4, color: THEME.textSecondary };
const hintStyle: React.CSSProperties = { fontSize: 11, color: THEME.textMuted, marginTop: 2 };
