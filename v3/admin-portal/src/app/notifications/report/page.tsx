"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft } from "lucide-react";

interface Stats { total_sent: number; total_delivered: number; total_failed: number; total_draft: number; }

export default function NotificationReportPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<Stats>("/admin/notifications/stats").then(d => setStats(d)).catch((e)=>{console.error('notification stats:',e)}).finally(()=>setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 32 }}>Loading...</div>;

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={()=>router.push("/notifications")} className="btn btn-ghost btn-sm"><ArrowLeft size={18}/></button>
        <div><h1 className="page-title" style={{ margin: 0 }}>Notification Report</h1><p className="page-subtitle" style={{ marginTop: 2 }}>Delivery & engagement overview</p></div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 24 }}>
        <div className="kpi-card"><div className="kpi-label">Total Sent</div><div className="kpi-value">{stats?.total_sent || 0}</div></div>
        <div className="kpi-card"><div className="kpi-label">Delivered</div><div className="kpi-value" style={{ color: "var(--color-success)" }}>{stats?.total_delivered || 0}</div></div>
        <div className="kpi-card"><div className="kpi-label">Failed</div><div className="kpi-value" style={{ color: "var(--color-error)" }}>{stats?.total_failed || 0}</div></div>
        <div className="kpi-card"><div className="kpi-label">Drafts</div><div className="kpi-value" style={{ color: "var(--color-text-muted)" }}>{stats?.total_draft || 0}</div></div>
      </div>

      <div className="card" style={{ padding: 24 }}>
        <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>Detailed delivery logs available per notification on the listing page.</p>
      </div>
    </div>
  );
}
