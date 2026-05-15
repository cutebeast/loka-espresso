"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Save } from "lucide-react";

export default function ReservationSettingsPage() {
  const [form, setForm] = useState({ sms_enabled: "false", sms_provider: "twilio", twilio_sid: "", twilio_token: "", twilio_from: "", whatsapp_enabled: "false", default_duration: "30", auto_confirm: "false" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    setLoading(true);
    api.getRaw<any>("/admin/config?prefix=reservation")
      .then(d => { const m: Record<string, any> = {}; (Array.isArray(d) ? d : (d.items || [])).forEach((c: any) => { m[c.config_key.replace("reservation.", "")] = c.config_value; }); setForm(prev => ({ ...prev, ...m })); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      for (const [k, v] of Object.entries(form)) {
        const qs = new URLSearchParams({ key: `reservation.${k}`, value: String(v) });
        await api.put(`/admin/config?${qs.toString()}`);
      }
      setMsg("Settings saved");
      setTimeout(() => setMsg(""), 2000);
    } catch {
      setMsg("Failed to save settings");
      setTimeout(() => setMsg(""), 2000);
    } finally { setSaving(false); }
  };

  if (loading) return <div style={{ padding: 32 }}>Loading...</div>;

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header"><div><h1 className="page-title">Reservation Settings</h1><p className="page-subtitle">SMS/WhatsApp notification config for reservation confirmations</p></div></div>
      {msg && <div className="alert alert-success" style={{ marginBottom: 12 }}>{msg}</div>}

      <div className="card" style={{ padding: 24, maxWidth: 600 }}>
        <div className="df-grid">
          <div className="df-field"><label className="df-label">SMS Enabled</label><select value={form.sms_enabled} onChange={e => setForm({ ...form, sms_enabled: e.target.value })}><option value="true">Yes</option><option value="false">No</option></select></div>
          <div className="df-field"><label className="df-label">SMS Provider</label><select value={form.sms_provider} onChange={e => setForm({ ...form, sms_provider: e.target.value })}><option value="twilio">Twilio</option><option value="vonage">Vonage</option></select></div>
          <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="df-label">Twilio Account SID</label><input value={form.twilio_sid} onChange={e => setForm({ ...form, twilio_sid: e.target.value })} placeholder="AC..." /></div>
          <div className="df-field" style={{ gridColumn: "1/-1" }}><label className="df-label">Twilio Auth Token</label><input type="password" value={form.twilio_token} onChange={e => setForm({ ...form, twilio_token: e.target.value })} /></div>
          <div className="df-field"><label className="df-label">From Number</label><input value={form.twilio_from} onChange={e => setForm({ ...form, twilio_from: e.target.value })} placeholder="+60123456789" /></div>
          <div className="df-field"><label className="df-label">WhatsApp Enabled</label><select value={form.whatsapp_enabled} onChange={e => setForm({ ...form, whatsapp_enabled: e.target.value })}><option value="true">Yes</option><option value="false">No</option></select></div>
          <div className="df-field"><label className="df-label">Default Duration (min)</label><input type="number" value={form.default_duration} onChange={e => setForm({ ...form, default_duration: e.target.value })} /><div className="df-hint">Reservation held for this many minutes</div></div>
          <div className="df-field"><label className="df-label">Auto-Confirm</label><select value={form.auto_confirm} onChange={e => setForm({ ...form, auto_confirm: e.target.value })}><option value="true">Yes</option><option value="false">No</option></select><div className="df-hint">Auto-confirm reservations without admin action</div></div>
        </div>
        <div style={{ marginTop: 20 }}>
          <button onClick={handleSave} disabled={saving} className="btn btn-primary"><Save size={16} /> {saving ? "Saving..." : "Save Settings"}</button>
        </div>
      </div>

      <div className="card" style={{ padding: 16, marginTop: 16, maxWidth: 600, background: "var(--color-bg-muted)", border: "1px solid var(--color-border-light)" }}>
        <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: 0 }}>
          <strong>Note:</strong> Reservation SMS providers are independent from marketing campaigns. When a reservation is confirmed, the system sends an SMS/WhatsApp notification using these credentials.
        </p>
      </div>
    </div>
  );
}
