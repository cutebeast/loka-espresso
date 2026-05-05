'use client';

import { useState, useCallback } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import { QRScanner, CartPanel, CheckoutPanel } from './pos-terminal';
import CustomerSearchForm from './CustomerSearchForm';
import type { CustomerResult } from './CustomerSearchForm';

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

export default function POSTerminalPage() {
  const [customer, setCustomer] = useState<CustomerResult | null>(null);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [loadingWallet, setLoadingWallet] = useState(false);
  const [walletError, setWalletError] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  // Clock-in/out state
  const [staffId, setStaffId] = useState('');
  const [clockPin, setClockPin] = useState('');
  const [clocking, setClocking] = useState(false);
  const [clockResult, setClockResult] = useState<{success: boolean; message: string} | null>(null);

  const fetchWallet = useCallback(async (customerId: number) => {
      setLoadingWallet(true);
    setWalletError('');
    try {
      const res = await apiFetch(`/admin/customers/${customerId}/wallet`);
      if (res.ok) {
        setWallet(await res.json());
      }
    } catch {
      setWallet(null);
      setWalletError('Could not load wallet data — try re-searching');
    } finally {
      setLoadingWallet(false);
    }
  }, []);

  async function handleCustomerFound(c: CustomerResult) {
    setCustomer(c);
    setWallet(null);
    setResult(null);
    await fetchWallet(c.id);
  }

  function handleCustomerFoundFromQR(c: CustomerResult) {
    setCustomer(c);
    fetchWallet(c.id);
  }

  async function applyReward(rewardId: number) {
    if (!customer) return;
    setProcessingId(`reward-${rewardId}`);
    setResult(null);
    try {
      const res = await apiFetch(`/admin/customers/${customer.id}/use-reward/${rewardId}`, undefined, {
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

  async function applyVoucher(voucherId: number) {
    if (!customer) return;
    setProcessingId(`voucher-${voucherId}`);
    setResult(null);
    try {
      const res = await apiFetch(`/admin/customers/${customer.id}/use-voucher/${voucherId}`, undefined, {
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

  async function clockIn() {
    const sid = parseInt(staffId);
    if (!sid) { setClockResult({success: false, message: 'Enter a staff ID'}); return; }
    if (!clockPin) { setClockResult({success: false, message: 'Enter PIN'}); return; }
    setClocking(true); setClockResult(null);
    try {
      const res = await apiFetch(`/admin/staff/${sid}/clock-in`, undefined, {
        method: 'POST',
        body: JSON.stringify({ pin_code: clockPin }),
      });
      const data = await res.json().catch(() => ({}));
      setClockResult({success: res.ok, message: data.message || data.detail || 'Clock in successful'});
      if (res.ok) { setStaffId(''); setClockPin(''); }
    } catch { setClockResult({success: false, message: 'Network error'}); }
    finally { setClocking(false); }
  }

  async function clockOut() {
    const sid = parseInt(staffId);
    if (!sid) { setClockResult({success: false, message: 'Enter a staff ID'}); return; }
    setClocking(true); setClockResult(null);
    try {
      const res = await apiFetch(`/admin/staff/${sid}/clock-out`, undefined, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      setClockResult({success: res.ok, message: data.message || data.detail || 'Clock out successful'});
      if (res.ok) { setStaffId(''); setClockPin(''); }
    } catch { setClockResult({success: false, message: 'Network error'}); }
    finally { setClocking(false); }
  }

  return (
    <div>
      <h2 className="ptp-0">
        <span className="ptp-1"><i className="fas fa-cash-register"></i></span>
        POS Terminal — Apply Rewards & Vouchers
      </h2>

      {/* How it works — collapsible guide */}
      <div className="card ptp-guide-card">
        <div onClick={() => setShowGuide(!showGuide)} className="ptp-guide-header">
          <span><span className="ptp-guide-icon"><i className="fas fa-circle-info"></i></span>How POS Terminal works</span>
          <i className={`fas fa-chevron-${showGuide ? 'up' : 'down'}`}></i>
        </div>
        {showGuide && (
          <div className="ptp-guide-content">
            <p><strong>1. Search customer</strong> — enter phone number or scan their QR code to find their wallet.</p>
            <p><strong>2. View rewards &amp; vouchers</strong> — see what the customer has available in their wallet.</p>
            <p><strong>3. Burn voucher/reward</strong> — click Use to redeem before the customer enters it into the 3rd-party POS.</p>
            <p><strong>4. Confirm redemption</strong> — the item is removed from the customer's wallet immediately.</p>
          </div>
        )}
      </div>

      <CustomerSearchForm onCustomerFound={handleCustomerFound}>
        <QRScanner
          onCustomerFound={handleCustomerFoundFromQR}
          onResult={setResult}
          onApplied={() => customer && fetchWallet(customer.id)}
        />
      </CustomerSearchForm>

      {customer && (
        <div className="pos-customer-card ptp-12">
          <div>
            <div className="ptp-13">{customer.name || 'Unnamed'}</div>
            <div className="ptp-14">{customer.phone}</div>
          </div>
          <div className="ptp-15">
            <div className="ptp-16">Customer ID</div>
            <div className="ptp-17">#{customer.id}</div>
          </div>
        </div>
      )}

      <CartPanel
        wallet={wallet}
        loadingWallet={loadingWallet}
        walletError={walletError}
        processingId={processingId}
        onApplyReward={applyReward}
        onApplyVoucher={applyVoucher}
      />

      <CheckoutPanel result={result} />

      {/* Staff Clock In/Out */}
      <div className="card" style={{ marginTop: 16, padding: 16 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}><i className="fas fa-clock" style={{ marginRight: 8 }}></i>Staff Clock</h3>
        {clockResult && (
          <div className={clockResult.success ? 'cdp-success' : 'alert alert-red'} style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            <i className={`fas ${clockResult.success ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i> {clockResult.message}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <div className="df-field" style={{ flex: 1 }}>
            <label className="df-label">Staff ID</label>
            <input type="number" value={staffId} onChange={e => setStaffId(e.target.value)} placeholder="Enter staff ID" disabled={clocking} />
          </div>
          <div className="df-field" style={{ flex: 1 }}>
            <label className="df-label">PIN (for clock in)</label>
            <input type="password" value={clockPin} onChange={e => setClockPin(e.target.value)} placeholder="PIN" disabled={clocking} maxLength={6} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={clockIn} disabled={clocking}>
              {clocking ? '...' : 'Clock In'}
            </button>
            <button className="btn" onClick={clockOut} disabled={clocking}>
              {clocking ? '...' : 'Clock Out'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
