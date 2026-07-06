"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft } from "lucide-react";
interface Stats {
  total_sent: number;
  total_delivered: number;
  total_failed: number;
  total_draft: number;
}
export default function NotificationReportPage() {
  const {
    t
  } = useTranslation();
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    api.get<Stats>("/admin/notifications/stats").then(d => setStats(d)).catch(e => {
      console.error('notification stats:', e);
      setError(e.message || 'Failed to load stats');
    }).finally(() => setLoading(false));
  }, []);
  if (loading) return <div style={{
    padding: 32
  }}>{t("notifications_report.loading")}</div>;
  if (error) return <div style={{
    padding: 32
  }}><div className="alert alert-error">{error}</div><button onClick={() => router.push("/notifications")} className="btn btn-sm" style={{
      marginTop: 12
    }}>{t("notifications_report.back_to_notifications")}</button></div>;
  return <div style={{
    padding: 32
  }}>
      <div style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: 24
    }}>
        <button onClick={() => router.push("/notifications")} className="btn btn-ghost btn-sm"><ArrowLeft size={18} /></button>
        <div><h1 className="page-title" style={{
          margin: 0
        }}>{t("notifications_report.notification_report")}</h1><p className="page-subtitle" style={{
          marginTop: 2
        }}>{t("notifications_report.delivery_engagement_overview")}</p></div>
      </div>

      <div className="kpi-grid" style={{
      marginBottom: 24
    }}>
        <div className="kpi-card"><div className="kpi-label">{t("notifications_report.total_sent")}</div><div className="kpi-value">{stats?.total_sent || 0}</div></div>
        <div className="kpi-card"><div className="kpi-label">{t("notifications_report.delivered")}</div><div className="kpi-value" style={{
          color: "var(--color-success)"
        }}>{stats?.total_delivered || 0}</div></div>
        <div className="kpi-card"><div className="kpi-label">{t("notifications_report.failed")}</div><div className="kpi-value" style={{
          color: "var(--color-error)"
        }}>{stats?.total_failed || 0}</div></div>
        <div className="kpi-card"><div className="kpi-label">{t("notifications_report.drafts")}</div><div className="kpi-value" style={{
          color: "var(--color-text-muted)"
        }}>{stats?.total_draft || 0}</div></div>
      </div>

      <div className="card" style={{
      padding: 24
    }}>
        <p style={{
        color: "var(--color-text-muted)",
        fontSize: 13
      }}>{t("notifications_report.detailed_delivery_logs_available_per_notification")}</p>
      </div>
    </div>;
}