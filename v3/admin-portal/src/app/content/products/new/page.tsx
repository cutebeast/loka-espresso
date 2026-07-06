"use client";

import { useTranslation } from "@/lib/i18n";
import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save, Upload } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";
export default function ProductNewPage() {
  const {
    t
  } = useTranslation();
  const router = useRouter();
  const {
    symbol
  } = useCurrency();
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
    price: 0,
    position: 0,
    is_active: true,
    start_date: "",
    end_date: ""
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
      await api.post("/admin/product-cards", form);
      router.push("/content/products");
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
    }}><button onClick={() => router.push("/content/products")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button><div><h1 className="page-title" style={{
          margin: 0
        }}>{t("content_products_new.new_product")}</h1></div></div>
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
          }}><label className="df-label">{t("content_products_new.title")}</label><input required value={form.title} onChange={e => setForm({
              ...form,
              title: e.target.value
            })} /></div>
          <div className="df-field"><label className="df-label">{`Price (${symbol})`}</label><input type="number" step="0.01" value={form.price} onChange={e => setForm({
              ...form,
              price: Number(e.target.value)
            })} /></div>
          <div className="df-field"><label className="df-label">{t("content_products_new.position")}</label><input type="number" value={form.position} onChange={e => setForm({
              ...form,
              position: Number(e.target.value)
            })} /></div>
          <div className="df-field" style={{
            gridColumn: "1/-1"
          }}><label className="df-label">{t("content_products_new.short_description")}</label><input value={form.short_description} onChange={e => setForm({
              ...form,
              short_description: e.target.value
            })} /></div>
          <div className="df-field" style={{
            gridColumn: "1/-1"
          }}><label className="df-label">{t("content_products_new.full_description")}</label><textarea rows={3} value={form.long_description} onChange={e => setForm({
              ...form,
              long_description: e.target.value
            })} /></div>
          <div className="df-field" style={{
            gridColumn: "1/-1"
          }}><label className="df-label">{t("content_products_new.image")}</label><div style={{
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
                }}>{t("content_products_new.clear")}</button></>}</div></div>
          <div className="df-field"><label className="df-label" style={{
              display: "flex",
              alignItems: "center",
              gap: 8
            }}><input type="checkbox" checked={form.is_active} onChange={e => setForm({
                ...form,
                is_active: e.target.checked
              })} />{t("content_products_new.active")}</label></div>
        </div><div className="df-actions" style={{
          marginTop: 20
        }}><button type="button" onClick={() => router.push("/content/products")} className="btn btn-ghost">{t("content_products_new.cancel")}</button><button type="submit" className="btn btn-primary" disabled={saving}><Save size={16} />{saving ? "Creating..." : "Create Product"}</button></div></form>
      </div>
    </div>;
}