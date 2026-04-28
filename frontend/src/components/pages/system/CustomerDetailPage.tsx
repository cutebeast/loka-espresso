'use client';

import { useState, useEffect, FormEvent, useCallback } from 'react';
import { apiFetch, formatRM } from '@/lib/merchant-api';
import type { CustomerDetail, CustomerWalletTransaction, CustomerLoyaltyTransaction, MerchantOrder } from '@/lib/merchant-types';
import { CustomerInfo, OrderHistory, LoyaltyPanel, WalletTransactions, WalletRewards } from './customer-detail';

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

function ActionCard({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="cdp-action-card">
      <div className="cdp-action-header">
        <span className="cdp-action-icon"><i className={`fas ${icon}`}></i></span>
        <span className="cdp-action-title">{title}</span>
      </div>
      {children}
    </div>
  );
}

function ActionError({ msg }: { msg: string }) {
  return <div className="cdp-error"><i className="fas fa-exclamation-circle"></i> {msg}</div>;
}
function ActionResult({ msg }: { msg: string }) {
  return <div className="cdp-success"><i className="fas fa-check-circle"></i> {msg}</div>;
}

function AwardPointsDialog({ customerId, token: _token, onDone }: { customerId: number; token: string; onDone: () => void }) {
  const [points, setPoints] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<string | null>(null);

  async function handleSubmit() {
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
    <ActionCard icon="star" title="Award / Deduct Points">
      {error && <ActionError msg={error} />}
      {result && <ActionResult msg={result} />}
      <div className="cdp-action-row">
        <div className="cdp-action-field cdp-action-field-sm">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <label className="df-label">Points</label>
            <span className="df-hint">Negative to deduct</span>
          </div>
          <input type="number" value={points} onChange={e => setPoints(e.target.value)} placeholder="+/- pts" />
        </div>
        <div className="cdp-action-field cdp-action-field-lg">
          <label className="df-label">Reason</label>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Loyalty bonus" />
        </div>
        <button onClick={handleSubmit} className="btn btn-primary btn-sm" disabled={saving || !points}>{saving ? 'Applying...' : 'Apply'}</button>
      </div>
    </ActionCard>
  );
}

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
          setVouchers(data.items || []);
          setLoaded(true);
        }
      } catch { console.error('Failed to load vouchers'); }
    })();
  }, [token]);

  async function handleSubmit() {
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
    <ActionCard icon="ticket" title="Award Voucher">
      {error && <ActionError msg={error} />}
      {result && <ActionResult msg={result} />}
      {!loaded ? (
        <div className="df-hint"><i className="fas fa-spinner fa-spin"></i> Loading vouchers...</div>
      ) : vouchers.length === 0 ? (
        <div className="df-hint">No active vouchers available.</div>
      ) : (
        <div className="cdp-action-row">
          <div className="cdp-action-field cdp-action-field-md">
            <label className="df-label">Voucher</label>
            <select value={selectedVoucher} onChange={e => setSelectedVoucher(e.target.value)}>
              <option value="">Select voucher...</option>
              {vouchers.map(v => (
                <option key={v.id} value={v.id}>{v.title || v.code} — {v.discount_type}: {v.discount_value}{v.discount_type === 'percent' ? '%' : ' RM'}</option>
              ))}
            </select>
          </div>
          <div className="cdp-action-field cdp-action-field-lg">
            <label className="df-label">Reason</label>
            <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Compensation" />
          </div>
          <button onClick={handleSubmit} className="btn btn-primary btn-sm" disabled={saving || !selectedVoucher}>{saving ? 'Awarding...' : 'Award'}</button>
        </div>
      )}
    </ActionCard>
  );
}

function SetTierDialog({ customerId, currentTier, token: _token, onDone }: { customerId: number; currentTier: string | null; token: string; onDone: () => void }) {
  const [tier, setTier] = useState(currentTier || 'bronze');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<string | null>(null);

  async function handleSubmit() {
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
    <ActionCard icon="medal" title="Set Tier Override">
      {error && <ActionError msg={error} />}
      {result && <ActionResult msg={result} />}
      <div className="cdp-action-row">
        <div className="cdp-action-field cdp-action-field-sm">
          <label className="df-label">Tier</label>
          <select value={tier} onChange={e => setTier(e.target.value)}>
            {tiers.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>
        <div className="cdp-action-field cdp-action-field-lg">
          <label className="df-label">Reason</label>
          <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. VIP upgrade" />
        </div>
        <button onClick={handleSubmit} className="btn btn-primary btn-sm" disabled={saving}>{saving ? 'Setting...' : 'Set Tier'}</button>
      </div>
    </ActionCard>
  );
}

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
    <div className="cdp-approve-card">
      <div className="cdp-approve-content">
        <div>
          <div className="cdp-approve-title"><i className="fas fa-user-check"></i> Phone Not Verified</div>
          <div className="cdp-approve-desc">Approve to verify this customer&apos;s phone and activate their account.</div>
          {error && <ActionError msg={error} />}
          {result && <ActionResult msg={result} />}
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
    } catch { console.error('Failed to load customer'); } finally { setLoading(false); }
  }, [customerId]);

  useEffect(() => { fetchDetail(); }, [fetchDetail]);

  const fetchOrders = useCallback(async (page: number) => {
    try {
      const res = await apiFetch(`/admin/customers/${customerId}/orders?page=${page}&page_size=${PAGE_SIZE}`);
      if (res.ok) {
        const data = await res.json();
        setOrders(typeof data.total === 'number' ? data : { total: Array.isArray(data) ? data.length : 0, page, page_size: PAGE_SIZE, items: Array.isArray(data) ? data : (data.orders || []) });
      }
    } catch { console.error('Failed to fetch orders'); }
  }, [customerId]);

  const fetchLoyalty = useCallback(async (page: number) => {
    try {
      const res = await apiFetch(`/admin/customers/${customerId}/loyalty-history?page=${page}&page_size=${PAGE_SIZE}`);
      if (res.ok) {
        const data = await res.json();
        setLoyalty(typeof data.total === 'number' ? data : { total: Array.isArray(data) ? data.length : 0, page, page_size: PAGE_SIZE, items: Array.isArray(data) ? data : (data.history || []) });
      }
    } catch { console.error('Failed to fetch loyalty'); }
  }, [customerId]);

  const fetchWallet = useCallback(async (page: number) => {
    try {
      const res = await apiFetch(`/admin/customers/${customerId}/wallet-history?page=${page}&page_size=${PAGE_SIZE}`);
      if (res.ok) {
        const data = await res.json();
        setWallet(typeof data.total === 'number' ? data : { total: Array.isArray(data) ? data.length : 0, page, page_size: PAGE_SIZE, items: Array.isArray(data) ? data : (data.transactions || []) });
      }
    } catch { console.error('Failed to fetch wallet'); }
  }, [customerId]);

  const fetchCustomerWallet = useCallback(async () => {
    setLoadingWalletItems(true);
    try {
      const res = await apiFetch(`/admin/customers/${customerId}/wallet`);
      if (res.ok) {
        const data = await res.json();
        setCustomerWallet({ rewards: data.rewards || [], vouchers: data.vouchers || [] });
      }
    } catch { console.error('Failed to load wallet items'); } finally { setLoadingWalletItems(false); }
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
    setEditSaving(true); setEditError('');
    try {
      const res = await apiFetch(`/admin/customers/${detail.id}`, undefined, {
        method: 'PUT',
        body: JSON.stringify({ name: editName, phone: editPhone, email: editEmail }),
      });
      if (!res.ok) { const data = await res.json().catch(() => ({})); setEditError(data.detail || `Failed (${res.status})`); return; }
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

  if (loading) {
    return (
      <div className="cdp-loading">
        <span className="cdp-loading-icon"><i className="fas fa-spinner fa-spin"></i></span>
        <p>Loading customer...</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="cdp-empty">
        <p>Customer not found</p>
        <button className="btn btn-primary" onClick={onBack}>Back to Customers</button>
      </div>
    );
  }

  return (
    <div>
      <div className="card cdp-header-card">
        <div className="cdp-header">
          <div className="cdp-header-left">
            <div className="cdp-avatar">{(detail.name || '?')[0].toUpperCase()}</div>
            <div>
              <div className="cdp-name">{detail.name || '-'}</div>
              <div className="cdp-subtitle">{detail.email || detail.phone || '-'}</div>
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

      <div className="cdp-tab-bar">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`btn btn-sm ${activeTab === tab.id ? 'btn-primary' : ''} cdp-tab-btn`}
            onClick={() => setActiveTab(tab.id)}
          >
            <i className={tab.icon}></i> {tab.label}
          </button>
        ))}
      </div>

      <div className="card">
        {activeTab === 'profile' && (
          <CustomerInfo
            detail={detail}
            editingCustomer={editingCustomer}
            editName={editName}
            editPhone={editPhone}
            editEmail={editEmail}
            editSaving={editSaving}
            editError={editError}
            onStartEdit={() => setEditingCustomer(true)}
            onCancelEdit={() => setEditingCustomer(false)}
            onEditSubmit={handleEditSubmit}
            setEditName={setEditName}
            setEditPhone={setEditPhone}
            setEditEmail={setEditEmail}
          />
        )}

        {activeTab === 'actions' && (
          <div className="df-section">
            <h4 className="cdp-section-title"><i className="fas fa-cog" style={{ marginRight: 8 }}></i>Customer Management Actions</h4>
            {!detail.phone_verified && (
              <ApproveProfileButton customerId={customerId} token={token} onDone={fetchDetail} />
            )}
            {detail.phone_verified && !detail.is_profile_complete && (
              <div className="cdp-approve-card">
                <div className="cdp-approve-content">
                  <div>
                    <div className="cdp-approve-title"><i className="fas fa-info-circle"></i> Phone Verified — Profile Incomplete</div>
                    <div className="cdp-approve-desc">This customer&apos;s phone is verified but profile is incomplete (name missing). Use <strong>Edit Profile</strong> on the Profile tab to set their name.</div>
                  </div>
                </div>
              </div>
            )}
            <AwardPointsDialog customerId={customerId} token={token} onDone={fetchDetail} />
            <AwardVoucherDialog customerId={customerId} token={token} onDone={fetchDetail} />
            <SetTierDialog customerId={customerId} currentTier={detail.tier} token={token} onDone={fetchDetail} />
          </div>
        )}

        {activeTab === 'orders' && (
          <div className="df-section">
            <h4 className="cdp-section-title"><i className="fas fa-receipt" style={{ marginRight: 8 }}></i>Order History</h4>
            <OrderHistory orders={orders} ordersPage={ordersPage} pageSize={PAGE_SIZE} setOrdersPage={setOrdersPage} />
          </div>
        )}

        {activeTab === 'loyalty' && (
          <div className="df-section">
            <h4 className="cdp-section-title"><i className="fas fa-star" style={{ marginRight: 8 }}></i>Loyalty Points History</h4>
            <LoyaltyPanel loyalty={loyalty} loyaltyPage={loyaltyPage} pageSize={PAGE_SIZE} setLoyaltyPage={setLoyaltyPage} />
          </div>
        )}

        {activeTab === 'wallet' && (
          <div className="df-section">
            <h4 className="cdp-section-title"><i className="fas fa-wallet" style={{ marginRight: 8 }}></i>Wallet Transactions</h4>
            <WalletTransactions wallet={wallet} walletPage={walletPage} pageSize={PAGE_SIZE} setWalletPage={setWalletPage} />
          </div>
        )}

        {activeTab === 'vouchers' && (
          <WalletRewards customerWallet={customerWallet} loadingWalletItems={loadingWalletItems} />
        )}
      </div>
    </div>
  );
}
