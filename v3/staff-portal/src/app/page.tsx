"use client";

import { useTranslation } from "@/hooks/useTranslation";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePolling } from "@/hooks/usePolling";
import { useStaffRole, canUsePOS, canUseKitchen, canUseOps, type StaffRole } from "@/hooks/useStaffRole";
import { api } from "@/lib/api";
import SkeletonCard from "@/components/SkeletonCard";
import Alert from "@/components/Alert";
import { Armchair, CreditCard, CalendarCheck, CalendarDays, Clock, UserCircle, Wallet, ChefHat, ClipboardList, Wrench, Package, AlertTriangle, Droplets, Trash2 } from "lucide-react";
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
  label: "New Order",
  icon: CreditCard,
  badge: null,
  route: "/pos",
  cls: "home-btn--primary",
  desc: "POS",
  allowed: (role: string | null, isAdmin: boolean) => canUsePOS(role as StaffRole | null, isAdmin)
}, {
  key: "orders",
  label: "Orders",
  icon: ClipboardList,
  badge: null,
  route: "/orders",
  cls: "",
  desc: "Queue & History",
  allowed: () => true
}, {
  key: "kitchen",
  label: "Kitchen",
  icon: ChefHat,
  badge: "pending_orders",
  route: "/kitchen",
  cls: "",
  desc: "KDS",
  allowed: (role: string | null, isAdmin: boolean) => canUseKitchen(role as StaffRole | null, isAdmin)
}, {
  key: "tables",
  label: "Tables",
  icon: Armchair,
  badge: "occupied_tables",
  route: "/tables",
  cls: "",
  desc: "Floor",
  allowed: () => true
}, {
  key: "reservations",
  label: "Bookings",
  icon: CalendarCheck,
  badge: "today_reservations",
  route: "/reservations",
  cls: "",
  desc: "Reservations",
  allowed: () => true
}, {
  key: "wallet",
  label: "Member",
  icon: Wallet,
  badge: null,
  route: "/wallet",
  cls: "",
  desc: "Wallet & Rewards",
  allowed: () => true
}];
const OPS_BUTTONS = [{
  key: "equipment",
  label: "Equipment",
  icon: Wrench,
  badge: null,
  route: "/equipment",
  cls: "",
  desc: "Maintenance",
  allowed: (role: string | null, isAdmin: boolean) => canUseOps(role as StaffRole | null, isAdmin)
}, {
  key: "grease-trap",
  label: "Grease Trap",
  icon: Droplets,
  badge: null,
  route: "/grease-trap",
  cls: "",
  desc: "Cleaning",
  allowed: (role: string | null, isAdmin: boolean) => canUseOps(role as StaffRole | null, isAdmin)
}, {
  key: "garbage",
  label: "Garbage",
  icon: Trash2,
  badge: null,
  route: "/garbage",
  cls: "",
  desc: "Disposal",
  allowed: (role: string | null, isAdmin: boolean) => canUseOps(role as StaffRole | null, isAdmin)
}, {
  key: "inventory",
  label: "Inventory",
  icon: Package,
  badge: null,
  route: "/inventory",
  cls: "",
  desc: "Stock Count",
  allowed: (role: string | null, isAdmin: boolean) => canUseOps(role as StaffRole | null, isAdmin)
}, {
  key: "wastage",
  label: "Wastage",
  icon: AlertTriangle,
  badge: null,
  route: "/wastage",
  cls: "",
  desc: "Report Waste",
  allowed: (role: string | null, isAdmin: boolean) => canUseOps(role as StaffRole | null, isAdmin)
}];
const SELF_BUTTONS = [{
  key: "clock",
  label: "Clock In",
  icon: Clock,
  badge: "clock_status",
  route: "/time-clock",
  cls: "",
  desc: "Time Clock",
  allowed: () => true
}, {
  key: "shifts",
  label: "Shifts",
  icon: CalendarDays,
  badge: null,
  route: "/shifts",
  cls: "",
  desc: "My Schedule",
  allowed: () => true
}, {
  key: "tasks",
  label: "Tasks",
  icon: ClipboardList,
  badge: null,
  route: "/tasks",
  cls: "",
  desc: "To-do",
  allowed: () => true
}, {
  key: "profile",
  label: "Me",
  icon: UserCircle,
  badge: null,
  route: "/profile",
  cls: "",
  desc: "Profile",
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
      setError("Unable to load dashboard");
    } finally {
      setLoading(false);
    }
  };
  usePolling(fetchData, [], {
    interval: 30000
  });
  const getBadge = (b: string | null): string | number | null => {
    if (!b || !data) return null;
    if (b === "clock_status") return data.clock_status === "in" ? "IN" : data.clock_status === "break" ? "BRK" : "OUT";
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
      }}>{data?.store_name || "Loka Espresso"}</h1>
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
                    <span className="home-btn-label">{btn.label}</span>
                    {btn.key === "pos" && <span style={{
                fontSize: 11,
                opacity: 0.6,
                fontWeight: 400
              }}>{btn.desc}</span>}
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
                    <span className="home-btn-label">{btn.label}</span>
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
                    <span className="home-btn-label">{btn.label}</span>
                  </button>;
          })}
            </div>
          </div>
        </>}
    </div>;
}