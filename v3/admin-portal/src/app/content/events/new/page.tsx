"use client";

import { useTranslation } from "@/lib/i18n";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save, Upload } from "lucide-react";
export default function EventNewPage() {
  const {
    t
  } = useTranslation();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [img, setImg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState({
    title: "",
    short_description: "",
    long_description: "",
    image_url: "",
    position: 0,
    is_active: true,
    start_date: "",
    end_date: "",
    location: "",
    event_datetime: "",
    rsvp_enabled: false,
    rsvp_max_capacity: 0
  });
  const handleUpload = async () => {
    const f = fileRef.current?.files?.[0];
    if (!f) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const j = await api.upload("/upload/image", fd);
      const url = j.url || j.filename || "";
      setForm({
        ...form,
        image_url: url
      });
      setImg(url);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
    ;
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const pl: any = {
      ...form,
      position: Number(form.position),
      rsvp_max_capacity: form.rsvp_max_capacity || null
    };
    try {
      await api.post("/admin/event-cards", pl);
      router.push("/content/events");
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
    ;
  };
  return <div style={{
    padding: 32
  }}>
      <div style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: 20
    }}><button onClick={() => router.push("/content/events")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button><div><h1 className="page-title" style={{
          margin: 0
        }}>{t("content_events_new.new_event")}</h1></div></div>
      {error && <div className="alert alert-error" style={{
      marginBottom: 16
    }}>{error}</div>}
      <div className="card" style={{
      padding: 24,
      maxWidth: 700
    }}>
        <form onSubmit={handleSubmit}><div className="df-grid">
          <div className="df-field" style={{
            gridColumn: "1/-1"
          }}><label className="df-label">{t("content_events_new.title")}</label><input required value={form.title} onChange={e => setForm({
              ...form,
              title: e.target.value
            })} /></div>
          <div className="df-field"><label className="df-label">{t("content_events_new.location")}</label><input value={form.location} onChange={e => setForm({
              ...form,
              location: e.target.value
            })} placeholder={t("content_events_new.loka_espresso_klcc")} /></div>
          <div className="df-field"><label className="df-label">{t("content_events_new.event_date_time")}</label><input type="datetime-local" value={form.event_datetime} onChange={e => setForm({
              ...form,
              event_datetime: e.target.value
            })} /></div>
          <div className="df-field"><label className="df-label">{t("content_events_new.start_date")}</label><input type="date" value={form.start_date} onChange={e => setForm({
              ...form,
              start_date: e.target.value
            })} /></div>
          <div className="df-field"><label className="df-label">{t("content_events_new.end_date")}</label><input type="date" value={form.end_date} onChange={e => setForm({
              ...form,
              end_date: e.target.value
            })} /></div>
          <div className="df-field"><label className="df-label">{t("content_events_new.position")}</label><input type="number" value={form.position} onChange={e => setForm({
              ...form,
              position: Number(e.target.value)
            })} /></div>
          <div className="df-field" style={{
            gridColumn: "1/-1"
          }}><label className="df-label">{t("content_events_new.short_description")}</label><input value={form.short_description} onChange={e => setForm({
              ...form,
              short_description: e.target.value
            })} /></div>
          <div className="df-field" style={{
            gridColumn: "1/-1"
          }}><label className="df-label">{t("content_events_new.full_description")}</label><textarea rows={3} value={form.long_description} onChange={e => setForm({
              ...form,
              long_description: e.target.value
            })} /></div>
          <div className="df-field" style={{
            gridColumn: "1/-1"
          }}><label className="df-label">{t("content_events_new.image")}</label><div style={{
              display: "flex",
              gap: 12,
              alignItems: "center"
            }}><input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} style={{
                display: "none"
              }} /><button type="button" onClick={() => fileRef.current?.click()} className="btn btn-sm btn-outline" disabled={uploading}><Upload size={14} />{uploading ? "Uploading..." : "Upload Image"}</button>{img && <><img src={img} alt="" style={{
                  width: 48,
                  height: 48,
                  borderRadius: 6,
                  objectFit: "cover"
                }} /><button type="button" onClick={() => {
                  setForm({
                    ...form,
                    image_url: ""
                  });
                  setImg("");
                }} className="btn btn-ghost btn-sm" style={{
                  color: "var(--color-error)"
                }}>{t("content_events_new.clear")}</button></>}</div></div>
          <div className="df-field"><label className="df-label" style={{
              display: "flex",
              alignItems: "center",
              gap: 8
            }}><input type="checkbox" checked={form.rsvp_enabled} onChange={e => setForm({
                ...form,
                rsvp_enabled: e.target.checked
              })} />{t("content_events_new.enable_rsvp")}</label></div>
          {form.rsvp_enabled && <div className="df-field"><label className="df-label">{t("content_events_new.max_capacity")}</label><input type="number" value={form.rsvp_max_capacity} onChange={e => setForm({
              ...form,
              rsvp_max_capacity: Number(e.target.value)
            })} placeholder={t("content_events_new.e_g_20")} /></div>}
          <div className="df-field"><label className="df-label" style={{
              display: "flex",
              alignItems: "center",
              gap: 8
            }}><input type="checkbox" checked={form.is_active} onChange={e => setForm({
                ...form,
                is_active: e.target.checked
              })} />{t("content_events_new.active")}</label></div>
        </div><div className="df-actions" style={{
          marginTop: 20
        }}><button type="button" onClick={() => router.push("/content/events")} className="btn btn-ghost">{t("content_events_new.cancel")}</button><button type="submit" className="btn btn-primary" disabled={saving}><Save size={16} />{saving ? "Creating..." : "Create Event"}</button></div></form>
      </div>
    </div>;
}