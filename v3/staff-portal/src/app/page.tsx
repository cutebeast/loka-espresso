"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { usePolling } from "@/hooks/usePolling";
import { api } from "@/lib/api";
import SkeletonCard from "@/components/SkeletonCard";
import {
  Armchair, CreditCard, CalendarCheck, Clock, UserCircle, Wallet,
  ChefHat, ClipboardList
} from "lucide-react";

interface DashboardData {
  pending_orders: number;
  occupied_tables: number;
  today_reservations: number;
  clock_status: string;
  store_name: string;
  staff_name: string;
}

const BUTTONS = [
  { key: "pos", label: "New Order", icon: CreditCard, badge: null, route: "/pos", cls: "home-btn--primary", desc: "POS" },
  { key: "orders", label: "Orders", icon: ClipboardList, badge: null, route: "/orders", cls: "", desc: "Queue & History" },
  { key: "kitchen", label: "Kitchen", icon: ChefHat, badge: "pending_orders", route: "/kitchen", cls: "", desc: "KDS" },
  { key: "tables", label: "Tables", icon: Armchair, badge: "occupied_tables", route: "/tables", cls: "", desc: "Floor" },
  { key: "reservations", label: "Bookings", icon: CalendarCheck, badge: "today_reservations", route: "/reservations", cls: "", desc: "Reservations" },
  { key: "wallet", label: "Member", icon: Wallet, badge: null, route: "/wallet", cls: "", desc: "Wallet & Rewards" },
  { key: "clock", label: "Clock In", icon: Clock, badge: "clock_status", route: "/time-clock", cls: "", desc: "Time Clock" },
  { key: "profile", label: "Me", icon: UserCircle, badge: null, route: "/profile", cls: "", desc: "Profile" },
];

export default function HomePage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const data = await api.get<DashboardData>("/staff/dashboard");
      if (data) setData(data);
    } catch (e) { console.error("Dashboard fetch failed:", e); } finally { setLoading(false); }
  };

  usePolling(fetchData, [], { interval: 30000 });

  const getBadge = (b: string | null): string | number | null => {
    if (!b || !data) return null;
    if (b === "clock_status") return data.clock_status === "in" ? "IN" : data.clock_status === "break" ? "BRK" : "OUT";
    return (data as any)[b] || null;
  };

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <div style={{ marginBottom: 24, textAlign: "center" }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: "var(--color-text-primary)" }}>{data?.store_name || "Loka Espresso"}</h1>
        {data?.staff_name && <p style={{ fontSize: 13, color: "var(--color-text-muted)", margin: "4px 0 0" }}>Welcome, {data.staff_name}</p>}
      </div>

      {loading ? (
        <SkeletonCard count={4} />
      ) : (
        <div className="home-grid">
          {BUTTONS.map((btn) => {
            const badge = getBadge(btn.badge);
            return (
              <button key={btn.key} onClick={() => router.push(btn.route)} className={`home-btn ${btn.cls}`}>
                {badge !== null && badge !== undefined && badge !== 0 && (
                  <span className="home-btn-badge">{badge}</span>
                )}
                <span className="home-btn-icon"><btn.icon size={btn.key === "pos" ? 42 : 32} /></span>
                <span className="home-btn-label">{btn.label}</span>
                {btn.key === "pos" && <span style={{ fontSize: 11, opacity: 0.6, fontWeight: 400 }}>{btn.desc}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
