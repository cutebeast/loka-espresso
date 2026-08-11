"use client";

import { useTranslation } from "@/hooks/useTranslation";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { usePolling } from "@/hooks/usePolling";
import { useStaffRole, canUsePOS, canUseKitchen, canUseOps, type StaffRole } from "@/hooks/useStaffRole";
import { api } from "@/lib/api";
import SkeletonCard from "@/components/SkeletonCard";
import Alert from "@/components/Alert";
import { Armchair, CreditCard, CalendarCheck, CalendarDays, Clock, UserCircle, Wallet, ChefHat, ClipboardList, Wrench, Package, AlertTriangle, Droplets, Trash2, HelpCircle, ClipboardCheck } from "lucide-react";
interface DashboardData {
  pending_orders: number;
  occupied_tables: number;
  today_reservations: number;
  clock_status: string;
  store_name: string;
  staff_name: string;
}
const ORDER_BUTTONS = [{
  key: "pos",
  labelKey: "dashboard.new_order",
  icon: CreditCard,
  badge: null,
  route: "/pos",
  cls: "home-btn--primary",
  descKey: "dashboard.pos",
  allowed: (role: string | null, isAdmin: boolean) => canUsePOS(role as StaffRole | null, isAdmin)
}, {
  key: "orders",
  labelKey: "dashboard.orders",
  icon: ClipboardList,
  badge: null,
  route: "/orders",
  cls: "",
  descKey: "dashboard.queue_history",
  allowed: () => true
}, {
  key: "kitchen",
  labelKey: "dashboard.kitchen",
  icon: ChefHat,
  badge: "pending_orders",
  route: "/kitchen",
  cls: "",
  descKey: "dashboard.kds",
  allowed: (role: string | null, isAdmin: boolean) => canUseKitchen(role as StaffRole | null, isAdmin)
}, {
  key: "tables",
  labelKey: "dashboard.tables",
  icon: Armchair,
  badge: "occupied_tables",
  route: "/tables",
  cls: "",
  descKey: "dashboard.floor",
  allowed: () => true
}, {
  key: "reservations",
  labelKey: "dashboard.bookings",
  icon: CalendarCheck,
  badge: "today_reservations",
  route: "/reservations",
  cls: "",
  descKey: "dashboard.reservations",
  allowed: () => true
}, {
  key: "wallet",
  labelKey: "dashboard.member",
  icon: Wallet,
  badge: null,
  route: "/wallet",
  cls: "",
  descKey: "dashboard.wallet_rewards",
  allowed: () => true
}];
const OPS_BUTTONS = [{
  key: "equipment",
  labelKey: "dashboard.equipment",
  icon: Wrench,
  badge: null,
  route: "/equipment",
  cls: "",
  descKey: "dashboard.maintenance",
  allowed: (role: string | null, isAdmin: boolean) => canUseOps(role as StaffRole | null, isAdmin)
}, {
  key: "grease-trap",
  labelKey: "dashboard.grease_trap",
  icon: Droplets,
  badge: null,
  route: "/grease-trap",
  cls: "",
  descKey: "dashboard.cleaning",
  allowed: () => true  // outlet-wide duty: any staff may report; supervisor/admin verifies
}, {
  key: "garbage",
  labelKey: "dashboard.garbage",
  icon: Trash2,
  badge: null,
  route: "/garbage",
  cls: "",
  descKey: "dashboard.disposal",
  allowed: () => true  // outlet-wide duty: any staff may report; supervisor/admin verifies
}, {
  key: "inventory",
  labelKey: "dashboard.inventory",
  icon: Package,
  badge: null,
  route: "/inventory",
  cls: "",
  descKey: "dashboard.stock_count",
  allowed: () => true  // outlet-wide duty: any staff may report; supervisor/admin verifies
}, {
  key: "wastage",
  labelKey: "dashboard.wastage",
  icon: AlertTriangle,
  badge: null,
  route: "/wastage",
  cls: "",
  descKey: "dashboard.report_waste",
  allowed: () => true  // outlet-wide duty: any staff may report; supervisor/admin verifies
}];
const SELF_BUTTONS = [{
  key: "clock",
  labelKey: "dashboard.clock_in",
  icon: Clock,
  badge: "clock_status",
  route: "/time-clock",
  cls: "",
  descKey: "dashboard.time_clock",
  allowed: () => true
}, {
  key: "shifts",
  labelKey: "dashboard.shifts",
  icon: CalendarDays,
  badge: null,
  route: "/shifts",
  cls: "",
  descKey: "dashboard.my_schedule",
  allowed: () => true
}, {
  key: "tasks",
  labelKey: "dashboard.tasks",
  icon: ClipboardList,
  badge: null,
  route: "/tasks",
  cls: "",
  descKey: "dashboard.to_do",
  allowed: () => true
}, {
  key: "help",
  labelKey: "header.help",
  icon: HelpCircle,
  badge: null,
  route: "/help",
  cls: "",
  descKey: "dashboard.help",
  allowed: () => true
}, {
  key: "profile",
  labelKey: "dashboard.me",
  icon: UserCircle,
  badge: null,
  route: "/profile",
  cls: "",
  descKey: "dashboard.profile",
  allowed: () => true
}];
export default function HomePage() {
  const {
    t
  } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = searchParams.get("tab") || "order";
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const {
    role,
    isAdmin
  } = useStaffRole();
  const fetchData = async () => {
    try {
      const data = await api.get<DashboardData>("/staff/dashboard");
      if (data) setData(data);
    } catch (e) {
      console.error("Dashboard fetch failed:", e);
      setError(t("dashboard.err_load_failed"));
    } finally {
      setLoading(false);
    }
  };
  usePolling(fetchData, [], {
    interval: 30000
  });
  const getBadge = (b: string | null): string | number | null => {
    if (!b || !data) return null;
    if (b === "clock_status") return data.clock_status === "in" ? t("time_clock.clock_in_label") : data.clock_status === "break" ? t("time_clock.on_break") : t("time_clock.not_clocked_in");
    return data[b as keyof DashboardData] as string | number ?? null;
  };
  return <div style={{ display: "flex", height: "100%" }}>
      {/* Sidebar */}
      <nav style={{
        display: "flex", flexDirection: "column", gap: 4, padding: "12px 8px",
        borderRight: "1px solid var(--border-light, #e5e0d5)",
        background: "var(--color-bg-card, #FFFDF8)", width: 180, flexShrink: 0,
        alignItems: "stretch",
      }}>
        {([["order", CreditCard, t("dashboard.order_management")], ["reports", ClipboardCheck, t("dashboard.reporting_checks")], ["personal", UserCircle, t("dashboard.personal")]] as const).map(([tab, Icon, label]) => (
          <button key={tab} onClick={() => router.push(`/?tab=${tab}`)} title={label}
            style={{
              display: "flex", flexDirection: "row", alignItems: "center", gap: 12,
              padding: "14px 12px", border: "none", borderRadius: 12, cursor: "pointer",
              background: activeTab === tab ? "var(--color-primary)" : "transparent",
              color: activeTab === tab ? "#fff" : "var(--color-text-muted)",
              fontSize: 14, fontWeight: 700, width: "100%", fontFamily: "inherit",
              transition: "all 0.15s",
            }}>
            <Icon size={24} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: "32px 24px", maxWidth: 960, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ marginBottom: 32, textAlign: "center" }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 4px", color: "var(--color-text-primary)" }}>
          {data?.store_name || t("common.store_name")}
        </h1>
        {data?.staff_name && <p style={{ fontSize: 14, color: "var(--color-text-muted)", margin: 0 }}>
          {t("dashboard.welcome")}{data.staff_name}
        </p>}
      </div>

      {loading ? <SkeletonCard count={4} /> : error ? <Alert variant="error" onDismiss={() => { setError(""); fetchData(); }}>{error}</Alert> : <>
        {/* Primary — POS (Order tab only) */}
        {activeTab === "order" && canUsePOS(role as StaffRole | null, isAdmin) && <button onClick={() => router.push("/pos")} style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 16,
          width: "100%", padding: "28px 24px", marginBottom: 32,
          borderRadius: 20, border: "none", cursor: "pointer",
          background: "var(--color-primary)", color: "#fff",
          boxShadow: "0 6px 24px rgba(0,0,0,0.15)", fontSize: 20, fontWeight: 800,
        }}>
          <CreditCard size={36} />
          {t("dashboard.new_order")}
          <span style={{ fontSize: 14, fontWeight: 400, opacity: 0.8 }}>— {t("dashboard.pos")}</span>
        </button>}

        {/* Order queue cards — Order tab only */}
        {activeTab === "order" && ORDER_BUTTONS.filter(btn => btn.key !== "pos").filter(btn => btn.allowed(role, isAdmin)).length > 0 && <>
          <h2 className="section-label">{t("dashboard.order_management")}</h2>
          <div className="home-grid">
            {ORDER_BUTTONS.filter(btn => btn.key !== "pos").filter(btn => btn.allowed(role, isAdmin)).map(btn => {
              const badge = getBadge(btn.badge);
              const hasBadge = badge !== null && badge !== undefined && badge !== 0;
              return <button key={btn.key} onClick={() => router.push(btn.route)} className="home-btn-v2">
                <span className="home-btn-v2-icon" style={btn.key === "wallet" ? { color: "var(--color-accent-gold)" } : {}}><btn.icon size={28} /></span>
                <span className="home-btn-v2-label">{t((btn as any).labelKey)}</span>
                {hasBadge && <span className="home-btn-badge">{badge}</span>}
              </button>;
            })}
          </div>
        </>}

        {/* Operations — Reports tab only */}
        {activeTab === "reports" && OPS_BUTTONS.filter(btn => btn.allowed(role, isAdmin)).length > 0 && <>
          <h2 className="section-label">{t("dashboard.reporting_checks")}</h2>
          <div className="home-grid">
            {OPS_BUTTONS.filter(btn => btn.allowed(role, isAdmin)).map(btn => <button key={btn.key} onClick={() => router.push(btn.route)} className="home-btn-v2">
              <span className="home-btn-v2-icon"><btn.icon size={28} /></span>
              <span className="home-btn-v2-label">{t((btn as any).labelKey)}</span>
            </button>)}
          </div>
        </>}

        {/* Personal — Personal tab only */}
        {activeTab === "personal" && <>
        <h2 className="section-label">{t("dashboard.personal")}</h2>
        <div className="home-grid">
          {SELF_BUTTONS.map(btn => {
            const badge = getBadge(btn.badge);
            const hasBadge = badge !== null && badge !== undefined && badge !== 0;
            return <button key={btn.key} onClick={() => router.push(btn.route)} className="home-btn-v2">
              <span className="home-btn-v2-icon"><btn.icon size={28} /></span>
              <span className="home-btn-v2-label">{t((btn as any).labelKey)}</span>
              {hasBadge && <span className="home-btn-badge">{badge}</span>}
            </button>;
          })}
        </div>
        </>}
      </>}
      </div>
    </div>;
}