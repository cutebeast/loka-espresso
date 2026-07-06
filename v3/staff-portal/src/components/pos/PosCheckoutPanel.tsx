"use client";

import { useTranslation } from "@/hooks/useTranslation";
import type { Dispatch, SetStateAction } from "react";
import PageHeader from "@/components/PageHeader";
import Alert from "@/components/Alert";
import Drawer from "@/components/Drawer";
import NumericKeypad from "@/components/NumericKeypad";
import { X, QrCode, User, Gift, CreditCard, Banknote, Smartphone } from "lucide-react";
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
  stripeEnabled?: boolean | null;
}
export default function PosCheckoutPanel({
  order,
  orderId: _orderId,
  customer,
  walletData,
  paymentMethod,
  amountTendered,
  discountAmount,
  discountType,
  tipAmount,
  saving,
  applyingDiscount,
  discountsApplied,
  error,
  msg,
  showDiscounts,
  onSetPaymentMethod,
  onSetAmountTendered,
  onSetDiscountAmount,
  onSetDiscountType,
  onSetTipAmount,
  onSetShowDiscounts,
  onSetCustomer,
  onSetWalletData,
  onSetError,
  onSetMsg,
  onScanCustomer,
  onApplyVoucher,
  onApplyReward,
  onWalletPayment,
  onCheckout,
  stripeEnabled
}: PosCheckoutPanelProps) {
  const {
    t
  } = useTranslation();
  const voucherDisc = Number(order.voucher_discount ?? 0);
  const rewardDisc = Number(order.reward_discount ?? 0);
  const originalTotal = order.total_amount || order.total || 0;
  const orderBase = order.total_amount || order.total || 0;
  // Backend applies percentage discounts to items_subtotal.
  const discountBase = (order as any).items_subtotal || orderBase;
  const manualDisc = discountType === "percentage" ? discountBase * (discountAmount / 100) : discountAmount;
  const walletPaid = discountsApplied.wallet || 0;
  const preTipDue = Math.max(0, orderBase - manualDisc - walletPaid);
  const checkoutTotal = Math.max(0, preTipDue + tipAmount);
  const discountPresets = discountType === "percentage" ? [5, 10, 15, 20] : [5, 10, 20, 50];
  return <div style={{
    padding: 24,
    maxWidth: 600,
    margin: "0 auto"
  }}>
      <PageHeader title={t("pos.checkout")} subtitle={order.order_number} />
      {error && <Alert variant="error" onDismiss={() => onSetError("")}>{error}</Alert>}
      {msg && <Alert variant="success" onDismiss={() => onSetMsg("")} autoDismiss={3000}>{msg}</Alert>}

      {/* Customer Identification */}
      {!customer ? <div className="card" style={{
      marginBottom: 16
    }}>
          <h4 style={{
        margin: "0 0 8px",
        fontSize: 14,
        fontWeight: 700
      }}>{t("pos.customer")}<span style={{
          fontWeight: 400,
          fontSize: 12,
          color: "var(--color-text-muted)"
        }}>{t("pos.optional_walks_in_accepted")}</span></h4>
          <div style={{
        display: "flex",
        gap: 8
      }}>
            <button className="btn btn-ghost btn-sm" onClick={onScanCustomer}>
              <QrCode size={14} />{t("pos.scan_customer")}</button>
            <span style={{
          fontSize: 12,
          color: "var(--color-text-muted)",
          alignSelf: "center"
        }}>{t("pos.or_search_to_apply_rewards_vouchers")}</span>
          </div>
        </div> : <div className="card" style={{
      marginBottom: 16,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between"
    }}>
          <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8
      }}>
            <User size={16} />
            <span style={{
          fontWeight: 600
        }}>{customer.display_name}</span>
            {walletData && <span className="badge badge-sm badge-outline">{t("pos.wallet_rm")}{Number(walletData?.balance ?? 0).toFixed(2)}</span>}
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => {
        onSetCustomer(null);
        onSetWalletData(null);
      }}>
            <X size={14} />{t("pos.change")}</button>
        </div>}

      <div className="card" style={{
      marginBottom: 16
    }}>
        <h4 style={{
        margin: "0 0 12px",
        fontSize: 14,
        fontWeight: 700
      }}>{t("pos.order_summary")}</h4>
        <div className="table-container" style={{
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--color-border-light)",
        marginBottom: 12
      }}>
          <table className="data-table">
            <thead><tr><th>{t("pos.item")}</th><th style={{
                textAlign: "center"
              }}>{t("pos.qty")}</th><th style={{
                textAlign: "right"
              }}>{t("pos.price")}</th></tr></thead>
            <tbody>
              {(order.line_items || order.items || []).map((li, idx) => <tr key={`${li.menu_item_id || li.id || li.item_name}-${li.modifiers_label || "none"}-${idx}`}>
                  <td>{li.item_name || li.name}</td>
                  <td style={{
                textAlign: "center"
              }}>{li.quantity}</td>
                  <td style={{
                textAlign: "right"
              }}>{t("pos.rm")}{Number(li.unit_price || li.price || 0).toFixed(2)}</td>
                </tr>)}
            </tbody>
          </table>
        </div>
        <div style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: 14,
        marginBottom: 4
      }}>
          <span>{t("pos.subtotal")}</span><span>{t("pos.rm_2")}{originalTotal.toFixed(2)}</span>
        </div>
        {voucherDisc > 0 && <div style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: 14,
        color: "var(--color-success)",
        marginBottom: 4
      }}>
            <span>{t("pos.voucher_discount")}</span><span>{t("pos.rm_3")}{voucherDisc.toFixed(2)}</span>
          </div>}
        {rewardDisc > 0 && <div style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: 14,
        color: "var(--color-success)",
        marginBottom: 4
      }}>
            <span>{t("pos.reward_discount")}</span><span>{t("pos.rm_4")}{rewardDisc.toFixed(2)}</span>
          </div>}
        {manualDisc > 0 && <div style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: 14,
        color: "var(--color-success)",
        marginBottom: 4
      }}>
            <span>{t("pos.staff_discount")}</span><span>{t("pos.rm_5")}{manualDisc.toFixed(2)}</span>
          </div>}
        {walletPaid > 0 && <div style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: 14,
        color: "var(--color-info)",
        marginBottom: 4
      }}>
            <span>{t("pos.wallet_payment")}</span><span>{t("pos.rm_6")}{walletPaid.toFixed(2)}</span>
          </div>}
        <div style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: 20,
        fontWeight: 700,
        marginTop: 8,
        paddingTop: 8,
        borderTop: "1px solid var(--color-border-light)"
      }}>
          <span>{t("pos.total_due")}</span><span>{t("pos.rm_7")}{checkoutTotal.toFixed(2)}</span>
        </div>
      </div>

      {customer && walletData && <button className="btn btn-outline w-full" style={{
      marginBottom: 16
    }} onClick={() => onSetShowDiscounts(true)} aria-expanded={showDiscounts} aria-haspopup="true">
          <Gift size={16} />{t("pos.apply_discounts_wallet")}</button>}

      {/* Manual Discount */}
      <div className="card" style={{
      marginBottom: 16
    }}>
        <h4 style={{
        margin: "0 0 12px",
        fontSize: 14,
        fontWeight: 700
      }}>{t("pos.staff_discount_2")}</h4>
        <div style={{
        display: "flex",
        gap: 8,
        marginBottom: 12
      }}>
          {(["percentage", "fixed"] as const).map(t => <button key={t} className={`btn btn-sm ${discountType === t ? "btn-primary" : "btn-ghost"}`} onClick={() => onSetDiscountType(t)}>
              {t === "percentage" ? "%" : "RM"}
            </button>)}
        </div>
        <div style={{
        display: "flex",
        gap: 8,
        flexWrap: "wrap"
      }}>
          {discountPresets.map(v => <button key={v} className={`btn btn-sm ${discountAmount === v ? "btn-primary" : "btn-ghost"}`} onClick={() => onSetDiscountAmount(v)}>
              {discountType === "percentage" ? `${v}%` : `RM ${v}`}
            </button>)}
          <button className={`btn btn-sm ${discountAmount === 0 ? "btn-primary" : "btn-ghost"}`} onClick={() => onSetDiscountAmount(0)}>{t("pos.none")}</button>
        </div>
      </div>

      {/* Tip */}
      <div className="card" style={{
      marginBottom: 16
    }}>
        <h4 style={{
        margin: "0 0 8px",
        fontSize: 14,
        fontWeight: 700
      }}>{t("pos.tip")}</h4>
        <div style={{
        display: "flex",
        gap: 6,
        flexWrap: "wrap",
        marginBottom: 8
      }}>
          {[0, 5, 10, 15, 20].map(pct => {
          const tip = Math.round(preTipDue * pct / 100 * 100) / 100;
          return <button key={pct} className={`btn btn-sm ${tipAmount === tip ? "btn-primary" : "btn-ghost"}`} onClick={() => onSetTipAmount(tip)}>
                {pct === 0 ? "None" : `${pct}% (RM ${tip.toFixed(0)})`}
              </button>;
        })}
        </div>
        <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8
      }}>
          <span style={{
          fontSize: 13,
          fontWeight: 600
        }}>{t("pos.rm_8")}</span>
          <input type="number" min={0} step={0.5} value={tipAmount === 0 ? "" : tipAmount} onChange={e => {
          const v = parseFloat(e.target.value);
          onSetTipAmount(isNaN(v) ? 0 : Math.max(0, v));
        }} placeholder={t("pos.custom")} className="form-input" style={{
          width: 100
        }} />
        </div>
      </div>

      {/* Payment */}
      <div className="card" style={{
      marginBottom: 16
    }}>
        <h4 style={{
        margin: "0 0 12px",
        fontSize: 14,
        fontWeight: 700
      }}>{t("pos.payment")}</h4>
        <div style={{
        display: "flex",
        gap: 8,
        marginBottom: 16
      }}>
          {(["cash", "card", "stripe_qr"] as PaymentMethod[]).map(m => {
          const disabled = m === "stripe_qr" && stripeEnabled === false;
          return <button key={m} className={`btn flex-1 ${paymentMethod === m ? "btn-primary" : "btn-ghost"} ${disabled ? "btn-disabled" : ""}`} onClick={() => !disabled && onSetPaymentMethod(m)} disabled={disabled} title={disabled ? "Stripe is not configured" : undefined}>
                {m === "cash" ? <Banknote size={16} /> : m === "card" ? <CreditCard size={16} /> : <Smartphone size={16} />}
                {m === "stripe_qr" ? "QR" : m.toUpperCase()}
              </button>;
        })}
        </div>

        {paymentMethod === "cash" && <div>
            <div style={{
          fontSize: 32,
          fontWeight: 700,
          textAlign: "center",
          marginBottom: 12
        }}>{t("pos.rm_9")}{checkoutTotal.toFixed(2)}</div>
            <NumericKeypad value={amountTendered} onPress={key => onSetAmountTendered((prev: string) => prev + key)} onBackspace={() => onSetAmountTendered((prev: string) => prev.slice(0, -1))} onClear={() => onSetAmountTendered("")} />
            <div style={{
          display: "flex",
          gap: 6,
          marginTop: 12
        }}>
              {[checkoutTotal, Math.ceil(checkoutTotal / 5) * 5, Math.ceil(checkoutTotal / 10) * 10].filter((v, i, a) => a.indexOf(v) === i).map(v => <button key={v} className="btn btn-sm btn-ghost flex-1" onClick={() => onSetAmountTendered(String(v))}>{t("pos.rm_10")}{v.toFixed(0)}</button>)}
            </div>
            {amountTendered && !isNaN(parseFloat(amountTendered)) && parseFloat(amountTendered) >= checkoutTotal && <div style={{
          marginTop: 12,
          fontSize: 16,
          color: "var(--color-success)",
          fontWeight: 700,
          textAlign: "center"
        }}>{t("pos.change_rm")}{Math.max(0, parseFloat(amountTendered) - checkoutTotal).toFixed(2)}
              </div>}
          </div>}

        {paymentMethod === "card" && <div style={{
        textAlign: "center",
        padding: 24
      }}>
            <CreditCard size={48} style={{
          opacity: 0.3,
          marginBottom: 12
        }} />
            <p style={{
          fontSize: 16,
          fontWeight: 600
        }}>{t("pos.tap_swipe_insert_card")}</p>
            <p style={{
          fontSize: 13,
          color: "var(--color-text-muted)"
        }}>{t("pos.customer_pays_via_card_terminal")}</p>
          </div>}

        {paymentMethod === "stripe_qr" && <div style={{
        textAlign: "center",
        padding: 24
      }}>
            <Smartphone size={48} style={{
          opacity: 0.3,
          marginBottom: 12
        }} />
            <p style={{
          fontSize: 16,
          fontWeight: 600
        }}>{t("pos.stripe_qr_payment")}</p>
            <p style={{
          fontSize: 13,
          color: "var(--color-text-muted)"
        }}>{t("pos.confirm_to_generate_a_qr_code")}</p>
          </div>}
      </div>

      <button className="btn btn-primary btn-lg w-full" onClick={onCheckout} disabled={saving || paymentMethod === "cash" && checkoutTotal > 0 && (!amountTendered || isNaN(parseFloat(amountTendered)) || parseFloat(amountTendered) < checkoutTotal)}>
        {saving ? "Processing..." : checkoutTotal <= 0 ? "Complete Checkout" : `Confirm Payment — RM ${checkoutTotal.toFixed(2)}`}
      </button>

      {/* Checkout Discounts Drawer */}
      <Drawer open={showDiscounts} onClose={() => onSetShowDiscounts(false)} title={t("pos.apply_discounts_wallet_2")} position="bottom">
        {applyingDiscount && <div style={{
        padding: 20,
        textAlign: "center"
      }}>{t("pos.applying")}</div>}
        {walletData && <div style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        padding: "0 0 20px"
      }}>
            {walletData.balance > 0 && <div className="card" style={{
          background: "var(--color-bg-muted)"
        }}>
                <div style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8
          }}>
                  <span style={{
              fontWeight: 700
            }}>{t("pos.wallet_balance")}</span>
                  <span className="badge badge-primary">{t("pos.rm_11")}{Number(walletData.balance ?? 0).toFixed(2)}</span>
                </div>
                {checkoutTotal > 0 && walletData.balance > 0 && <button className="btn btn-primary w-full" onClick={() => onWalletPayment(Math.min(walletData.balance, checkoutTotal))}>{t("pos.pay_rm")}{Math.min(walletData.balance, checkoutTotal).toFixed(2)}{t("pos.from_wallet")}</button>}
              </div>}

            {walletData.vouchers && walletData.vouchers.length > 0 && <div>
                <h4 style={{
            fontSize: 14,
            fontWeight: 700,
            marginBottom: 8
          }}>{t("pos.vouchers")}</h4>
                <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 8
          }}>
                  {walletData.vouchers.map(v => <div key={v.id} className="card" style={{
              padding: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}>
                      <div>
                        <div style={{
                  fontWeight: 600,
                  fontSize: 14
                }}>{v.title || v.code}</div>
                        <div style={{
                  fontSize: 12,
                  color: "var(--color-text-muted)"
                }}>
                          {v.discount_type === "percent" ? `${v.discount_value}% off` : `RM ${v.discount_value} off`}
                          {v.min_spend ? ` · Min spend RM ${v.min_spend}` : ""}
                        </div>
                      </div>
                      <button className="btn btn-sm btn-primary" onClick={() => onApplyVoucher(v.code ?? "")}>{t("pos.apply")}</button>
                    </div>)}
                </div>
              </div>}

            {walletData.rewards && walletData.rewards.length > 0 && <div>
                <h4 style={{
            fontSize: 14,
            fontWeight: 700,
            marginBottom: 8
          }}>{t("pos.rewards")}</h4>
                <div style={{
            display: "flex",
            flexDirection: "column",
            gap: 8
          }}>
                  {walletData.rewards.map(r => <div key={r.id} className="card" style={{
              padding: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between"
            }}>
                      <div>
                        <div style={{
                  fontWeight: 600,
                  fontSize: 14
                }}>{r.name || r.redemption_code}</div>
                        <div style={{
                  fontSize: 12,
                  color: "var(--color-text-muted)"
                }}>{r.points_spent}{t("pos.pts_exp")}{r.expires_at?.slice(0, 10)}</div>
                      </div>
                      <button className="btn btn-sm btn-primary" onClick={() => onApplyReward(r.id)}>{t("pos.apply_2")}</button>
                    </div>)}
                </div>
              </div>}
          </div>}
      </Drawer>
    </div>;
}