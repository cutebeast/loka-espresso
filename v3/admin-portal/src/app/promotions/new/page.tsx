"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Upload, Save } from "lucide-react";
interface Voucher {
  id: number;
  display_title: string;
  voucher_code: string;
}
interface Survey {
  id: number;
  survey_name: string;
}
const ACTION_TYPES = [{
  value: "read_claim",
  label: "Read & Claim"
}, {
  value: "url_claim",
  label: "Visit Link & Claim"
}, {
  value: "survey_claim",
  label: "Survey & Claim"
}];
export default function PromotionNewPage() {
  const {
    t
  } = useTranslation();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [imagePreview, setImagePreview] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [voucherSegments, setVoucherSegments] = useState<string[]>([]);
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [form, setForm] = useState({
    title: "",
    short_description: "",
    long_description: "",
    image_url: "",
    action_type: "",
    action_url: "",
    voucher_id: "",
    survey_id: "",
    position: 0,
    is_active: true,
    start_date: "",
    end_date: ""
  });
  useEffect(() => {
    api.get<{
      items: Voucher[];
    }>("/admin/vouchers?per_page=100&is_active=true").then(d => setVouchers(Array.isArray(d) ? d : d.items || [])).catch(e => {
      console.error('vouchers:', e);
    });
    api.get<{
      items: Survey[];
    }>("/admin/surveys?per_page=100").then(d => setSurveys(Array.isArray(d) ? d : d.items || [])).catch(e => {
      console.error('surveys:', e);
    });
  }, []);
  useEffect(() => {
    if (!form.voucher_id) {
      Promise.resolve().then(() => setVoucherSegments([]));
      return;
    }
    api.getRaw<any>(`/admin/vouchers/${form.voucher_id}`).then(d => {
      const segs = d.customer_segments || [];
      setVoucherSegments(Array.isArray(segs) ? segs : []);
    }).catch(e => {
      console.error('voucher segments:', e);
      setVoucherSegments([]);
    });
  }, [form.voucher_id]);
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
      setImagePreview(url);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.voucher_id) {
      setError("A reward voucher is required");
      return;
    }
    setSaving(true);
    try {
      const p: Record<string, unknown> = {
        ...form,
        voucher_id: Number(form.voucher_id),
        survey_id: form.survey_id ? Number(form.survey_id) : null,
        start_date: form.start_date || null,
        end_date: form.end_date || null
      };
      await api.post("/admin/promo-banners", p);
      router.push("/promotions");
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
        <button onClick={() => router.push("/promotions")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button>
        <div><h1 className="page-title" style={{
          margin: 0
        }}>{t("promotions_new.new_promotion")}</h1><p className="page-subtitle" style={{
          marginTop: 2
        }}>{t("promotions_new.create_a_voucher_gating_promotion_banner")}</p></div>
      </div>
      {error && <div className="alert alert-error" style={{
      marginBottom: 16
    }}>{error}</div>}

      <div style={{
      background: "var(--color-bg-muted)",
      borderRadius: "var(--radius-md)",
      padding: 12,
      marginBottom: 16,
      fontSize: 13,
      color: "var(--color-text-muted)"
    }}>
        <strong>{t("promotions_new.3_action_types")}</strong> <em>{t("promotions_new.read_claim")}</em> · <em>{t("promotions_new.visit_link_claim")}</em> · <em>{t("promotions_new.survey_claim")}</em>
      </div>

      <div className="card" style={{
      padding: 24,
      maxWidth: 700
    }}>
        <form onSubmit={handleSubmit}>
          <div className="df-grid">
            <div className="df-field" style={{
            gridColumn: "1/-1"
          }}><label className="df-label">{t("promotions_new.title")}</label><input required value={form.title} onChange={e => setForm({
              ...form,
              title: e.target.value
            })} /></div>
            <div className="df-field"><label className="df-label">{t("promotions_new.position")}</label><input type="number" value={form.position} onChange={e => setForm({
              ...form,
              position: Number(e.target.value)
            })} /></div>
            <div className="df-field" style={{
            gridColumn: "1/-1"
          }}><label className="df-label">{t("promotions_new.short_description")}</label><input value={form.short_description} onChange={e => setForm({
              ...form,
              short_description: e.target.value
            })} placeholder={t("promotions_new.brief_summary_shown_in_card")} /></div>
            <div className="df-field" style={{
            gridColumn: "1/-1"
          }}><label className="df-label">{t("promotions_new.full_description")}</label><textarea rows={4} value={form.long_description} onChange={e => setForm({
              ...form,
              long_description: e.target.value
            })} placeholder={t("promotions_new.full_content_shown_when_customer_taps")} /></div>
            <div className="df-field"><label className="df-label">{t("promotions_new.action_type")}</label><select value={form.action_type} onChange={e => setForm({
              ...form,
              action_type: e.target.value
            })}><option value="">{t("promotions_new.select")}</option>{ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}</select></div>
            <div className="df-field"><label className="df-label">{t("promotions_new.reward_voucher")}</label><select required value={form.voucher_id} onChange={e => setForm({
              ...form,
              voucher_id: e.target.value
            })}><option value="">{t("promotions_new.required")}</option>{vouchers.map(v => <option key={v.id} value={v.id}>{v.display_title} ({v.voucher_code})</option>)}</select><div className="df-hint">{t("promotions_new.every_promotion_must_reward_a_voucher")}</div>
              {voucherSegments.length > 0 && <div style={{
              marginTop: 6,
              padding: "6px 10px",
              background: "var(--color-bg-muted)",
              borderRadius: "var(--radius-sm)",
              fontSize: 11,
              color: "var(--color-text-muted)"
            }}>{t("promotions_new.this_voucher_is_restricted_to")}<strong>{voucherSegments.join(", ")}</strong></div>}
            </div>
            {form.action_type === "url_claim" && <div className="df-field" style={{
            gridColumn: "1/-1"
          }}><label className="df-label">{t("promotions_new.link_url")}</label><input value={form.action_url} onChange={e => setForm({
              ...form,
              action_url: e.target.value
            })} placeholder={t("promotions_new.https")} /></div>}
            {form.action_type === "survey_claim" && <div className="df-field"><label className="df-label">{t("promotions_new.survey")}</label><select value={form.survey_id} onChange={e => setForm({
              ...form,
              survey_id: e.target.value
            })}><option value="">{t("promotions_new.select_2")}</option>{surveys.map(s => <option key={s.id} value={s.id}>{s.survey_name}</option>)}</select></div>}
            <div className="df-field" style={{
            gridColumn: "1/-1"
          }}>
              <label className="df-label">{t("promotions_new.image")}</label>
              <div style={{
              display: "flex",
              gap: 12,
              alignItems: "center"
            }}>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} style={{
                display: "none"
              }} />
                <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-sm btn-outline" disabled={uploading}><Upload size={14} /> {uploading ? "Uploading..." : "Upload Image"}</button>
                {imagePreview && <><img src={imagePreview} alt="" style={{
                  width: 48,
                  height: 48,
                  borderRadius: 6,
                  objectFit: "cover"
                }} /><button type="button" onClick={() => {
                  setForm({
                    ...form,
                    image_url: ""
                  });
                  setImagePreview("");
                }} className="btn btn-ghost btn-sm" style={{
                  color: "var(--color-error)"
                }}>{t("promotions_new.clear")}</button></>}
              </div>
              <div className="df-hint">{t("promotions_new.recommended_720_405px_16_9")}</div>
            </div>
            <div className="df-field"><label className="df-label">{t("promotions_new.start_date")}</label><input type="date" value={form.start_date} onChange={e => setForm({
              ...form,
              start_date: e.target.value
            })} /></div>
            <div className="df-field"><label className="df-label">{t("promotions_new.end_date")}</label><input type="date" value={form.end_date} onChange={e => setForm({
              ...form,
              end_date: e.target.value
            })} /></div>
            <div className="df-field"><label className="df-label" style={{
              display: "flex",
              alignItems: "center",
              gap: 8
            }}><input type="checkbox" checked={form.is_active} onChange={e => setForm({
                ...form,
                is_active: e.target.checked
              })} />{t("promotions_new.active")}</label></div>
          </div>
          <div className="df-actions" style={{
          marginTop: 20
        }}><button type="button" onClick={() => router.push("/promotions")} className="btn btn-ghost">{t("promotions_new.cancel")}</button><button type="submit" className="btn btn-primary" disabled={saving}><Save size={16} /> {saving ? "Creating..." : "Create Promotion"}</button></div>
        </form>
      </div>
    </div>;
}