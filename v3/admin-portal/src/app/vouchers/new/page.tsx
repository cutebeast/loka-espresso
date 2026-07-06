"use client";

import { useTranslation } from "@/lib/i18n";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save } from "lucide-react";
import { useAudienceSegments } from "@/lib/useAudienceSegments";
import { useCurrency } from "@/hooks/useCurrency";
export default function VoucherNewPage() {
  const {
    t
  } = useTranslation();
  const router = useRouter();
  const {
    symbol
  } = useCurrency();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [_displayPercent, setDisplayPercent] = useState("0");
  const {
    allSegments
  } = useAudienceSegments();
  const [form, setForm] = useState({
    voucher_code: "",
    display_title: "",
    voucher_type: "fixed_amount_off",
    discount_value: 0,
    valid_from: "",
    valid_until: "",
    max_global_uses: "" as string | number,
    minimum_order_value: 0,
    max_uses_per_customer: 1,
    short_description: "",
    long_description: "",
    how_to_redeem: "",
    terms_and_conditions: "",
    promo_type: "generic",
    validity_days: "",
    minimum_tier_id: null as number | null,
    is_active: true,
    customer_segments: [] as string[]
  });
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        ...form
      };
      // Convert string[] customer_segments to dict (API expects dict | None)
      const segs = form.customer_segments as string[];
      payload.customer_segments = segs && segs.length > 0 ? Object.fromEntries(segs.map(s => [s, true])) : null;
      // Discount value stored as-is (percentage: 50 means 50%, backend divides by 100)
      payload.discount_value = Number(form.discount_value);
      if (!payload.max_global_uses) payload.max_global_uses = null;else payload.max_global_uses = Number(payload.max_global_uses);
      payload.validity_days = form.validity_days ? Number(form.validity_days) : null;
      payload.max_uses_per_customer = Number(form.max_uses_per_customer) || 1;
      payload.minimum_order_value = Number(form.minimum_order_value) || 0;
      await api.post("/admin/vouchers", payload);
      router.push("/vouchers");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };
  const discountLabel = form.voucher_type === "percentage_off" ? "Discount %" : form.voucher_type === "free_item" ? `Max Value (${symbol})` : `Discount (${symbol})`;
  const discountStep = form.voucher_type === "percentage_off" ? "1" : "0.01";
  return <div style={{
    padding: 32
  }}>
      <div style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: 20
    }}>
        <button onClick={() => router.push("/vouchers")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button>
        <div>
          <h1 className="page-title" style={{
          margin: 0
        }}>{t("vouchers_new.new_voucher")}</h1>
          <p className="page-subtitle" style={{
          marginTop: 2
        }}>{t("vouchers_new.create_a_discount_voucher_for_promotions")}</p>
        </div>
      </div>
      {error && <div className="alert alert-error" style={{
      marginBottom: 16
    }}>{error}</div>}

      <div className="card" style={{
      padding: 24,
      maxWidth: 700
    }}>
        <form onSubmit={handleSubmit}>
          <div className="df-grid">
            <div className="df-field"><label className="df-label">{t("vouchers_new.code")}</label><input required value={form.voucher_code} onChange={e => setForm({
              ...form,
              voucher_code: e.target.value
            })} /><div className="df-hint">{t("vouchers_new.customer_facing_code_e_g_welcome10")}</div></div>
            <div className="df-field"><label className="df-label">{t("vouchers_new.title")}</label><input required value={form.display_title} onChange={e => setForm({
              ...form,
              display_title: e.target.value
            })} /></div>
            <div className="df-field">
              <label className="df-label">{t("vouchers_new.type")}</label>
              <select value={form.voucher_type} onChange={e => {
              setForm({
                ...form,
                voucher_type: e.target.value,
                discount_value: 0
              });
              setDisplayPercent("0");
            }}>
                <option value="percentage_off">{t("vouchers_new.percentage_off")}</option>
                <option value="fixed_amount_off">{`Fixed Amount (${symbol})`}</option>
                <option value="free_item">{t("vouchers_new.free_item")}</option>
                <option value="free_delivery">{t("vouchers_new.free_delivery")}</option>
              </select>
            </div>
            <div className="df-field">
              <label className="df-label">{discountLabel}</label>
              <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8
            }}>
                <input type="number" required step={discountStep} min="0" value={form.discount_value} onChange={e => setForm({
                ...form,
                discount_value: Number(e.target.value)
              })} style={{
                flex: 1
              }} />
                {form.voucher_type === "percentage_off" && <span style={{
                fontSize: 13,
                color: "var(--color-text-muted)"
              }}>%</span>}
              </div>
              {form.voucher_type === "percentage_off" && <div className="df-hint">{t("vouchers_new.enter_percentage_like_50_for_50")}</div>}
            </div>
            <div className="df-field"><label className="df-label">{`Min Order Value (${symbol})`}</label><input type="number" step="0.01" min="0" value={form.minimum_order_value} onChange={e => setForm({
              ...form,
              minimum_order_value: Number(e.target.value)
            })} /></div>
            <div className="df-field"><label className="df-label">{t("vouchers_new.max_uses_per_customer")}</label><input type="number" min="1" value={form.max_uses_per_customer} onChange={e => setForm({
              ...form,
              max_uses_per_customer: Number(e.target.value)
            })} /></div>
            <div className="df-field"><label className="df-label">{t("vouchers_new.max_global_uses")}</label><input type="number" min="1" value={form.max_global_uses} onChange={e => setForm({
              ...form,
              max_global_uses: e.target.value
            })} /><div className="df-hint">{t("vouchers_new.leave_empty_for_unlimited")}</div></div>
            <div className="df-field"><label className="df-label">{t("vouchers_new.validity_days")}</label><input type="number" value={form.validity_days} onChange={e => setForm({
              ...form,
              validity_days: e.target.value
            })} /></div>
            <div className="df-field">
              <label className="df-label">{t("vouchers_new.loyalty_tier_required")}</label>
              <select value={form.minimum_tier_id ?? ""} onChange={e => setForm({
              ...form,
              minimum_tier_id: e.target.value ? Number(e.target.value) : null
            })}>
                <option value="">{t("vouchers_new.no_restriction")}</option>
                <option value="1">{t("vouchers_new.silver")}</option>
                <option value="2">{t("vouchers_new.gold")}</option>
                <option value="3">{t("vouchers_new.platinum")}</option>
              </select>
              <div className="df-hint">{t("vouchers_new.customer_must_be_at_least_this")}</div>
            </div>
            <div className="df-field">
              <label className="df-label">{t("vouchers_new.promo_type")}</label>
              <select value={form.promo_type} onChange={e => setForm({
              ...form,
              promo_type: e.target.value
            })}>
                <option value="generic">{t("vouchers_new.generic")}</option>
                <option value="bogo">{t("vouchers_new.bogo_buy_one_get_one")}</option>
                <option value="happy_hour">{t("vouchers_new.happy_hour")}</option>
                <option value="seasonal">{t("vouchers_new.seasonal")}</option>
              </select>
            </div>
            <div className="df-field" style={{
            gridColumn: "1/-1"
          }}>
              <label className="df-label">{t("vouchers_new.target_customer_segments")}</label>
              <div style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6
            }}>
                {allSegments.map(seg => {
                const isSelected = form.customer_segments?.includes(seg.value);
                return <button type="button" key={seg.value} onClick={() => {
                  const arr = form.customer_segments || [];
                  setForm({
                    ...form,
                    customer_segments: isSelected ? arr.filter(x => x !== seg.value) : [...arr, seg.value]
                  });
                }} style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 12px",
                  borderRadius: "var(--radius-full)",
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: "pointer",
                  border: isSelected ? "2px solid var(--color-primary)" : "1px solid var(--color-border-light)",
                  background: isSelected ? "rgba(59,74,26,0.08)" : "var(--color-bg-white)",
                  color: isSelected ? "var(--color-primary)" : "var(--color-text-muted)"
                }}>{isSelected && "✓ "}{seg.label}</button>;
              })}
              </div>
              <div className="df-hint">{t("vouchers_new.leave_empty_for_all_customers")}</div>
            </div>
            <div className="df-field"><label className="df-label">{t("vouchers_new.valid_from")}</label><input type="datetime-local" value={form.valid_from} onChange={e => setForm({
              ...form,
              valid_from: e.target.value
            })} /></div>
            <div className="df-field"><label className="df-label">{t("vouchers_new.valid_until")}</label><input type="datetime-local" value={form.valid_until} onChange={e => setForm({
              ...form,
              valid_until: e.target.value
            })} /></div>
            <div className="df-field" style={{
            gridColumn: "1/-1"
          }}><label className="df-label">{t("vouchers_new.short_description")}</label><input value={form.short_description} onChange={e => setForm({
              ...form,
              short_description: e.target.value
            })} placeholder={t("vouchers_new.brief_summary")} /></div>
            <div className="df-field" style={{
            gridColumn: "1/-1"
          }}><label className="df-label">{t("vouchers_new.full_description")}</label><textarea rows={3} value={form.long_description} onChange={e => setForm({
              ...form,
              long_description: e.target.value
            })} placeholder={t("vouchers_new.full_details")} /></div>
            <div className="df-field" style={{
            gridColumn: "1/-1"
          }}><label className="df-label">{t("vouchers_new.how_to_redeem")}</label><textarea rows={2} value={form.how_to_redeem} onChange={e => setForm({
              ...form,
              how_to_redeem: e.target.value
            })} placeholder={t("vouchers_new.instructions_for_customer")} /></div>
            <div className="df-field" style={{
            gridColumn: "1/-1"
          }}><label className="df-label">{t("vouchers_new.terms_conditions")}</label><textarea rows={2} value={form.terms_and_conditions} onChange={e => setForm({
              ...form,
              terms_and_conditions: e.target.value
            })} placeholder={t("vouchers_new.legal_terms")} /></div>
            <div className="df-field"><label className="df-label" style={{
              display: "flex",
              alignItems: "center",
              gap: 8
            }}><input type="checkbox" checked={form.is_active} onChange={e => setForm({
                ...form,
                is_active: e.target.checked
              })} />{t("vouchers_new.active")}</label></div>
          </div>
          <div className="df-actions" style={{
          marginTop: 20
        }}>
            <button type="button" onClick={() => router.push("/vouchers")} className="btn btn-ghost">{t("vouchers_new.cancel")}</button>
            <button type="submit" className="btn btn-primary" disabled={saving}><Save size={16} /> {saving ? "Creating..." : "Create Voucher"}</button>
          </div>
        </form>
      </div>
    </div>;
}