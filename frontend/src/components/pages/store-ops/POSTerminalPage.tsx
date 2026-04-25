'use client';

import { useState, FormEvent, useRef, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/merchant-api';

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

interface ScannedItem {
  type: 'reward' | 'voucher';
  code: string;
  name: string;
  customer_id: number;
  detail: any;
}

interface POSTerminalPageProps {
  token: string;
}

export default function POSTerminalPage({ token: _token }: POSTerminalPageProps) {
  const [phone, setPhone] = useState('');
  const [searching, setSearching] = useState(false);
  const [customer, setCustomer] = useState<CustomerResult | null>(null);
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [loadingWallet, setLoadingWallet] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  // QR Scanner state
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState('');
  const [scannedItem, setScannedItem] = useState<ScannedItem | null>(null);
  const [confirmingScan, setConfirmingScan] = useState(false);
  const scannerRef = useRef<any>(null);
  const videoRef = useRef<HTMLDivElement>(null);

  async function handleSearch(e: FormEvent) {
    e.preventDefault();
    if (!phone.trim()) return;
    setSearching(true);
    setCustomer(null);
    setWallet(null);
    setResult(null);
    setScannedItem(null);
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

  const fetchWallet = useCallback(async (customerId: number) => {
    setLoadingWallet(true);
    try {
      const res = await apiFetch(`/admin/customers/${customerId}/wallet`);
      if (res.ok) {
        setWallet(await res.json());
      }
    } catch {
      // Silent fail
    } finally {
      setLoadingWallet(false);
    }
  }, []);

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

  // ── QR Scanner ───────────────────────────────────────────────────────────

  const stopScanner = useCallback(async () => {
    try {
      if (scannerRef.current) {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
        scannerRef.current = null;
      }
    } catch {
      // Ignore
    }
    setScanning(false);
  }, []);

  const validateScannedCode = useCallback(async (code: string) => {
    setConfirmingScan(true);
    setResult(null);
    try {
      let res = await apiFetch(`/scan/reward/${encodeURIComponent(code)}`, undefined, {
        method: 'POST',
        body: JSON.stringify({ store_id: null }),
      });
      if (res.ok) {
        const data = await res.json();
        setScannedItem({
          type: 'reward',
          code,
          name: data.reward_name || 'Unknown Reward',
          customer_id: data.customer_id,
          detail: data,
        });
        if (data.customer_id) {
          const cRes = await apiFetch(`/admin/customers/${data.customer_id}`);
          if (cRes.ok) {
            const c = await cRes.json();
            setCustomer({ id: c.id, name: c.name, phone: c.phone });
            await fetchWallet(c.id);
          }
        }
        setConfirmingScan(false);
        return;
      }

      res = await apiFetch(`/scan/voucher/${encodeURIComponent(code)}`, undefined, {
        method: 'POST',
        body: JSON.stringify({ store_id: null }),
      });
      if (res.ok) {
        const data = await res.json();
        setScannedItem({
          type: 'voucher',
          code,
          name: data.reward_name || code,
          customer_id: data.customer_id,
          detail: data,
        });
        if (data.customer_id) {
          const cRes = await apiFetch(`/admin/customers/${data.customer_id}`);
          if (cRes.ok) {
            const c = await cRes.json();
            setCustomer({ id: c.id, name: c.name, phone: c.phone });
            await fetchWallet(c.id);
          }
        }
        setConfirmingScan(false);
        return;
      }

      const errData = await res.json().catch(() => ({}));
      setResult({ success: false, message: errData.detail || 'Code not found or already used' });
      setConfirmingScan(false);
    } catch {
      setResult({ success: false, message: 'Network error validating code' });
      setConfirmingScan(false);
    }
  }, [fetchWallet]);

  const startScanner = useCallback(async () => {
    setScanning(true);
    setScanError('');
    setScannedItem(null);
    setResult(null);

    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      if (!videoRef.current) return;

      const scanner = new Html5Qrcode('qr-reader');
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decodedText: string) => {
          await stopScanner();
          await validateScannedCode(decodedText.trim());
        },
        () => {
        }
      );
    } catch (err: any) {
      setScanError(err.message || 'Unable to start camera. Please check permissions.');
      setScanning(false);
    }
  }, [stopScanner, validateScannedCode]);

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  async function confirmScannedUse() {
    if (!scannedItem) return;
    setConfirmingScan(true);
    try {
      const endpoint = scannedItem.type === 'reward'
        ? `/scan/reward/${encodeURIComponent(scannedItem.code)}`
        : `/scan/voucher/${encodeURIComponent(scannedItem.code)}`;
      const res = await apiFetch(endpoint, undefined, {
        method: 'POST',
        body: JSON.stringify({ store_id: null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({ success: false, message: data.detail || 'Failed to apply' });
        return;
      }
      setResult({ success: true, message: data.message || `${scannedItem.type === 'reward' ? 'Reward' : 'Voucher'} applied!` });
      setScannedItem(null);
      if (customer) await fetchWallet(customer.id);
    } catch {
      setResult({ success: false, message: 'Network error' });
    } finally {
      setConfirmingScan(false);
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
      <h2 className="ptp-0">
        <span className="ptp-1"><i className="fas fa-cash-register"></i></span>
        POS Terminal — Apply Rewards & Vouchers
      </h2>

      {/* Step 1: Search Customer */}
      <div className="card ptp-2" >
        <h3 className="ptp-3">Step 1: Find Customer</h3>
        <form onSubmit={handleSearch} className="ptp-4">
          <div className="ptp-5">
            <label className="ptp-6">Phone Number</label>
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="e.g. +60123456789"
              className="ptp-7"
            />
          </div>
          <div className="ptp-8">
            <button type="submit" className="btn btn-primary ptp-9" disabled={searching} >
              {searching ? 'Searching...' : 'Search'}
            </button>
            <button
              type="button"
              className="btn ptp-10"
              onClick={startScanner}
              disabled={scanning}
              
            >
              <span className="ptp-11"><i className="fas fa-camera"></i></span>
              {scanning ? 'Opening...' : 'Scan QR'}
            </button>
          </div>
        </form>

        {customer && (
          <div  className="pos-customer-card ptp-12">
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
      </div>

      {/* QR Scanner Overlay */}
      {scanning && (
        <div className="ptp-18">
          <div className="ptp-19">
            <div className="ptp-20">
              <span className="ptp-21">Scan Customer QR Code</span>
              <button
                className="btn btn-sm ptp-22"
                onClick={stopScanner}
                
              >
                <i className="fas fa-times"></i> Cancel
              </button>
            </div>
            <div
              id="qr-reader"
              ref={videoRef}
              className="ptp-23"
            />
            {scanError && (
              <div className="ptp-24">{scanError}</div>
            )}
            <p className="ptp-25">
              Point camera at the customer&apos;s reward or voucher QR code
            </p>
          </div>
        </div>
      )}

      {/* Scanned Item Confirmation */}
      {scannedItem && (
        <div className="card ptp-26" >
          <div className="ptp-27">
            <span className="ptp-28"><i className="fas fa-check-circle"></i></span>
            <div>
              <div className="ptp-29">
                {scannedItem.type === 'reward' ? 'Reward' : 'Voucher'} Found
              </div>
              <div className="ptp-30">{scannedItem.name}</div>
            </div>
          </div>
          <div  className="pos-scan-actions ptp-31">
            <button
              className="btn btn-primary ptp-32"
              onClick={confirmScannedUse}
              disabled={confirmingScan}
              
            >
              {confirmingScan ? 'Applying...' : `Confirm & Mark as Used`}
            </button>
            <button
              className="btn ptp-33"
              onClick={() => setScannedItem(null)}
              disabled={confirmingScan}
              
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Wallet */}
      {customer && loadingWallet && (
        <div className="ptp-34">
          <i className="fas fa-spinner fa-spin"></i> Loading wallet...
        </div>
      )}

      {wallet && (
        <>
          {/* Rewards */}
          <div className="card ptp-35" >
            <h3 className="ptp-36">
              <span className="ptp-37"><i className="fas fa-gift"></i></span>
              Available Rewards ({wallet.rewards.length})
            </h3>
            {wallet.rewards.length === 0 ? (
              <div className="ptp-38">No available rewards</div>
            ) : (
              <div className="ptp-39">
                {wallet.rewards.map(r => (
                  <div key={r.id}  className="pos-wallet-item ptp-40">
                    <div>
                      <div className="ptp-41">{r.name}</div>
                      <div className="ptp-42">
                        Code: <code className="ptp-43">{r.redemption_code}</code>
                        {r.points_spent ? ` · ${r.points_spent} pts` : ''}
                        {r.expires_at ? ` · Expires ${new Date(r.expires_at).toLocaleDateString()}` : ''}
                      </div>
                    </div>
                    <button
                      className="btn btn-primary btn-sm ptp-44"
                      disabled={processingId === `reward-${r.id}`}
                      onClick={() => applyReward(r.id)}
                      
                    >
                      {processingId === `reward-${r.id}` ? 'Applying...' : 'Use Reward'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Vouchers */}
          <div className="card ptp-45" >
            <h3 className="ptp-46">
              <span className="ptp-47"><i className="fas fa-ticket"></i></span>
              Available Vouchers ({wallet.vouchers.length})
            </h3>
            {wallet.vouchers.length === 0 ? (
              <div className="ptp-48">No available vouchers</div>
            ) : (
              <div className="ptp-49">
                {wallet.vouchers.map(v => (
                  <div key={v.id}  className="pos-wallet-item ptp-50">
                    <div>
                      <div className="ptp-51">{v.title}</div>
                      <div className="ptp-52">
                        Code: <code className="ptp-53">{v.code}</code>
                        {formatDiscount(v) ? ` · ${formatDiscount(v)}` : ''}
                        {v.min_spend ? ` · Min spend RM ${v.min_spend}` : ''}
                        {v.expires_at ? ` · Expires ${new Date(v.expires_at).toLocaleDateString()}` : ''}
                      </div>
                    </div>
                    <button
                      className="btn btn-primary btn-sm ptp-54"
                      disabled={processingId === `voucher-${v.id}`}
                      onClick={() => applyVoucher(v.id)}
                      
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
          className={`card ptp-result ${result.success ? 'ptp-result-success' : 'ptp-result-error'}`}
        >
          <div className="ptp-55">
            <i className={`fas ${result.success ? 'fa-check-circle' : 'fa-exclamation-circle'} ptp-icon ${result.success ? 'ptp-icon-success' : 'ptp-icon-error'}`}></i>
            <div>
              <div className={`ptp-title ${result.success ? 'ptp-title-success' : 'ptp-title-error'}`}>{result.success ? 'Success' : 'Error'}</div>
              <div className={`ptp-msg ${result.success ? 'ptp-msg-success' : 'ptp-msg-error'}`}>{result.message}</div>
            </div>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="ptp-56">
        <strong><i className="fas fa-info-circle"></i> How it works:</strong>
        <ol className="ptp-57">
          <li>Customer comes to the counter for in-store purchase</li>
          <li>Staff asks for phone number <strong>OR</strong> taps <strong>Scan QR</strong> to scan customer&apos;s code</li>
          <li>Staff sees customer&apos;s available rewards and vouchers</li>
          <li>Staff clicks <strong>Use Reward</strong> or <strong>Use Voucher</strong></li>
          <li>Staff manually applies the discount on their physical POS terminal</li>
          <li>Item is marked as used in the customer&apos;s account instantly</li>
        </ol>
      </div>
    </div>
  );
}
