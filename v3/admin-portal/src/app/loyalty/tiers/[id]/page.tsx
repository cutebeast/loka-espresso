"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save, RefreshCw, Cake, Truck, Crown, Star, Coffee, Ticket, Sparkles } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";
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
const F = [{
  key: "display_name",
  label: "Tier Name"
}];
const DEFAULT_BENEFITS = {
  order_discount_percent: 0,
  order_discount_fixed: 0,
  birthday_reward_enabled: false,
  birthday_reward_description: "",
  welcome_bonus_points: 0,
  free_delivery: false,
  priority_seating: false,
  exclusive_menu_access: false,
  monthly_free_item: false,
  vip_event_access: false,
  complimentary_upgrades: false
};
function BenefitSwitch({
  label,
  icon: Icon,
  checked,
  onChange
}: {
  label: string;
  icon: any;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return <label style={{
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--color-border-light)",
    cursor: "pointer",
    background: checked ? "rgba(59,74,26,0.04)" : "var(--color-bg-white)"
  }}>
      <Icon size={18} color={checked ? "var(--color-primary)" : "var(--color-text-muted)"} />
      <span style={{
      flex: 1,
      fontSize: 13,
      fontWeight: 500
    }}>{label}</span>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} style={{
      width: 18,
      height: 18,
      accentColor: "var(--color-primary)"
    }} />
    </label>;
}
function BenefitNumber({
  label,
  value,
  onChange,
  suffix,
  min = 0,
  max,
  step = 1
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  return <div style={{
    padding: "10px 12px",
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--color-border-light)",
    background: "var(--color-bg-white)"
  }}>
      <div style={{
      fontSize: 12,
      fontWeight: 600,
      color: "var(--color-text-muted)",
      marginBottom: 6
    }}>{label}</div>
      <div style={{
      display: "flex",
      alignItems: "center",
      gap: 6
    }}>
        <input type="number" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} style={{
        width: 80,
        padding: "6px 8px",
        fontSize: 13,
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--color-border-light)"
      }} />
        {suffix && <span style={{
        fontSize: 12,
        color: "var(--color-text-muted)"
      }}>{suffix}</span>}
      </div>
    </div>;
}
export default function TierEditPage() {
  const {
    t
  } = useTranslation();
  const {
    symbol
  } = useCurrency();
  const p = useParams();
  const r = useRouter();
  const id = p.id as string;
  const [form, setForm] = useState<Record<string, any>>({});
  const [benefits, setBenefits] = useState<Record<string, any>>({
    ...DEFAULT_BENEFITS
  });
  const [loading, setLoading] = useState(true);
  const [loc, setLoc] = useState("en");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [regen, setRegen] = useState(false);
  const [tr, setTr] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    try {
      const d = await api.getRaw<any>(`/admin/loyalty/tiers/${id}`);
      setForm({
        display_name: d.display_name || "",
        tier_key: d.tier_key || "",
        color_hex: d.color_hex || "#FFD700",
        min_lifetime_points: d.min_lifetime_points,
        points_multiplier: d.points_multiplier,
        sort_order: d.sort_order,
        is_active: d.is_active
      });
      const bc = d.benefits_config || {};
      setBenefits({
        order_discount_percent: bc.order_discount_percent || 0,
        order_discount_fixed: bc.order_discount_fixed || 0,
        birthday_reward_enabled: !!bc.birthday_reward_enabled,
        birthday_reward_description: bc.birthday_reward_description || "",
        welcome_bonus_points: bc.welcome_bonus_points || 0,
        free_delivery: !!bc.free_delivery,
        priority_seating: !!bc.priority_seating,
        exclusive_menu_access: !!bc.exclusive_menu_access,
        monthly_free_item: !!bc.monthly_free_item,
        vip_event_access: !!bc.vip_event_access,
        complimentary_upgrades: !!bc.complimentary_upgrades
      });
      const x: Record<string, string> = {};
      for (const lc of L) {
        if (lc.code === "en") continue;
        try {
          const rt = await api.getRaw<any>(`/admin/translations?table_name=loyalty_tiers&record_id=${id}&locale=${lc.code}&per_page=10`);
          if (rt?.items) for (const t of rt.items) {
            const fk = t.translation_key.split(".").pop() || "";
            x[`${lc.code}:${fk}`] = t.translated_text || "";
          }
        } catch (e) {
          console.error(e);
        }
      }
      setTr(x);
    } catch (e) {
      console.error(e);
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
      const pl: any = {
        ...form
      };
      pl.min_lifetime_points = Number(pl.min_lifetime_points);
      pl.points_multiplier = Number(pl.points_multiplier);
      pl.sort_order = Number(pl.sort_order);
      pl.benefits_config = {
        order_discount_percent: Number(benefits.order_discount_percent) || 0,
        order_discount_fixed: Number(benefits.order_discount_fixed) || 0,
        birthday_reward_enabled: !!benefits.birthday_reward_enabled,
        birthday_reward_description: benefits.birthday_reward_description || "",
        welcome_bonus_points: Number(benefits.welcome_bonus_points) || 0,
        free_delivery: !!benefits.free_delivery,
        priority_seating: !!benefits.priority_seating,
        exclusive_menu_access: !!benefits.exclusive_menu_access,
        monthly_free_item: !!benefits.monthly_free_item,
        vip_event_access: !!benefits.vip_event_access,
        complimentary_upgrades: !!benefits.complimentary_upgrades
      };
      await api.put(`/admin/loyalty/tiers/${id}`, pl);
      setMsg("Saved");
      setTimeout(() => setMsg(""), 2000);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };
  const upsert = async (field: string, locale: string, src: string, text: string) => {
    const rt = await api.getRaw<any>(`/admin/translations?table_name=loyalty_tiers&record_id=${id}&column_name=${field}&locale=${locale}&per_page=1`);
    const ex = rt?.items?.[0];
    if (ex) await api.put(`/admin/translations/${ex.id}`, {
      translated_text: text
    });else await api.post("/admin/translations", {
      translation_key: `loyalty_tiers.${id}.${field}`,
      locale,
      namespace: "loyalty",
      translated_text: text,
      source_text: src,
      table_name: "loyalty_tiers",
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
      } catch (e) {
        console.error(e);
      }
    }
    setMsg(`Regenerated ${c}`);
    setTimeout(() => setMsg(""), 2500);
    setRegen(false);
  };
  const saveAll = async () => {
    for (const f of F) {
      const t = tr[`${loc}:${f.key}`] || "";
      if (t) await upsert(f.key, loc, (form[f.key] || "").trim(), t);
    }
    setMsg("Saved");
    setTimeout(() => setMsg(""), 2000);
  };
  const updateBenefit = (key: string, value: any) => setBenefits(prev => ({
    ...prev,
    [key]: value
  }));
  if (loading) return <div style={{
    padding: 32
  }}>{t("loyalty_tiers_[id].loading")}</div>;
  return <div style={{
    padding: 32
  }}>
      <div style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: 20
    }}><button onClick={() => r.push("/loyalty/tiers")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button><div><h1 className="page-title" style={{
          margin: 0
        }}>{form.display_name || "Tier"}</h1></div></div>
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

      {loc === "en" ? <>
          <div className="card" style={{
        padding: 24,
        maxWidth: 720,
        marginBottom: 20
      }}>
            <h3 style={{
          margin: "0 0 16px",
          fontSize: 14,
          fontWeight: 700,
          textTransform: "uppercase",
          color: "var(--color-text-muted)",
          borderBottom: "1px solid var(--color-border-light)",
          paddingBottom: 8
        }}>{t("loyalty_tiers_[id].basic_info")}</h3>
            <div className="df-grid">
              <div className="df-field"><label className="form-label">{t("loyalty_tiers_[id].display_name")}</label><input className="w-full border rounded px-3 py-2 text-sm" value={form.display_name || ""} onChange={e => setForm({
              ...form,
              display_name: e.target.value
            })} /></div>
              <div className="df-field"><label className="form-label">{t("loyalty_tiers_[id].key")}</label><input className="w-full border rounded px-3 py-2 text-sm" value={form.tier_key || ""} onChange={e => setForm({
              ...form,
              tier_key: e.target.value
            })} /></div>
              <div className="df-field"><label className="form-label">{t("loyalty_tiers_[id].min_points")}</label><input type="number" className="w-full border rounded px-3 py-2 text-sm" value={form.min_lifetime_points ?? ""} onChange={e => setForm({
              ...form,
              min_lifetime_points: e.target.value
            })} /></div>
              <div className="df-field"><label className="form-label">{t("loyalty_tiers_[id].multiplier")}</label><input type="number" step="0.1" className="w-full border rounded px-3 py-2 text-sm" value={form.points_multiplier ?? ""} onChange={e => setForm({
              ...form,
              points_multiplier: e.target.value
            })} /></div>
              <div className="df-field"><label className="form-label">{t("loyalty_tiers_[id].sort_order")}</label><input type="number" className="w-full border rounded px-3 py-2 text-sm" value={form.sort_order ?? ""} onChange={e => setForm({
              ...form,
              sort_order: e.target.value
            })} /></div>
              <div className="df-field"><label className="form-label">{t("loyalty_tiers_[id].color")}</label><div style={{
              display: "flex",
              alignItems: "center",
              gap: 8
            }}><input type="color" value={form.color_hex || "#FFD700"} onChange={e => setForm({
                ...form,
                color_hex: e.target.value
              })} style={{
                width: 40,
                height: 36,
                border: "none",
                cursor: "pointer"
              }} /><input className="border rounded px-3 py-2 text-sm" style={{
                flex: 1
              }} value={form.color_hex || ""} onChange={e => setForm({
                ...form,
                color_hex: e.target.value
              })} /></div></div>
              <div className="df-field"><label style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13
            }}><input type="checkbox" checked={!!form.is_active} onChange={e => setForm({
                ...form,
                is_active: e.target.checked
              })} />{t("loyalty_tiers_[id].active")}</label></div>
            </div>
          </div>

          <div className="card" style={{
        padding: 24,
        maxWidth: 720,
        marginBottom: 20
      }}>
            <h3 style={{
          margin: "0 0 16px",
          fontSize: 14,
          fontWeight: 700,
          textTransform: "uppercase",
          color: "var(--color-text-muted)",
          borderBottom: "1px solid var(--color-border-light)",
          paddingBottom: 8
        }}>{t("loyalty_tiers_[id].benefits_perks")}</h3>

            <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 10,
          marginBottom: 16
        }}>
              <BenefitNumber label={t("loyalty_tiers_[id].order_discount")} value={benefits.order_discount_percent} onChange={v => updateBenefit("order_discount_percent", v)} suffix="%" max={100} />
              <BenefitNumber label={t("loyalty_tiers_[id].order_discount_fixed")} value={benefits.order_discount_fixed} onChange={v => updateBenefit("order_discount_fixed", v)} suffix={symbol} step={0.5} />
              <BenefitNumber label={t("loyalty_tiers_[id].welcome_bonus_points")} value={benefits.welcome_bonus_points} onChange={v => updateBenefit("welcome_bonus_points", v)} suffix="pts" />
            </div>

            {benefits.birthday_reward_enabled && <div style={{
          marginBottom: 12
        }}>
                <label style={{
            fontSize: 12,
            fontWeight: 600,
            color: "var(--color-text-muted)",
            display: "block",
            marginBottom: 4
          }}>{t("loyalty_tiers_[id].birthday_reward_description")}</label>
                <input type="text" value={benefits.birthday_reward_description || ""} onChange={e => updateBenefit("birthday_reward_description", e.target.value)} placeholder={t("loyalty_tiers_[id].e_g_free_slice_of_cake")} className="w-full border rounded px-3 py-2 text-sm" style={{
            maxWidth: 400
          }} />
              </div>}

            <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 10
        }}>
              <BenefitSwitch label={t("loyalty_tiers_[id].birthday_reward")} icon={Cake} checked={benefits.birthday_reward_enabled} onChange={v => updateBenefit("birthday_reward_enabled", v)} />
              <BenefitSwitch label={t("loyalty_tiers_[id].free_delivery")} icon={Truck} checked={benefits.free_delivery} onChange={v => updateBenefit("free_delivery", v)} />
              <BenefitSwitch label={t("loyalty_tiers_[id].priority_seating")} icon={Star} checked={benefits.priority_seating} onChange={v => updateBenefit("priority_seating", v)} />
              <BenefitSwitch label={t("loyalty_tiers_[id].exclusive_menu")} icon={Crown} checked={benefits.exclusive_menu_access} onChange={v => updateBenefit("exclusive_menu_access", v)} />
              <BenefitSwitch label={t("loyalty_tiers_[id].monthly_free_item")} icon={Coffee} checked={benefits.monthly_free_item} onChange={v => updateBenefit("monthly_free_item", v)} />
              <BenefitSwitch label={t("loyalty_tiers_[id].vip_event_access")} icon={Ticket} checked={benefits.vip_event_access} onChange={v => updateBenefit("vip_event_access", v)} />
              <BenefitSwitch label={t("loyalty_tiers_[id].complimentary_upgrades")} icon={Sparkles} checked={benefits.complimentary_upgrades} onChange={v => updateBenefit("complimentary_upgrades", v)} />
            </div>
          </div>

          <div className="df-actions" style={{
        maxWidth: 720
      }}>
            <button type="button" onClick={() => r.push("/loyalty/tiers")} className="btn btn-ghost">{t("loyalty_tiers_[id].cancel")}</button>
            <button onClick={save} disabled={saving} className="btn btn-primary"><Save size={16} />{saving ? "Saving..." : "Save"}</button>
          </div>
        </> : <div className="card" style={{
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
        }}>{L.find(l => l.code === loc)?.flag} {L.find(l => l.code === loc)?.label}{t("loyalty_tiers_[id].translation")}</h3><button onClick={regenAll} disabled={regen} className="btn btn-primary btn-sm" aria-label={t("loyalty_tiers_[id].refresh")}><RefreshCw size={14} />{regen ? "..." : "Regenerate"}</button></div>
          <div className="df-grid">{F.map(f => {
          const {
            t
          } = useTranslation();
          const k = `${loc}:${f.key}`;
          return <div className="df-field" key={f.key}><label style={{
              fontSize: 11,
              fontWeight: 600,
              color: "var(--color-text-muted)"
            }}>{f.label}<span style={{
                fontWeight: 400,
                fontStyle: "italic",
                marginLeft: 8
              }}>{t("loyalty_tiers_[id].en")}{(form[f.key] || "").slice(0, 30)}</span></label><input value={tr[k] || ""} onChange={e => setTr(p => ({
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
      }}><button onClick={saveAll} className="btn btn-primary"><Save size={16} />{t("loyalty_tiers_[id].save_translations")}</button></div>
        </div>}
    </div>;
}