"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, createMarketingCampaign } from "@/lib/api";
import { ArrowLeft, Save } from "lucide-react";
import { useAudienceSegments } from "@/lib/useAudienceSegments";

export default function CampaignNewPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { allSegments } = useAudienceSegments();
  const [form, setForm] = useState({ campaign_name: "", campaign_key: "", campaign_type: "promotional", channel: "push_notification", status: "draft", audience_segment: "", body_content: "", scheduled_at: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try { await createMarketingCampaign(form); router.push("/marketing/campaigns"); } catch (err: any) { setError(err.message); } finally { setSaving(false); }
  };

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.push("/marketing/campaigns")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button>
        <div><h1 className="page-title" style={{ margin: 0 }}>New Campaign</h1><p className="page-subtitle" style={{ marginTop: 2 }}>Create a multi-channel marketing campaign</p></div>
      </div>
      {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="card" style={{ padding: 24, maxWidth: 700 }}>
        <form onSubmit={handleSubmit}>
          <div className="df-grid">
            <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="df-label">Campaign Name *</label><input required value={form.campaign_name} onChange={e => setForm({ ...form, campaign_name: e.target.value })} /></div>
            <div className="df-field"><label className="df-label">Channel</label><select value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })}><option value="push_notification">Push Notification</option><option value="email">Email (Resend)</option><option value="sms">SMS (Twilio)</option><option value="whatsapp">WhatsApp (Twilio)</option><option value="in_app">In-App</option></select></div>
            <div className="df-field"><label className="df-label">Status</label><select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}><option value="draft">Draft</option><option value="scheduled">Scheduled</option><option value="active">Active</option></select></div>
            <div className="df-field"><label className="df-label">Campaign Type</label><select value={form.campaign_type} onChange={e => setForm({ ...form, campaign_type: e.target.value })}><option value="promotional">Promotional</option><option value="transactional">Transactional</option><option value="announcement">Announcement</option><option value="retention">Retention</option></select></div>
            <div className="df-field"><label className="df-label">Scheduled At</label><input type="datetime-local" value={form.scheduled_at} onChange={e => setForm({ ...form, scheduled_at: e.target.value })} /><div className="df-hint">Leave empty for immediate send</div></div>
            <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="df-label">Audience Segment</label><select value={form.audience_segment} onChange={e => setForm({ ...form, audience_segment: e.target.value })}>{allSegments.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select><div className="df-hint">Target audience for campaign delivery</div></div>
            <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="df-label">Content</label><textarea rows={5} value={form.body_content} onChange={e => setForm({ ...form, body_content: e.target.value })} placeholder="Campaign message content..." /></div>
          </div>
          <div className="df-actions" style={{ marginTop: 20 }}><button type="button" onClick={() => router.push("/marketing/campaigns")} className="btn btn-ghost">Cancel</button><button type="submit" className="btn btn-primary" disabled={saving}><Save size={16} /> {saving ? "Creating..." : "Create Campaign"}</button></div>
        </form>
      </div>
    </div>
  );
}
