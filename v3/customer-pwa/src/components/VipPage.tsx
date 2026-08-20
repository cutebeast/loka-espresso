"use client";

import { useMemo } from "react";
import { ArrowLeft, Gift, TrendingUp, ChevronRight } from "lucide-react";
import { useTranslation } from "@/hooks/useTranslation";
import { useUIStore } from "@/stores/uiStore";
import { useWalletStore } from "@/stores/walletStore";
import { GuestGate } from "@/components/auth/GuestGate";
import { useConfigStore } from "@/stores/configStore";
import { TierInfo } from "@/lib/api";

const TIER_COLORS: Record<string, string> = {
  bloom: "#4CAF50",
  origin: "#FF9800",
  reserve: "#9C27B0",
};

interface BenefitRow {
  key: string;
  labelKey: string;
  tiers: Array<{ tier: TierInfo; enabled: boolean; text?: string }>;
}

/**
 * Membership tiers page — the dedicated VIP screen (Bloom / Origin / Reserve).
 * Shows the current tier with progress to the next milestone, the milestone
 * rail, and the admin-configured benefits comparison table. This is the page
 * the dashboard's tier card links to (de-crammed from the home feed).
 */
export default function VipPage() {
  const { t } = useTranslation();
  const { setPage } = useUIStore();
  const { lifetimePoints, tier } = useWalletStore();
  const tiers = useConfigStore(s => s.tiers);

  const sortedTiers = useMemo(() => [...tiers].sort((a, b) => a.min_points - b.min_points), [tiers]);

  const currentTierKey = (tier || "bloom").toLowerCase();
  const currentIdx = useMemo(() => {
    const idx = sortedTiers.findIndex(tier => tier.name.toLowerCase() === currentTierKey);
    return idx >= 0 ? idx : 0;
  }, [sortedTiers, currentTierKey]);

  const current = sortedTiers[currentIdx];
  const next = sortedTiers[currentIdx + 1] ?? null;

  const progress = useMemo(() => {
    if (!current) return 0;
    if (!next) return 100;
    const span = next.min_points - current.min_points;
    if (span <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round(((lifetimePoints - current.min_points) / span) * 100)));
  }, [current, next, lifetimePoints]);

  const benefitRows = useMemo<BenefitRow[]>(() => {
    const defs: Array<{ key: string; labelKey: string; kind: "bool" | "fixed" | "percent" | "points" }> = [
      { key: "free_delivery", labelKey: "vip.benefit_free_delivery", kind: "bool" },
      { key: "priority_seating", labelKey: "vip.benefit_priority_seating", kind: "bool" },
      { key: "vip_event_access", labelKey: "vip.benefit_vip_event", kind: "bool" },
      { key: "monthly_free_item", labelKey: "vip.benefit_monthly_free_item", kind: "bool" },
      { key: "exclusive_menu_access", labelKey: "vip.benefit_exclusive_menu", kind: "bool" },
      { key: "complimentary_upgrades", labelKey: "vip.benefit_upgrades", kind: "bool" },
      { key: "birthday_reward_enabled", labelKey: "vip.benefit_birthday", kind: "bool" },
      { key: "order_discount_fixed", labelKey: "vip.benefit_order_discount", kind: "fixed" },
      { key: "order_discount_percent", labelKey: "vip.benefit_order_discount_pct", kind: "percent" },
      { key: "welcome_bonus_points", labelKey: "vip.benefit_welcome_points", kind: "points" },
    ];
    return defs.map(def => ({
      key: def.key,
      labelKey: def.labelKey,
      tiers: sortedTiers.map((tier): { tier: TierInfo; enabled: boolean; text?: string } => {
        const cfg = (tier.benefits as Record<string, unknown> | null) || {};
        const raw = cfg[def.key];
        if (def.kind === "bool") return { tier, enabled: raw === true };
        if (def.kind === "fixed") return { tier, enabled: typeof raw === "number" && raw > 0, text: raw ? `RM ${Number(raw).toFixed(0)}` : undefined };
        if (def.kind === "percent") return { tier, enabled: typeof raw === "number" && raw > 0, text: raw ? `${Number(raw).toFixed(0)}%` : undefined };
        return { tier, enabled: typeof raw === "number" && raw > 0, text: raw ? `${Number(raw)}` : undefined };
      }),
    }));
  }, [sortedTiers]);

  if (!current) {
    // Tiers come from the authed app-data load — guests never receive them, so
    // without this gate the page sat on "Loading…" forever (round-40 crawl).
    return (
      <div style={{ padding: 40, textAlign: "center" }}>
        <GuestGate message={t("profile.guestMessage")}><div /></GuestGate>
      </div>
    );
  }

  const color = TIER_COLORS[current.name.toLowerCase()] || "#4CAF50";

  return (
    <div style={{
      maxWidth: 480, margin: "0 auto", minHeight: "100vh",
      background: "var(--color-bg, #FAFAF8)", color: "var(--color-text-primary, #1E1B18)",
      display: "flex", flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, padding: "14px 16px",
        background: "var(--color-bg-white, #fff)", borderBottom: "1px solid var(--color-hair, #E8E6E0)",
      }}>
        <button onClick={() => setPage("profile")} aria-label={t("common.back")} style={{
          background: "none", border: "none", cursor: "pointer", color: "inherit",
          display: "flex", padding: 6,
        }}>
          <ArrowLeft size={20} />
        </button>
        <h1 style={{ fontSize: 16, fontWeight: 700 }}>{t("vip.title")}</h1>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px 24px" }}>
        <GuestGate message={t("profile.guestMessage")}>
        {/* Current tier hero */}
        <div style={{
          marginTop: 14, borderRadius: 12, padding: 16,
          border: "1px solid var(--color-hair, #E8E6E0)",
          background: "var(--color-bg-white, #fff)",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 15 }}>
              <span style={{ width: 11, height: 11, borderRadius: "50%", background: color, display: "inline-block" }} />
              {current.name}
            </span>
            <span style={{
              display: "inline-flex", alignItems: "center", gap: 4,
              background: "var(--color-primary-50, #F5F7F0)", color: "var(--color-primary, #3B4A1A)",
              fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 999,
            }}>
              <TrendingUp size={12} />
              ×{Number(current.points_multiplier).toFixed(1)} {t("vip.multiplier")}
            </span>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--color-text-muted, #8A8078)", marginTop: 8 }}>
            {t("vip.lifetimePoints")}: <b style={{ color: "inherit" }}>{lifetimePoints.toLocaleString()}</b>
            {next ? ` · ${t("vip.pointsToNext", { count: next.min_points - lifetimePoints, tier: next.name })}` : ` · ${t("vip.topTier")}`}
          </div>
          <div style={{ height: 7, background: "var(--color-hair-2, #EFEEE9)", borderRadius: 4, marginTop: 10, overflow: "hidden" }}>
            <div style={{ width: `${progress}%`, height: 7, background: "var(--color-primary, #3B4A1A)", borderRadius: 4 }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--color-text-muted, #8A8078)", marginTop: 5, fontWeight: 600 }}>
            {sortedTiers.map(tier => (
              <span key={tier.id} style={{ color: tier.name === current.name ? color : undefined }}>{tier.name}</span>
            ))}
          </div>
        </div>

        {/* Milestone rail */}
        <div style={{
          marginTop: 14, borderRadius: 12, padding: 16,
          border: "1px solid var(--color-hair, #E8E6E0)",
          background: "var(--color-bg-white, #fff)",
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>{t("vip.milestones")}</div>
          <div style={{ display: "flex", alignItems: "flex-start", position: "relative" }}>
            <div style={{
              position: "absolute", top: 7, left: "12%", right: "12%",
              height: 3, background: "var(--color-hair-2, #EFEEE9)", borderRadius: 2,
            }} />
            {sortedTiers.map((tier) => {
              const reached = lifetimePoints >= tier.min_points;
              const isCurrent = tier.name === current.name;
              const tc = TIER_COLORS[tier.name.toLowerCase()] || "#4CAF50";
              return (
                <div key={tier.id} style={{ flex: 1, textAlign: "center", position: "relative", zIndex: 1 }}>
                  <div style={{
                    width: 16, height: 16, borderRadius: "50%", margin: "0 auto",
                    background: reached || isCurrent ? tc : "var(--color-hair-2, #EFEEE9)",
                    boxShadow: isCurrent ? `0 0 0 3px var(--color-bg-white, #fff), 0 0 0 5px ${tc}` : undefined,
                  }} />
                  <div style={{ fontSize: 11, fontWeight: isCurrent ? 800 : 600, marginTop: 6, color: isCurrent ? tc : undefined }}>
                    {tier.name}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--color-text-muted, #8A8078)", marginTop: 2 }}>
                    {tier.min_points.toLocaleString()} {t("common.pointsAbbr")}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Benefits comparison */}
        <div style={{
          marginTop: 14, borderRadius: 12, overflow: "hidden",
          border: "1px solid var(--color-hair, #E8E6E0)",
          background: "var(--color-bg-white, #fff)",
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, padding: 14, borderBottom: "1px solid var(--color-hair, #E8E6E0)" }}>
            {t("vip.benefits")}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `1fr repeat(${sortedTiers.length}, 74px)`, fontSize: 11 }}>
            <div />
            {sortedTiers.map(tier => (
              <div key={tier.id} style={{
                textAlign: "center", padding: "8px 4px", fontWeight: 700,
                color: TIER_COLORS[tier.name.toLowerCase()] || undefined,
              }}>
                {tier.name}
              </div>
            ))}
            {benefitRows.map(row => (
              <BenefitRowCells key={row.key} row={row} currentTierName={current.name} />
            ))}
          </div>
        </div>

        {/* CTA */}
        <button onClick={() => setPage("my-rewards")} style={{
          width: "100%", marginTop: 14, padding: "13px 16px", borderRadius: 10,
          background: "var(--color-primary, #3B4A1A)", color: "#fff",
          border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
          <Gift size={16} />
          {t("vip.earnMore")}
          <ChevronRight size={16} />
        </button>
        </GuestGate>
      </div>
    </div>
  );
}

function BenefitRowCells({ row, currentTierName }: { row: BenefitRow; currentTierName: string }) {
  const { t } = useTranslation();
  return (
    <>
      <div style={{
        padding: "10px 10px", borderTop: "1px solid var(--color-hair-2, #EFEEE9)",
        fontSize: 11.5, fontWeight: 600, display: "flex", alignItems: "center", gap: 6,
        color: "var(--color-text-secondary, #4A4038)",
      }}>
        {t(row.labelKey)}
      </div>
      {row.tiers.map(({ tier, enabled, text }) => (
        <div key={tier.id} style={{
          borderTop: "1px solid var(--color-hair-2, #EFEEE9)",
          textAlign: "center", padding: "10px 4px",
          color: enabled ? "var(--color-success, #3E7A3E)" : "var(--color-text-muted, #8A8078)",
          fontWeight: enabled ? 700 : 500,
          background: tier.name === currentTierName ? "var(--color-primary-50, #F5F7F0)" : undefined,
        }}>
          {enabled ? (text || "✓") : "—"}
        </div>
      ))}
    </>
  );
}
