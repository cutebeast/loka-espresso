'use client';

import { useState, FormEvent } from 'react';
import { apiFetch, formatRM } from '@/lib/merchant-api';
import { THEME } from '@/lib/theme';

interface CustomerResult {
  id: number;
  name: string | null;
  phone: string | null;
  wallet_balance: number;
}

interface WalletTopUpPageProps {
  token: string;
}

const TOPUP_PRESETS = [20, 50, 100, 200, 300, 500];

export default function WalletTopUpPage({ token }: WalletTopUpPageProps) {
  const [phone, setPhone] = useState('');
  const [searching, setSearching] = useState(false);
  const [customer, setCustomer] = useState<CustomerResult | null>(null);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'paywave'>('cash');
  const [notes, setNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; newBalance?: number } | null>(null);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (!phone.trim()) return;
    setSearching(true);
    setCustomer(null);
    setResult(null);
    try {
      const res = await apiFetch(`/admin/customers?search=${encodeURIComponent(phone.trim())}&page=1&page_size=10`, token);
      if (!res.ok) { setResult({ success: false, message: 'Search failed' }); return; }
      const data = await res.json();
      const items = data.items || [];
      // Try exact phone match first, then partial
      const exact = items.find((c: CustomerResult) => c.phone === phone.trim());
      const match = exact || items[0];
      if (match) {
        setCustomer(match);
      } else {
        setResult({ success: false, message: `No customer found with phone ${phone}` });
      }
    } catch {
      setResult({ success: false, message: 'Network error searching customer' });
    } finally {
      setSearching(false);
    }
  }

  async function handleTopUp(e: FormEvent) {
    e.preventDefault();
    if (!customer || !amount) return;
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      setResult({ success: false, message: 'Please enter a valid amount' });
      return;
    }
    setProcessing(true);
    setResult(null);
    try {
      const res = await apiFetch('/admin/wallet/topup', token, {
        method: 'POST',
        body: JSON.stringify({
          phone: customer.phone,
          amount: amt,
          payment_method: paymentMethod,
          notes: notes.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({ success: false, message: data.detail || 'Top-up failed' });
        return;
      }
      setResult({ success: true, message: data.message || 'Top-up successful', newBalance: data.new_balance });
      setCustomer(prev => prev ? { ...prev, wallet_balance: data.new_balance } : prev);
      setAmount('');
      setNotes('');
    } catch {
      setResult({ success: false, message: 'Network error processing top-up' });
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div>
      <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20, color: THEME.textPrimary }}>
        <i className="fas fa-wallet" style={{ marginRight: 10, color: THEME.primary }}></i>
        In-Store Wallet Top-Up
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
              <div style={{ fontSize: 11, color: THEME.textMuted }}>Current Balance</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: THEME.primary }}>{formatRM(customer.wallet_balance || 0)}</div>
            </div>
          </div>
        )}
      </div>

      {/* Step 2: Top-Up Form */}
      {customer && (
        <div className="card">
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12, color: THEME.textSecondary }}>Step 2: Process Top-Up</h3>

          {/* Amount presets */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {TOPUP_PRESETS.map(preset => (
              <button
                key={preset}
                type="button"
                onClick={() => setAmount(String(preset))}
                className={`btn btn-sm ${amount === String(preset) ? 'btn-primary' : ''}`}
                style={{ minWidth: 60 }}
              >
                RM {preset}
              </button>
            ))}
          </div>

          <form onSubmit={handleTopUp}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: THEME.textMuted, display: 'block', marginBottom: 4 }}>Amount (RM)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: THEME.textMuted, display: 'block', marginBottom: 4 }}>Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value as 'cash' | 'card' | 'paywave')}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${THEME.border}`, fontSize: 14 }}
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="paywave">Paywave</option>
                </select>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: THEME.textMuted, display: 'block', marginBottom: 4 }}>Notes (optional)</label>
              <input
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Counter 1, Staff: Ahmad"
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={processing} style={{ width: '100%' }}>
              {processing ? 'Processing...' : `Top Up RM ${amount || '0'}`}
            </button>
          </form>
        </div>
      )}

      {/* Result */}
      {result && (
        <div
          className="card"
          style={{
            marginTop: 16,
            background: result.success ? '#F0FDF4' : '#FEF2F2',
            border: `1px solid ${result.success ? '#86EFAC' : '#FECACA'}`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <i className={`fas ${result.success ? 'fa-check-circle' : 'fa-exclamation-circle'}`} style={{ fontSize: 24, color: result.success ? '#16A34A' : '#DC2626' }}></i>
            <div>
              <div style={{ fontWeight: 700, color: result.success ? '#166534' : '#991B1B' }}>{result.success ? 'Success' : 'Error'}</div>
              <div style={{ fontSize: 13, color: result.success ? '#166534' : '#991B1B' }}>{result.message}</div>
              {result.newBalance !== undefined && (
                <div style={{ fontSize: 18, fontWeight: 800, color: THEME.primary, marginTop: 4 }}>
                  New Balance: {formatRM(result.newBalance)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div style={{ marginTop: 20, padding: '12px 16px', background: '#FFFBEB', borderRadius: 8, fontSize: 12, color: '#92400E' }}>
        <strong><i className="fas fa-info-circle"></i> How it works:</strong>
        <ol style={{ margin: '8px 0 0 16px', padding: 0 }}>
          <li>Customer comes to the counter and requests a wallet top-up</li>
          <li>Staff searches customer by phone number</li>
          <li>Staff collects payment (cash/card/paywave) from customer</li>
          <li>Staff enters amount and clicks <strong>Top Up</strong> — wallet is credited instantly</li>
          <li>Customer sees the new balance in their app immediately</li>
        </ol>
      </div>
    </div>
  );
}
