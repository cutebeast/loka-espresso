"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { isNotFoundError } from "@/lib/errors";
import NotFoundState from "@/components/NotFoundState";
import { ArrowLeft, Save, RefreshCw } from "lucide-react";
const L = [{
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

export default function BundleCategoryEditPage() {
  const {
    t
  } = useTranslation();

  const F = [{
  key: "name",
  label: t("admin.form.name")
}];
  const p = useParams();
  const r = useRouter();
  const id = p.id as string;
  const [form, setForm] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loc, setLoc] = useState("en");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [regen, setRegen] = useState(false);
  const [tr, setTr] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    try {
      const d = await api.getRaw<any>(`/admin/bundle-categories/${id}`);
      setForm({
        name: d.name || "",
        slug: d.slug || "",
        display_order: d.display_order ?? 0,
        is_active: d.is_active
      });
      const x: Record<string, string> = {};
      for (const lc of L) {
        if (lc.code === "en") continue;
        try {
          const rt = await api.getRaw<any>(`/admin/translations?table_name=bundle_categories&record_id=${id}&locale=${lc.code}&per_page=10`);
          if (rt?.items) for (const t of rt.items) {
            const fk = t.translation_key.split(".").pop() || "";
            x[`${lc.code}:${fk}`] = t.translated_text || "";
          }
        } catch (e: any) {console.error(e); setMsg(e.message || t("admin.errors.loadFailed")); }
      }
      setTr(x);
    } catch (e) {
      if (isNotFoundError(e)) {
        setNotFound(true);
      } else {
        console.error(e);
      }
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    (async () => {
      load();
    })();
  }, [load]);
  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/admin/bundle-categories/${id}`, form);
      setMsg(t("admin.common.saved"));
      setTimeout(() => setMsg(""), 2000);
    } catch (e: any) {console.error(e); setMsg(e.message || t("admin.errors.loadFailed")); } finally {
      setSaving(false);
    }
  };
  const upsert = async (field: string, locale: string, src: string, text: string) => {
    const rt = await api.getRaw<any>(`/admin/translations?table_name=bundle_categories&record_id=${id}&column_name=${field}&locale=${locale}&per_page=1`);
    const ex = rt?.items?.[0];
    if (ex) await api.put(`/admin/translations/${ex.id}`, {
      translated_text: text
    });else await api.post("/admin/translations", {
      translation_key: `bundle_categories.${id}.${field}`,
      locale,
      namespace: "menu",
      translated_text: text,
      source_text: src,
      table_name: "bundle_categories",
      record_id: Number(id),
      column_name: field
    });
  };
  const regenAll = async () => {
    setRegen(true);
    let c = 0;
    for (const f of F) {
      const src = (form[f.key] || "").trim();
      if (!src) continue;
      try {
        const rt: any = await api.post("/admin/translations/translate", {
          text: src,
          target_locale: loc,
          source_locale: "en"
        });
        if (rt?.translated_text) {
          setTr(p => ({
            ...p,
            [`${loc}:${f.key}`]: rt.translated_text
          }));
          await upsert(f.key, loc, src, rt.translated_text);
          c++;
        }
      } catch (e: any) {console.error(e); setMsg(e.message || t("admin.errors.loadFailed")); }
    }
    setMsg(`Regenerated ${c}`);
    setTimeout(() => setMsg(""), 2500);
    setRegen(false);
  };
  const saveAllTr = async () => {
    for (const f of F) {
      const t = tr[`${loc}:${f.key}`] || "";
      if (t) await upsert(f.key, loc, (form[f.key] || "").trim(), t);
    }
    setMsg(t("admin.common.saved"));
    setTimeout(() => setMsg(""), 2000);
  };
  if (notFound) return <NotFoundState title={t("notFound.title", "Not Found")} message={t("notFound.message", "The requested record could not be found.")} onBack={() => r.back()} />;
  if (loading) return <div style={{
    padding: 32
  }}>{t("menu_bundle-categories_[id].loading")}</div>;
  return <div style={{
    padding: 32
  }}>
      <div style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: 20
    }}><button onClick={() => r.push("/menu/bundle-categories")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button><div><h1 className="page-title" style={{
          margin: 0
        }}>{form.name || "Category"}</h1></div></div>
      {msg && <div className="alert alert-success" style={{
      marginBottom: 12
    }}>{msg}</div>}
      <div style={{
      display: "flex",
      gap: 4,
      marginBottom: 20,
      borderBottom: "2px solid var(--color-border-light)",
      paddingBottom: 0
    }}>{L.map(lc => <button key={lc.code} onClick={() => setLoc(lc.code)} style={{
        padding: "10px 20px",
        fontSize: 13,
        fontWeight: loc === lc.code ? 700 : 400,
        border: "none",
        borderBottom: loc === lc.code ? "3px solid var(--color-primary)" : "3px solid transparent",
        background: loc === lc.code ? "rgba(59,74,26,0.05)" : "transparent",
        cursor: "pointer",
        color: loc === lc.code ? "var(--color-primary)" : "var(--color-text-muted)",
        borderRadius: "4px 4px 0 0"
      }}>{lc.flag} {lc.label}</button>)}</div>

      {loc === "en" ? <div className="card" style={{
      padding: 24,
      maxWidth: 600
    }}>
          <div className="df-grid">
            <div className="df-field"><label className="form-label">{t("menu_bundle-categories_[id].name")}</label><input value={form.name || ""} onChange={e => setForm({
            ...form,
            name: e.target.value
          })} /></div>
            <div className="df-field"><label className="form-label">{t("menu_bundle-categories_[id].slug")}</label><input value={form.slug || ""} onChange={e => setForm({
            ...form,
            slug: e.target.value
          })} /></div>
            <div className="df-field"><label className="form-label">{t("menu_bundle-categories_[id].display_order")}</label><input type="number" min="0" value={form.display_order} onChange={e => setForm({
            ...form,
            display_order: Number(e.target.value)
          })} /></div>
            <div className="df-field"><label style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            fontSize: 13
          }}><input type="checkbox" checked={!!form.is_active} onChange={e => setForm({
              ...form,
              is_active: e.target.checked
            })} />{t("menu_bundle-categories_[id].active")}</label></div>
          </div>
          <div className="df-actions" style={{
        marginTop: 16
      }}><button type="button" onClick={() => r.push("/menu/bundle-categories")} className="btn btn-ghost">{t("menu_bundle-categories_[id].cancel")}</button><button onClick={save} disabled={saving} className="btn btn-primary"><Save size={16} /> {saving ? t("admin.common.saving") : t("admin.common.save")}</button></div>
        </div> : <div className="card" style={{
      padding: 24,
      maxWidth: 600
    }}>
          <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 20
      }}><h3 style={{
          margin: 0
        }}>{L.find(l => l.code === loc)?.flag} {L.find(l => l.code === loc)?.label}{t("menu_bundle-categories_[id].translation")}</h3><button onClick={regenAll} disabled={regen} className="btn btn-primary btn-sm" aria-label={t("menu_bundle-categories_[id].refresh")}><RefreshCw size={14} /> {regen ? "..." : "Regenerate All"}</button></div>
          <div className="df-grid">{F.map(f => {
          const k = `${loc}:${f.key}`;
          return <div className="df-field" key={f.key}><label style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--color-text-muted)"
            }}>{f.label}<span style={{
                fontWeight: 400,
                fontStyle: "italic",
                marginLeft: 8
              }}>{t("menu_bundle-categories_[id].en")}{(form[f.key] || "").slice(0, 30)}</span></label><input value={tr[k] || ""} onChange={e => setTr(p => ({
              ...p,
              [k]: e.target.value
            }))} style={{
              width: "100%",
              padding: "8px 10px",
              fontSize: 13,
              border: tr[k] ? "1px solid var(--color-border-light)" : "2px solid #FCD34D",
              borderRadius: "var(--radius-sm)",
              background: tr[k] ? "var(--color-bg-white)" : "#FFFBEB"
            }} placeholder="—" /></div>;
        })}</div>
          <div style={{
        marginTop: 20
      }}><button onClick={saveAllTr} className="btn btn-primary"><Save size={16} />{t("menu_bundle-categories_[id].save_translations")}</button></div>
        </div>}
    </div>;
}
