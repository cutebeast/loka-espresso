"use client";

import type { Dispatch, SetStateAction } from "react";
import PageHeader from "@/components/PageHeader";
import Alert from "@/components/Alert";
import Drawer from "@/components/Drawer";
import NumericKeypad from "@/components/NumericKeypad";
import { X, QrCode, User, Gift, CreditCard, Banknote, Smartphone } from "lucide-react";
import { showFeatureToast } from "@/lib/featureFlags";
import { type Customer, type CustomerWallet } from "@/lib/api";
import { PaymentMethod } from "./usePosState";

interface PosCheckoutLineItem {
  menu_item_id?: number;
  id?: string | number;
  item_name?: string;
  name?: string;
  modifiers_label?: string;
  quantity: number;
  unit_price?: number;
  price?: number;
}

interface PosCheckoutOrder {
  order_number: string;
  total_amount?: number;
  total?: number;
  voucher_discount?: number;
  reward_discount?: number;
  line_items?: PosCheckoutLineItem[];
  items?: PosCheckoutLineItem[];
}

interface DiscountsApplied {
  voucher?: unknown;
  reward?: unknown;
  wallet?: number;
}

interface PosCheckoutPanelProps {
  order: PosCheckoutOrder;
  orderId: string | null;
  customer: Customer | null;
  walletData: CustomerWallet | null;
  paymentMethod: PaymentMethod;
  amountTendered: string;
  discountAmount: number;
  discountType: "percentage" | "fixed";
  tipAmount: number;
  saving: boolean;
  applyingDiscount: boolean;
  discountsApplied: DiscountsApplied;
  error: string;
  msg: string;
  showDiscounts: boolean;
  onSetPaymentMethod: (m: PaymentMethod) => void;
  onSetAmountTendered: Dispatch<SetStateAction<string>>;
  onSetDiscountAmount: (v: number) => void;
  onSetDiscountType: (t: "percentage" | "fixed") => void;
  onSetTipAmount: (v: number) => void;
  onSetShowDiscounts: (v: boolean) => void;
  onSetCustomer: (c: Customer | null) => void;
  onSetWalletData: (w: CustomerWallet | null) => void;
  onSetError: (e: string) => void;
  onSetMsg: (m: string) => void;
  onScanCustomer: () => void;
  onApplyVoucher: (code: string) => void;
  onApplyReward: (id: number) => void;
  onWalletPayment: (amount: number) => void;
  onCheckout: () => void;
}

export default function PosCheckoutPanel({
  order, orderId: _orderId, customer, walletData,
  paymentMethod, amountTendered, discountAmount, discountType, tipAmount,
  saving, applyingDiscount, discountsApplied,
  error, msg, showDiscounts,
  onSetPaymentMethod, onSetAmountTendered, onSetDiscountAmount, onSetDiscountType, onSetTipAmount,
  onSetShowDiscounts, onSetCustomer, onSetWalletData,
  onSetError, onSetMsg, onScanCustomer,
  onApplyVoucher, onApplyReward, onWalletPayment, onCheckout,
}: PosCheckoutPanelProps) {
  const voucherDisc = Number(order.voucher_discount ?? 0);
  const rewardDisc = Number(order.reward_discount ?? 0);
  const originalTotal = (order.total_amount || order.total || 0);
  const orderBase = order.total_amount || order.total || 0;
  const manualDisc = discountType === "percentage" ? orderBase * (discountAmount / 100) : discountAmount;
  const walletPaid = discountsApplied.wallet || 0;
  const remainingTotal = Math.max(0, (order.total_amount || order.total || 0) - manualDisc);
  const checkoutTotal = Math.max(0, remainingTotal - walletPaid);

  const discountPresets = discountType === "percentage" ? [5, 10, 15, 20] : [5, 10, 20, 50];

  return (
    <div style={{ padding: 24, maxWidth: 600, margin: "0 auto" }}>
      <PageHeader title="Checkout" subtitle={order.order_number} />
      {error && <Alert variant="error" onDismiss={() => onSetError("")}>{error}</Alert>}
      {msg && <Alert variant="success" onDismiss={() => onSetMsg("")} autoDismiss={3000}>{msg}</Alert>}

      {/* Customer Identification */}
      {!customer ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700 }}>Customer</h4>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={onScanCustomer}>
              <QrCode size={14} /> Scan Customer
            </button>
            <span style={{ fontSize: 12, color: "var(--color-text-muted)", alignSelf: "center" }}>or search to apply rewards/vouchers</span>
          </div>
        </div>
      ) : (
        <div className="card" style={{ marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <User size={16} />
            <span style={{ fontWeight: 600 }}>{customer.display_name}</span>
            {walletData && (
              <span className="badge badge-sm badge-outline">Wallet: RM {(Number(walletData?.balance ?? 0)).toFixed(2)}</span>
            )}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => { onSetCustomer(null); onSetWalletData(null); }}>
            <X size={14} /> Change
          </button>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700 }}>Order Summary</h4>
        <div className="table-container" style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--color-border-light)", marginBottom: 12 }}>
          <table className="data-table">
            <thead><tr><th>Item</th><th style={{ textAlign: "center" }}>Qty</th><th style={{ textAlign: "right" }}>Price</th></tr></thead>
            <tbody>
              {(order.line_items || order.items || []).map((li, idx) => (
                <tr key={`${li.menu_item_id || li.id || li.item_name}-${li.modifiers_label || "none"}-${idx}`}>
                  <td>{li.item_name || li.name}</td>
                  <td style={{ textAlign: "center" }}>{li.quantity}</td>
                  <td style={{ textAlign: "right" }}>RM {Number(li.unit_price || li.price || 0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
          <span>Subtotal</span><span>RM {originalTotal.toFixed(2)}</span>
        </div>
        {voucherDisc > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "var(--color-success)", marginBottom: 4 }}>
            <span>Voucher Discount</span><span>-RM {voucherDisc.toFixed(2)}</span>
          </div>
        )}
        {rewardDisc > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "var(--color-success)", marginBottom: 4 }}>
            <span>Reward Discount</span><span>-RM {rewardDisc.toFixed(2)}</span>
          </div>
        )}
        {manualDisc > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "var(--color-success)", marginBottom: 4 }}>
            <span>Staff Discount</span><span>-RM {manualDisc.toFixed(2)}</span>
          </div>
        )}
        {walletPaid > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "var(--color-info)", marginBottom: 4 }}>
            <span>Wallet Payment</span><span>-RM {walletPaid.toFixed(2)}</span>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20, fontWeight: 700, marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--color-border-light)" }}>
          <span>Total Due</span><span>RM {checkoutTotal.toFixed(2)}</span>
        </div>
      </div>

      {customer && walletData && (
        <button
          className="btn btn-outline w-full"
          style={{ marginBottom: 16 }}
          onClick={() => onSetShowDiscounts(true)}
          aria-expanded={showDiscounts}
          aria-haspopup="true"
        >
          <Gift size={16} /> Apply Discounts & Wallet
        </button>
      )}

      {/* Manual Discount */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700 }}>Staff Discount</h4>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          {(["percentage", "fixed"] as const).map((t) => (
            <button key={t} className={`btn btn-sm ${discountType === t ? "btn-primary" : "btn-ghost"}`} onClick={() => onSetDiscountType(t)}>
              {t === "percentage" ? "%" : "RM"}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {discountPresets.map((v) => (
            <button key={v} className={`btn btn-sm ${discountAmount === v ? "btn-primary" : "btn-ghost"}`} onClick={() => onSetDiscountAmount(v)}>
              {discountType === "percentage" ? `${v}%` : `RM ${v}`}
            </button>
          ))}
          <button className={`btn btn-sm ${discountAmount === 0 ? "btn-primary" : "btn-ghost"}`} onClick={() => onSetDiscountAmount(0)}>None</button>
        </div>
      </div>

      {/* Tip */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h4 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 700 }}>Tip</h4>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
          {[0, 5, 10, 15, 20].map((pct) => {
            const tip = Math.round(checkoutTotal * pct / 100 * 100) / 100;
            return (
              <button key={pct} className={`btn btn-sm ${tipAmount === tip ? "btn-primary" : "btn-ghost"}`} onClick={() => onSetTipAmount(tip)}>
                {pct === 0 ? "None" : `${pct}% (RM ${tip.toFixed(0)})`}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>RM</span>
          <input
            type="number" min={0} step={0.5}
            value={tipAmount === 0 ? "" : tipAmount}
            onChange={(e) => { const v = parseFloat(e.target.value); onSetTipAmount(isNaN(v) ? 0 : Math.max(0, v)); }}
            placeholder="Custom"
            className="form-input" style={{ width: 100 }}
          />
        </div>
      </div>

      {/* Payment */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700 }}>Payment</h4>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {(["cash", "card", "qr"] as PaymentMethod[]).map((m) => (
            <button key={m} className={`btn flex-1 ${paymentMethod === m ? "btn-primary" : "btn-ghost"}`} onClick={() => onSetPaymentMethod(m)}>
              {m === "cash" ? <Banknote size={16} /> : m === "card" ? <CreditCard size={16} /> : <Smartphone size={16} />}
              {m.toUpperCase()}
            </button>
          ))}
        </div>

        {paymentMethod === "cash" && (
          <div>
            <div style={{ fontSize: 32, fontWeight: 700, textAlign: "center", marginBottom: 12 }}>RM {checkoutTotal.toFixed(2)}</div>
            <NumericKeypad
              value={amountTendered}
              onPress={(key) => onSetAmountTendered((prev: string) => prev + key)}
              onBackspace={() => onSetAmountTendered((prev: string) => prev.slice(0, -1))}
              onClear={() => onSetAmountTendered("")}
            />
            <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
              {[checkoutTotal, Math.ceil(checkoutTotal / 5) * 5, Math.ceil(checkoutTotal / 10) * 10].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
                <button key={v} className="btn btn-sm btn-ghost flex-1" onClick={() => onSetAmountTendered(String(v))}>RM {v.toFixed(0)}</button>
              ))}
            </div>
            {amountTendered && !isNaN(parseFloat(amountTendered)) && parseFloat(amountTendered) >= checkoutTotal && (
              <div style={{ marginTop: 12, fontSize: 16, color: "var(--color-success)", fontWeight: 700, textAlign: "center" }}>
                Change: RM {Math.max(0, parseFloat(amountTendered) - checkoutTotal).toFixed(2)}
              </div>
            )}
          </div>
        )}

        {paymentMethod === "card" && (
          <div style={{ textAlign: "center", padding: 24 }}>
            <CreditCard size={48} style={{ opacity: 0.3, marginBottom: 12 }} />
            <p style={{ fontSize: 16, fontWeight: 600 }}>Tap / Swipe / Insert Card</p>
            <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Customer pays via card terminal</p>
          </div>
        )}

        {paymentMethod === "qr" && (
          <div style={{ textAlign: "center", padding: 24 }}>
            <Smartphone size={48} style={{ opacity: 0.3, marginBottom: 12 }} />
            <p style={{ fontSize: 16, fontWeight: 600 }}>Show QR to Customer</p>
            <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => showFeatureToast("QR Payment Gateway")}>Payment gateway QR integration pending</button>
            </p>
            <div style={{ width: 200, height: 200, margin: "16px auto", background: "var(--color-bg-muted)", borderRadius: "var(--radius-md)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <QrCode size={64} style={{ opacity: 0.2 }} />
            </div>
          </div>
        )}
      </div>

      <button className="btn btn-primary btn-lg w-full" onClick={onCheckout} disabled={saving || (paymentMethod === "cash" && checkoutTotal > 0 && (!amountTendered || isNaN(parseFloat(amountTendered)) || parseFloat(amountTendered) < checkoutTotal))}>
        {saving ? "Processing..." : checkoutTotal <= 0 ? "Complete Checkout" : `Confirm Payment — RM ${checkoutTotal.toFixed(2)}`}
      </button>

      {/* Checkout Discounts Drawer */}
      <Drawer open={showDiscounts} onClose={() => onSetShowDiscounts(false)} title="Apply Discounts & Wallet" position="bottom">
        {applyingDiscount && <div style={{ padding: 20, textAlign: "center" }}>Applying...</div>}
        {walletData && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "0 0 20px" }}>
            {walletData.balance > 0 && (
              <div className="card" style={{ background: "var(--color-bg-muted)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontWeight: 700 }}>Wallet Balance</span>
                  <span className="badge badge-primary">RM {Number(walletData.balance ?? 0).toFixed(2)}</span>
                </div>
                {remainingTotal > 0 && (
                  <button className="btn btn-primary w-full" onClick={() => onWalletPayment(Math.min(walletData.balance, remainingTotal))}>
                    Pay RM {Math.min(walletData.balance, remainingTotal).toFixed(2)} from Wallet
                  </button>
                )}
              </div>
            )}

            {walletData.vouchers && walletData.vouchers.length > 0 && (
              <div>
                <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Vouchers</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {walletData.vouchers.map((v) => (
                    <div key={v.id} className="card" style={{ padding: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{v.title || v.code}</div>
                        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                          {v.discount_type === "percent" ? `${v.discount_value}% off` : `RM ${v.discount_value} off`}
                          {v.min_spend ? ` · Min spend RM ${v.min_spend}` : ""}
                        </div>
                      </div>
                      <button className="btn btn-sm btn-primary" onClick={() => onApplyVoucher(v.code ?? "")}>Apply</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {walletData.rewards && walletData.rewards.length > 0 && (
              <div>
                <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Rewards</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {walletData.rewards.map((r) => (
                    <div key={r.id} className="card" style={{ padding: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{r.name || r.redemption_code}</div>
                        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{r.points_spent} pts · Exp: {r.expires_at?.slice(0, 10)}</div>
                      </div>
                      <button className="btn btn-sm btn-primary" onClick={() => onApplyReward(r.id)}>Apply</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
