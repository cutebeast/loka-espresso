'use client';

import { useState, FormEvent } from 'react';
import { apiFetch, formatRM } from '@/lib/merchant-api';
import CustomerSearchForm from './CustomerSearchForm';
import QRScanner from './pos-terminal/QRScanner';
import type { CustomerResult } from './CustomerSearchForm';

interface WalletTopUpPageProps {
  token: string;
}

const TOPUP_PRESETS = [20, 50, 100, 200, 300, 500];

export default function WalletTopUpPage({ token: _token }: WalletTopUpPageProps) {
  const [customer, setCustomer] = useState<CustomerResult | null>(null);
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'paywave'>('cash');
  const [notes, setNotes] = useState('');
  const [showGuide, setShowGuide] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; newBalance?: number } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  async function handleCustomerFound(c: CustomerResult) {
    setResult(null);
    try {
      const res = await apiFetch(`/admin/customers/${c.id}`);
      if (res.ok) {
        const detail = await res.json();
        setCustomer({ ...c, wallet_balance: detail.wallet_balance ?? 0 });
      } else {
        setCustomer({ ...c, wallet_balance: 0 });
      }
    } catch {
      setCustomer({ ...c, wallet_balance: 0 });
    }
  }

  async function handleCustomerFoundFromQR(c: CustomerResult) {
    await handleCustomerFound(c);
    setResult({ success: true, message: `Customer found: ${c.name || 'Unknown'} (${c.phone || '—'})` });
  }

  async function handleTopUp(e: FormEvent) {
    e.preventDefault();
    if (!customer || !amount) return;
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) {
      setResult({ success: false, message: 'Please enter a valid amount' });
      return;
    }
    setShowConfirm(true);
  }

  async function executeTopUp() {
    if (!customer || !amount) return;
    const amt = parseFloat(amount);
    setShowConfirm(false);
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

      {/* How it works — collapsible guide */}
      <div className="card wtup-guide-card">
        <div onClick={() => setShowGuide(!showGuide)} className="wtup-guide-header">
          <span><span className="wtup-guide-icon"><i className="fas fa-circle-info"></i></span>How Wallet Top-Up works</span>
          <i className={`fas fa-chevron-${showGuide ? 'up' : 'down'}`}></i>
        </div>
        {showGuide && (
          <div className="wtup-guide-content">
            <p><strong>1. Customer approaches counter</strong> — requests a wallet top-up.</p>
            <p><strong>2. Search customer</strong> — enter their phone number to find their wallet.</p>
            <p><strong>3. Collect payment</strong> — accept cash, card, or paywave from the customer.</p>
            <p><strong>4. Enter amount &amp; Top Up</strong> — wallet is credited instantly.</p>
            <p><strong>5. Customer confirms</strong> — they see the new balance in their app immediately.</p>
          </div>
        )}
      </div>

      {/* Step 1: Search Customer by phone or scan QR */}
      <CustomerSearchForm onCustomerFound={handleCustomerFound}>
        <QRScanner
          onCustomerFound={handleCustomerFoundFromQR}
          onResult={setResult}
          onApplied={() => {}}
        />
      </CustomerSearchForm>

      {customer && (
        <div className="wallet-topup-customer wtup-10">
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
      {/* Confirmation Dialog */}
      {showConfirm && (
        <div className="modal-overlay" onClick={() => setShowConfirm(false)}>
          <div className="modal md-4" onClick={e => e.stopPropagation()}>
            <h3 className="md-5">Confirm Top-Up</h3>
            <p style={{ margin: '12px 0' }}>
              Top up <strong>{formatRM(parseFloat(amount))}</strong> for{' '}
              <strong>{customer?.name || 'customer'}</strong>
              {customer?.phone ? ` (${customer.phone})` : ''}?
            </p>
            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn" style={{ flex: 1 }} onClick={() => setShowConfirm(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={executeTopUp}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
