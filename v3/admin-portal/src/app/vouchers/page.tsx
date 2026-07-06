"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { usePagination } from "@/hooks/usePagination";
import { useCurrency } from "@/hooks/useCurrency";
import { Plus, Edit2, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
interface Voucher {
  id: number;
  voucher_code: string;
  display_title: string;
  voucher_type: string;
  discount_value: number;
  global_use_count?: number;
  max_global_uses?: number;
  valid_from?: string;
  valid_until?: string;
  is_active: boolean;
}
const PAGE_SIZE = 20;
export default function VouchersPage() {
  const {
    t
  } = useTranslation();
  const router = useRouter();
  const [items, setItems] = useState<Voucher[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const pagination = usePagination({
    defaultPage: 1,
    defaultPerPage: PAGE_SIZE
  });
  const {
    symbol
  } = useCurrency();
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const fetchData = useCallback(async (p: number = 1) => {
    return api.getRaw<{
      items: Voucher[];
      total: number;
      total_pages: number;
    }>(`/admin/vouchers?page=${p}&per_page=${PAGE_SIZE}`);
  }, []);
  useEffect(() => {
    let cancelled = false;
    fetchData(1).then(d => {
      if (cancelled) return;
      setItems(d.items || []);
      pagination.setTotalPages(d.total_pages || 1);
      pagination.setPage(1);
      pagination.setTotal(d.total || 0);
    }).catch((e: any) => {
      if (!cancelled) setError(e.message);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchData, pagination.setTotalPages, pagination.setPage, pagination.setTotal]);
  const handleDelete = async (id: number) => {
    if (!confirm("Delete this voucher?")) return;
    setDeletingId(id);
    try {
      await api.del(`/admin/vouchers/${id}`);
      const d = await fetchData(pagination.page);
      setItems(d.items || []);
      pagination.setTotalPages(d.total_pages || 1);
      pagination.setTotal(d.total || 0);
    } catch (e: any) {
      console.error("Failed to delete voucher:", e);
    } finally {
      setDeletingId(null);
    }
  };
  const discountLabel = (v: Voucher) => {
    if (v.voucher_type === "percentage_off") return `${(v.discount_value * 100).toFixed(0)}% off`;
    if (v.voucher_type === "free_item") return `Free (up to ${symbol} ${v.discount_value})`;
    return `${symbol} ${v.discount_value} off`;
  };
  const typeBadge = (t: string) => {
    const m: Record<string, string> = {
      percentage_off: "badge-blue",
      fixed_amount_off: "badge-green",
      free_item: "badge-yellow"
    };
    return <span className={`badge badge-sm ${m[t] || "badge-blue"}`}>{t.replace(/_/g, " ")}</span>;
  };
  return <div style={{
    padding: 32
  }}>
      <div className="page-header">
        <div><h1 className="page-title">{t("vouchers.vouchers")}</h1><p className="page-subtitle">{t("vouchers.discount_vouchers_claimed_through_promotions")}</p></div>
        <button type="button" onClick={() => router.push("/vouchers/new")} className="btn btn-primary btn-sm"><Plus size={16} />{t("vouchers.add_voucher")}</button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="table-header-bar"><span className="text-sm font-semibold">{items.length}{t("vouchers.vouchers_2")}</span></div>
      <div className="table-container"><table className="data-table">
        <thead><tr><th>{t("vouchers.code")}</th><th>{t("vouchers.title")}</th><th>{t("vouchers.type")}</th><th>{t("vouchers.discount")}</th><th>{t("vouchers.valid")}</th><th>{t("vouchers.uses")}</th><th style={{
              width: 80
            }}>{t("vouchers.status")}</th><th style={{
              width: 80
            }}>{t("vouchers.actions")}</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={8} className="data-table-empty">{t("vouchers.loading")}</td></tr> : items.map(item => <tr key={item.id} className="clickable" role="button" tabIndex={0} onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              router.push(`/vouchers/${item.id}`);
            }
          }} onClick={() => router.push(`/vouchers/${item.id}`)} style={{
            cursor: "pointer"
          }}>
                <td style={{
              fontSize: 12
            }} className="font-mono">{item.voucher_code}</td>
                <td style={{
              fontWeight: 600
            }}>{item.display_title}</td>
                <td>{typeBadge(item.voucher_type)}</td>
                <td style={{
              fontWeight: 600,
              color: "var(--color-success)"
            }}>{discountLabel(item)}</td>
                <td style={{
              fontSize: 12
            }}>{item.valid_from?.slice(0, 10) || "—"} → {item.valid_until?.slice(0, 10) || "—"}</td>
                <td style={{
              fontSize: 12
            }}>{item.global_use_count || 0}/{item.max_global_uses || "∞"}</td>
                <td onClick={e => e.stopPropagation()}><span className={`badge badge-sm ${item.is_active ? "badge-green" : "badge-gray"}`}>{item.is_active ? "Active" : "Inactive"}</span></td>
                <td onClick={e => e.stopPropagation()}>
                  <div style={{
                display: "flex",
                gap: 4,
                alignItems: "center"
              }}>
                    <button type="button" onClick={() => router.push(`/vouchers/${item.id}`)} className="btn btn-ghost btn-sm" style={{
                  color: "var(--color-info)"
                }} aria-label={t("vouchers.edit_voucher")}><Edit2 size={14} /></button>
                    <button type="button" onClick={() => handleDelete(item.id)} disabled={deletingId === item.id} className="btn btn-ghost btn-sm" style={{
                  color: deletingId === item.id ? "var(--color-text-muted)" : "var(--color-error)"
                }} aria-label={t("vouchers.delete_voucher")}><Trash2 size={14} /></button>
                  </div>
                </td>
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
          <button type="button" className="btn btn-sm btn-ghost" disabled={!pagination.hasPrev} onClick={async () => {
        const d = await fetchData(pagination.page - 1);
        setItems(d.items || []);
        pagination.setTotalPages(d.total_pages || 1);
        pagination.setTotal(d.total || 0);
        pagination.prevPage();
      }}><ChevronLeft size={14} />{t("vouchers.prev")}</button>
          <span style={{
        fontSize: 13,
        color: "var(--color-text-muted)"
      }}>{t("vouchers.page")}{pagination.page}{t("vouchers.of")}{pagination.totalPages}</span>
          <button type="button" className="btn btn-sm btn-ghost" disabled={!pagination.hasNext} onClick={async () => {
        const d = await fetchData(pagination.page + 1);
        setItems(d.items || []);
        pagination.setTotalPages(d.total_pages || 1);
        pagination.setTotal(d.total || 0);
        pagination.nextPage();
      }}>{t("vouchers.next")}<ChevronRight size={14} /></button>
        </div>}
    </div>;
}