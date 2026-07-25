"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Mail, Users, X } from "lucide-react";
interface Event {
  id: number;
  title: string;
  location?: string;
  event_datetime?: string;
  rsvp_enabled: boolean;
  rsvp_max_capacity?: number;
  rsvp_count: number;
  is_active: boolean;
  event_type?: string;
}
export default function EventRsvpReportPage() {
  const {
    t
  } = useTranslation();
  const router = useRouter();
  const [items, setItems] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterEvent, setFilterEvent] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [attendeesFor, setAttendeesFor] = useState<Event | null>(null);
  const [attendees, setAttendees] = useState<any[]>([]);
  const [attLoading, setAttLoading] = useState(false);
  const [msgFor, setMsgFor] = useState<Event | null>(null);
  const [msgTitle, setMsgTitle] = useState("");
  const [msgBody, setMsgBody] = useState("");
  const [msgChannels, setMsgChannels] = useState<Record<string, boolean>>({ push_notification: false, sms: false, whatsapp: false });
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState("");

  const openAttendees = async (e: Event) => {
    setAttendeesFor(e); setAttLoading(true); setAttendees([]);
    try {
      const d = await api.getRaw<any>(`/admin/event-cards/${e.id}/attendees`);
      setAttendees(d.items || []);
    } catch (err: any) { setError(err.message); } finally { setAttLoading(false); }
  };
  const openMessage = (e: Event) => { setMsgFor(e); setMsgTitle(""); setMsgBody(""); setSendResult(""); setMsgChannels({ push_notification: false, sms: false, whatsapp: false }); };
  const sendMessage = async () => {
    if (!msgFor || !msgTitle.trim() || sending) return;
    setSending(true); setSendResult("");
    try {
      const channels = ["in_app", ...Object.keys(msgChannels).filter(k => msgChannels[k])];
      const created = await api.post<any>("/admin/notifications", {
        title: msgTitle.trim(),
        body: msgBody.trim(),
        notification_type: "event",
        audience_segment: `event:${msgFor.id}`,
        channels,
      });
      const nid = created?.id ?? created?.data?.id;
      const sent = await api.post<any>(`/admin/notifications/${nid}/send`, {});
      const count = sent?.delivered_count ?? sent?.data?.delivered_count ?? 0;
      const stats = sent?.channel_stats ?? sent?.data?.channel_stats ?? {};
      const lines = [`${t("content_events_report.sent_to")} ${count} ${t("content_events_report.recipients")}`];
      for (const [ch, s] of Object.entries<any>(stats)) {
        const parts = [`${s.sent} ${t("content_events_report.ch_sent")}`];
        if (s.failed) parts.push(`${s.failed} ${t("content_events_report.ch_failed")}`);
        if (s.skipped) parts.push(`${s.skipped} ${t("content_events_report.ch_skipped")}`);
        lines.push(`${t(`content_events_report.ch_${ch === "push_notification" ? "push" : ch}`)}: ${parts.join(" · ")}`);
      }
      setSendResult(lines.join("\n"));
      setMsgTitle(""); setMsgBody("");
    } catch (err: any) { setSendResult(err.message || t("admin.errors.loadFailed")); }
    finally { setSending(false); }
  };
  const fetch = useCallback(() => {
    setLoading(true);
    api.get<{
      items: Event[];
    }>("/admin/event-cards?per_page=100").then(d => setItems((Array.isArray(d) ? d : d.items || []).filter(e => e.rsvp_enabled))).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    (async () => {
      fetch();
    })();
  }, [fetch]);
  const filtered = items.filter(e =>
    (filterEvent === "all" || e.id === Number(filterEvent)) &&
    (filterType === "all" || (e.event_type || "public") === filterType) &&
    (filterStatus === "all" || (filterStatus === "active" ? e.is_active : !e.is_active))
  );
  const totalRsvp = filtered.reduce((s, i) => s + (i.rsvp_count || 0), 0);
  return <div style={{
    padding: 32
  }}>
      <div style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: 20
    }}>
        <button onClick={() => router.push("/events")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button>
        <div><h1 className="page-title" style={{
          margin: 0
        }}>{t("content_events_report.event_rsvp_report")}</h1><p className="page-subtitle" style={{
          marginTop: 2
        }}>{filtered.length} {t("content_events_report.events_with_rsvp")} · {totalRsvp} {t("content_events_report.total_sign_ups")}</p></div>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="kpi-grid" style={{
      marginBottom: 24
    }}>
        <div className="kpi-card"><div className="kpi-label">{t("content_events_report.events_with_rsvp_2")}</div><div className="kpi-value">{filtered.length}</div></div>
        <div className="kpi-card"><div className="kpi-label">{t("content_events_report.total_sign_ups_2")}</div><div className="kpi-value">{totalRsvp}</div></div>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <select value={filterEvent} onChange={e => setFilterEvent(e.target.value)} style={{ minWidth: 220 }}>
          <option value="all">{t("content_events_report.all_events")}</option>
          {items.map(e => <option key={e.id} value={e.id}>{e.title}</option>)}
        </select>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ minWidth: 150 }}>
          <option value="all">{t("content_events_report.all_types")}</option>
          <option value="public">{t("content_events.type_public")}</option>
          <option value="invite_only">{t("content_events.type_invite_only")}</option>
          <option value="paid">{t("content_events.type_paid")}</option>
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ minWidth: 130 }}>
          <option value="all">{t("content_events_report.all_status")}</option>
          <option value="active">{t("admin.status.active")}</option>
          <option value="inactive">{t("admin.status.inactive")}</option>
        </select>
      </div>

      <div className="table-header-bar"><span className="text-sm font-semibold">{filtered.length} {t("content_events_report.events")}</span></div>
      <div className="table-container"><table className="data-table">
        <thead><tr><th>{t("content_events_report.event")}</th><th>{t("content_events_report.location")}</th><th>{t("content_events_report.date")}</th><th>{t("content_events_report.capacity")}</th><th>{t("content_events_report.sign_ups")}</th><th>{t("content_events_report.fill")}</th><th>{t("content_events_report.status")}</th><th style={{ width: 90 }}>{t("content_events_report.actions")}</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={8} className="data-table-empty">{t("content_events_report.loading")}</td></tr> : filtered.length === 0 ? <tr><td colSpan={8} className="data-table-empty">{t("admin.common.noResults")}</td></tr> : filtered.map(e => {
            const pct = e.rsvp_max_capacity ? Math.round(e.rsvp_count / e.rsvp_max_capacity * 100) : 0;
            return <tr key={e.id} style={{
              cursor: "pointer"
            }} onClick={() => router.push(`/events/${e.id}`)}>
              <td style={{
                fontWeight: 600
              }}>{e.title}</td>
              <td>{e.location || "—"}</td>
              <td style={{
                fontSize: 12
              }}>{e.event_datetime?.slice(0, 16)?.replace("T", " ") || "—"}</td>
              <td>{e.rsvp_max_capacity || "∞"}</td>
              <td style={{
                fontWeight: 600
              }}>{e.rsvp_count}</td>
              <td><span className={`badge badge-sm ${pct >= 80 ? "badge-red" : pct >= 50 ? "badge-yellow" : "badge-green"}`}>{pct}%</span></td>
              <td><span className={`badge badge-sm ${e.is_active ? "badge-green" : "badge-gray"}`}>{e.is_active ? t("admin.status.active") : t("admin.status.inactive")}</span></td>
              <td onClick={ev => ev.stopPropagation()}>
                <div style={{ display: "flex", gap: 4 }}>
                  <button type="button" onClick={() => openAttendees(e)} className="btn btn-ghost btn-sm" style={{ color: "var(--color-info)" }} title={t("content_events_report.attendees")} aria-label={t("content_events_report.attendees")}><Users size={14} /></button>
                  <button type="button" onClick={() => openMessage(e)} className="btn btn-ghost btn-sm" style={{ color: "var(--color-primary)" }} title={t("content_events_report.message_attendees")} aria-label={t("content_events_report.message_attendees")}><Mail size={14} /></button>
                </div>
              </td>
            </tr>;
          })}
        </tbody>
      </table></div>

      {attendeesFor && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60 }} onClick={() => setAttendeesFor(null)}>
        <div className="card" style={{ padding: 24, width: "92%", maxWidth: 560, maxHeight: "80vh", overflowY: "auto" }} onClick={ev => ev.stopPropagation()}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ margin: 0 }}>{t("content_events_report.attendee_list")} — {attendeesFor.title}</h3>
            <button onClick={() => setAttendeesFor(null)} className="btn btn-ghost btn-sm" aria-label={t("admin.common.close")}><X size={16} /></button>
          </div>
          {attLoading ? <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>{t("content_events_report.loading")}</p>
            : attendees.length === 0 ? <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>{t("content_events_report.no_attendees")}</p>
            : <table className="data-table">
              <thead><tr><th>{t("content_events_report.guest")}</th><th>{t("content_events_report.contact")}</th><th>{t("content_events_report.rsvped_at")}</th></tr></thead>
              <tbody>{attendees.map(a => <tr key={a.rsvp_id}>
                <td style={{ fontWeight: 600 }}>{a.display_name || "—"}</td>
                <td style={{ fontSize: 12 }}>{a.phone_number || ""}{a.phone_number && a.email_address ? " · " : ""}{a.email_address || ""}</td>
                <td style={{ fontSize: 12 }}>{a.rsvped_at?.slice(0, 16).replace("T", " ") || "—"}</td>
              </tr>)}</tbody>
            </table>}
        </div>
      </div>}

      {msgFor && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 60 }} onClick={() => setMsgFor(null)}>
        <div className="card" style={{ padding: 24, width: "92%", maxWidth: 520 }} onClick={ev => ev.stopPropagation()}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <h3 style={{ margin: 0 }}>{t("content_events_report.message_attendees")} — {msgFor.title}</h3>
            <button onClick={() => setMsgFor(null)} className="btn btn-ghost btn-sm" aria-label={t("admin.common.close")}><X size={16} /></button>
          </div>
          <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 16 }}>{msgFor.rsvp_count} {t("content_events_report.recipients")}</p>
          {sendResult && <div className="alert alert-success" style={{ marginBottom: 12, whiteSpace: "pre-line" }}>{sendResult}</div>}
          <div className="df-field" style={{ marginBottom: 12 }}>
            <input value={msgTitle} onChange={ev => setMsgTitle(ev.target.value)} placeholder={t("content_events_report.msg_title_ph")} style={{ width: "100%" }} maxLength={200} />
          </div>
          <div className="df-field" style={{ marginBottom: 12 }}>
            <textarea rows={4} value={msgBody} onChange={ev => setMsgBody(ev.target.value)} placeholder={t("content_events_report.msg_body_ph")} style={{ width: "100%" }} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16, fontSize: 13 }}>
            <span style={{ color: "var(--color-text-muted)", fontWeight: 600 }}>{t("content_events_report.channels")}:</span>
            <label style={{ display: "flex", alignItems: "center", gap: 6, opacity: 0.6 }}><input type="checkbox" checked disabled />{t("content_events_report.ch_inbox")}</label>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}><input type="checkbox" checked={msgChannels.push_notification} onChange={ev => setMsgChannels({ ...msgChannels, push_notification: ev.target.checked })} />{t("content_events_report.ch_push")}</label>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}><input type="checkbox" checked={msgChannels.sms} onChange={ev => setMsgChannels({ ...msgChannels, sms: ev.target.checked })} />{t("content_events_report.ch_sms")}</label>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}><input type="checkbox" checked={msgChannels.whatsapp} onChange={ev => setMsgChannels({ ...msgChannels, whatsapp: ev.target.checked })} />{t("content_events_report.ch_whatsapp")}</label>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button onClick={() => setMsgFor(null)} className="btn btn-ghost">{t("admin.common.cancel")}</button>
            <button onClick={sendMessage} disabled={sending || !msgTitle.trim() || msgFor.rsvp_count === 0} className="btn btn-primary"><Mail size={14} />{sending ? t("content_events_report.sending") : t("content_events_report.send_now")}</button>
          </div>
        </div>
      </div>}
    </div>;
}