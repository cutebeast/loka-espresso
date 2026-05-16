"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

export default function CheckinsPage() {
  const [items, setItems] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<{items:any[]}>("/admin/checkins?per_page=50").then(d => setItems(Array.isArray(d) ? d : (d.items||[]))).catch(()=>{}),
      api.get<any>("/admin/checkins/stats").then(d => setStats(d||{})).catch(()=>{}),
    ]).finally(() => setLoading(false));
  }, []);

  return (
    <div style={{padding:32}}>
      <h1 className="page-title">Daily Check-ins</h1>
      <p className="page-subtitle" style={{marginBottom:24}}>Customer daily login rewards & streak tracking</p>
      
      <div className="kpi-grid" style={{marginBottom:24}}>
        <div className="kpi-card"><div className="kpi-label">Today</div><div className="kpi-value">{stats.today||0}</div></div>
        <div className="kpi-card"><div className="kpi-label">This Week</div><div className="kpi-value">{stats.this_week||0}</div></div>
        <div className="kpi-card"><div className="kpi-label">Total Check-ins</div><div className="kpi-value">{stats.total_checkins||0}</div></div>
      </div>

      <div className="table-header-bar"><span className="text-sm font-semibold">{items.length} check-ins</span></div>
      <div className="table-container"><table className="data-table"><thead><tr><th>Customer</th><th>Date</th><th>Streak Day</th><th>Points</th></tr></thead><tbody>
        {loading?<tr><td colSpan={4} className="data-table-empty">Loading...</td></tr>
        :items.map((c:any)=>(<tr key={c.id}><td>{c.customer_name||`#${c.customer_id}`}</td><td>{c.checkin_date}</td><td>Day {c.streak_day}</td><td style={{fontWeight:600,color:"var(--color-success)"}}>+{c.points_earned} pts</td></tr>))}
      </tbody></table></div>
    </div>
  );
}
