"use client";

import { useTranslation } from "@/lib/i18n";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save, Truck, Crown, Star, Cake, Sparkles, Coffee, Ticket } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";
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
export default function NewTierPage() {
  const {
    t
  } = useTranslation();
  const router = useRouter();
  const {
    symbol
  } = useCurrency();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    tier_key: "",
    display_name: "",
    min_lifetime_points: 0,
    sort_order: 0,
    is_active: true,
    points_multiplier: 1.0,
    color_hex: "#6B7280"
  });
  const [benefits, setBenefits] = useState<Record<string, any>>({
    ...DEFAULT_BENEFITS
  });
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: any = {
        ...form
      };
      payload.min_lifetime_points = Number(payload.min_lifetime_points);
      payload.points_multiplier = Number(payload.points_multiplier);
      payload.sort_order = Number(payload.sort_order);
      payload.benefits_config = {
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
      const r: any = await api.post("/admin/loyalty/tiers", payload);
      const id = r?.id;
      if (id) router.push(`/loyalty/tiers/${id}`);else router.push("/loyalty/tiers");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };
  const updateBenefit = (key: string, value: any) => setBenefits(prev => ({
    ...prev,
    [key]: value
  }));
  return <div style={{
    padding: 32
  }}>
      <div style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: 20
    }}>
        <button onClick={() => router.push("/loyalty/tiers")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button>
        <h1 className="page-title" style={{
        margin: 0
      }}>{t("loyalty_tiers_new.new_loyalty_tier")}</h1>
      </div>
      {error && <div className="alert alert-error" style={{
      marginBottom: 16
    }}>{error}</div>}

      <form onSubmit={handleSubmit}>
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
        }}>{t("loyalty_tiers_new.basic_info")}</h3>
          <div className="df-grid">
            <div className="df-field"><label className="form-label">{t("loyalty_tiers_new.tier_key")}</label><input required className="w-full border rounded px-3 py-2 text-sm" value={form.tier_key} onChange={e => setForm({
              ...form,
              tier_key: e.target.value
            })} placeholder={t("loyalty_tiers_new.silver_gold_platinum")} /></div>
            <div className="df-field"><label className="form-label">{t("loyalty_tiers_new.display_name")}</label><input required className="w-full border rounded px-3 py-2 text-sm" value={form.display_name} onChange={e => setForm({
              ...form,
              display_name: e.target.value
            })} /></div>
            <div className="df-field"><label className="form-label">{t("loyalty_tiers_new.min_lifetime_points")}</label><input type="number" className="w-full border rounded px-3 py-2 text-sm" value={form.min_lifetime_points} onChange={e => setForm({
              ...form,
              min_lifetime_points: Number(e.target.value)
            })} /></div>
            <div className="df-field"><label className="form-label">{t("loyalty_tiers_new.points_multiplier")}</label><input type="number" step="0.1" className="w-full border rounded px-3 py-2 text-sm" value={form.points_multiplier} onChange={e => setForm({
              ...form,
              points_multiplier: Number(e.target.value)
            })} /></div>
            <div className="df-field"><label className="form-label">{t("loyalty_tiers_new.color")}</label><input type="color" value={form.color_hex} onChange={e => setForm({
              ...form,
              color_hex: e.target.value
            })} style={{
              width: 60,
              height: 36,
              padding: 2
            }} /></div>
            <div className="df-field"><label className="form-label">{t("loyalty_tiers_new.sort_order")}</label><input type="number" className="w-full border rounded px-3 py-2 text-sm" value={form.sort_order} onChange={e => setForm({
              ...form,
              sort_order: Number(e.target.value)
            })} /></div>
            <div className="df-field"><label style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: 13
            }}><input type="checkbox" checked={form.is_active} onChange={e => setForm({
                ...form,
                is_active: e.target.checked
              })} />{t("loyalty_tiers_new.active")}</label></div>
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
        }}>{t("loyalty_tiers_new.benefits_perks")}</h3>

          <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 10,
          marginBottom: 16
        }}>
            <BenefitNumber label={t("loyalty_tiers_new.order_discount")} value={benefits.order_discount_percent} onChange={v => updateBenefit("order_discount_percent", v)} suffix="%" max={100} />
            <BenefitNumber label={t("loyalty_tiers_new.order_discount_fixed")} value={benefits.order_discount_fixed} onChange={v => updateBenefit("order_discount_fixed", v)} suffix={symbol} step={0.5} />
            <BenefitNumber label={t("loyalty_tiers_new.welcome_bonus_points")} value={benefits.welcome_bonus_points} onChange={v => updateBenefit("welcome_bonus_points", v)} suffix="pts" />
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
          }}>{t("loyalty_tiers_new.birthday_reward_description")}</label>
              <input type="text" value={benefits.birthday_reward_description || ""} onChange={e => updateBenefit("birthday_reward_description", e.target.value)} placeholder={t("loyalty_tiers_new.e_g_free_slice_of_cake")} className="w-full border rounded px-3 py-2 text-sm" style={{
            maxWidth: 400
          }} />
            </div>}

          <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: 10
        }}>
            <BenefitSwitch label={t("loyalty_tiers_new.birthday_reward")} icon={Cake} checked={benefits.birthday_reward_enabled} onChange={v => updateBenefit("birthday_reward_enabled", v)} />
            <BenefitSwitch label={t("loyalty_tiers_new.free_delivery")} icon={Truck} checked={benefits.free_delivery} onChange={v => updateBenefit("free_delivery", v)} />
            <BenefitSwitch label={t("loyalty_tiers_new.priority_seating")} icon={Star} checked={benefits.priority_seating} onChange={v => updateBenefit("priority_seating", v)} />
            <BenefitSwitch label={t("loyalty_tiers_new.exclusive_menu")} icon={Crown} checked={benefits.exclusive_menu_access} onChange={v => updateBenefit("exclusive_menu_access", v)} />
            <BenefitSwitch label={t("loyalty_tiers_new.monthly_free_item")} icon={Coffee} checked={benefits.monthly_free_item} onChange={v => updateBenefit("monthly_free_item", v)} />
            <BenefitSwitch label={t("loyalty_tiers_new.vip_event_access")} icon={Ticket} checked={benefits.vip_event_access} onChange={v => updateBenefit("vip_event_access", v)} />
            <BenefitSwitch label={t("loyalty_tiers_new.complimentary_upgrades")} icon={Sparkles} checked={benefits.complimentary_upgrades} onChange={v => updateBenefit("complimentary_upgrades", v)} />
          </div>
        </div>

        <div className="df-actions" style={{
        maxWidth: 720
      }}>
          <button type="button" onClick={() => router.push("/loyalty/tiers")} className="btn btn-ghost">{t("loyalty_tiers_new.cancel")}</button>
          <button type="submit" disabled={saving} className="btn btn-primary"><Save size={16} /> {saving ? "Creating..." : "Create Tier"}</button>
        </div>
      </form>
    </div>;
}