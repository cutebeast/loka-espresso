'use client';

import { useState, FormEvent } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import { THEME } from '@/lib/theme';

interface CustomerResult {
  id: number;
  name: string | null;
  phone: string | null;
}

interface WalletReward {
  id: number;
  reward_id: number;
  name: string;
  redemption_code: string;
  points_spent: number | null;
  expires_at: string | null;
}

interface WalletVoucher {
  id: number;
  voucher_id: number;
  title: string;
  code: string;
  discount_type: string | null;
  discount_value: number | null;
  min_spend: number | null;
  expires_at: string | null;
}

interface WalletData {
  customer_id: number;
  customer_name: string | null;
  customer_phone: string | null;
  rewards: WalletReward[];
  vouchers: WalletVoucher[];
}

interface POSTerminalPageProps {
  token: string;
}

export default function POSTerminalPage({ token }: POSTerminalPageProps) {
  const [phone, setPhone] = useState('');
  const [searching, setSearching] = useState(false);
  const [customer, setCustomer] = useState<CustomerResult | null>(null);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [loadingWallet, setLoadingWallet] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (!phone.trim()) return;
    setSearching(true);
    setCustomer(null);
    setWallet(null);
    setResult(null);
    try {
      const res = await apiFetch(`/admin/customers?search=${encodeURIComponent(phone.trim())}&page=1&page_size=10`, token);
      if (!res.ok) { setResult({ success: false, message: 'Search failed' }); return; }
      const data = await res.json();
      const items = data.items || [];
      const exact = items.find((c: CustomerResult) => c.phone === phone.trim());
      const match = exact || items[0];
      if (match) {
        setCustomer(match);
        await fetchWallet(match.id);
      } else {
        setResult({ success: false, message: `No customer found with phone ${phone}` });
      }
    } catch {
      setResult({ success: false, message: 'Network error searching customer' });
    } finally {
      setSearching(false);
    }
  }

  async function fetchWallet(customerId: number) {
    setLoadingWallet(true);
    try {
      const res = await apiFetch(`/admin/customers/${customerId}/wallet`, token);
      if (res.ok) {
        setWallet(await res.json());
      }
    } catch {
      // Silent fail
    } finally {
      setLoadingWallet(false);
    }
  }

  async function useReward(rewardId: number) {
    if (!customer) return;
    setProcessingId(`reward-${rewardId}`);
    setResult(null);
    try {
      const res = await apiFetch(`/admin/customers/${customer.id}/use-reward/${rewardId}`, token, {
        method: 'POST',
        body: JSON.stringify({ store_id: null, notes: 'Used in-store via POS Terminal' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({ success: false, message: data.detail || 'Failed to use reward' });
        return;
      }
      setResult({ success: true, message: data.message || 'Reward applied successfully' });
      await fetchWallet(customer.id);
    } catch {
      setResult({ success: false, message: 'Network error' });
    } finally {
      setProcessingId(null);
    }
  }

  async function useVoucher(voucherId: number) {
    if (!customer) return;
    setProcessingId(`voucher-${voucherId}`);
    setResult(null);
    try {
      const res = await apiFetch(`/admin/customers/${customer.id}/use-voucher/${voucherId}`, token, {
        method: 'POST',
        body: JSON.stringify({ store_id: null, notes: 'Used in-store via POS Terminal' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({ success: false, message: data.detail || 'Failed to use voucher' });
        return;
      }
      setResult({ success: true, message: data.message || 'Voucher applied successfully' });
      await fetchWallet(customer.id);
    } catch {
      setResult({ success: false, message: 'Network error' });
    } finally {
      setProcessingId(null);
    }
  }

  function formatDiscount(v: WalletVoucher) {
    if (!v.discount_type || !v.discount_value) return '';
    if (v.discount_type === 'percent') return `${v.discount_value}% off`;
    if (v.discount_type === 'fixed') return `RM ${v.discount_value} off`;
    if (v.discount_type === 'free_item') return 'Free item';
    return '';
  }

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20, color: THEME.textPrimary }}>
        <i className="fas fa-cash-register" style={{ marginRight: 10, color: THEME.primary }}></i>
        POS Terminal — Apply Rewards & Vouchers
      </h2>

      {/* Step 1: Search Customer */}
      <div className="card" style={{ marginBottom: 20 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: THEME.textSecondary }}>Step 1: Find Customer</h3>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: THEME.textMuted, display: 'block', marginBottom: 4 }}>Phone Number</label>
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="e.g. +60123456789"
              style={{ width: '100%' }}
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={searching}>
            {searching ? 'Searching...' : 'Search'}
          </button>
        </form>

        {customer && (
          <div style={{ marginTop: 16, padding: '14px 16px', background: THEME.bgMuted, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: THEME.textPrimary }}>{customer.name || 'Unnamed'}</div>
              <div style={{ fontSize: 13, color: THEME.textMuted }}>{customer.phone}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: THEME.textMuted }}>Customer ID</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: THEME.primary }}>#{customer.id}</div>
            </div>
          </div>
        )}
      </div>

      {/* Step 2: Wallet */}
      {customer && loadingWallet && (
        <div style={{ textAlign: 'center', padding: 20, color: THEME.textMuted }}>
          <i className="fas fa-spinner fa-spin"></i> Loading wallet...
        </div>
      )}

      {wallet && (
        <>
          {/* Rewards */}
          <div className="card" style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: THEME.textSecondary }}>
              <i className="fas fa-gift" style={{ marginRight: 8, color: THEME.primary }}></i>
              Available Rewards ({wallet.rewards.length})
            </h3>
            {wallet.rewards.length === 0 ? (
              <div style={{ color: THEME.textMuted, fontSize: 13 }}>No available rewards</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {wallet.rewards.map(r => (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: THEME.bgMuted, borderRadius: 10, border: `1px solid ${THEME.border}` }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: THEME.textPrimary }}>{r.name}</div>
                      <div style={{ fontSize: 12, color: THEME.textMuted, marginTop: 2 }}>
                        Code: <code style={{ background: 'white', padding: '1px 6px', borderRadius: 4, fontSize: 12 }}>{r.redemption_code}</code>
                        {r.points_spent ? ` · ${r.points_spent} pts` : ''}
                        {r.expires_at ? ` · Expires ${new Date(r.expires_at).toLocaleDateString()}` : ''}
                      </div>
                    </div>
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={processingId === `reward-${r.id}`}
                      onClick={() => useReward(r.id)}
                    >
                      {processingId === `reward-${r.id}` ? 'Applying...' : 'Use Reward'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Vouchers */}
          <div className="card" style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: THEME.textSecondary }}>
              <i className="fas fa-ticket" style={{ marginRight: 8, color: THEME.primary }}></i>
              Available Vouchers ({wallet.vouchers.length})
            </h3>
            {wallet.vouchers.length === 0 ? (
              <div style={{ color: THEME.textMuted, fontSize: 13 }}>No available vouchers</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {wallet.vouchers.map(v => (
                  <div key={v.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: THEME.bgMuted, borderRadius: 10, border: `1px solid ${THEME.border}` }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: THEME.textPrimary }}>{v.title}</div>
                      <div style={{ fontSize: 12, color: THEME.textMuted, marginTop: 2 }}>
                        Code: <code style={{ background: 'white', padding: '1px 6px', borderRadius: 4, fontSize: 12 }}>{v.code}</code>
                        {formatDiscount(v) ? ` · ${formatDiscount(v)}` : ''}
                        {v.min_spend ? ` · Min spend RM ${v.min_spend}` : ''}
                        {v.expires_at ? ` · Expires ${new Date(v.expires_at).toLocaleDateString()}` : ''}
                      </div>
                    </div>
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={processingId === `voucher-${v.id}`}
                      onClick={() => useVoucher(v.id)}
                    >
                      {processingId === `voucher-${v.id}` ? 'Applying...' : 'Use Voucher'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Result */}
      {result && (
        <div
          className="card"
          style={{
            marginBottom: 20,
            background: result.success ? '#F0FDF4' : '#FEF2F2',
            border: `1px solid ${result.success ? '#86EFAC' : '#FECACA'}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <i className={`fas ${result.success ? 'fa-check-circle' : 'fa-exclamation-circle'}`} style={{ fontSize: 24, color: result.success ? '#16A34A' : '#DC2626' }}></i>
            <div>
              <div style={{ fontWeight: 700, color: result.success ? '#166534' : '#991B1B' }}>{result.success ? 'Success' : 'Error'}</div>
              <div style={{ fontSize: 13, color: result.success ? '#166534' : '#991B1B' }}>{result.message}</div>
            </div>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div style={{ padding: '12px 16px', background: '#FFFBEB', borderRadius: 8, fontSize: 12, color: '#92400E' }}>
        <strong><i className="fas fa-info-circle"></i> How it works:</strong>
        <ol style={{ margin: '8px 0 0 16px', padding: 0 }}>
          <li>Customer comes to the counter for in-store purchase</li>
          <li>Staff asks for phone number and searches customer</li>
          <li>Staff sees customer's available rewards and vouchers</li>
          <li>Staff clicks <strong>Use Reward</strong> or <strong>Use Voucher</strong></li>
          <li>Staff manually applies the discount on their physical POS terminal</li>
          <li>Item is marked as used in the customer's account instantly</li>
        </ol>
      </div>
    </div>
  );
}
