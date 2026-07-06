"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
interface Referral {
  id: number;
  referrer_customer_id: number;
  invitee_customer_id: number;
  referrer_name?: string | null;
  invitee_name?: string | null;
  referral_code: string;
  status: string;
  created_at: string;
  reward_points?: number;
  converted_at?: string;
}
export default function ReferralsPage() {
  const {
    t
  } = useTranslation();
  const [items, setItems] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const fetchData = useCallback(() => {
    api.get<{
      items: Referral[];
    }>("/admin/referrals?per_page=100").then(d => setItems(Array.isArray(d) ? d : [])).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    fetchData();
  }, []);
  const statusBadge = (s: string) => {
    const colors: Record<string, string> = {
      pending: "badge-yellow",
      converted: "badge-blue",
      rewarded: "badge-green",
      expired: "badge-gray"
    };
    return <span className={`badge badge-sm ${colors[s] || "badge-gray"}`}>{s}</span>;
  };
  return <div style={{
    padding: 32
  }}>
      <div className="page-header"><h1 className="page-title">{t("referrals.referrals")}</h1><p className="page-subtitle">{items.length}{t("referrals.referrals_points_auto_credited_when_invitee")}</p></div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="table-header-bar"><span className="text-sm font-semibold">{items.length}{t("referrals.referrals_2")}</span></div>
      <div className="table-container">
        <table className="data-table">
          <thead><tr><th>{t("referrals.referrer")}</th><th>{t("referrals.code")}</th><th>{t("referrals.invitee")}</th><th>{t("referrals.reward_pts")}</th><th>{t("referrals.status")}</th><th>{t("referrals.date")}</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className="data-table-empty">{t("referrals.loading")}</td></tr> : items.map(item => <tr key={item.id}>
                <td style={{
              fontWeight: 600
            }}>{item.referrer_name || `#${item.referrer_customer_id}`}</td>
                <td className="font-mono" style={{
              fontSize: 11
            }}>{item.referral_code}</td>
                <td>{item.invitee_name || `#${item.invitee_customer_id}`}</td>
                <td>{item.reward_points ? `+${item.reward_points} pts` : "—"}</td>
                <td>{statusBadge(item.status)}</td>
                <td style={{
              fontSize: 12
            }}>{item.created_at?.slice(0, 10)}</td>
              </tr>)}
          </tbody>
        </table>
      </div>
    </div>;
}