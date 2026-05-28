"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save } from "lucide-react";
import { useAudienceSegments } from "@/lib/useAudienceSegments";

export default function VoucherNewPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [_displayPercent, setDisplayPercent] = useState("0");
  const { allSegments } = useAudienceSegments();

  const [form, setForm] = useState({
    voucher_code: "", display_title: "", voucher_type: "fixed_amount_off",
    discount_value: 0, valid_from: "", valid_until: "",
    max_global_uses: "" as string | number, minimum_order_value: 0,
    max_uses_per_customer: 1, short_description: "",
    long_description: "", how_to_redeem: "", terms_and_conditions: "",
    promo_type: "generic", validity_days: "", minimum_tier_id: null as number | null, is_active: true, customer_segments: [] as string[],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, unknown> = { ...form };
      // Convert string[] customer_segments to dict (API expects dict | None)
      const segs = form.customer_segments as string[];
      payload.customer_segments = segs && segs.length > 0
        ? Object.fromEntries(segs.map(s => [s, true]))
        : null;
      // Convert percentage to fraction if percentage_off
      if (form.voucher_type === "percentage_off") {
        payload.discount_value = Number(form.discount_value) / 100;
      } else {
        payload.discount_value = Number(form.discount_value);
      }
      if (!payload.max_global_uses) payload.max_global_uses = null;
      else payload.max_global_uses = Number(payload.max_global_uses);
      payload.validity_days = form.validity_days ? Number(form.validity_days) : null;
      payload.max_uses_per_customer = Number(form.max_uses_per_customer) || 1;
      payload.minimum_order_value = Number(form.minimum_order_value) || 0;
      await api.post("/admin/vouchers", payload);
      router.push("/vouchers");
    } catch (err: any) { setError(err.message); }
    finally { setSaving(false); }
  };

  const discountLabel = form.voucher_type === "percentage_off" ? "Discount %" : form.voucher_type === "free_item" ? "Max Value (RM)" : "Discount (RM)";
  const discountStep = form.voucher_type === "percentage_off" ? "1" : "0.01";

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.push("/vouchers")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>New Voucher</h1>
          <p className="page-subtitle" style={{ marginTop: 2 }}>Create a discount voucher for promotions</p>
        </div>
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="card" style={{ padding: 24, maxWidth: 700 }}>
        <form onSubmit={handleSubmit}>
          <div className="df-grid">
            <div className="df-field"><label className="df-label">Code *</label><input required value={form.voucher_code} onChange={e => setForm({ ...form, voucher_code: e.target.value })} /><div className="df-hint">Customer-facing code (e.g. WELCOME10)</div></div>
            <div className="df-field"><label className="df-label">Title *</label><input required value={form.display_title} onChange={e => setForm({ ...form, display_title: e.target.value })} /></div>
            <div className="df-field">
              <label className="df-label">Type</label>
              <select value={form.voucher_type} onChange={e => { setForm({ ...form, voucher_type: e.target.value, discount_value: 0 }); setDisplayPercent("0"); }}>
                <option value="percentage_off">Percentage Off (%)</option>
                <option value="fixed_amount_off">Fixed Amount (RM)</option>
                <option value="free_item">Free Item</option>
                <option value="free_delivery">Free Delivery</option>
              </select>
            </div>
            <div className="df-field">
              <label className="df-label">{discountLabel}</label>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="number" required step={discountStep} min="0" value={form.discount_value} onChange={e => setForm({ ...form, discount_value: Number(e.target.value) })} style={{ flex: 1 }} />
                {form.voucher_type === "percentage_off" && <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>%</span>}
              </div>
              {form.voucher_type === "percentage_off" && <div className="df-hint">Enter percentage like 50 for 50%</div>}
            </div>
            <div className="df-field"><label className="df-label">Min Order Value (RM)</label><input type="number" step="0.01" min="0" value={form.minimum_order_value} onChange={e => setForm({ ...form, minimum_order_value: Number(e.target.value) })} /></div>
            <div className="df-field"><label className="df-label">Max Uses Per Customer</label><input type="number" min="1" value={form.max_uses_per_customer} onChange={e => setForm({ ...form, max_uses_per_customer: Number(e.target.value) })} /></div>
            <div className="df-field"><label className="df-label">Max Global Uses</label><input type="number" min="1" value={form.max_global_uses} onChange={e => setForm({ ...form, max_global_uses: e.target.value })} /><div className="df-hint">Leave empty for unlimited</div></div>
            <div className="df-field"><label className="df-label">Validity (days)</label><input type="number" value={form.validity_days} onChange={e => setForm({ ...form, validity_days: e.target.value })} /></div>
            <div className="df-field">
              <label className="df-label">Loyalty Tier Required</label>
              <select value={form.minimum_tier_id ?? ""} onChange={e => setForm({ ...form, minimum_tier_id: e.target.value ? Number(e.target.value) : null })}>
                <option value="">No restriction</option>
                <option value="1">Silver</option>
                <option value="2">Gold</option>
                <option value="3">Platinum</option>
              </select>
              <div className="df-hint">Customer must be at least this tier to use</div>
            </div>
            <div className="df-field">
              <label className="df-label">Promo Type</label>
              <select value={form.promo_type} onChange={e => setForm({ ...form, promo_type: e.target.value })}>
                <option value="generic">Generic</option>
                <option value="bogo">BOGO (Buy One Get One)</option>
                <option value="happy_hour">Happy Hour</option>
                <option value="seasonal">Seasonal</option>
              </select>
            </div>
            <div className="df-field" style={{ gridColumn: "1/-1" }}>
              <label className="df-label">Target Customer Segments</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {allSegments.map(seg=>{
                  const isSelected = form.customer_segments?.includes(seg.value);
                  return <button type="button" key={seg.value} onClick={()=>{
                    const arr = form.customer_segments||[];
                    setForm({...form, customer_segments: isSelected ? arr.filter(x=>x!==seg.value) : [...arr, seg.value]});
                  }} style={{ display:"inline-flex",alignItems:"center",gap:4,padding:"4px 12px",borderRadius:"var(--radius-full)",fontSize:12,fontWeight:500,cursor:"pointer",border:isSelected?"2px solid var(--color-primary)":"1px solid var(--color-border-light)",background:isSelected?"rgba(59,74,26,0.08)":"var(--color-bg-white)",color:isSelected?"var(--color-primary)":"var(--color-text-muted)"}}>{isSelected&&"✓ "}{seg.label}</button>;
                })}
              </div>
              <div className="df-hint">Leave empty for all customers</div>
            </div>
            <div className="df-field"><label className="df-label">Valid From</label><input type="datetime-local" value={form.valid_from} onChange={e => setForm({ ...form, valid_from: e.target.value })} /></div>
            <div className="df-field"><label className="df-label">Valid Until</label><input type="datetime-local" value={form.valid_until} onChange={e => setForm({ ...form, valid_until: e.target.value })} /></div>
            <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="df-label">Short Description</label><input value={form.short_description} onChange={e => setForm({ ...form, short_description: e.target.value })} placeholder="Brief summary" /></div>
            <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="df-label">Full Description</label><textarea rows={3} value={form.long_description} onChange={e => setForm({ ...form, long_description: e.target.value })} placeholder="Full details" /></div>
            <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="df-label">How to Redeem</label><textarea rows={2} value={form.how_to_redeem} onChange={e => setForm({ ...form, how_to_redeem: e.target.value })} placeholder="Instructions for customer" /></div>
            <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="df-label">Terms & Conditions</label><textarea rows={2} value={form.terms_and_conditions} onChange={e => setForm({ ...form, terms_and_conditions: e.target.value })} placeholder="Legal terms" /></div>
            <div className="df-field"><label className="df-label" style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} /> Active</label></div>
          </div>
          <div className="df-actions" style={{ marginTop: 20 }}>
            <button type="button" onClick={() => router.push("/vouchers")} className="btn btn-ghost">Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}><Save size={16} /> {saving ? "Creating..." : "Create Voucher"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
