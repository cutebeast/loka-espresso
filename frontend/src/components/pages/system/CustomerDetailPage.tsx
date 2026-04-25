'use client';

import { useState, useEffect, FormEvent, useCallback } from 'react';
import { apiFetch, formatRM } from '@/lib/merchant-api';
import type { CustomerDetail, CustomerWalletTransaction, CustomerLoyaltyTransaction, MerchantOrder } from '@/lib/merchant-types';
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
    <form onSubmit={handleSubmit} className="apd-0">
      <div className="apd-1"><span className="apd-2"><i className="fas fa-star"></i></span>Award / Deduct Points</div>
      {error && <div className="apd-3"><i className="fas fa-exclamation-circle"></i> {error}</div>}
      {result && <div className="apd-4"><i className="fas fa-check-circle"></i> {result}</div>}
      <div className="apd-5">
        <div className="apd-6">
          <label className="cdp-label">Points</label>
          <input type="number" value={points} onChange={e => setPoints(e.target.value)} placeholder="+/- pts" className="apd-7" />
          <div className="cdp-hint">Negative to deduct</div>
        </div>
        <div className="apd-8">
          <label className="cdp-label">Reason</label>
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
    <form onSubmit={handleSubmit} className="avd-9">
      <div className="avd-10"><span className="avd-11"><i className="fas fa-ticket-alt"></i></span>Award Voucher</div>
      {error && <div className="avd-12"><i className="fas fa-exclamation-circle"></i> {error}</div>}
      {result && <div className="avd-13"><i className="fas fa-check-circle"></i> {result}</div>}
      {!loaded ? (
        <div className="avd-14"><i className="fas fa-spinner fa-spin"></i> Loading vouchers...</div>
      ) : vouchers.length === 0 ? (
        <div className="avd-15">No active vouchers available. Create one in Vouchers first.</div>
      ) : (
        <div className="avd-16">
          <div className="avd-17">
            <label className="cdp-label">Voucher</label>
            <select value={selectedVoucher} onChange={e => setSelectedVoucher(e.target.value)} className="avd-18">
              <option value="">Select voucher...</option>
              {vouchers.map(v => (
                <option key={v.id} value={v.id}>{v.title || v.code} — {v.discount_type}: {v.discount_value}{v.discount_type === 'percent' ? '%' : ' RM'}</option>
              ))}
            </select>
          </div>
          <div className="avd-19">
            <label className="cdp-label">Reason</label>
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
    <form onSubmit={handleSubmit} className="std-20">
      <div className="std-21"><span className="std-22"><i className="fas fa-medal"></i></span>Set Tier Override</div>
      {error && <div className="std-23"><i className="fas fa-exclamation-circle"></i> {error}</div>}
      {result && <div className="std-24"><i className="fas fa-check-circle"></i> {result}</div>}
      <div className="std-25">
        <div className="std-26">
          <label className="cdp-label">Tier</label>
          <select value={tier} onChange={e => setTier(e.target.value)} className="std-27">
            {tiers.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>
        <div className="std-28">
          <label className="cdp-label">Reason</label>
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
    <div className="apb-29">
      <div className="apb-30">
        <div>
          <div className="apb-31"><span className="apb-32"><i className="fas fa-user-check"></i></span>Phone Not Verified</div>
          <div className="apb-33">Approve to verify this customer&apos;s phone and activate their account. They can update their name later from the app.</div>
          {error && <div className="apb-34"><i className="fas fa-exclamation-circle"></i> {error}</div>}
          {result && <div className="apb-35"><i className="fas fa-check-circle"></i> {result}</div>}
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
    { key: 'order_type', header: 'Type', render: (o) => <span className="cdp-36">{o.order_type?.replace('_', ' ')}</span> },
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
      <span className="cdp-points" style={{ color: t.type === 'earn' ? '#059669' : '#EF4444' }}>
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
      <span className="cdp-points" style={{ color: t.type === 'top_up' || t.type === 'refund' ? '#059669' : '#EF4444' }}>
        {t.type === 'top_up' || t.type === 'refund' ? '+' : '-'}{formatRM(t.amount)}
      </span>
    )},
  ];

  if (loading) {
    return (
      <div className="cdp-37">
        <span className="cdp-38"><i className="fas fa-spinner fa-spin"></i></span>
        <p className="cdp-39">Loading customer...</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="cdp-40">
        <p>Customer not found</p>
        <button className="btn btn-primary" onClick={onBack}>Back to Customers</button>
      </div>
    );
  }

  return (
    <div>
      <div className="card cdp-41" >
        <div className="cdp-42">
          <div className="cdp-43">
            <div className="cdp-44">
              {(detail.name || '?')[0].toUpperCase()}
            </div>
            <div>
              <div className="cdp-45">{detail.name || '-'}</div>
              <div className="cdp-46">{detail.email || detail.phone || '-'}</div>
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

      <div className="cdp-47">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`btn btn-sm ${activeTab === tab.id ? 'btn-primary' : ''} cdp-48`}
            onClick={() => setActiveTab(tab.id)}
            
          >
            <i className={tab.icon}></i> {tab.label}
          </button>
        ))}
      </div>

      <div className="card">
        {activeTab === 'profile' && (
          <div className="cdp-49">
            <div>
              <h4 className="cdp-50">Profile</h4>
              {editingCustomer ? (
                <form onSubmit={handleEditSubmit}>
                  {editError && (
                    <div className="cdp-51">
                      <i className="fas fa-exclamation-circle"></i> {editError}
                    </div>
                  )}
                  <div className="cdp-52">
                    <label className="cdp-label">Name</label>
                    <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Customer name" />
                  </div>
                  <div className="cdp-53">
                    <label className="cdp-label">Phone</label>
                    <input value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="+60 12-345 6789" />
                    <div className="cdp-hint">Used for passwordless login.</div>
                  </div>
                  <div className="cdp-54">
                    <label className="cdp-label">Email</label>
                    <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="customer@email.com" />
                    <div className="cdp-hint">Recovery channel.</div>
                  </div>
                  <div className="cdp-55">
                    <button type="submit" className="btn btn-primary" disabled={editSaving}>{editSaving ? 'Saving...' : 'Save Changes'}</button>
                    <button type="button" className="btn" onClick={() => setEditingCustomer(false)}>Cancel</button>
                  </div>
                </form>
              ) : (
                <>
                  <p className="cdp-56"><strong>Name:</strong> {detail.name || '-'}</p>
                  <p className="cdp-57"><strong>Phone:</strong> {detail.phone || '-'}</p>
                  <p className="cdp-58"><strong>Email:</strong> {detail.email || (
                    <span className="cdp-59">Not set</span>
                  )}</p>
                  <p className="cdp-60"><strong>Tier:</strong> <span className="badge badge-blue">{detail.tier ? detail.tier.charAt(0).toUpperCase() + detail.tier.slice(1) : 'No Tier'}</span></p>
                  <p className="cdp-61"><strong>Phone Verified:</strong> {detail.phone_verified ? <span className="cdp-62">Yes</span> : <span className="cdp-63">No</span>}</p>
                  <p className="cdp-64"><strong>Profile Complete:</strong> {detail.is_profile_complete ? <span className="cdp-65">Yes</span> : <span className="cdp-66">No {!detail.phone_verified ? '(phone not verified)' : '(name still required)'}</span>}</p>
                  <p className="cdp-67"><strong>Joined:</strong> {detail.created_at ? new Date(detail.created_at).toLocaleDateString() : '-'}</p>
                  <button className="btn btn-sm" onClick={() => setEditingCustomer(true)}>
                    <i className="fas fa-edit"></i> Edit Profile
                  </button>
                </>
              )}
            </div>
            <div>
              <h4 className="cdp-68">Balances</h4>
              <p className="cdp-69"><strong>Loyalty Points:</strong> {detail.points_balance} pts</p>
              <p className="cdp-70"><strong>Total Earned:</strong> {detail.total_points_earned ?? '-'} pts</p>
              <p className="cdp-71"><strong>Wallet Balance:</strong> {formatRM(detail.wallet_balance || 0)}</p>
              <p className="cdp-72"><strong>Total Orders:</strong> {detail.total_orders}</p>
              <p><strong>Total Spent:</strong> {formatRM(detail.total_spent)}</p>
            </div>
          </div>
        )}

        {activeTab === 'actions' && (
          <div>
            <h4 className="cdp-73">
              <span className="cdp-74"><i className="fas fa-cog"></i></span>Customer Management Actions
            </h4>

            {!detail.phone_verified && (
              <ApproveProfileButton customerId={customerId} token={token} onDone={fetchDetail} />
            )}

            {detail.phone_verified && !detail.is_profile_complete && (
              <div className="cdp-75">
                <div className="cdp-76">
                  <span className="cdp-77"><i className="fas fa-info-circle"></i></span>Phone Verified — Profile Incomplete
                </div>
                <div className="cdp-78">
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
              <div className="cdp-79"><i className="fas fa-spinner fa-spin"></i></div>
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
              <div className="cdp-80"><i className="fas fa-spinner fa-spin"></i></div>
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
              <div className="cdp-81"><i className="fas fa-spinner fa-spin"></i></div>
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
              <div className="cdp-82"><i className="fas fa-spinner fa-spin"></i></div>
            ) : (
              <>
                <h4 className="cdp-83">
                  <span className="cdp-84"><i className="fas fa-gift"></i></span>Available Rewards ({customerWallet?.rewards.length || 0})
                </h4>
                {customerWallet && customerWallet.rewards.length > 0 ? (
                  <div className="cdp-85">
                    {customerWallet.rewards.map((r: any) => (
                      <div key={r.id} className="cdp-86">
                        <div className="cdp-87">{r.name}</div>
                        <div className="cdp-88">
                          Code: <code className="cdp-89">{r.redemption_code}</code>
                          {r.points_spent ? ` · ${r.points_spent} pts` : ''}
                          {r.expires_at ? ` · Expires ${new Date(r.expires_at).toLocaleDateString()}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="cdp-90">No available rewards</div>
                )}

                <h4 className="cdp-91">
                  <span className="cdp-92"><i className="fas fa-ticket"></i></span>Available Vouchers ({customerWallet?.vouchers.length || 0})
                </h4>
                {customerWallet && customerWallet.vouchers.length > 0 ? (
                  <div className="cdp-93">
                    {customerWallet.vouchers.map((v: any) => (
                      <div key={v.id} className="cdp-94">
                        <div className="cdp-95">{v.title}</div>
                        <div className="cdp-96">
                          Code: <code className="cdp-97">{v.code}</code>
                          {v.discount_type && v.discount_value ? ` · ${v.discount_type === 'percent' ? v.discount_value + '%' : 'RM ' + v.discount_value} off` : ''}
                          {v.min_spend ? ` · Min spend RM ${v.min_spend}` : ''}
                          {v.expires_at ? ` · Expires ${new Date(v.expires_at).toLocaleDateString()}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="cdp-98">No available vouchers</div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}


