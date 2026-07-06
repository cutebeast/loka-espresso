"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Plus, Edit2, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import Image from "next/image";
import { useCurrency } from "@/hooks/useCurrency";
interface Reward {
  id: number;
  reward_name: string;
  reward_key: string;
  reward_type: string;
  short_description?: string;
  image_url?: string;
  points_cost: number;
  minimum_order_value?: number;
  is_active: boolean;
}
const PAGE_SIZE = 20;
export default function RewardsPage() {
  const {
    t
  } = useTranslation();
  const router = useRouter();
  const [items, setItems] = useState<Reward[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const {
    symbol
  } = useCurrency();
  const fetchData = useCallback(async (p: number = 1) => {
    return api.getRaw<{
      items: Reward[];
      total: number;
      total_pages: number;
    }>(`/admin/rewards?page=${p}&per_page=${PAGE_SIZE}`);
  }, []);
  useEffect(() => {
    let cancelled = false;
    fetchData(1).then(d => {
      if (cancelled) return;
      setItems(d.items || []);
      setTotalPages(d.total_pages || 1);
      setPage(1);
    }).catch((e: any) => {
      if (!cancelled) setError(e.message);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchData]);
  const handleDelete = async (id: number) => {
    if (!confirm("Delete this reward?")) return;
    try {
      await api.del(`/admin/rewards/${id}`);
      const d = await fetchData(page);
      setItems(d.items || []);
      setTotalPages(d.total_pages || 1);
    } catch (e) {
      console.error(e);
    }
  };
  const typeLabel = (t: string) => {
    const map: Record<string, string> = {
      free_item: "Free Item",
      percentage_discount: "% Discount",
      fixed_discount: "Fixed Discount",
      free_delivery: "Free Delivery"
    };
    return <span className="badge badge-sm badge-blue">{map[t] || t}</span>;
  };
  return <div style={{
    padding: 32
  }}>
      <div className="page-header">
        <div><h1 className="page-title">{t("rewards.rewards")}</h1><p className="page-subtitle">{t("rewards.loyalty_point_redemption_catalog")}</p></div>
        <button type="button" onClick={() => router.push("/rewards/new")} className="btn btn-primary btn-sm"><Plus size={16} />{t("rewards.add_reward")}</button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="table-header-bar"><span className="text-sm font-semibold">{items.length}{t("rewards.rewards_2")}</span></div>
      <div className="table-container"><table className="data-table">
        <thead><tr><th style={{
              width: 44
            }}></th><th>{t("rewards.name")}</th><th>{t("rewards.type")}</th><th>{t("rewards.points")}</th><th>{t("rewards.min_order")}</th><th style={{
              width: 80
            }}>{t("rewards.status")}</th><th style={{
              width: 80
            }}>{t("rewards.actions")}</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={7} className="data-table-empty">{t("rewards.loading")}</td></tr> : items.map(item => <tr key={item.id} className="clickable" role="button" tabIndex={0} onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              (() => router.push(`/rewards/${item.id}`))();
            }
          }} onClick={() => router.push(`/rewards/${item.id}`)} style={{
            cursor: "pointer"
          }}>
                <td>{item.image_url ? <Image src={item.image_url} alt={item.reward_name} width={32} height={32} style={{
                borderRadius: 6,
                objectFit: "cover"
              }} /> : <span style={{
                fontSize: 16
              }}>🎁</span>}</td>
                <td style={{
              fontWeight: 600
            }}>{item.reward_name}</td>
                <td>{typeLabel(item.reward_type)}</td>
                <td style={{
              fontWeight: 600
            }}>{(item.points_cost ?? 0).toLocaleString()}{t("rewards.pts")}</td>
                <td>{item.minimum_order_value != null ? `${symbol} ${item.minimum_order_value}` : "—"}</td>
                <td onClick={e => e.stopPropagation()}><span className={`badge badge-sm ${item.is_active ? "badge-green" : "badge-gray"}`}>{item.is_active ? "Active" : "Inactive"}</span></td>
                <td onClick={e => e.stopPropagation()}>
                  <div style={{
                display: "flex",
                gap: 4,
                alignItems: "center"
              }}>
                    <button type="button" onClick={() => router.push(`/rewards/${item.id}`)} className="btn btn-ghost btn-sm" style={{
                  color: "var(--color-info)"
                }}><Edit2 size={14} /></button>
                    <button type="button" onClick={() => handleDelete(item.id)} className="btn btn-ghost btn-sm" style={{
                  color: "var(--color-error)"
                }}><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>)}
        </tbody>
      </table></div>
      {totalPages > 1 && <div style={{
      display: "flex",
      justifyContent: "center",
      gap: 8,
      alignItems: "center",
      marginTop: 16
    }}>
          <button type="button" className="btn btn-sm btn-ghost" disabled={page <= 1} onClick={async () => {
        const d = await fetchData(page - 1);
        setItems(d.items || []);
        setTotalPages(d.total_pages || 1);
        setPage(page - 1);
      }}><ChevronLeft size={14} />{t("rewards.prev")}</button>
          <span style={{
        fontSize: 13,
        color: "var(--color-text-muted)"
      }}>{t("rewards.page")}{page}{t("rewards.of")}{totalPages}</span>
          <button type="button" className="btn btn-sm btn-ghost" disabled={page >= totalPages} onClick={async () => {
        const d = await fetchData(page + 1);
        setItems(d.items || []);
        setTotalPages(d.total_pages || 1);
        setPage(page + 1);
      }}>{t("rewards.next")}<ChevronRight size={14} /></button>
        </div>}
    </div>;
}