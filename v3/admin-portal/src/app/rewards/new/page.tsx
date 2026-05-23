"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Upload, Save } from "lucide-react";
import { useAudienceSegments } from "@/lib/useAudienceSegments";

export default function RewardNewPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [imagePreview, setImagePreview] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const { allSegments } = useAudienceSegments();

  const [form, setForm] = useState({
    reward_name: "", reward_key: "", image_url: "", points_cost: 0,
    reward_type: "free_item", description: "", short_description: "",
    long_description: "", how_to_redeem: "", terms_and_conditions: "",
    minimum_order_value: 0, validity_days: 30, position: 0, customer_segments: [] as string[], is_active: true,
  });

  const handleUpload = async () => {
    const f = fileRef.current?.files?.[0]; if (!f) return;
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", f);
      const j = await api.upload("/upload/image", fd);
      const url = j.url || j.filename || "";
      setForm({ ...form, image_url: url }); setImagePreview(url);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e: any) { setError(e.message); }
    finally { setUploading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const p = { ...form, reward_key: form.reward_key || form.reward_name.toLowerCase().replace(/[^a-z0-9]/g, "_") };
      await api.post("/admin/rewards", p);
      router.push("/rewards");
    } catch (e: any) { setError(e.message); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.push("/rewards")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>New Reward</h1>
          <p className="page-subtitle" style={{ marginTop: 2 }}>Create a loyalty point redemption reward</p>
        </div>
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="card" style={{ padding: 24, maxWidth: 700 }}>
        <form onSubmit={handleSubmit}>
          <div className="df-grid">
            <div className="df-field">
              <label className="df-label">Name *</label>
              <input required value={form.reward_name} onChange={e => setForm({ ...form, reward_name: e.target.value })} />
            </div>
            <div className="df-field">
              <label className="df-label">Identifier</label>
              <input value={form.reward_key} onChange={e => setForm({ ...form, reward_key: e.target.value })} placeholder="auto-generated" />
              <div className="df-hint">Auto-generated from name</div>
            </div>
            <div className="df-field">
              <label className="df-label">Points Cost *</label>
              <input type="number" required value={form.points_cost} onChange={e => setForm({ ...form, points_cost: Number(e.target.value) })} />
              <div className="df-hint">Loyalty points customer spends to redeem</div>
            </div>
            <div className="df-field">
              <label className="df-label">Type</label>
              <select value={form.reward_type} onChange={e => setForm({ ...form, reward_type: e.target.value })}>
                <option value="free_item">Free Item</option>
                <option value="percentage_discount">% Discount</option>
                <option value="fixed_discount">Fixed Discount</option>
                <option value="free_delivery">Free Delivery</option>
              </select>
            </div>
            <div className="df-field">
              <label className="df-label">Min Order Value (RM)</label>
              <input type="number" step="0.01" value={form.minimum_order_value} onChange={e => setForm({ ...form, minimum_order_value: Number(e.target.value) })} />
            </div>
            <div className="df-field">
              <label className="df-label">Validity (days)</label>
              <input type="number" value={form.validity_days} onChange={e => setForm({ ...form, validity_days: Number(e.target.value) })} />
            </div>
            <div className="df-field">
              <label className="df-label">Position</label>
              <input type="number" value={form.position} onChange={e => setForm({ ...form, position: Number(e.target.value) })} />
              <div className="df-hint">Sort order (lower = first)</div>
            </div>
            <div className="df-field" style={{ gridColumn: "1/-1" }}>
              <label className="df-label">Short Description</label>
              <input value={form.short_description} onChange={e => setForm({ ...form, short_description: e.target.value })} placeholder="Brief summary shown in list" />
            </div>
            <div className="df-field" style={{ gridColumn: "1/-1" }}>
              <label className="df-label">Full Description</label>
              <textarea rows={3} value={form.long_description} onChange={e => setForm({ ...form, long_description: e.target.value })} placeholder="Full detail description" />
            </div>
            <div className="df-field" style={{ gridColumn: "1/-1" }}>
              <label className="df-label">How to Redeem</label>
              <textarea rows={2} value={form.how_to_redeem} onChange={e => setForm({ ...form, how_to_redeem: e.target.value })} placeholder="Instructions for the customer" />
            </div>
            <div className="df-field" style={{ gridColumn: "1/-1" }}>
              <label className="df-label">Terms & Conditions</label>
              <textarea rows={2} value={form.terms_and_conditions} onChange={e => setForm({ ...form, terms_and_conditions: e.target.value })} placeholder="Legal terms" />
            </div>
            <div className="df-field" style={{ gridColumn: "1/-1" }}>
              <label className="df-label">Image</label>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} style={{ display: "none" }} />
                <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-sm btn-outline" disabled={uploading}>
                  <Upload size={14} /> {uploading ? "Uploading..." : "Upload Image"}
                </button>
                {imagePreview && (
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <img src={imagePreview} alt="" style={{ width: 48, height: 48, borderRadius: 6, objectFit: "cover" }} />
                    <button type="button" onClick={() => { setForm({ ...form, image_url: "" }); setImagePreview(""); }} className="btn btn-ghost btn-sm" style={{ color: "var(--color-error)" }}>Clear</button>
                  </div>
                )}
              </div>
              <div className="df-hint">Recommended: square image, 400×400px</div>
            </div>
            <div className="df-field" style={{ gridColumn: "1/-1" }}>
              <label className="df-label">Target Customer Segments</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {allSegments.map(seg => { const isSel = (form.customer_segments||[]).includes(seg.value); return <button type="button" key={seg.value} onClick={()=>{ const arr = form.customer_segments||[]; setForm({...form, customer_segments: isSel ? arr.filter((x:string)=>x!==seg.value) : [...arr, seg.value]}); }} style={{ display:"inline-flex",alignItems:"center",gap:4,padding:"4px 12px",borderRadius:"var(--radius-full)",fontSize:12,fontWeight:500,cursor:"pointer",border:isSel?"2px solid var(--color-primary)":"1px solid var(--color-border-light)",background:isSel?"rgba(59,74,26,0.08)":"var(--color-bg-white)",color:isSel?"var(--color-primary)":"var(--color-text-muted)"}}>{isSel&&"✓ "}{seg.label}</button>; })}
              </div>
              <div className="df-hint">Leave empty for all customers</div>
            </div>
            <div className="df-field">
              <label className="df-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} /> Active
              </label>
            </div>
          </div>
          <div className="df-actions" style={{ marginTop: 20 }}>
            <button type="button" onClick={() => router.push("/rewards")} className="btn btn-ghost">Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}><Save size={16} /> {saving ? "Creating..." : "Create Reward"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
