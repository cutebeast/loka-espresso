"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save, RefreshCw, Upload } from "lucide-react";
import { useAudienceSegments } from "@/lib/useAudienceSegments";
import GalleryUpload from "@/components/GalleryUpload";
import { useCurrency } from "@/hooks/useCurrency";
type LocaleTab = "en" | "ms" | "zh" | "ta" | "tr";
const LOCALES: {
  code: LocaleTab;
  label: string;
  flag: string;
}[] = [{
  code: "en",
  label: "English",
  flag: "🇬🇧"
}, {
  code: "ms",
  label: "BM",
  flag: "🇲🇾"
}, {
  code: "zh",
  label: "中文",
  flag: "🇨🇳"
}, {
  code: "ta",
  label: "தமிழ்",
  flag: "🇮🇳"
}, {
  code: "tr",
  label: "TR",
  flag: "🇹🇷"
}];
const TRANSLATABLE_FIELDS = [{
  key: "reward_name",
  label: "Reward Name"
}, {
  key: "short_description",
  label: "Short Description"
}, {
  key: "long_description",
  label: "Full Description"
}, {
  key: "how_to_redeem",
  label: "How to Redeem"
}, {
  key: "terms_and_conditions",
  label: "Terms & Conditions"
}];
interface Reward {
  id: number;
  reward_name: string;
  reward_key: string;
  reward_type: string;
  description?: string;
  short_description?: string;
  long_description?: string;
  image_url?: string;
  points_cost: number;
  minimum_order_value?: number;
  validity_days?: number;
  how_to_redeem?: string;
  terms_and_conditions?: string;
  position?: number;
  image_gallery_urls?: string[];
  gallery_video_url?: string;
  customer_segments?: string[];
  is_active: boolean;
  discount_value?: number;
  discount_max_amount?: number;
}
export default function RewardEditPage() {
  const {
    t
  } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const rewardId = params.id as string;
  const {
    allSegments
  } = useAudienceSegments();
  const {
    symbol
  } = useCurrency();
  const [reward, setReward] = useState<Reward | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeLocale, setActiveLocale] = useState<LocaleTab>("en");
  const [regenerating, setRegenerating] = useState<string>("");
  const [msg, setMsg] = useState("");
  const [uploading, setUploading] = useState(false);
  const [imagePreview, setImagePreview] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [translations, setTranslations] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!rewardId) return;
    loadReward();
  }, [rewardId]);
  const loadReward = async () => {
    setLoading(true);
    try {
      const d = await api.getRaw<Reward>(`/admin/rewards/${rewardId}`);
      setReward(d);
      setForm({
        reward_name: d.reward_name || "",
        reward_key: d.reward_key || "",
        reward_type: d.reward_type || "free_item",
        points_cost: d.points_cost ?? 0,
        minimum_order_value: d.minimum_order_value ?? 0,
        validity_days: d.validity_days ?? 30,
        discount_value: d.discount_value ?? 0,
        discount_max_amount: d.discount_max_amount ?? 0,
        description: d.description || "",
        short_description: d.short_description || "",
        long_description: d.long_description || "",
        how_to_redeem: d.how_to_redeem || "",
        terms_and_conditions: d.terms_and_conditions || "",
        image_url: d.image_url || "",
        image_gallery_urls: d.image_gallery_urls || [],
        gallery_video_url: d.gallery_video_url || "",
        position: d.position ?? 0,
        customer_segments: d.customer_segments || [],
        is_active: d.is_active
      });
      setImagePreview(d.image_url || "");

      // Load translations
      const allTr: Record<string, string> = {};
      for (const loc of LOCALES) {
        if (loc.code === "en") continue;
        try {
          const tr = await api.getRaw<{
            items: {
              translation_key: string;
              translated_text: string;
              locale: string;
            }[];
          }>(`/admin/translations?table_name=reward_catalog&record_id=${rewardId}&locale=${loc.code}&per_page=50`);
          if (tr?.items) {
            for (const t of tr.items) {
              const field = t.translation_key.split(".").pop() || "";
              allTr[`${loc.code}:${field}`] = t.translated_text || "";
            }
          }
        } catch (e) {
          console.error(e);
        }
      }
      setTranslations(allTr);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };
  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form
      };
      ["points_cost", "minimum_order_value", "validity_days"].forEach(k => {
        if (payload[k] !== null && payload[k] !== "") payload[k] = Number(payload[k]);
      });
      await api.put(`/admin/rewards/${rewardId}`, payload);
      setMsg("Saved");
      setTimeout(() => setMsg(""), 2000);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };
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
    } catch (e) {
      console.error(e);
    } finally {
      setUploading(false);
    }
  };
  const upsertTranslation = async (field: string, locale: string, sourceText: string, translatedText: string) => {
    const allTr = await api.getRaw<{
      items: {
        id: number;
        translation_key: string;
      }[];
    }>(`/admin/translations?table_name=reward_catalog&record_id=${rewardId}&column_name=${field}&locale=${locale}&per_page=1`);
    const existing = allTr?.items?.[0];
    if (existing) {
      await api.put(`/admin/translations/${existing.id}`, {
        translated_text: translatedText
      });
    } else {
      await api.post("/admin/translations", {
        translation_key: `reward_catalog.${rewardId}.${field}`,
        locale: locale,
        namespace: "reward",
        translated_text: translatedText,
        source_text: sourceText,
        table_name: "reward_catalog",
        record_id: Number(rewardId),
        column_name: field
      });
    }
  };
  const handleRegenerateAll = async (locale: string) => {
    setRegenerating("all");
    const results: {
      field: string;
      text: string;
    }[] = [];
    for (const field of TRANSLATABLE_FIELDS) {
      const sourceText = (form[field.key] || "").trim();
      if (!sourceText) continue;
      try {
        const r: any = await api.post("/admin/translations/translate", {
          text: sourceText,
          target_locale: locale,
          source_locale: "en"
        });
        const translated = r?.translated_text;
        if (translated) {
          results.push({
            field: field.key,
            text: translated
          });
          setTranslations(prev => ({
            ...prev,
            [`${locale}:${field.key}`]: translated
          }));
        }
      } catch (e) {
        console.error(e);
      }
    }
    for (const r of results) {
      await upsertTranslation(r.field, locale, (form[r.field] || "").trim(), r.text);
    }
    setMsg(results.length > 0 ? `Regenerated ${results.length} ${locale.toUpperCase()} translations & saved` : "No translatable content found");
    setTimeout(() => setMsg(""), 2500);
    setRegenerating("");
  };
  const handleSaveTranslations = async (locale: string) => {
    setSaving(true);
    for (const field of TRANSLATABLE_FIELDS) {
      const trKey = `${locale}:${field.key}`;
      const text = translations[trKey] || "";
      if (text.trim()) {
        await upsertTranslation(field.key, locale, form[field.key] || "", text);
      }
    }
    setMsg(`All ${locale.toUpperCase()} translations saved`);
    setTimeout(() => setMsg(""), 2000);
    setSaving(false);
  };
  if (loading) return <div style={{
    padding: 32
  }}><p>{t("rewards_[id].loading")}</p></div>;
  if (!reward) return <div style={{
    padding: 32
  }}><p>{t("rewards_[id].reward_not_found")}</p></div>;
  return <div style={{
    padding: 32
  }}>
      <div style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: 20
    }}>
        <button type="button" onClick={() => router.push("/rewards")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button>
        <div>
          <h1 className="page-title" style={{
          margin: 0
        }}>{reward.reward_name}</h1>
          <p className="page-subtitle" style={{
          marginTop: 2
        }}>{t("rewards_[id].edit_reward_details_translations")}</p>
        </div>
      </div>
      {msg && <div className="alert alert-success" style={{
      marginBottom: 12
    }}>{msg}</div>}

      {/* Language Tabs */}
      <div style={{
      display: "flex",
      gap: 4,
      marginBottom: 20,
      borderBottom: "2px solid var(--color-border-light)",
      paddingBottom: 0
    }}>
        {LOCALES.map(loc => <button type="button" key={loc.code} onClick={() => setActiveLocale(loc.code)} style={{
        padding: "10px 20px",
        fontSize: 13,
        fontWeight: activeLocale === loc.code ? 700 : 400,
        border: "none",
        borderBottom: activeLocale === loc.code ? "3px solid var(--color-primary)" : "3px solid transparent",
        background: activeLocale === loc.code ? "rgba(59,74,26,0.05)" : "transparent",
        cursor: "pointer",
        color: activeLocale === loc.code ? "var(--color-primary)" : "var(--color-text-muted)",
        borderRadius: "4px 4px 0 0"
      }}>{loc.flag} {loc.label}</button>)}
      </div>

      {/* English Tab — All Fields */}
      {activeLocale === "en" && <div className="card" style={{
      padding: 24,
      maxWidth: 700
    }}>
          <h3 style={{
        marginBottom: 20
      }}>{t("rewards_[id].english_source_content")}</h3>
          <div className="df-grid">
            <div className="df-field">
              <label className="df-label">{t("rewards_[id].name")}</label>
              <input required value={form.reward_name} onChange={e => setForm({
            ...form,
            reward_name: e.target.value
          })} />
            </div>
            <div className="df-field">
              <label className="df-label">{t("rewards_[id].identifier")}</label>
              <input value={form.reward_key} onChange={e => setForm({
            ...form,
            reward_key: e.target.value
          })} />
              <div className="df-hint">{t("rewards_[id].auto_generated_from_name")}</div>
            </div>
            <div className="df-field">
              <label className="df-label">{t("rewards_[id].points_cost")}</label>
              <input type="number" required value={form.points_cost} onChange={e => setForm({
            ...form,
            points_cost: Number(e.target.value)
          })} />
            </div>
            <div className="df-field">
              <label className="df-label">{t("rewards_[id].type")}</label>
              <select value={form.reward_type} onChange={e => setForm({
            ...form,
            reward_type: e.target.value
          })}>
                <option value="free_item">{t("rewards_[id].free_item")}</option>
                <option value="percentage_discount">{t("rewards_[id].discount")}</option>
                <option value="fixed_discount">{t("rewards_[id].fixed_discount")}</option>
                <option value="free_delivery">{t("rewards_[id].free_delivery")}</option>
              </select>
            </div>
            {(form.reward_type === "percentage_discount" || form.reward_type === "fixed_discount") && <>
              <div className="df-field">
                <label className="df-label">{form.reward_type === "percentage_discount" ? "Discount %" : `Discount (${symbol})`}</label>
                <input type="number" step={form.reward_type === "percentage_discount" ? "1" : "0.01"} min="0" value={form.discount_value} onChange={e => setForm({
              ...form,
              discount_value: Number(e.target.value)
            })} />
                {form.reward_type === "percentage_discount" && <div className="df-hint">{t("rewards_[id].e_g_enter_10_for_10")}</div>}
              </div>
              <div className="df-field">
                <label className="df-label">{`Max Discount Cap (${symbol})`}</label>
                <input type="number" step="0.01" min="0" value={form.discount_max_amount} onChange={e => setForm({
              ...form,
              discount_max_amount: Number(e.target.value)
            })} />
                <div className="df-hint">{t("rewards_[id].optional_cap_the_total_discount")}</div>
              </div>
            </>}
            <div className="df-field">
              <label className="df-label">{`Min Order Value (${symbol})`}</label>
              <input type="number" step="0.01" value={form.minimum_order_value} onChange={e => setForm({
            ...form,
            minimum_order_value: Number(e.target.value)
          })} />
            </div>
            <div className="df-field">
              <label className="df-label">{t("rewards_[id].validity_days")}</label>
              <input type="number" value={form.validity_days} onChange={e => setForm({
            ...form,
            validity_days: Number(e.target.value)
          })} />
            </div>
            <div className="df-field">
              <label className="df-label">{t("rewards_[id].position")}</label>
              <input type="number" value={form.position} onChange={e => setForm({
            ...form,
            position: Number(e.target.value)
          })} />
              <div className="df-hint">{t("rewards_[id].sort_order_lower_first")}</div>
            </div>
            <div className="df-field" style={{
          gridColumn: "1/-1"
        }}>
              <label className="df-label">{t("rewards_[id].short_description")}</label>
              <input value={form.short_description} onChange={e => setForm({
            ...form,
            short_description: e.target.value
          })} placeholder={t("rewards_[id].brief_summary_shown_in_list")} />
            </div>
            <div className="df-field" style={{
          gridColumn: "1/-1"
        }}>
              <label className="df-label">{t("rewards_[id].full_description")}</label>
              <textarea rows={3} value={form.long_description} onChange={e => setForm({
            ...form,
            long_description: e.target.value
          })} placeholder={t("rewards_[id].full_detail_description")} />
            </div>
            <div className="df-field" style={{
          gridColumn: "1/-1"
        }}>
              <label className="df-label">{t("rewards_[id].how_to_redeem")}</label>
              <textarea rows={2} value={form.how_to_redeem} onChange={e => setForm({
            ...form,
            how_to_redeem: e.target.value
          })} placeholder={t("rewards_[id].instructions_for_the_customer")} />
            </div>
            <div className="df-field" style={{
          gridColumn: "1/-1"
        }}>
              <label className="df-label">{t("rewards_[id].terms_conditions")}</label>
              <textarea rows={2} value={form.terms_and_conditions} onChange={e => setForm({
            ...form,
            terms_and_conditions: e.target.value
          })} placeholder={t("rewards_[id].legal_terms")} />
            </div>
            <div className="df-field" style={{
          gridColumn: "1/-1"
        }}>
              <label className="df-label">{t("rewards_[id].image")}</label>
              <div style={{
            display: "flex",
            gap: 12,
            alignItems: "center"
          }}>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleUpload} style={{
              display: "none"
            }} />
                <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-sm btn-outline" disabled={uploading}>
                  <Upload size={14} /> {uploading ? "Uploading..." : "Upload Image"}
                </button>
                {imagePreview && <div style={{
              display: "flex",
              gap: 8,
              alignItems: "center"
            }}>
                    <img src={imagePreview} alt="" style={{
                width: 48,
                height: 48,
                borderRadius: 6,
                objectFit: "cover"
              }} />
                    <button type="button" onClick={() => {
                setForm({
                  ...form,
                  image_url: ""
                });
                setImagePreview("");
              }} className="btn btn-ghost btn-sm" style={{
                color: "var(--error)"
              }}>{t("rewards_[id].clear")}</button>
                  </div>}
              </div>
            </div>
            <GalleryUpload imageUrls={form.image_gallery_urls || []} videoUrl={form.gallery_video_url || ""} onImagesChange={urls => setForm({
          ...form,
          image_gallery_urls: urls
        })} onVideoChange={url => setForm({
          ...form,
          gallery_video_url: url
        })} disabled={uploading} />
            <div className="df-field">
              <label className="df-label" style={{
            display: "flex",
            alignItems: "center",
            gap: 8
          }}>
                <input type="checkbox" checked={form.is_active} onChange={e => setForm({
              ...form,
              is_active: e.target.checked
            })} />{t("rewards_[id].active")}</label>
            </div>
            <div className="df-field" style={{
          gridColumn: "1/-1"
        }}>
              <label className="df-label">{t("rewards_[id].target_customer_segments")}</label>
              <div style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6
          }}>
                {allSegments.map(seg => {
              const isSel = (form.customer_segments || []).includes(seg.value);
              return <button type="button" key={seg.value} onClick={() => {
                const arr = form.customer_segments || [];
                setForm({
                  ...form,
                  customer_segments: isSel ? arr.filter((x: string) => x !== seg.value) : [...arr, seg.value]
                });
              }} style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "4px 12px",
                borderRadius: "var(--radius-full)",
                fontSize: 12,
                fontWeight: 500,
                cursor: "pointer",
                border: isSel ? "2px solid var(--color-primary)" : "1px solid var(--color-border-light)",
                background: isSel ? "rgba(59,74,26,0.08)" : "var(--color-bg-white)",
                color: isSel ? "var(--color-primary)" : "var(--color-text-muted)"
              }}>{isSel && "✓ "}{seg.label}</button>;
            })}
              </div>
              <div className="df-hint">{t("rewards_[id].leave_empty_for_all_customers")}</div>
            </div>
          </div>
           <div className="df-actions" style={{
        marginTop: 20
      }}>
             <button type="button" onClick={() => router.push("/rewards")} className="btn btn-ghost">{t("rewards_[id].cancel")}</button>
             <button type="button" onClick={handleSave} disabled={saving} className="btn btn-primary"><Save size={16} /> {saving ? "Saving..." : "Save Changes"}</button>
           </div>
        </div>}

      {/* Translation Tabs — MS, ZH, TA, TR */}
      {activeLocale !== "en" && <div className="card" style={{
      padding: 24,
      maxWidth: 720
    }}>
          <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 20
      }}>
            <h3 style={{
          margin: 0,
          fontSize: 16
        }}>
              {LOCALES.find(l => l.code === activeLocale)?.flag} {LOCALES.find(l => l.code === activeLocale)?.label}{t("rewards_[id].translation")}</h3>
            <button type="button" onClick={() => handleRegenerateAll(activeLocale)} disabled={!!regenerating} className="btn btn-primary btn-sm" style={{
          fontSize: 12,
          padding: "8px 16px"
        }}>
              <RefreshCw size={14} /> {regenerating === "all" ? "Generating..." : "Regenerate All"}
            </button>
          </div>
          <div className="df-grid">
            {TRANSLATABLE_FIELDS.map(field => {
          const {
            t
          } = useTranslation();
          const trKey = `${activeLocale}:${field.key}`;
          const translation = translations[trKey] || "";
          const sourceText = form[field.key] || "";
          const isLong = field.key === "long_description" || field.key === "how_to_redeem" || field.key === "terms_and_conditions";
          return <div className="df-field" key={field.key} style={isLong ? {
            gridColumn: "1/-1"
          } : {}}>
                  <label style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--color-text-muted)",
              display: "flex",
              justifyContent: "space-between"
            }}>
                    <span>{field.label}</span>
                    <span style={{
                fontWeight: 400,
                fontStyle: "italic"
              }}>{t("rewards_[id].en")}{sourceText?.slice(0, 30) || "—"}</span>
                  </label>
                  {isLong ? <textarea rows={3} value={translation} onChange={e => setTranslations(prev => ({
              ...prev,
              [trKey]: e.target.value
            }))} style={{
              width: "100%",
              padding: "8px 10px",
              fontSize: 13,
              border: translation ? "1px solid var(--color-border-light)" : "2px solid #FCD34D",
              borderRadius: "var(--radius-sm)",
              background: translation ? "var(--color-bg-white)" : "#FFFBEB"
            }} placeholder={translation ? "" : "—"} /> : <input value={translation} onChange={e => setTranslations(prev => ({
              ...prev,
              [trKey]: e.target.value
            }))} style={{
              width: "100%",
              padding: "8px 10px",
              fontSize: 13,
              border: translation ? "1px solid var(--color-border-light)" : "2px solid #FCD34D",
              borderRadius: "var(--radius-sm)",
              background: translation ? "var(--color-bg-white)" : "#FFFBEB"
            }} placeholder={translation ? "" : "—"} />}
                </div>;
        })}
          </div>
          <div style={{
        marginTop: 20
      }}>
            <button type="button" onClick={() => handleSaveTranslations(activeLocale)} disabled={saving} className="btn btn-primary" style={{
          fontSize: 13,
          padding: "10px 24px"
        }}>
              <Save size={16} />{t("rewards_[id].save_all_translations")}</button>
          </div>
        </div>}
    </div>;
}