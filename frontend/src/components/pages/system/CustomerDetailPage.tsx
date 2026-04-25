'use client';

import { useState, useEffect, FormEvent, useCallback } from 'react';
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

type TabId = 'profile' | 'orders' | 'loyalty' | 'wallet' | 'vouchers' | 'actions';

interface CustomerDetailPageProps {
  token: string;
  customerId: number;
  onBack: () => void;
}

// ── Action Dialog: Award Points ──
function AwardPointsDialog({ customerId, token: _token, onDone }: { customerId: number; token: string; onDone: () => void }) {
  const [points, setPoints] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const pts = parseInt(points);
    if (!pts) { setError('Enter a non-zero point value'); return; }
    setSaving(true); setError(''); setResult(null);
    try {
      const res = await apiFetch(`/admin/customers/${customerId}/adjust-points`, undefined, {
        method: 'POST',
        body: JSON.stringify({ points: pts, reason: reason || `Admin adjustment: ${pts > 0 ? '+' : ''}${pts} pts` }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.detail || 'Failed'); return; }
      const d = await res.json();
      setResult(`Done! New balance: ${d.new_balance} pts`);
      setPoints(''); setReason('');
      onDone();
    } catch { setError('Network error'); } finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit} style={{ padding: '12px 16px', background: THEME.bgMuted, borderRadius: 12, marginBottom: 16 }}>
      <div style={{ fontWeight: 600, fontSize: 14, color: THEME.primary, marginBottom: 8 }}><i className="fas fa-star" style={{ marginRight: 6 }}></i>Award / Deduct Points</div>
      {error && <div style={{ color: '#DC2626', fontSize: 12, marginBottom: 8 }}><i className="fas fa-exclamation-circle"></i> {error}</div>}
      {result && <div style={{ color: '#059669', fontSize: 12, marginBottom: 8 }}><i className="fas fa-check-circle"></i> {result}</div>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: '0 0 100px' }}>
          <label style={labelStyle}>Points</label>
          <input type="number" value={points} onChange={e => setPoints(e.target.value)} placeholder="+/- pts" style={{ width: '100%' }} />
          <div style={hintStyle}>Negative to deduct</div>
        </div>
        <div style={{ flex: 1, minWidth: 150 }}>
          <label style={labelStyle}>Reason</label>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Loyalty bonus" />
        </div>
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !points}>{saving ? 'Applying...' : 'Apply'}</button>
      </div>
    </form>
  );
}

// ── Action Dialog: Award Voucher ──
function AwardVoucherDialog({ customerId, token, onDone }: { customerId: number; token: string; onDone: () => void }) {
  const [vouchers, setVouchers] = useState<{ id: number; code: string; title: string | null; discount_type: string; discount_value: number }[]>([]);
  const [selectedVoucher, setSelectedVoucher] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/admin/vouchers?is_active=true&page_size=100');
        if (res.ok) {
          const data = await res.json();
          setVouchers(data.vouchers || data.items || data || []);
          setLoaded(true);
        }
      } catch {}
    })();
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!selectedVoucher) { setError('Select a voucher'); return; }
    setSaving(true); setError(''); setResult(null);
    try {
      const res = await apiFetch(`/admin/customers/${customerId}/award-voucher`, undefined, {
        method: 'POST',
        body: JSON.stringify({ voucher_id: parseInt(selectedVoucher), reason: reason || 'Admin awarded' }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.detail || 'Failed'); return; }
      const d = await res.json();
      setResult(`Awarded "${d.voucher_title}" (${d.voucher_code})`);
      setSelectedVoucher(''); setReason('');
      onDone();
    } catch { setError('Network error'); } finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit} style={{ padding: '12px 16px', background: THEME.bgMuted, borderRadius: 12, marginBottom: 16 }}>
      <div style={{ fontWeight: 600, fontSize: 14, color: THEME.primary, marginBottom: 8 }}><i className="fas fa-ticket-alt" style={{ marginRight: 6 }}></i>Award Voucher</div>
      {error && <div style={{ color: '#DC2626', fontSize: 12, marginBottom: 8 }}><i className="fas fa-exclamation-circle"></i> {error}</div>}
      {result && <div style={{ color: '#059669', fontSize: 12, marginBottom: 8 }}><i className="fas fa-check-circle"></i> {result}</div>}
      {!loaded ? (
        <div style={{ fontSize: 12, color: THEME.textMuted }}><i className="fas fa-spinner fa-spin"></i> Loading vouchers...</div>
      ) : vouchers.length === 0 ? (
        <div style={{ fontSize: 12, color: THEME.textMuted }}>No active vouchers available. Create one in Vouchers first.</div>
      ) : (
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label style={labelStyle}>Voucher</label>
            <select value={selectedVoucher} onChange={e => setSelectedVoucher(e.target.value)} style={{ width: '100%', padding: '6px 10px', borderRadius: 8, border: `1px solid ${THEME.accentLight}`, fontSize: 13 }}>
              <option value="">Select voucher...</option>
              {vouchers.map(v => (
                <option key={v.id} value={v.id}>{v.title || v.code} — {v.discount_type}: {v.discount_value}{v.discount_type === 'percent' ? '%' : ' RM'}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 120 }}>
            <label style={labelStyle}>Reason</label>
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Compensation" />
          </div>
          <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !selectedVoucher}>{saving ? 'Awarding...' : 'Award'}</button>
        </div>
      )}
    </form>
  );
}

// ── Action Dialog: Set Tier ──
function SetTierDialog({ customerId, currentTier, token: _token, onDone }: { customerId: number; currentTier: string | null; token: string; onDone: () => void }) {
  const [tier, setTier] = useState(currentTier || 'bronze');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true); setError(''); setResult(null);
    try {
      const res = await apiFetch(`/admin/customers/${customerId}/set-tier`, undefined, {
        method: 'POST',
        body: JSON.stringify({ tier, reason: reason || `Admin set tier to ${tier}` }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.detail || 'Failed'); return; }
      setResult(`Tier set to ${tier}`);
      setReason('');
      onDone();
    } catch { setError('Network error'); } finally { setSaving(false); }
  }

  const tiers = ['bronze', 'silver', 'gold', 'platinum'];

  return (
    <form onSubmit={handleSubmit} style={{ padding: '12px 16px', background: THEME.bgMuted, borderRadius: 12, marginBottom: 16 }}>
      <div style={{ fontWeight: 600, fontSize: 14, color: THEME.primary, marginBottom: 8 }}><i className="fas fa-medal" style={{ marginRight: 6 }}></i>Set Tier Override</div>
      {error && <div style={{ color: '#DC2626', fontSize: 12, marginBottom: 8 }}><i className="fas fa-exclamation-circle"></i> {error}</div>}
      {result && <div style={{ color: '#059669', fontSize: 12, marginBottom: 8 }}><i className="fas fa-check-circle"></i> {result}</div>}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: '0 0 140px' }}>
          <label style={labelStyle}>Tier</label>
          <select value={tier} onChange={e => setTier(e.target.value)} style={{ width: '100%', padding: '6px 10px', borderRadius: 8, border: `1px solid ${THEME.accentLight}`, fontSize: 13 }}>
            {tiers.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 150 }}>
          <label style={labelStyle}>Reason</label>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. VIP upgrade" />
        </div>
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Setting...' : 'Set Tier'}</button>
      </div>
    </form>
  );
}

// ── Action: Approve Profile ──
function ApproveProfileButton({ customerId, token: _token, onDone }: { customerId: number; token: string; onDone: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<string | null>(null);

  async function handleApprove() {
    if (!confirm('Approve this customer? This will verify their phone and activate their account.')) return;
    setSaving(true); setError(''); setResult(null);
    try {
      const res = await apiFetch(`/admin/customers/${customerId}/approve-profile`, undefined, { method: 'POST' });
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.detail || 'Failed'); return; }
      const data = await res.json().catch(() => ({}));
      setResult(data.note || 'Customer approved and activated');
      onDone();
    } catch { setError('Network error'); } finally { setSaving(false); }
  }

  return (
    <div style={{ padding: '12px 16px', background: '#FEF3C7', borderRadius: 12, marginBottom: 16, border: '1px solid #F59E0B' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: 14, color: '#92400E', marginBottom: 4 }}><i className="fas fa-user-check" style={{ marginRight: 6 }}></i>Phone Not Verified</div>
          <div style={{ fontSize: 12, color: '#78350F' }}>Approve to verify this customer&apos;s phone and activate their account. They can update their name later from the app.</div>
          {error && <div style={{ color: '#DC2626', fontSize: 12, marginTop: 4 }}><i className="fas fa-exclamation-circle"></i> {error}</div>}
          {result && <div style={{ color: '#059669', fontSize: 12, marginTop: 4 }}><i className="fas fa-check-circle"></i> {result}</div>}
        </div>
        <button className="btn btn-primary btn-sm" disabled={saving} onClick={handleApprove}>
          {saving ? 'Approving...' : <><i className="fas fa-check"></i> Approve Profile</>}
        </button>
      </div>
    </div>
  );
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
  const [customerWallet, setCustomerWallet] = useState<{ rewards: any[]; vouchers: any[] } | null>(null);
  const [loadingWalletItems, setLoadingWalletItems] = useState(false);

  const [editingCustomer, setEditingCustomer] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const PAGE_SIZE = 10;

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/admin/customers/${customerId}`);
      if (res.ok) {
        const d = await res.json();
        setDetail(d);
        setEditName(d.name || '');
        setEditPhone(d.phone || '');
        setEditEmail(d.email || '');
      }
    } catch {} finally { setLoading(false); }
  }, [customerId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const fetchOrders = useCallback(async (page: number) => {
    try {
      const res = await apiFetch(`/admin/customers/${customerId}/orders?page=${page}&page_size=${PAGE_SIZE}`);
      if (res.ok) {
        const data = await res.json();
        setOrders(typeof data.total === 'number' ? data : { total: Array.isArray(data) ? data.length : 0, page, page_size: PAGE_SIZE, items: Array.isArray(data) ? data : (data.orders || []) });
      }
    } catch {}
  }, [customerId]);

  const fetchLoyalty = useCallback(async (page: number) => {
    try {
      const res = await apiFetch(`/admin/customers/${customerId}/loyalty-history?page=${page}&page_size=${PAGE_SIZE}`);
      if (res.ok) {
        const data = await res.json();
        setLoyalty(typeof data.total === 'number' ? data : { total: Array.isArray(data) ? data.length : 0, page, page_size: PAGE_SIZE, items: Array.isArray(data) ? data : (data.history || []) });
      }
    } catch {}
  }, [customerId]);

  const fetchWallet = useCallback(async (page: number) => {
    try {
      const res = await apiFetch(`/admin/customers/${customerId}/wallet-history?page=${page}&page_size=${PAGE_SIZE}`);
      if (res.ok) {
        const data = await res.json();
        setWallet(typeof data.total === 'number' ? data : { total: Array.isArray(data) ? data.length : 0, page, page_size: PAGE_SIZE, items: Array.isArray(data) ? data : (data.transactions || []) });
      }
    } catch {}
  }, [customerId]);

  const fetchCustomerWallet = useCallback(async () => {
    setLoadingWalletItems(true);
    try {
      const res = await apiFetch(`/admin/customers/${customerId}/wallet`);
      if (res.ok) {
        const data = await res.json();
        setCustomerWallet({ rewards: data.rewards || [], vouchers: data.vouchers || [] });
      }
    } catch {} finally { setLoadingWalletItems(false); }
  }, [customerId]);

  useEffect(() => {
    if (activeTab === 'orders') fetchOrders(ordersPage);
    else if (activeTab === 'loyalty') fetchLoyalty(loyaltyPage);
    else if (activeTab === 'wallet') fetchWallet(walletPage);
    else if (activeTab === 'vouchers') fetchCustomerWallet();
  }, [activeTab, ordersPage, loyaltyPage, walletPage, fetchOrders, fetchLoyalty, fetchWallet, fetchCustomerWallet]);

  async function handleEditSubmit(e: FormEvent) {
    e.preventDefault();
    if (!detail) return;
    setEditSaving(true);
    setEditError('');
    try {
      const res = await apiFetch(`/admin/customers/${detail.id}`, undefined, {
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
    { id: 'actions', label: 'Manage', icon: 'fas fa-cog' },
    { id: 'orders', label: 'Orders', icon: 'fas fa-receipt' },
    { id: 'loyalty', label: 'Loyalty', icon: 'fas fa-star' },
    { id: 'wallet', label: 'Wallet', icon: 'fas fa-wallet' },
    { id: 'vouchers', label: 'Rewards & Vouchers', icon: 'fas fa-gift' },
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
            <span className="badge badge-blue">{detail.tier ? detail.tier.charAt(0).toUpperCase() + detail.tier.slice(1) : 'No Tier'}</span>
            <span className="badge badge-yellow">{detail.points_balance} pts</span>
            <span className="badge badge-green">{formatRM(detail.wallet_balance || 0)} wallet</span>
            {!detail.is_profile_complete && <span className="badge badge-red"><i className="fas fa-exclamation-triangle"></i> Incomplete</span>}
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
                  <p style={{ marginBottom: 8 }}><strong>Tier:</strong> <span className="badge badge-blue">{detail.tier ? detail.tier.charAt(0).toUpperCase() + detail.tier.slice(1) : 'No Tier'}</span></p>
                  <p style={{ marginBottom: 8 }}><strong>Phone Verified:</strong> {detail.phone_verified ? <span style={{ color: '#059669' }}>Yes</span> : <span style={{ color: '#EF4444' }}>No</span>}</p>
                  <p style={{ marginBottom: 12 }}><strong>Profile Complete:</strong> {detail.is_profile_complete ? <span style={{ color: '#059669' }}>Yes</span> : <span style={{ color: '#D97706' }}>No {!detail.phone_verified ? '(phone not verified)' : '(name still required)'}</span>}</p>
                  <p style={{ marginBottom: 12 }}><strong>Joined:</strong> {detail.created_at ? new Date(detail.created_at).toLocaleDateString() : '-'}</p>
                  <button className="btn btn-sm" onClick={() => setEditingCustomer(true)}>
                    <i className="fas fa-edit"></i> Edit Profile
                  </button>
                </>
              )}
            </div>
            <div>
              <h4 style={{ marginBottom: 12, fontSize: 14, fontWeight: 600, color: THEME.textSecondary }}>Balances</h4>
              <p style={{ marginBottom: 8 }}><strong>Loyalty Points:</strong> {detail.points_balance} pts</p>
              <p style={{ marginBottom: 8 }}><strong>Total Earned:</strong> {detail.total_points_earned ?? '-'} pts</p>
              <p style={{ marginBottom: 8 }}><strong>Wallet Balance:</strong> {formatRM(detail.wallet_balance || 0)}</p>
              <p style={{ marginBottom: 8 }}><strong>Total Orders:</strong> {detail.total_orders}</p>
              <p><strong>Total Spent:</strong> {formatRM(detail.total_spent)}</p>
            </div>
          </div>
        )}

        {activeTab === 'actions' && (
          <div>
            <h4 style={{ marginBottom: 16, fontSize: 14, fontWeight: 600, color: THEME.textSecondary }}>
              <i className="fas fa-cog" style={{ marginRight: 8 }}></i>Customer Management Actions
            </h4>

            {!detail.phone_verified && (
              <ApproveProfileButton customerId={customerId} token={token} onDone={fetchDetail} />
            )}

            {detail.phone_verified && !detail.is_profile_complete && (
              <div style={{ padding: '12px 16px', background: '#EFF6FF', borderRadius: 12, marginBottom: 16, border: '1px solid #3B82F6' }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: '#1E40AF', marginBottom: 4 }}>
                  <i className="fas fa-info-circle" style={{ marginRight: 6 }}></i>Phone Verified — Profile Incomplete
                </div>
                <div style={{ fontSize: 12, color: '#1E3A8A', marginBottom: 8 }}>
                  This customer&apos;s phone is verified but profile is incomplete (name missing).
                  Use <strong>Edit Profile</strong> on the Profile tab to set their name.
                </div>
              </div>
            )}

            <AwardPointsDialog customerId={customerId} token={token} onDone={fetchDetail} />
            <AwardVoucherDialog customerId={customerId} token={token} onDone={fetchDetail} />
            <SetTierDialog customerId={customerId} currentTier={detail.tier} token={token} onDone={fetchDetail} />
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

        {activeTab === 'vouchers' && (
          <>
            {loadingWalletItems ? (
              <div style={{ textAlign: 'center', padding: 20, color: THEME.textMuted }}><i className="fas fa-spinner fa-spin"></i></div>
            ) : (
              <>
                <h4 style={{ marginBottom: 16, fontSize: 14, fontWeight: 600, color: THEME.textSecondary }}>
                  <i className="fas fa-gift" style={{ marginRight: 8 }}></i>Available Rewards ({customerWallet?.rewards.length || 0})
                </h4>
                {customerWallet && customerWallet.rewards.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                    {customerWallet.rewards.map((r: any) => (
                      <div key={r.id} style={{ padding: '12px 14px', background: THEME.bgMuted, borderRadius: 10, border: `1px solid ${THEME.border}` }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: THEME.textPrimary }}>{r.name}</div>
                        <div style={{ fontSize: 12, color: THEME.textMuted, marginTop: 2 }}>
                          Code: <code style={{ background: 'white', padding: '1px 6px', borderRadius: 4, fontSize: 12 }}>{r.redemption_code}</code>
                          {r.points_spent ? ` · ${r.points_spent} pts` : ''}
                          {r.expires_at ? ` · Expires ${new Date(r.expires_at).toLocaleDateString()}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: THEME.textMuted, fontSize: 13, marginBottom: 24 }}>No available rewards</div>
                )}

                <h4 style={{ marginBottom: 16, fontSize: 14, fontWeight: 600, color: THEME.textSecondary }}>
                  <i className="fas fa-ticket" style={{ marginRight: 8 }}></i>Available Vouchers ({customerWallet?.vouchers.length || 0})
                </h4>
                {customerWallet && customerWallet.vouchers.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {customerWallet.vouchers.map((v: any) => (
                      <div key={v.id} style={{ padding: '12px 14px', background: THEME.bgMuted, borderRadius: 10, border: `1px solid ${THEME.border}` }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: THEME.textPrimary }}>{v.title}</div>
                        <div style={{ fontSize: 12, color: THEME.textMuted, marginTop: 2 }}>
                          Code: <code style={{ background: 'white', padding: '1px 6px', borderRadius: 4, fontSize: 12 }}>{v.code}</code>
                          {v.discount_type && v.discount_value ? ` · ${v.discount_type === 'percent' ? v.discount_value + '%' : 'RM ' + v.discount_value} off` : ''}
                          {v.min_spend ? ` · Min spend RM ${v.min_spend}` : ''}
                          {v.expires_at ? ` · Expires ${new Date(v.expires_at).toLocaleDateString()}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ color: THEME.textMuted, fontSize: 13 }}>No available vouchers</div>
                )}
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
