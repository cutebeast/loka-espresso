"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useCurrency } from "@/hooks/useCurrency";
export default function VoucherReportPage() {
  const {
    t
  } = useTranslation();
  const {
    symbol
  } = useCurrency();
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api.get<{
      items: any[];
    }>("/admin/vouchers?per_page=100").then(d => setVouchers(Array.isArray(d) ? d : d.items || [])).catch(e => {
      console.error('vouchers:', e);
    }).finally(() => setLoading(false));
  }, []);
  const totalUsed = vouchers.reduce((s: number, v: any) => s + (v.global_use_count || 0), 0);
  return <div style={{
    padding: 32
  }}>
      <h1 className="page-title">{t("vouchers_report.voucher_report")}</h1>
      <p className="page-subtitle" style={{
      marginBottom: 24
    }}>{vouchers.length}{t("vouchers_report.vouchers")}{totalUsed}{t("vouchers_report.total_redemptions")}</p>
      {loading ? <p>{t("vouchers_report.loading")}</p> : <div className="table-container"><table className="data-table"><thead><tr><th>{t("vouchers_report.voucher")}</th><th>{t("vouchers_report.type")}</th><th>{t("vouchers_report.discount")}</th><th>{t("vouchers_report.used")}</th><th>{t("vouchers_report.max")}</th><th>{t("vouchers_report.usage")}</th><th>{t("vouchers_report.status")}</th></tr></thead><tbody>
          {vouchers.map((v: any) => <tr key={v.id}>
              <td><div style={{
                fontWeight: 600
              }}>{v.display_title}</div><div style={{
                fontSize: 11,
                color: "var(--color-text-muted)"
              }}>{v.voucher_code}</div></td>
              <td>{v.voucher_type}</td>
              <td>{v.voucher_type === "percentage_off" ? Math.round(v.discount_value) : v.discount_value}{v.voucher_type === "percentage_off" ? "%" : v.voucher_type === "fixed_amount_off" ? ` ${symbol}` : ""}</td>
              <td>{v.global_use_count || 0}</td>
              <td>{v.max_global_uses || "∞"}</td>
              <td><div style={{
                width: 100,
                height: 6,
                borderRadius: 3,
                background: "var(--color-bg-muted)"
              }}><div style={{
                  width: `${v.max_global_uses ? Math.min(100, (v.global_use_count || 0) / v.max_global_uses * 100) : 0}%`,
                  height: "100%",
                  borderRadius: 3,
                  background: (v.global_use_count || 0) > 0 ? "var(--color-primary)" : "var(--color-border-light)"
                }} /></div></td>
              <td><span className={`badge badge-sm ${v.is_active ? "badge-green" : "badge-gray"}`}>{v.is_active ? "Active" : "Inactive"}</span></td>
            </tr>)}
        </tbody></table></div>}
    </div>;
}