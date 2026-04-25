'use client';

import { useState, FormEvent } from 'react';
import { apiFetch, formatRM } from '@/lib/merchant-api';

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

export default function WalletTopUpPage({ token: _token }: WalletTopUpPageProps) {
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
      const res = await apiFetch(`/admin/customers?search=${encodeURIComponent(phone.trim())}&page=1&page_size=10`);
      if (!res.ok) { setResult({ success: false, message: 'Search failed' }); return; }
      const data = await res.json();
      const items = data.customers || data.items || [];
      // Normalize digits for flexible phone matching (+60 prefix optional)
      const searchDigits = phone.trim().replace(/\D/g, '');
      const exact = items.find((c: CustomerResult) => (c.phone || '').replace(/\D/g, '').includes(searchDigits));
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
      const res = await apiFetch('/admin/wallet/topup', undefined, {
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
      <h2 className="wtup-0">
        <span className="wtup-1"><i className="fas fa-wallet"></i></span>
        In-Store Wallet Top-Up
      </h2>

      {/* Step 1: Search Customer */}
      <div className="card wtup-2" >
        <h3 className="wtup-3">Step 1: Find Customer</h3>
        <form onSubmit={handleSearch} className="wtup-4">
          <div className="wtup-5">
            <label className="wtup-6">Phone Number</label>
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="e.g. +60123456789"
              className="wtup-7"
            />
          </div>
          <div className="wtup-8">
            <button type="submit" className="btn btn-primary wtup-9" disabled={searching} >
              {searching ? 'Searching...' : 'Search'}
            </button>
          </div>
        </form>

        {customer && (
          <div  className="wallet-topup-customer wtup-10">
            <div>
              <div className="wtup-11">{customer.name || 'Unnamed'}</div>
              <div className="wtup-12">{customer.phone}</div>
            </div>
            <div className="wtup-13">
              <div className="wtup-14">Current Balance</div>
              <div className="wtup-15">{formatRM(customer.wallet_balance || 0)}</div>
            </div>
          </div>
        )}
      </div>

      {/* Step 2: Top-Up Form */}
      {customer && (
        <div className="card">
          <h3 className="wtup-16">Step 2: Process Top-Up</h3>

          {/* Amount presets */}
          <div className="wtup-17">
            {TOPUP_PRESETS.map(preset => (
              <button
                key={preset}
                type="button"
                onClick={() => setAmount(String(preset))}
                className={`btn btn-sm ${amount === String(preset) ? 'btn-primary' : ''} wtup-18`}
                
              >
                RM {preset}
              </button>
            ))}
          </div>

          <form onSubmit={handleTopUp}>
            <div  className="wallet-topup-grid wtup-19">
              <div>
                <label className="wtup-20">Amount (RM)</label>
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
                <label className="wtup-21">Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={e => setPaymentMethod(e.target.value as 'cash' | 'card' | 'paywave')}
                  className="wtup-22"
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="paywave">Paywave</option>
                </select>
              </div>
            </div>

            <div className="wtup-23">
              <label className="wtup-24">Notes (optional)</label>
              <input
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Counter 1, Staff: Ahmad"
              />
            </div>

            <button type="submit" className="btn btn-primary wtup-25" disabled={processing} >
              {processing ? 'Processing...' : `Top Up RM ${amount || '0'}`}
            </button>
          </form>
        </div>
      )}

      {/* Result */}
      {result && (
        <div
            >
          <div className="wtup-26">
            <i className={`fas ${result.success ? 'fa-check-circle' : 'fa-exclamation-circle'} wtup-icon ${result.success ? 'wtup-icon-success' : 'wtup-icon-error'}`}></i>
            <div>
              <div className={`wtup-title ${result.success ? 'wtup-title-success' : 'wtup-title-error'}`}>{result.success ? 'Success' : 'Error'}</div>
              <div className={`wtup-msg ${result.success ? 'wtup-msg-success' : 'wtup-msg-error'}`}>{result.message}</div>
              {result.newBalance !== undefined && (
                <div className="wtup-27">
                  New Balance: {formatRM(result.newBalance)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="wtup-28">
        <strong><i className="fas fa-info-circle"></i> How it works:</strong>
        <ol className="wtup-29">
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

/* Mobile responsive styles */
const walletTopUpMobileStyles = `
@media (max-width: 767px) {
  .wallet-topup-grid {
    grid-template-columns: 1fr !important;
  }
  .wallet-topup-customer {
    flex-direction: column;
    align-items: flex-start !important;
  }
  .wallet-topup-customer > div:last-child {
    text-align: left !important;
    width: 100%;
  }
}
`;

if (typeof document !== 'undefined') {
  const styleId = 'wallet-topup-mobile-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = walletTopUpMobileStyles;
    document.head.appendChild(style);
  }
}
