"use client";

import { useTranslation } from "@/hooks/useTranslation";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePolling } from "@/hooks/usePolling";
import { useStaffRole, canUsePOS, canUseKitchen, canUseOps, type StaffRole } from "@/hooks/useStaffRole";
import { api } from "@/lib/api";
import SkeletonCard from "@/components/SkeletonCard";
import Alert from "@/components/Alert";
import { Armchair, CreditCard, CalendarCheck, CalendarDays, Clock, UserCircle, Wallet, ChefHat, ClipboardList, Wrench, Package, AlertTriangle, Droplets, Trash2, HelpCircle } from "lucide-react";
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
  allowed: (role: string | null, isAdmin: boolean) => canUseOps(role as StaffRole | null, isAdmin)
}, {
  key: "garbage",
  labelKey: "dashboard.garbage",
  icon: Trash2,
  badge: null,
  route: "/garbage",
  cls: "",
  descKey: "dashboard.disposal",
  allowed: (role: string | null, isAdmin: boolean) => canUseOps(role as StaffRole | null, isAdmin)
}, {
  key: "inventory",
  labelKey: "dashboard.inventory",
  icon: Package,
  badge: null,
  route: "/inventory",
  cls: "",
  descKey: "dashboard.stock_count",
  allowed: (role: string | null, isAdmin: boolean) => canUseOps(role as StaffRole | null, isAdmin)
}, {
  key: "wastage",
  labelKey: "dashboard.wastage",
  icon: AlertTriangle,
  badge: null,
  route: "/wastage",
  cls: "",
  descKey: "dashboard.report_waste",
  allowed: (role: string | null, isAdmin: boolean) => canUseOps(role as StaffRole | null, isAdmin)
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
  return <div style={{
    padding: 24,
    maxWidth: 720,
    margin: "0 auto"
  }}>
      <div style={{
      marginBottom: 24,
      textAlign: "center"
    }}>
        <h1 style={{
        fontSize: 22,
        fontWeight: 800,
        margin: 0,
        color: "var(--color-text-primary)"
      }}>{data?.store_name || t("common.store_name")}</h1>
        {data?.staff_name && <p style={{
        fontSize: 13,
        color: "var(--color-text-muted)",
        margin: "4px 0 0"
      }}>{t("dashboard.welcome")}{data.staff_name}</p>}
      </div>

      {loading ? <SkeletonCard count={4} /> : error ? <Alert variant="error" onDismiss={() => {
      setError("");
      fetchData();
    }}>{error}</Alert> : <>
          {/* Order Management */}
          <div style={{
        marginBottom: 20
      }}>
            <h2 style={{
          fontSize: 12,
          fontWeight: 700,
          color: "var(--color-text-muted)",
          textTransform: "uppercase",
          letterSpacing: 1,
          margin: "0 0 8px 4px"
        }}>{t("dashboard.order_management")}</h2>
            <div className="home-grid">
              {ORDER_BUTTONS.filter(btn => btn.allowed(role, isAdmin)).map(btn => {
            const badge = getBadge(btn.badge);
            return <button key={btn.key} onClick={() => router.push(btn.route)} className={`home-btn ${btn.cls}`}>
                    {badge !== null && badge !== undefined && badge !== 0 && <span className="home-btn-badge">{badge}</span>}
                    <span className="home-btn-icon"><btn.icon size={btn.key === "pos" ? 42 : 32} /></span>
                    <span className="home-btn-label">{t((btn as { labelKey: string }).labelKey)}</span>
                    {btn.key === "pos" && <span style={{
                fontSize: 11,
                opacity: 0.6,
                fontWeight: 400
              }}>{t((btn as { descKey: string }).descKey)}</span>}
                  </button>;
          })}
            </div>
          </div>

          {/* Operations */}
          <div style={{
        marginBottom: 20
      }}>
            <h2 style={{
          fontSize: 12,
          fontWeight: 700,
          color: "var(--color-text-muted)",
          textTransform: "uppercase",
          letterSpacing: 1,
          margin: "0 0 8px 4px"
        }}>{t("dashboard.reporting_checks")}</h2>
            <div className="home-grid">
              {OPS_BUTTONS.filter(btn => btn.allowed(role, isAdmin)).map(btn => {
            const badge = getBadge(btn.badge);
            return <button key={btn.key} onClick={() => router.push(btn.route)} className="home-btn">
                    {badge !== null && badge !== undefined && badge !== 0 && <span className="home-btn-badge">{badge}</span>}
                    <span className="home-btn-icon"><btn.icon size={32} /></span>
                    <span className="home-btn-label">{t((btn as { labelKey: string }).labelKey)}</span>
                  </button>;
          })}
            </div>
          </div>

          {/* Personal */}
          <div>
            <h2 style={{
          fontSize: 12,
          fontWeight: 700,
          color: "var(--color-text-muted)",
          textTransform: "uppercase",
          letterSpacing: 1,
          margin: "0 0 8px 4px"
        }}>{t("dashboard.personal")}</h2>
            <div className="home-grid">
              {SELF_BUTTONS.map(btn => {
            const badge = getBadge(btn.badge);
            return <button key={btn.key} onClick={() => router.push(btn.route)} className="home-btn">
                    {badge !== null && badge !== undefined && badge !== 0 && <span className="home-btn-badge">{badge}</span>}
                    <span className="home-btn-icon"><btn.icon size={32} /></span>
                    <span className="home-btn-label">{t((btn as { labelKey: string }).labelKey)}</span>
                  </button>;
          })}
            </div>
          </div>
        </>}
    </div>;
}