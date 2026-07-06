"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
interface CheckinStats {
  today: number;
  this_week: number;
  total_checkins: number;
}
interface CheckinItem {
  id: number | string;
  customer_name?: string;
  customer_id?: number;
  checkin_date?: string;
  streak_day?: number;
  points_earned?: number;
}
export default function CheckinsPage() {
  const {
    t
  } = useTranslation();
  const [items, setItems] = useState<CheckinItem[]>([]);
  const [stats, setStats] = useState<CheckinStats>({
    today: 0,
    this_week: 0,
    total_checkins: 0
  });
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([api.get<{
      items: CheckinItem[];
    }>("/admin/checkins?per_page=50").then(d => setItems(Array.isArray(d) ? d : d.items || [])).catch(e => {
      console.error('checkins:', e);
    }), api.get<CheckinStats>("/admin/checkins/stats").then(d => setStats(d || {
      today: 0,
      this_week: 0,
      total_checkins: 0
    })).catch(e => {
      console.error('checkin stats:', e);
    })]).finally(() => setLoading(false));
  }, []);
  return <div style={{
    padding: 32
  }}>
      <h1 className="page-title">{t("checkins.daily_check_ins")}</h1>
      <p className="page-subtitle" style={{
      marginBottom: 24
    }}>{t("checkins.customer_daily_login_rewards_streak_tracking")}</p>
      
      <div className="kpi-grid" style={{
      marginBottom: 24
    }}>
        <div className="kpi-card"><div className="kpi-label">{t("checkins.today")}</div><div className="kpi-value">{stats.today || 0}</div></div>
        <div className="kpi-card"><div className="kpi-label">{t("checkins.this_week")}</div><div className="kpi-value">{stats.this_week || 0}</div></div>
        <div className="kpi-card"><div className="kpi-label">{t("checkins.total_check_ins")}</div><div className="kpi-value">{stats.total_checkins || 0}</div></div>
      </div>

      <div className="table-header-bar"><span className="text-sm font-semibold">{items.length}{t("checkins.check_ins")}</span></div>
      <div className="table-container"><table className="data-table"><thead><tr><th>{t("checkins.customer")}</th><th>{t("checkins.date")}</th><th>{t("checkins.streak_day")}</th><th>{t("checkins.points")}</th></tr></thead><tbody>
        {loading ? <tr><td colSpan={4} className="data-table-empty">{t("checkins.loading")}</td></tr> : items.map((c: CheckinItem) => <tr key={c.id}><td>{c.customer_name || `#${c.customer_id}`}</td><td>{c.checkin_date}</td><td>{t("checkins.day")}{c.streak_day}</td><td style={{
              fontWeight: 600,
              color: "var(--color-success)"
            }}>+{c.points_earned}{t("checkins.pts")}</td></tr>)}
      </tbody></table></div>
    </div>;
}