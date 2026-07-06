"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { useDebounce } from "@/hooks/useDebounce";
import { usePagination } from "@/hooks/usePagination";
import { Search, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";
interface CustomerSummary {
  id: number;
  display_name: string;
  phone_number: string;
  email_address: string | null;
  referral_code: string | null;
  order_count: number;
  lifetime_value: number;
  is_active: boolean;
  created_at: string;
  last_order_at: string | null;
}
export default function CustomersPage() {
  const {
    t
  } = useTranslation();
  const router = useRouter();
  const {
    format
  } = useCurrency();
  const [items, setItems] = useState<CustomerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const pagination = usePagination({
    defaultPage: 1,
    defaultPerPage: 20
  });
  const fetchData = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        page: String(pagination.page),
        per_page: "20"
      });
      if (debouncedSearch) qs.set("search", debouncedSearch);
      const r = await api.getRaw<any>(`/admin/customers?${qs.toString()}`);
      setItems(r.items || []);
      pagination.setTotal(r.total || 0);
      pagination.setTotalPages(r.total_pages || 1);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, debouncedSearch, pagination.setTotal, pagination.setTotalPages]);
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  const formatDate = (s: string | null) => s ? new Date(s).toLocaleDateString("en-MY") : "—";
  return <div style={{
    padding: 32
  }}>
      <div className="page-header">
        <div><h1 className="page-title">{t("customers.customers")}</h1><p className="page-subtitle">{pagination.total}{t("customers.customers_2")}</p></div>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      <div style={{
      marginBottom: 16,
      maxWidth: 400
    }}>
        <div style={{
        position: "relative"
      }}>
          <label htmlFor="customer-search" style={{
          position: "absolute",
          left: "-9999px",
          width: 1,
          height: 1,
          overflow: "hidden"
        }}>{t("customers.search_customers")}</label>
          <Search size={16} style={{
          position: "absolute",
          left: 12,
          top: "50%",
          transform: "translateY(-50%)",
          color: "var(--color-text-muted)"
        }} />
          <input id="customer-search" type="text" value={search} onChange={e => {
          setSearch(e.target.value);
          pagination.setPage(1);
        }} placeholder={t("customers.search_by_name_phone_or_email")} style={{
          width: "100%",
          padding: "8px 12px 8px 36px",
          fontSize: 13,
          border: "1px solid var(--color-border-light)",
          borderRadius: "var(--radius-sm)"
        }} />
        </div>
      </div>

      <div className="table-header-bar"><span className="text-sm font-semibold">{items.length}{t("customers.of")}{pagination.total}{t("customers.customers_3")}</span></div>
      <div className="table-container"><table className="data-table">
        <thead><tr><th>{t("customers.customer")}</th><th>{t("customers.phone")}</th><th>{t("customers.email")}</th><th style={{
              textAlign: "center"
            }}>{t("customers.orders")}</th><th style={{
              textAlign: "right"
            }}>{t("customers.ltv")}</th><th>{t("customers.joined")}</th><th style={{
              width: 80
            }}>{t("customers.status")}</th><th style={{
              width: 70
            }}>{t("customers.actions")}</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={8} className="data-table-empty">{t("customers.loading")}</td></tr> : items.length === 0 ? <tr><td colSpan={8} className="data-table-empty">{t("customers.no_customers_found")}</td></tr> : items.map(c => <tr key={c.id} className="clickable" role="button" tabIndex={0} onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              router.push(`/customers/${c.id}`);
            }
          }} style={{
            cursor: "pointer"
          }} onClick={() => router.push(`/customers/${c.id}`)}>
              <td style={{
              fontWeight: 600
            }}>{c.display_name || "—"}</td>
              <td style={{
              fontSize: 11
            }} className="font-mono">{c.phone_number || "—"}</td>
              <td style={{
              fontSize: 12,
              color: "var(--color-text-muted)"
            }}>{c.email_address || "—"}</td>
              <td style={{
              textAlign: "center"
            }}>{c.order_count}</td>
              <td style={{
              textAlign: "right",
              fontWeight: 600
            }}>{format(c.lifetime_value)}</td>
              <td style={{
              fontSize: 12
            }}>{formatDate(c.created_at)}</td>
              <td onClick={e => e.stopPropagation()}><span className={`badge badge-sm ${c.is_active ? "badge-green" : "badge-gray"}`}>{c.is_active ? "Active" : "Inactive"}</span></td>
              <td onClick={e => e.stopPropagation()}><Link href={`/customers/${c.id}`} className="btn btn-ghost btn-sm" style={{
                color: "var(--color-info)"
              }}><ExternalLink size={12} />{t("customers.view")}</Link></td>
            </tr>)}
        </tbody>
      </table></div>

      {pagination.totalPages > 1 && <div style={{
      display: "flex",
      justifyContent: "center",
      gap: 8,
      alignItems: "center",
      marginTop: 16
    }}>
          <button type="button" className="btn btn-sm btn-ghost" disabled={!pagination.hasPrev} onClick={() => pagination.prevPage()}><ChevronLeft size={14} />{t("customers.prev")}</button>
          <span style={{
        fontSize: 13,
        color: "var(--color-text-muted)"
      }}>{t("customers.page")}{pagination.page}{t("customers.of_2")}{pagination.totalPages}</span>
          <button type="button" className="btn btn-sm btn-ghost" disabled={!pagination.hasNext} onClick={() => pagination.nextPage()}>{t("customers.next")}<ChevronRight size={14} /></button>
        </div>}
    </div>;
}