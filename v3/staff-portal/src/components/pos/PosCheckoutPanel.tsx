"use client";

import { useTranslation } from "@/hooks/useTranslation";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import PageHeader from "@/components/PageHeader";
import Alert from "@/components/Alert";
import Drawer from "@/components/Drawer";
import NumericKeypad from "@/components/NumericKeypad";
import PosSplitBillSection from "./PosSplitBillSection";
import { X, QrCode, User, Gift, CreditCard, Banknote, Smartphone, UtensilsCrossed, RotateCcw } from "lucide-react";
import { api, refundOrder, type Customer, type CustomerWallet } from "@/lib/api";
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
  payment_status?: string;
  total_amount?: number;
  total?: number;
  voucher_discount?: number;
  reward_discount?: number;
  line_items?: PosCheckoutLineItem[];
  items?: PosCheckoutLineItem[];
  items_subtotal?: number;
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
  /** menu_item_id → image_url, for checkout line-item thumbnails */
  itemImages?: Record<number, string | undefined>;
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
  onCheckout: (split?: import("./PosSplitBillSection").SplitSelection) => void;
  stripeEnabled?: boolean | null;
  /** Offline mode: cash only — QR / card terminals need connectivity. */
  offline?: boolean;
  /** Reports split-bill progress for the customer display (null on unmount). */
  onSplitDisplayChange?: (info: { paid: number; total: number; charging: number | null } | null) => void;
}
export default function PosCheckoutPanel({
  order,
  orderId,
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
  itemImages = {},
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
  stripeEnabled,
  offline = false,
  onSplitDisplayChange
}: PosCheckoutPanelProps) {
  const {
    t
  } = useTranslation();
  const voucherDisc = Number(order.voucher_discount ?? 0);
  const rewardDisc = Number(order.reward_discount ?? 0);
  const originalTotal = order.total_amount || order.total || 0;
  const orderBase = order.total_amount || order.total || 0;
  // Backend applies percentage discounts to items_subtotal.
  const discountBase = order.items_subtotal || orderBase;
  const manualDisc = discountType === "percentage" ? discountBase * (discountAmount / 100) : discountAmount;
  const walletPaid = discountsApplied.wallet || 0;
  const preTipDue = Math.max(0, orderBase - manualDisc - walletPaid);
  const checkoutTotal = Math.max(0, preTipDue + tipAmount);
  const discountPresets = discountType === "percentage" ? [5, 10, 15, 20] : [5, 10, 20, 50];
  // Staff meal — one-tap discount configured by the boss (staffmeal.* platform config)
  const [staffMealLoading, setStaffMealLoading] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundSaving, setRefundSaving] = useState(false);
  const refundable = (order.payment_status === "captured" || order.payment_status === "partially_refunded") && !!orderId;
  const applyStaffMeal = async () => {
    setStaffMealLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cfg = await api.getRaw<any>("/staff/config/staff-meal");
      const v = Number(cfg?.discount_value || 0);
      if (!v || v <= 0) {
        onSetError(t("pos.staff_meal_unavailable"));
        return;
      }
      onSetDiscountType(cfg?.discount_type === "fixed" ? "fixed" : "percentage");
      onSetDiscountAmount(v);
      onSetMsg(t("pos.staff_meal_applied"));
    } catch {
      onSetError(t("pos.staff_meal_unavailable"));
    } finally {
      setStaffMealLoading(false);
    }
  };
  // Split bill — when active, the payment covers only the selected share
  const [split, setSplit] = useState<import("./PosSplitBillSection").SplitSelection>({ mode: "full", allocations: [], chargeAmount: null, shareTotal: checkoutTotal });
  const splitActive = split.mode !== "full";
  // Echo split progress to the customer display (paid/total + current share)
  const [splitProgress, setSplitProgress] = useState<{ paid: number; total: number } | null>(null);
  // Remaining due nets out earlier split shares — a partially paid order must
  // not present (or charge) the full total again.
  const paidSoFar = splitProgress?.paid ?? 0;
  const remainingDue = Math.max(0, checkoutTotal - paidSoFar);
  const activeTotal = splitActive ? split.shareTotal : remainingDue;
  useEffect(() => {
    if (!onSplitDisplayChange) return;
    onSplitDisplayChange(splitProgress ? { ...splitProgress, charging: splitActive ? split.shareTotal : null } : null);
  }, [splitProgress, splitActive, split.shareTotal, onSplitDisplayChange]);
  useEffect(() => () => onSplitDisplayChange?.(null), [onSplitDisplayChange]);
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
            {refundable && <button className="btn btn-ghost btn-sm" style={{ color: "var(--color-error)" }} onClick={() => {
            setRefundOpen(true);
            setRefundAmount(String(order.total_amount ?? ""));
            setRefundReason("");
          }}>
              <RotateCcw size={14} />{t("pos.refund")}</button>}
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
                  <td><div style={{
                display: "flex",
                alignItems: "center",
                gap: 8
              }}>
                      {li.menu_item_id && itemImages[Number(li.menu_item_id)] ?
                /* plain img: /uploads paths are served by the backend, not next/image */
                <img src={itemImages[Number(li.menu_item_id)]} alt="" style={{
                  width: 36,
                  height: 36,
                  borderRadius: 8,
                  objectFit: "cover",
                  flexShrink: 0
                }} /> : null}
                      <span>{li.item_name || li.name}{li.modifiers_label ? <span style={{
                  fontSize: 12,
                  color: "var(--color-text-muted)",
                  display: "block"
                }}>{li.modifiers_label}</span> : null}</span>
                    </div></td>
                  <td style={{
                textAlign: "center"
              }}>{li.quantity}</td>
                  <td style={{
                textAlign: "right"
              }}>{t("pos.currency_symbol")}{Number(li.unit_price || li.price || 0).toFixed(2)}</td>
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
          <span>{t("pos.subtotal")}</span><span>{t("pos.currency_symbol")}{originalTotal.toFixed(2)}</span>
        </div>
        {voucherDisc > 0 && <div style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: 14,
        color: "var(--color-success)",
        marginBottom: 4
      }}>
            <span>{t("pos.voucher_discount")}</span><span>{t("pos.currency_symbol")}{voucherDisc.toFixed(2)}</span>
          </div>}
        {rewardDisc > 0 && <div style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: 14,
        color: "var(--color-success)",
        marginBottom: 4
      }}>
            <span>{t("pos.reward_discount")}</span><span>{t("pos.currency_symbol")}{rewardDisc.toFixed(2)}</span>
          </div>}
        {manualDisc > 0 && <div style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: 14,
        color: "var(--color-success)",
        marginBottom: 4
      }}>
            <span>{t("pos.staff_discount")}</span><span>{t("pos.currency_symbol")}{manualDisc.toFixed(2)}</span>
          </div>}
        {walletPaid > 0 && <div style={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: 14,
        color: "var(--color-info)",
        marginBottom: 4
      }}>
            <span>{t("pos.wallet_payment")}</span><span>{t("pos.currency_symbol")}{walletPaid.toFixed(2)}</span>
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
          <span>{t("pos.total_due")}</span><span>{t("pos.currency_symbol")}{remainingDue.toFixed(2)}</span>
        </div>
      </div>

      {orderId && <PosSplitBillSection
        orderId={orderId}
        currencySymbol={t("pos.currency_symbol")}
        refreshKey={String((order as any).updated_at ?? "")}
        onSplitChange={setSplit}
        onSplitStateChange={setSplitProgress}
      />}

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
          {(["percentage", "fixed"] as const).map(ty => <button key={ty} className={`btn btn-sm ${discountType === ty ? "btn-primary" : "btn-ghost"}`} onClick={() => onSetDiscountType(ty)}>
              {ty === "percentage" ? "%" : t("pos.currency_symbol")}
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
        <button className="btn btn-outline btn-sm" disabled={staffMealLoading} style={{
        marginTop: 10,
        display: "flex",
        alignItems: "center",
        gap: 6
      }} onClick={applyStaffMeal}>
          <UtensilsCrossed size={14} />{staffMealLoading ? "..." : t("pos.staff_meal")}
        </button>
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
                {pct === 0 ? t("pos.none") : `${pct}% (RM ${tip.toFixed(0)})`}
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
        }}>{t("pos.currency_symbol")}</span>
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
          {(["cash", "card", "stripe_qr"] as PaymentMethod[]).filter(m => !offline || m === "cash").map(m => {
          const disabled = m === "stripe_qr" && stripeEnabled === false;
          return <button key={m} className={`btn flex-1 ${paymentMethod === m ? "btn-primary" : "btn-ghost"} ${disabled ? "btn-disabled" : ""}`} onClick={() => !disabled && onSetPaymentMethod(m)} disabled={disabled} title={disabled ? t("pos.stripe_not_configured") : undefined}>
                {m === "cash" ? <Banknote size={16} /> : m === "card" ? <CreditCard size={16} /> : <Smartphone size={16} />}
                {m === "stripe_qr" ? "QR" : t(`pos.${m}_label`)}
              </button>;
        })}
        </div>
        {offline && <p style={{
        fontSize: 12,
        color: "var(--color-warning, #8A7030)",
        marginTop: -8,
        marginBottom: 12
      }}>{t("pos.offline_cash_only")}</p>}

        {paymentMethod === "cash" && <div>
            <div style={{
          fontSize: 32,
          fontWeight: 700,
          textAlign: "center",
          marginBottom: 12
        }}>{t("pos.currency_symbol")}{activeTotal.toFixed(2)}{splitActive && <span style={{ fontSize: 14, fontWeight: 400, color: "var(--color-text-muted)" }}> {t("pos.split_share_of_total", { total: `${t("pos.currency_symbol")}${checkoutTotal.toFixed(2)}` })}</span>}</div>
            <NumericKeypad value={amountTendered} onPress={key => onSetAmountTendered((prev: string) => prev + key)} onBackspace={() => onSetAmountTendered((prev: string) => prev.slice(0, -1))} onClear={() => onSetAmountTendered("")} />
            <div style={{
          display: "flex",
          gap: 6,
          marginTop: 12
        }}>
              {[activeTotal, Math.ceil(activeTotal / 5) * 5, Math.ceil(activeTotal / 10) * 10].filter((v, i, a) => a.indexOf(v) === i).map(v => <button key={v} className="btn btn-sm btn-ghost flex-1" onClick={() => onSetAmountTendered(String(v))}>{t("pos.currency_symbol")}{v.toFixed(0)}</button>)}
            </div>
            {amountTendered && !isNaN(parseFloat(amountTendered)) && parseFloat(amountTendered) >= activeTotal && <div style={{
          marginTop: 12,
          fontSize: 16,
          color: "var(--color-success)",
          fontWeight: 700,
          textAlign: "center"
        }}>{t("pos.change_rm")}{Math.max(0, parseFloat(amountTendered) - activeTotal).toFixed(2)}
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

      <button className="btn btn-primary btn-lg w-full" onClick={() => onCheckout(split)} disabled={saving || (splitActive && split.shareTotal <= 0) || paymentMethod === "cash" && activeTotal > 0 && (!amountTendered || isNaN(parseFloat(amountTendered)) || parseFloat(amountTendered) < activeTotal)}>
        {saving ? t("pos.processing") : activeTotal <= 0 ? t("pos.complete_checkout") : splitActive ? `${t("pos.pay_share_rm")}${activeTotal.toFixed(2)}` : `${t("pos.confirm_payment_rm")}${activeTotal.toFixed(2)}`}
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
                  <span className="badge badge-primary">{t("pos.currency_symbol")}{Number(walletData.balance ?? 0).toFixed(2)}</span>
                </div>
                {remainingDue > 0 && walletData.balance > 0 && <button className="btn btn-primary w-full" onClick={() => onWalletPayment(Math.min(walletData.balance, remainingDue))}>{t("pos.pay_rm")}{Math.min(walletData.balance, remainingDue).toFixed(2)}{t("pos.from_wallet")}</button>}
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
                }}>{v.title || v.code || t("common.voucher")}</div>
                        <div style={{
                  fontSize: 12,
                  color: "var(--color-text-muted)"
                }}>
                          {v.discount_type === "percent" ? t("pos.discount_percent_off", { value: v.discount_value ?? 0 }) : t("pos.discount_amount_off", { value: v.discount_value ?? 0 })}
                          {v.min_spend ? ` \u00b7 ${t("pos.min_spend", { value: v.min_spend })}` : ""}
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
                }}>{r.name || r.redemption_code || t("common.reward")}</div>
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
      {refundOpen && (
        <div style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 120
      }} onClick={() => setRefundOpen(false)}>
          <div style={{
          background: "var(--color-bg-white, #fff)", borderRadius: 12, padding: 20,
          width: "min(92vw, 400px)"
        }} onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold mb-2">{t("pos.refund")} — {order.order_number}</h3>
            <label className="block text-sm mb-1">{t("pos.refund_amount")}</label>
            <input type="number" min="0.01" step="0.01" value={refundAmount} onChange={e => setRefundAmount(e.target.value)} style={{
            width: "100%", padding: "10px 12px", borderRadius: 8,
            border: "1px solid var(--color-border, #d1d5db)", marginBottom: 10
          }} />
            <label className="block text-sm mb-1">{t("pos.refund_reason")}</label>
            <input value={refundReason} onChange={e => setRefundReason(e.target.value)} placeholder={t("pos.refund_reason_placeholder")} maxLength={300} style={{
            width: "100%", padding: "10px 12px", borderRadius: 8,
            border: "1px solid var(--color-border, #d1d5db)", marginBottom: 14
          }} />
            <div className="flex gap-2 justify-end">
              <button className="btn btn-ghost" onClick={() => setRefundOpen(false)}>{t("common.cancel")}</button>
              <button className="btn btn-primary" disabled={refundSaving || !refundAmount || parseFloat(refundAmount) <= 0 || refundReason.trim().length < 3} onClick={async () => {
            setRefundSaving(true);
            try {
              const res = await refundOrder(orderId!, parseFloat(refundAmount), refundReason.trim(), "customer_request");
              onSetMsg(res.status === "completed" ? t("pos.refund_done") : t("pos.refund_pending"));
              setRefundOpen(false);
              onSetError("");
            } catch (e: unknown) {
              onSetError((e as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t("pos.refund_failed"));
            } finally {
              setRefundSaving(false);
            }
          }}>{refundSaving ? t("common.saving") : t("pos.refund_confirm")}</button>
            </div>
          </div>
        </div>
      )}
    </div>;
}