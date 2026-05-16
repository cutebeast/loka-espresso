"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UtensilsCrossed, Armchair, CreditCard, CalendarCheck, Clock, UserCircle, Wallet } from "lucide-react";

interface DashboardData {
  pending_orders: number;
  occupied_tables: number;
  today_reservations: number;
  clock_status: string;
  store_name: string;
  staff_name: string;
}

const BUTTONS = [
  { key: "kitchen", label: "Kitchen", icon: UtensilsCrossed, badge: "pending_orders", route: "/kitchen", cls: "" },
  { key: "tables", label: "Tables", icon: Armchair, badge: "occupied_tables", route: "/tables", cls: "" },
  { key: "pos", label: "POS", icon: CreditCard, badge: null, route: "/pos", cls: "home-btn--primary" },
  { key: "reservations", label: "Reserv.", icon: CalendarCheck, badge: "today_reservations", route: "/reservations", cls: "" },
  { key: "wallet", label: "Wallet", icon: Wallet, badge: null, route: "/wallet", cls: "" },
  { key: "clock", label: "Clock", icon: Clock, badge: "clock_status", route: "/time-clock", cls: "" },
  { key: "profile", label: "Profile", icon: UserCircle, badge: null, route: "/profile", cls: "" },
];

export default function HomePage() {
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const t = localStorage.getItem("token");
      if (!t) return;
      const r = await fetch("/api/v1/staff/dashboard", { headers: { Authorization: `Bearer ${t}` } });
      if (r.ok) {
        const j = await r.json();
        setData(j.data || j);
      }
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); const iv = setInterval(fetchData, 30000); return () => clearInterval(iv); }, []);

  const getBadge = (b: string | null): string | number | null => {
    if (!b || !data) return null;
    if (b === "clock_status") return data.clock_status === "in" ? "IN" : data.clock_status === "break" ? "BRK" : "OUT";
    return (data as any)[b] || null;
  };

  return (
    <div style={{ padding: "16px", maxWidth: 720, margin: "0 auto" }}>
      <div style={{ marginBottom: 16, textAlign: "center" }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{data?.store_name || "Loka Espresso"}</h2>
        {data?.staff_name && <p style={{ fontSize: 12, opacity: 0.6, margin: "4px 0 0" }}>Welcome, {data.staff_name}</p>}
      </div>

      {loading && <div style={{ textAlign: "center", padding: 40, opacity: 0.5 }}>Loading...</div>}

      <div className="home-grid">
        {BUTTONS.map(btn => {
          const badge = getBadge(btn.badge);
          return (
            <button
              key={btn.key}
              onClick={() => router.push(btn.route)}
              className={`home-btn ${btn.cls}`}
            >
              {badge !== null && badge !== undefined && badge !== 0 && (
                <span className="home-btn-badge">{badge}</span>
              )}
              <span className="home-btn-icon"><btn.icon size={36} /></span>
              <span className="home-btn-label">{btn.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
