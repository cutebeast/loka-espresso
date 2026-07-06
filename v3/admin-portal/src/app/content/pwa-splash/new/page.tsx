"use client";

import { useTranslation } from "@/lib/i18n";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save, Upload } from "lucide-react";
export default function SplashScreenNewPage() {
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
    screen_name: "",
    title: "",
    subtitle: "",
    image_url: "",
    cta_text: "",
    cta_url: "",
    show_frequency: "once_per_session",
    dismissible: true,
    duration_ms: "",
    active_from: "",
    active_until: "",
    is_active: true
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
    try {
      await api.post("/admin/content/splash-screens", {
        ...form,
        duration_ms: form.duration_ms ? Number(form.duration_ms) : undefined
      });
      router.push("/content/pwa-splash");
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
    }}><button onClick={() => router.push("/content/pwa-splash")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button><div><h1 className="page-title" style={{
          margin: 0
        }}>{t("content_pwa-splash_new.new_pwa_splash")}</h1></div></div>
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
          }}><label className="df-label">{t("content_pwa-splash_new.title")}</label><input required value={form.title} onChange={e => setForm({
              ...form,
              title: e.target.value
            })} /></div>
          <div className="df-field"><label className="df-label" style={{
              display: "flex",
              alignItems: "center",
              gap: 8
            }}><input type="checkbox" checked={form.screen_name === "pre_login"} onChange={e => setForm({
                ...form,
                screen_name: e.target.checked ? "pre_login" : ""
              })} />{t("content_pwa-splash_new.pre_login_splash")}</label><div className="df-hint">{t("content_pwa-splash_new.shows_before_login_page_on_pwa")}</div></div>
          <div className="df-field" style={{
            gridColumn: "1/-1"
          }}><label className="df-label">{t("content_pwa-splash_new.subtitle")}</label><input value={form.subtitle} onChange={e => setForm({
              ...form,
              subtitle: e.target.value
            })} /></div>
          <div className="df-field"><label className="df-label">{t("content_pwa-splash_new.active_from")}</label><input type="datetime-local" value={form.active_from} onChange={e => setForm({
              ...form,
              active_from: e.target.value
            })} /></div>
          <div className="df-field"><label className="df-label">{t("content_pwa-splash_new.active_until")}</label><input type="datetime-local" value={form.active_until} onChange={e => setForm({
              ...form,
              active_until: e.target.value
            })} /></div>
          <div className="df-field"><label className="df-label">{t("content_pwa-splash_new.cta_text")}</label><input value={form.cta_text} onChange={e => setForm({
              ...form,
              cta_text: e.target.value
            })} placeholder={t("content_pwa-splash_new.learn_more")} /></div>
          <div className="df-field"><label className="df-label">{t("content_pwa-splash_new.cta_url")}</label><input value={form.cta_url} onChange={e => setForm({
              ...form,
              cta_url: e.target.value
            })} placeholder={t("content_pwa-splash_new.https")} /></div>
          <div className="df-field"><label className="df-label">{t("content_pwa-splash_new.show_frequency")}</label><select value={form.show_frequency} onChange={e => setForm({
              ...form,
              show_frequency: e.target.value
            })}><option value="once_per_session">{t("content_pwa-splash_new.once_per_session")}</option><option value="always">{t("content_pwa-splash_new.always")}</option><option value="once_per_day">{t("content_pwa-splash_new.once_per_day")}</option><option value="once">{t("content_pwa-splash_new.once_only")}</option></select><div className="df-hint">{t("content_pwa-splash_new.how_often_this_splash_appears")}</div></div>
          <div className="df-field"><label className="df-label">{t("content_pwa-splash_new.duration_ms")}</label><input type="number" value={form.duration_ms} onChange={e => setForm({
              ...form,
              duration_ms: e.target.value
            })} placeholder="3000" min={500} step={100} /><div className="df-hint">{t("content_pwa-splash_new.how_long_to_show_default_3000ms")}</div></div>
          <div className="df-field"><label className="df-label" style={{
              display: "flex",
              alignItems: "center",
              gap: 8
            }}><input type="checkbox" checked={form.dismissible} onChange={e => setForm({
                ...form,
                dismissible: e.target.checked
              })} />{t("content_pwa-splash_new.dismissible")}</label><div className="df-hint">{t("content_pwa-splash_new.can_user_dismiss_this_splash")}</div></div>
          <div className="df-field" style={{
            gridColumn: "1/-1"
          }}><label className="df-label">{t("content_pwa-splash_new.image")}</label><div style={{
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
                }}>{t("content_pwa-splash_new.clear")}</button></>}</div></div>
          <div className="df-field"><label className="df-label" style={{
              display: "flex",
              alignItems: "center",
              gap: 8
            }}><input type="checkbox" checked={form.is_active} onChange={e => setForm({
                ...form,
                is_active: e.target.checked
              })} />{t("content_pwa-splash_new.active")}</label></div>
        </div><div className="df-actions" style={{
          marginTop: 20
        }}><button type="button" onClick={() => router.push("/content/pwa-splash")} className="btn btn-ghost">{t("content_pwa-splash_new.cancel")}</button><button type="submit" className="btn btn-primary" disabled={saving}><Save size={16} />{saving ? "Creating..." : "Create Splash"}</button></div></form>
      </div>
    </div>;
}