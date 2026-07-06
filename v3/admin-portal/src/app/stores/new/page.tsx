"use client";

import { useTranslation } from "@/lib/i18n";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save } from "lucide-react";
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export default function NewStorePage() {
  const {
    t
  } = useTranslation();
  const router = useRouter();
  const [form, setForm] = useState<Record<string, any>>({
    store_name: "",
    store_code: "",
    slug: "",
    brand_name: "",
    address_line_1: "",
    address_line_2: "",
    city: "",
    state_province: "",
    postal_code: "",
    country_code: "MY",
    latitude: "",
    longitude: "",
    phone_number: "",
    email_address: "",
    timezone: "Asia/Kuala_Lumpur",
    currency_code: "MYR",
    logo_url: "",
    banner_image_url: "",
    pickup_lead_minutes: "15",
    delivery_radius_km: "10",
    first_order_minutes_after_open: "30",
    last_order_minutes_before_close: "45",
    position: "0",
    is_active: true,
    is_accepting_orders: true
  });
  const [hours, setHours] = useState(DAYS.map((_, i) => ({
    day_of_week: i,
    open_time: "08:00",
    close_time: "22:00",
    is_closed: false,
    is_24_hours: false,
    last_order_time: ""
  })));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const updateField = (key: string, value: any) => setForm(prev => ({
    ...prev,
    [key]: value
  }));
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: any = {
        ...form
      };
      if (!payload.slug) payload.slug = (payload.store_name || "store").toLowerCase().replace(/[^a-z0-9]/g, "-");
      if (!payload.store_code) payload.store_code = payload.slug.toUpperCase().slice(0, 6) + Date.now().toString(36).slice(-2);
      // Convert numeric strings
      ["latitude", "longitude", "pickup_lead_minutes", "delivery_radius_km", "first_order_minutes_after_open", "last_order_minutes_before_close", "position"].forEach(k => {
        if (payload[k] === "" || payload[k] === undefined) {
          delete payload[k];
        } else payload[k] = Number(payload[k]);
      });
      payload.operating_hours = hours;
      const r: any = await api.post("/admin/stores", payload);
      const id = r?.id;
      if (id) {
        router.push(`/stores/${id}`);
      } else {
        setMsg("Created but no redirect ID");
      }
    } catch (e: any) {
      setMsg("Error: " + (e.message || "Failed"));
    } finally {
      setSaving(false);
    }
  };
  const inputClass = "w-full border rounded px-3 py-2 text-sm";
  const labelClass = "block text-xs font-semibold text-gray-500 uppercase mb-1";
  const sectionClass = "mb-6";
  const sectionTitle = "text-sm font-bold uppercase text-gray-400 border-b pb-1 mb-3";
  return <div style={{
    padding: 32
  }}>
      <div style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: 20
    }}>
        <button onClick={() => router.push("/stores")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button>
        <div><h1 className="page-title" style={{
          margin: 0
        }}>{t("stores_new.new_store")}</h1></div>
      </div>
      {msg && <div className="alert alert-error" style={{
      marginBottom: 12,
      maxWidth: 720
    }}>{msg}</div>}

      <form onSubmit={handleSubmit}>
        <div className="card" style={{
        padding: 24,
        maxWidth: 720
      }}>
          {/* BASIC */}
          <div className={sectionClass}><div className={sectionTitle}>{t("stores_new.basic")}</div>
            <div className="df-grid">
              <div className="df-field"><label className={labelClass}>{t("stores_new.store_name")}</label><input required className={inputClass} value={form.store_name} onChange={e => updateField("store_name", e.target.value)} /></div>
              <div className="df-field"><label className={labelClass}>{t("stores_new.brand_name")}</label><input className={inputClass} value={form.brand_name || ""} onChange={e => updateField("brand_name", e.target.value)} /></div>
              <div className="df-field"><label className={labelClass}>{t("stores_new.store_code")}</label><input className={inputClass} value={form.store_code} onChange={e => updateField("store_code", e.target.value)} placeholder={t("stores_new.auto_generated")} /></div>
              <div className="df-field"><label className={labelClass}>{t("stores_new.slug")}</label><input className={inputClass} value={form.slug} onChange={e => updateField("slug", e.target.value)} placeholder={t("stores_new.auto_generated_2")} /></div>
            </div>
          </div>

          {/* SORT ORDER */}
          <div className={sectionClass}><div className={sectionTitle}>{t("stores_new.sort_order")}</div>
            <div className="df-grid">
              <div className="df-field"><label className={labelClass}>{t("stores_new.position")}</label><input type="number" className={inputClass} value={form.position} onChange={e => updateField("position", e.target.value)} /></div>
            </div>
          </div>

          {/* ADDRESS */}
          <div className={sectionClass}><div className={sectionTitle}>{t("stores_new.address")}</div>
            <div className="df-grid">
              <div className="df-field" style={{
              gridColumn: "1/-1"
            }}><label className={labelClass}>{t("stores_new.address_line_1")}</label><input required className={inputClass} value={form.address_line_1} onChange={e => updateField("address_line_1", e.target.value)} /></div>
              <div className="df-field" style={{
              gridColumn: "1/-1"
            }}><label className={labelClass}>{t("stores_new.address_line_2")}</label><input className={inputClass} value={form.address_line_2 || ""} onChange={e => updateField("address_line_2", e.target.value)} /></div>
              <div className="df-field"><label className={labelClass}>{t("stores_new.city")}</label><input required className={inputClass} value={form.city} onChange={e => updateField("city", e.target.value)} /></div>
              <div className="df-field"><label className={labelClass}>{t("stores_new.state_province")}</label><input className={inputClass} value={form.state_province || ""} onChange={e => updateField("state_province", e.target.value)} /></div>
              <div className="df-field"><label className={labelClass}>{t("stores_new.postal_code")}</label><input required className={inputClass} value={form.postal_code} onChange={e => updateField("postal_code", e.target.value)} /></div>
              <div className="df-field"><label className={labelClass}>{t("stores_new.country")}</label><input className={inputClass} value={form.country_code} onChange={e => updateField("country_code", e.target.value)} /></div>
            </div>
          </div>

          {/* CONTACT */}
          <div className={sectionClass}><div className={sectionTitle}>{t("stores_new.contact")}</div>
            <div className="df-grid">
              <div className="df-field"><label className={labelClass}>{t("stores_new.phone_number")}</label><input required className={inputClass} value={form.phone_number} onChange={e => updateField("phone_number", e.target.value)} /></div>
              <div className="df-field"><label className={labelClass}>{t("stores_new.email")}</label><input className={inputClass} value={form.email_address || ""} onChange={e => updateField("email_address", e.target.value)} /></div>
              <div className="df-field"><label className={labelClass}>{t("stores_new.timezone")}</label><input className={inputClass} value={form.timezone} onChange={e => updateField("timezone", e.target.value)} /></div>
              <div className="df-field"><label className={labelClass}>{t("stores_new.currency")}</label><input className={inputClass} value={form.currency_code} onChange={e => updateField("currency_code", e.target.value)} /></div>
            </div>
          </div>

          {/* LOCATION */}
          <div className={sectionClass}><div className={sectionTitle}>{t("stores_new.location")}</div>
            <div className="df-grid">
              <div className="df-field"><label className={labelClass}>{t("stores_new.latitude")}</label><input type="number" step="any" className={inputClass} value={form.latitude} onChange={e => updateField("latitude", e.target.value)} /></div>
              <div className="df-field"><label className={labelClass}>{t("stores_new.longitude")}</label><input type="number" step="any" className={inputClass} value={form.longitude} onChange={e => updateField("longitude", e.target.value)} /></div>
            </div>
          </div>

          {/* OPERATIONS */}
          <div className={sectionClass}><div className={sectionTitle}>{t("stores_new.operations")}</div>
            <div className="df-grid">
              <div className="df-field"><label className={labelClass}>{t("stores_new.pickup_lead_min")}</label><input type="number" className={inputClass} value={form.pickup_lead_minutes} onChange={e => updateField("pickup_lead_minutes", e.target.value)} /></div>
              <div className="df-field"><label className={labelClass}>{t("stores_new.delivery_radius_km")}</label><input type="number" step="0.1" className={inputClass} value={form.delivery_radius_km} onChange={e => updateField("delivery_radius_km", e.target.value)} /></div>
            </div>
          </div>

          {/* MEDIA */}
          <div className={sectionClass}><div className={sectionTitle}>{t("stores_new.media")}</div>
            <div className="df-grid">
              <div className="df-field"><label className={labelClass}>{t("stores_new.logo_url")}</label><input className={inputClass} value={form.logo_url || ""} onChange={e => updateField("logo_url", e.target.value)} /></div>
              <div className="df-field"><label className={labelClass}>{t("stores_new.banner_image_url")}</label><input className={inputClass} value={form.banner_image_url || ""} onChange={e => updateField("banner_image_url", e.target.value)} /></div>
            </div>
          </div>

          {/* OPERATING HOURS */}
          <div className={sectionClass}><div className={sectionTitle}>{t("stores_new.operating_hours")}</div>
            {hours.map((h, i) => <div key={i} style={{
            display: "flex",
            gap: 8,
            alignItems: "center",
            marginBottom: 6,
            opacity: h.is_closed ? 0.5 : 1,
            flexWrap: "wrap"
          }}>
                <span style={{
              width: 40,
              fontSize: 13,
              fontWeight: 600
            }}>{DAYS[i]}</span>
                <input type="time" value={h.open_time || "00:00"} onChange={e => {
              const hh = [...hours];
              hh[i] = {
                ...hh[i],
                open_time: e.target.value
              } as any;
              setHours(hh);
            }} className={inputClass} style={{
              width: 120
            }} disabled={h.is_closed || h.is_24_hours} />
                <span style={{
              fontSize: 12
            }}>{t("stores_new.to")}</span>
                  <input type="time" value={h.close_time || "23:59"} onChange={e => {
              const hh = [...hours];
              hh[i] = {
                ...hh[i],
                close_time: e.target.value
              } as any;
              setHours(hh);
            }} className={inputClass} style={{
              width: 120
            }} disabled={h.is_closed || h.is_24_hours} />
                <label style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              marginLeft: 4
            }}>
                    <input type="checkbox" checked={h.is_closed} onChange={e => {
                const hh = [...hours];
                hh[i] = {
                  ...hh[i],
                  is_closed: e.target.checked
                } as any;
                setHours(hh);
              }} />{t("stores_new.closed")}</label>
                <label style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              marginLeft: 4
            }}>
                    <input type="checkbox" checked={h.is_24_hours} onChange={e => {
                const hh = [...hours];
                hh[i] = {
                  ...hh[i],
                  is_24_hours: e.target.checked
                } as any;
                if (e.target.checked) {
                  hh[i] = {
                    ...hh[i],
                    open_time: "00:00",
                    close_time: "23:59"
                  } as any;
                }
                setHours(hh);
              }} />{t("stores_new.24h")}</label>
                {!h.is_closed && <label style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              marginLeft: 4
            }}>
                    <span style={{
                color: "var(--color-text-muted)"
              }}>{t("stores_new.last_order")}</span>
                      <input type="time" value={h.last_order_time || ""} onChange={e => {
                const hh = [...hours];
                hh[i] = {
                  ...hh[i],
                  last_order_time: e.target.value
                } as any;
                setHours(hh);
              }} className={inputClass} style={{
                width: 100
              }} />
                  </label>}
              </div>)}
          </div>

          {/* TOGGLES */}
          <div className={sectionClass}>
            <div className="df-grid">
              <div className="df-field"><label style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13
              }}><input type="checkbox" checked={form.is_active} onChange={e => updateField("is_active", e.target.checked)} />{t("stores_new.active")}</label></div>
              <div className="df-field"><label style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13
              }}><input type="checkbox" checked={form.is_accepting_orders} onChange={e => updateField("is_accepting_orders", e.target.checked)} />{t("stores_new.accepting_orders")}</label></div>
            </div>
          </div>

          <div className="df-actions">
            <button type="button" onClick={() => router.push("/stores")} className="btn btn-ghost">{t("stores_new.cancel")}</button>
            <button type="submit" disabled={saving} className="btn btn-primary"><Save size={16} /> {saving ? "Creating..." : "Create Store"}</button>
          </div>
        </div>
      </form>
    </div>;
}