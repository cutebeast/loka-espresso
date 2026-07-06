"use client";

import { useTranslation } from "@/lib/i18n";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createMarketingCampaign } from "@/lib/api";
import { ArrowLeft, Save } from "lucide-react";
import { useAudienceSegments } from "@/lib/useAudienceSegments";
export default function CampaignNewPage() {
  const {
    t
  } = useTranslation();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const {
    allSegments
  } = useAudienceSegments();
  const [form, setForm] = useState({
    campaign_name: "",
    campaign_key: "",
    campaign_type: "promotional",
    channel: "push_notification",
    status: "draft",
    audience_segment: "",
    body_content: "",
    scheduled_at: ""
  });
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await createMarketingCampaign(form);
      router.push("/marketing/campaigns");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };
  return <div style={{
    padding: 32
  }}>
      <div style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: 20
    }}>
        <button onClick={() => router.push("/marketing/campaigns")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button>
        <div><h1 className="page-title" style={{
          margin: 0
        }}>{t("marketing_campaigns_new.new_campaign")}</h1><p className="page-subtitle" style={{
          marginTop: 2
        }}>{t("marketing_campaigns_new.create_a_multi_channel_marketing_campaign")}</p></div>
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
            <div className="df-field" style={{
            gridColumn: "1/-1"
          }}><label className="df-label">{t("marketing_campaigns_new.campaign_name")}</label><input required value={form.campaign_name} onChange={e => setForm({
              ...form,
              campaign_name: e.target.value
            })} /></div>
            <div className="df-field"><label className="df-label">{t("marketing_campaigns_new.channel")}</label><select value={form.channel} onChange={e => setForm({
              ...form,
              channel: e.target.value
            })}><option value="push_notification">{t("marketing_campaigns_new.push_notification")}</option><option value="email">{t("marketing_campaigns_new.email_resend")}</option><option value="sms">{t("marketing_campaigns_new.sms_twilio")}</option><option value="whatsapp">{t("marketing_campaigns_new.whatsapp_twilio")}</option><option value="in_app">{t("marketing_campaigns_new.in_app")}</option></select></div>
            <div className="df-field"><label className="df-label">{t("marketing_campaigns_new.status")}</label><select value={form.status} onChange={e => setForm({
              ...form,
              status: e.target.value
            })}><option value="draft">{t("marketing_campaigns_new.draft")}</option><option value="scheduled">{t("marketing_campaigns_new.scheduled")}</option><option value="active">{t("marketing_campaigns_new.active")}</option></select></div>
            <div className="df-field"><label className="df-label">{t("marketing_campaigns_new.campaign_type")}</label><select value={form.campaign_type} onChange={e => setForm({
              ...form,
              campaign_type: e.target.value
            })}><option value="promotional">{t("marketing_campaigns_new.promotional")}</option><option value="transactional">{t("marketing_campaigns_new.transactional")}</option><option value="announcement">{t("marketing_campaigns_new.announcement")}</option><option value="retention">{t("marketing_campaigns_new.retention")}</option></select></div>
            <div className="df-field"><label className="df-label">{t("marketing_campaigns_new.scheduled_at")}</label><input type="datetime-local" value={form.scheduled_at} onChange={e => setForm({
              ...form,
              scheduled_at: e.target.value
            })} /><div className="df-hint">{t("marketing_campaigns_new.leave_empty_for_immediate_send")}</div></div>
            <div className="df-field" style={{
            gridColumn: "1/-1"
          }}><label className="df-label">{t("marketing_campaigns_new.audience_segment")}</label><select value={form.audience_segment} onChange={e => setForm({
              ...form,
              audience_segment: e.target.value
            })}>{allSegments.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}</select><div className="df-hint">{t("marketing_campaigns_new.target_audience_for_campaign_delivery")}</div></div>
            <div className="df-field" style={{
            gridColumn: "1/-1"
          }}><label className="df-label">{t("marketing_campaigns_new.content")}</label><textarea rows={5} value={form.body_content} onChange={e => setForm({
              ...form,
              body_content: e.target.value
            })} placeholder={t("marketing_campaigns_new.campaign_message_content")} /></div>
          </div>
          <div className="df-actions" style={{
          marginTop: 20
        }}><button type="button" onClick={() => router.push("/marketing/campaigns")} className="btn btn-ghost">{t("marketing_campaigns_new.cancel")}</button><button type="submit" className="btn btn-primary" disabled={saving}><Save size={16} /> {saving ? "Creating..." : "Create Campaign"}</button></div>
        </form>
      </div>
    </div>;
}