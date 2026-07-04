"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  searchCustomers, getCustomerWallet, getCustomerById, topUpWallet, api,
  markRewardUsed, markVoucherUsed, scanCustomerCode, scanRewardCode, scanVoucherCode,
  type Customer, type CustomerWallet, type Reward, type Voucher
} from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import PageHeader from "@/components/PageHeader";
import Alert from "@/components/Alert";
import Card from "@/components/Card";
import EmptyState from "@/components/EmptyState";
import QrScannerModal from "@/components/QrScannerModal";
import SkeletonCard from "@/components/SkeletonCard";
import {
  Search, QrCode, Wallet, Banknote,
  Gift, Ticket, User, Lock, CheckCircle, ScanLine
} from "lucide-react";

type Tab = "topup" | "rewards";
// Admin top-up credits the wallet directly; only cash/counter payment is supported.
type PaymentMethod = "cash";

const QUICK_AMOUNTS = [20, 50, 100, 200, 300, 500];

export default function WalletPage() {
  const [tab, setTab] = useState<Tab>("topup");
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [walletData, setWalletData] = useState<CustomerWallet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Top-up state
  const [amount, setAmount] = useState("");
  const [paymentMethod] = useState<PaymentMethod>("cash");
  const [notes, setNotes] = useState("");
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [toppingUp, setToppingUp] = useState(false);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  // QR Scanner
  const [showScanner, setShowScanner] = useState(false);
  const [scanMode, setScanMode] = useState<"customer" | "reward" | "voucher">("customer");

  // Redeem state
  const [redeemingId, setRedeemingId] = useState<number | null>(null);
  const [redeemType, setRedeemType] = useState<"reward" | "voucher" | null>(null);

  // Redeem PIN state
  const [showRedeemPin, setShowRedeemPin] = useState(false);
  const [redeemPin, setRedeemPin] = useState("");
  const [pendingRedeem, setPendingRedeem] = useState<{ reward?: Reward; voucher?: Voucher } | null>(null);

  const MAX_TOPUP = 100000;

  const doSearch = useCallback(async (q: string) => {
    if (q.length < 2) { setSearchResults([]); return; }
    setLoading(true);
    try {
      const data = await searchCustomers(q);
      setSearchResults((Array.isArray(data) ? data : []).slice(0, 5));
      setError("");
    } catch (e) { console.error("Customer search failed:", e); setSearchResults([]); }
    finally { setLoading(false); }
  }, []);

  const loadCustomer = async (customer: Customer) => {
    setSelectedCustomer(customer);
    setSearchResults([]);
    setSearchQ(customer.display_name);
    setLoading(true);
    try {
      const wallet = await getCustomerWallet(customer.id);
      setWalletData(wallet);
      setError("");
    } catch (err: unknown) {
      console.error("Failed to load customer wallet:", err);
      setError(parseApiError(err, "Failed to load customer wallet"));
      setWalletData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleScan = async (code: string) => {
    setShowScanner(false);
    setLoading(true);
    try {
      if (scanMode === "customer") {
        const data = await scanCustomerCode(code);
        const customer = await getCustomerById(data.customer_id);
        await loadCustomer(customer);
        setSuccess(`Found customer: ${data.customer_name}`);
      } else if (scanMode === "reward") {
        const data = await scanRewardCode(code);
        if (!data.valid) { setError("Invalid or expired reward"); return; }
        if (data.customer_id && selectedCustomer?.id !== data.customer_id) {
          const customer = await getCustomerById(data.customer_id);
          await loadCustomer(customer);
        } else if (selectedCustomer) {
          const wallet = await getCustomerWallet(selectedCustomer.id);
          setWalletData(wallet);
        }
        setSuccess(`Reward found: ${data.name}`);
        setTab("rewards");
      } else if (scanMode === "voucher") {
        const data = await scanVoucherCode(code);
        if (!data.valid) { setError("Invalid or expired voucher"); return; }
        if (data.customer_id && selectedCustomer?.id !== data.customer_id) {
          const customer = await getCustomerById(data.customer_id);
          await loadCustomer(customer);
        } else if (selectedCustomer) {
          const wallet = await getCustomerWallet(selectedCustomer.id);
          setWalletData(wallet);
        }
        setSuccess(`Voucher found: ${data.title}`);
        setTab("rewards");
      }
    } catch (err: unknown) {
      console.error("Scan failed:", err);
      setError(parseApiError(err, "Scan failed"));
    } finally {
      setLoading(false);
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => setSuccess(""), 3000);
    }
  };

  const attemptCountRef = useRef(0);

  const verifyPin = useCallback(async (pinToVerify: string): Promise<boolean> => {
    try {
      const delay = Math.min(3000, attemptCountRef.current * 1000);
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      const d = await api.post<{ valid?: boolean; data?: { valid?: boolean } }>("/staff/auth/verify-pin", { pin: pinToVerify });
      return (d?.valid || d?.data?.valid) === true;
    } catch (e) { console.error("PIN verification failed:", e); return false; }
  }, []);

  const handleTopUp = async () => {
    const amt = parseFloat(amount);
    if (!selectedCustomer || !amount || isNaN(amt) || amt <= 0) { setError("Select a customer and enter a valid amount"); return; }
    if (amt > MAX_TOPUP) { setError(`Maximum top-up is RM ${MAX_TOPUP.toLocaleString()}`); return; }
    setToppingUp(true);
    try {
      const valid = await verifyPin(pin);
      if (!valid) { attemptCountRef.current++; setError("Invalid PIN"); setToppingUp(false); return; }
      attemptCountRef.current = 0;
      const res = await topUpWallet({
        customer_id: selectedCustomer.id,
        amount: parseFloat(amount),
        payment_method: paymentMethod,
        notes: notes || undefined,
      });
      const bal = typeof res.new_balance === "number" && !isNaN(res.new_balance) ? res.new_balance.toFixed(2) : "—";
      setSuccess(`Top-up successful! New balance: RM ${bal}`);
      setAmount(""); setPin(""); setNotes(""); setShowPin(false);
      if (selectedCustomer) loadCustomer(selectedCustomer);
    } catch (e: unknown) { console.error("Top-up failed:", e); setError(parseApiError(e, "Top-up failed")); } finally { setToppingUp(false); }
  };

  const handleUseReward = async (reward: Reward) => {
    if (!selectedCustomer) { setError("Search for a customer first"); return; }
    setPendingRedeem({ reward });
    setShowRedeemPin(true);
    setRedeemPin("");
  };

  const handleUseVoucher = async (voucher: Voucher) => {
    if (!selectedCustomer) { setError("Search for a customer first"); return; }
    setPendingRedeem({ voucher });
    setShowRedeemPin(true);
    setRedeemPin("");
  };

  const executeRedeem = async () => {
    if (!pendingRedeem || !selectedCustomer) { setError("Select a reward or voucher first"); return; }
    const valid = await verifyPin(redeemPin);
    if (!valid) { attemptCountRef.current++; setError("Invalid PIN"); return; }
    attemptCountRef.current = 0;
    setShowRedeemPin(false);
    setRedeemPin("");

    if (pendingRedeem.reward) {
      const reward = pendingRedeem.reward;
      setRedeemingId(reward.id);
      setRedeemType("reward");
      try {
        const res = await markRewardUsed(selectedCustomer.id, reward.id);
        setSuccess(res.message || "Reward used successfully");
        if (selectedCustomer) loadCustomer(selectedCustomer);
      } catch (e: unknown) { setError(parseApiError(e, "Failed to redeem reward")); } finally { setRedeemingId(null); setRedeemType(null); }
    } else if (pendingRedeem.voucher) {
      const voucher = pendingRedeem.voucher;
      setRedeemingId(voucher.id);
      setRedeemType("voucher");
      try {
        const res = await markVoucherUsed(selectedCustomer.id, voucher.id);
        setSuccess(res.message || "Voucher used successfully");
        if (selectedCustomer) loadCustomer(selectedCustomer);
      } catch (e: unknown) { setError(parseApiError(e, "Failed to redeem voucher")); } finally { setRedeemingId(null); setRedeemType(null); }
    }
    setPendingRedeem(null);
  };

  const formatRewardName = (r: Reward) => {
    return r.name || (r.redemption_code ? `Reward #${r.redemption_code}` : `Reward #${r.id}`);
  };

  const formatVoucherName = (v: Voucher) => {
    return v.title || v.code || v.voucher_title || v.voucher_code || `Voucher #${v.id}`;
  };

  return (
    <div style={{ padding: 24, maxWidth: 700, margin: "0 auto" }}>
      <PageHeader title="Customer Service" subtitle="Wallet, Rewards & Vouchers" />

      {error && <Alert variant="error" onDismiss={() => setError("")}>{error}</Alert>}
      {success && <Alert variant="success" onDismiss={() => setSuccess("")} autoDismiss={3000}>{success}</Alert>}

      {/* Big Scan QR Button */}
      {!selectedCustomer && (
        <button
          className="btn btn-primary w-full"
          style={{ padding: "20px 16px", fontSize: 18, fontWeight: 700, marginBottom: 16, gap: 10 }}
          onClick={() => { setScanMode("customer"); setShowScanner(true); }}
        >
          <ScanLine size={28} />
          Scan Customer QR Code
        </button>
      )}

      {/* Customer Search */}
      <Card style={{ marginBottom: 16 }}>
        <label className="form-label" style={{ marginBottom: 8, display: "block" }}>
          {selectedCustomer ? "Customer" : "Search Customer"}
        </label>
        {!selectedCustomer ? (
          <>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1, position: "relative" }}>
                <Search size={16} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", opacity: 0.4, pointerEvents: "none" }} />
                <input
                  className="form-input"
                  style={{ paddingLeft: 40 }}
                  value={searchQ}
                  onChange={e => setSearchQ(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") doSearch(searchQ); }}
                  placeholder="Type phone number or name..."
                  disabled={loading}
                />
              </div>
              <button className="btn btn-primary" onClick={() => doSearch(searchQ)} disabled={loading || searchQ.length < 2}>
                <Search size={16} /> Search
              </button>
            </div>
            {searchResults.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {searchResults.map(c => (
                  <button
                    key={c.id}
                    className="btn btn-ghost w-full"
                    style={{ justifyContent: "flex-start", padding: "10px 12px", borderRadius: "var(--radius-md)", border: "1px solid var(--color-border-light)", background: "white" }}
                    onClick={() => loadCustomer(c)}
                  >
                    <User size={16} style={{ marginRight: 10, opacity: 0.5 }} />
                    <span style={{ fontSize: 14 }}>{c.display_name} · {c.phone_number}</span>
                  </button>
                ))}
              </div>
            )}
            {searchQ.length >= 2 && !loading && searchResults.length === 0 && (
              <p style={{ fontSize: 13, color: "var(--color-text-muted)", textAlign: "center", padding: 8 }}>No customers found.</p>
            )}
          </>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--color-bg-dark)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700 }}>
                {(selectedCustomer.display_name || "?").charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{selectedCustomer.display_name}</div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{selectedCustomer.phone_number}</div>
              </div>
            </div>
            <button className="btn btn-sm btn-ghost" onClick={() => { setSelectedCustomer(null); setWalletData(null); setSearchQ(""); setSearchResults([]); }}>
              Change
            </button>
          </div>
        )}
      </Card>

      {/* Customer Card */}
      {selectedCustomer && walletData && (
        <Card style={{ marginBottom: 16, borderLeft: "4px solid var(--color-primary)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--color-bg-dark)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700 }}>
                {(selectedCustomer.display_name || "?").charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{selectedCustomer.display_name}</div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{selectedCustomer.phone_number}</div>
              </div>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
            <div style={{ textAlign: "center", padding: 10, background: "var(--color-bg-muted)", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 2 }}>Rewards</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{walletData.rewards?.length || 0}</div>
            </div>
            <div style={{ textAlign: "center", padding: 10, background: "var(--color-bg-muted)", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginBottom: 2 }}>Vouchers</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{walletData.vouchers?.length || 0}</div>
            </div>
          </div>
        </Card>
      )}

      {loading && <SkeletonCard count={3} />}

      {/* Tabs */}
      {selectedCustomer && walletData && !loading && (
        <>
          <div className="tab-bar" style={{ marginBottom: 16 }}>
            <button className={`tab ${tab === "topup" ? "active" : ""}`} onClick={() => setTab("topup")}>
              <Wallet size={14} style={{ marginRight: 6 }} /> Wallet Top-Up
            </button>
            <button className={`tab ${tab === "rewards" ? "active" : ""}`} onClick={() => setTab("rewards")}>
              <Gift size={14} style={{ marginRight: 6 }} /> Rewards & Vouchers
            </button>
          </div>

          {tab === "topup" && (
            <Card>
              <label className="form-label">Top-Up Amount</label>
              <input
                type="number"
                inputMode="decimal"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="form-input"
                style={{ fontSize: 24, fontWeight: 700, marginBottom: 10 }}
              />
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
                {QUICK_AMOUNTS.map(v => (
                  <button
                    key={v}
                    className={`btn btn-sm ${amount === String(v) ? "btn-primary" : "btn-ghost"}`}
                    onClick={() => setAmount(String(v))}
                  >
                    RM {v}
                  </button>
                ))}
              </div>

              <label className="form-label">Payment Method</label>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <div className="btn btn-primary flex-1" style={{ cursor: "default" }}>
                  <Banknote size={16} />
                  {paymentMethod.toUpperCase()}
                </div>
              </div>

              <label className="form-label">Notes (optional)</label>
              <input
                className="form-input"
                style={{ marginBottom: 16 }}
                placeholder="e.g. Counter 1, Staff: Ahmad"
                value={notes}
                onChange={e => setNotes(e.target.value)}
              />

              {!showPin ? (
                <button
                  className="btn btn-primary w-full"
                  onClick={() => setShowPin(true)}
                  disabled={!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0}
                >
                  <Lock size={16} /> Confirm with PIN
                </button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <form onSubmit={e => e.preventDefault()} style={{ display: "contents" }}>
                  <input
                    type="password"
                    inputMode="numeric"
                    value={pin}
                    onChange={e => setPin(e.target.value)}
                    placeholder="Enter 4-digit PIN"
                    maxLength={6}
                    className="form-input"
                    style={{ textAlign: "center" }}
                    autoFocus
                  />
                  </form>
                  <button
                    className="btn btn-primary w-full"
                    onClick={handleTopUp}
                    disabled={toppingUp || pin.length < 4}
                  >
                    {toppingUp ? "Processing..." : `Top-Up RM ${(() => { const a = parseFloat(amount || "0"); return isNaN(a) ? "0.00" : a.toFixed(2); })()}`}
                  </button>
                </div>
              )}
            </Card>
          )}

          {tab === "rewards" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Redeem PIN Entry */}
              {showRedeemPin && (
                <Card style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
                    Enter your PIN to confirm
                  </div>
                  <form onSubmit={e => e.preventDefault()} style={{ display: "contents" }}>
                  <input
                    type="password"
                    inputMode="numeric"
                    value={redeemPin}
                    onChange={e => setRedeemPin(e.target.value)}
                    placeholder="4 digits"
                    maxLength={6}
                    className="form-input"
                    style={{ textAlign: "center", fontSize: 24, letterSpacing: 8, marginBottom: 16 }}
                    autoFocus
                  />
                  </form>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button className="btn btn-ghost flex-1" onClick={() => { setShowRedeemPin(false); setRedeemPin(""); setPendingRedeem(null); }}>
                      Cancel
                    </button>
                    <button
                      className="btn btn-primary flex-1"
                      onClick={executeRedeem}
                      disabled={redeemPin.length < 4}
                    >
                      Confirm
                    </button>
                  </div>
                </Card>
              )}
              {/* Rewards */}
              <Card title={`Available Rewards (${walletData.rewards?.length || 0})`}>
                {(!walletData.rewards || walletData.rewards.length === 0) ? (
                  <EmptyState title="No rewards" description="This customer has no available rewards." icon={<Gift size={40} />} />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {walletData.rewards.map((reward: Reward) => (
                      <div
                        key={reward.id}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: 12, background: "var(--color-bg-muted)", borderRadius: "var(--radius-md)"
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{formatRewardName(reward)}</div>
                          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                            {reward.redemption_code && <>Code: {reward.redemption_code} · </>}
                            {reward.points_spent !== undefined && <>{reward.points_spent} pts · </>}
                            {reward.expires_at && <>{(() => { const d = new Date(reward.expires_at); return !isNaN(d.getTime()) ? `Expires: ${d.toLocaleDateString()}` : null; })()}</>}
                          </div>
                        </div>
                        <button
                          className="btn btn-sm btn-success"
                          onClick={() => handleUseReward(reward)}
                          disabled={redeemingId === reward.id && redeemType === "reward"}
                        >
                          {redeemingId === reward.id && redeemType === "reward" ? "..." : <><CheckCircle size={12} /> Use</>}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: 12, textAlign: "center" }}>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => { setScanMode("reward"); setShowScanner(true); }}
                  >
                    <QrCode size={14} /> Scan Reward QR
                  </button>
                </div>
              </Card>

              {/* Vouchers */}
              <Card title={`Available Vouchers (${walletData.vouchers?.length || 0})`}>
                {(!walletData.vouchers || walletData.vouchers.length === 0) ? (
                  <EmptyState title="No vouchers" description="This customer has no available vouchers." icon={<Ticket size={40} />} />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {walletData.vouchers.map((voucher: Voucher) => (
                      <div
                        key={voucher.id}
                        style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          padding: 12, background: "var(--color-bg-muted)", borderRadius: "var(--radius-md)"
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{formatVoucherName(voucher)}</div>
                          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                            Code: {voucher.code || voucher.voucher_code || voucher.redemption_code || "—"}
                            {voucher.expires_at && <>{(() => { const d = new Date(voucher.expires_at); return !isNaN(d.getTime()) ? ` · Exp: ${d.toLocaleDateString()}` : null; })()}</>}
                          </div>
                        </div>
                        <button
                          className="btn btn-sm btn-success"
                          onClick={() => handleUseVoucher(voucher)}
                          disabled={redeemingId === voucher.id && redeemType === "voucher"}
                        >
                          {redeemingId === voucher.id && redeemType === "voucher" ? "..." : <><CheckCircle size={12} /> Use</>}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ marginTop: 12, textAlign: "center" }}>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => { setScanMode("voucher"); setShowScanner(true); }}
                  >
                    <QrCode size={14} /> Scan Voucher QR
                  </button>
                </div>
              </Card>
            </div>
          )}
        </>
      )}

      {/* QR Scanner */}
      <QrScannerModal
        open={showScanner}
        onClose={() => setShowScanner(false)}
        onScan={handleScan}
        title={scanMode === "customer" ? "Scan Customer QR" : scanMode === "reward" ? "Scan Reward QR" : "Scan Voucher QR"}
      />
    </div>
  );
}
