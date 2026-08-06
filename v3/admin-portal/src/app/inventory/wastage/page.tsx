"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { CheckCircle, XCircle, AlertTriangle, Eye } from "lucide-react";
import { useTranslation } from "@/lib/i18n";
interface WastageEntry {
  id: number;
  store_id: number;
  store_name: string | null;
  menu_item_id: number | null;
  inventory_item_id: number | null;
  item_name: string;
  quantity: number;
  unit_of_measure: string | null;
  reason: string;
  image_urls: string[] | null;
  reported_by: string;
  status: string;
  verified_by: string | null;
  verified_at: string | null;
  verified_notes: string | null;
  created_at: string;
}
export default function WastageReportsPage() {
  const {
    t
  } = useTranslation();
  const [items, setItems] = useState<WastageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stores, setStores] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [storeFilter, setStoreFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [modalImages, setModalImages] = useState<{
    images: string[];
    label: string;
  } | null>(null);
  const [reviewing, setReviewing] = useState<number | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const perPage = 20;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (storeFilter) params.set("store_id", storeFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (dateFrom) params.set("date_from", dateFrom);
      if (dateTo) params.set("date_to", dateTo);
      params.set("page", String(page));
      params.set("per_page", String(perPage));
      const d = await api.getRaw<any>(`/admin/inventory/wastage-reports?${params.toString()}`);
      setItems(d?.items || []);
      setTotal(d?.total || 0);
    } catch (e: any) {
      setError(e?.message || "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }, [storeFilter, statusFilter, dateFrom, dateTo, page]);
  useEffect(() => {
    api.getRaw<any>("/admin/stores?per_page=50").then(d => setStores(Array.isArray(d) ? d : d.items || [])).catch((e: any) => { console.error("wastage stores load:", e); setError(e.message || t("admin.errors.loadFailed")); });
  }, []);
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  const handleReview = async (id: number, status: "verified" | "flagged") => {
    try {
      await api.patch(`/admin/inventory/wastage-reports/${id}`, {
        status,
        verified_notes: reviewNotes || null
      });
      setReviewing(null);
      setReviewNotes("");
      fetchData();
    } catch (e: any) {
      setError(e?.message || "Failed to update report");
    }
  };
  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: "badge-yellow",
      verified: "badge-green",
      flagged: "badge-red"
    };
    return map[status] || "badge-gray";
  };
  const filterStyle = {
    padding: "6px 12px",
    fontSize: 13,
    borderRadius: "var(--radius-sm)",
    border: "1px solid var(--color-border-light)"
  } as const;
  return <div style={{
    padding: 32
  }}>
      <div className="page-header">
        <div><h1 className="page-title">{t("wastage_admin.wastage_reports")}</h1><p className="page-subtitle">{total} {" "}{t("wastage_admin.reports_subtitle")}</p></div>
      </div>
      {error && <div className="alert alert-error" style={{
      marginBottom: 16
    }}>{error}</div>}

      <div style={{
      display: "flex",
      gap: 8,
      marginBottom: 16,
      flexWrap: "wrap"
    }}>
        <select value={storeFilter} onChange={e => {
        setStoreFilter(e.target.value);
        setPage(1);
      }} style={filterStyle}>
          <option value="">{t("admin.common.allStores")}</option>
          {stores.map(s => <option key={s.id} value={s.id}>{s.store_name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => {
        setStatusFilter(e.target.value);
        setPage(1);
      }} style={filterStyle}>
          <option value="">{t("wastage_admin.all_status")}</option>
          <option value="pending">{t("wastage_admin.pending")}</option>
          <option value="verified">{t("wastage_admin.verified")}</option>
          <option value="flagged">{t("wastage_admin.flagged")}</option>
        </select>
        <input type="date" value={dateFrom} onChange={e => {
        setDateFrom(e.target.value);
        setPage(1);
      }} style={filterStyle} />
        <input type="date" value={dateTo} onChange={e => {
        setDateTo(e.target.value);
        setPage(1);
      }} style={filterStyle} />
      </div>

      <div className="table-container">
        <table className="data-table">
          <thead><tr>
            <th>{t("wastage_admin.id")}</th><th>{t("wastage_admin.item")}</th><th>{t("wastage_admin.source")}</th><th style={{
              textAlign: "center"
            }}>{t("wastage_admin.qty")}</th><th>{t("wastage_admin.store")}</th><th>{t("wastage_admin.reason")}</th><th>{t("wastage_admin.reported_by")}</th><th style={{
              width: 80
            }}>{t("wastage_admin.photos")}</th><th style={{
              width: 90
            }}>{t("wastage_admin.status")}</th><th>{t("wastage_admin.date")}</th><th style={{
              width: 140
            }}>{t("wastage_admin.actions")}</th>
          </tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={11} className="data-table-empty">{t("wastage_admin.loading")}</td></tr> : items.length === 0 ? <tr><td colSpan={11} className="data-table-empty">{t("wastage_admin.no_reports")}</td></tr> : items.map(item => <tr key={item.id}>
                  <td style={{
                fontWeight: 600,
                fontSize: 13
              }}>#{item.id}</td>
                  <td style={{
                fontWeight: 600
              }}>{item.item_name}</td>
                  <td style={{
                fontSize: 12
              }}>{item.menu_item_id ? t("wastage_admin.menu_item") : t("wastage_admin.inventory_item")}</td>
                  <td style={{
                textAlign: "center",
                fontWeight: 600
              }}>{item.quantity}{item.unit_of_measure ? ` ${item.unit_of_measure}` : ""}</td>
                  <td>{item.store_name || `Store #${item.store_id}`}</td>
                  <td style={{
                maxWidth: 200,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: 12
              }}>{item.reason}</td>
                  <td style={{
                fontSize: 13
              }}>{item.reported_by}</td>
                  <td>
                    {Array.isArray(item.image_urls) && item.image_urls.length > 0 ? <button onClick={() => setModalImages({
                  images: item.image_urls!,
                  label: `#${item.id} ${item.item_name}`
                })} className="btn btn-ghost btn-sm" style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 12
                }}>
                        <Eye size={14} /> {item.image_urls.length}
                      </button> : "—"}
                  </td>
                  <td><span className={`badge badge-sm ${statusBadge(item.status)}`}>{item.status}</span></td>
                  <td style={{
                fontSize: 12
              }}>{new Date(item.created_at).toLocaleString()}</td>
                  <td>
                    {reviewing === item.id ? <div style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 4
                }}>
                        <input placeholder={t("wastage_admin.notes_optional")} value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} style={{
                    fontSize: 11,
                    padding: "4px 6px",
                    width: 120
                  }} />
                        <div style={{
                    display: "flex",
                    gap: 4
                  }}>
                          <button onClick={() => handleReview(item.id, "verified")} className="btn btn-sm btn-success" style={{
                      fontSize: 11,
                      padding: "2px 8px"
                    }}>{t("wastage_admin.verify")}</button>
                          <button onClick={() => handleReview(item.id, "flagged")} className="btn btn-sm btn-danger" style={{
                      fontSize: 11,
                      padding: "2px 8px"
                    }}>{t("wastage_admin.flag")}</button>
                          <button onClick={() => setReviewing(null)} className="btn btn-ghost btn-sm" style={{
                      fontSize: 11
                    }}>{t("wastage_admin.cancel")}</button>
                        </div>
                      </div> : item.status === "pending" ? <button onClick={() => setReviewing(item.id)} className="btn btn-outline btn-sm" style={{
                  fontSize: 12
                }}>{t("wastage_admin.review")}</button> : <div style={{
                  fontSize: 11
                }}>
                        {item.status === "verified" && <span style={{
                    color: "var(--color-success)",
                    display: "flex",
                    alignItems: "center",
                    gap: 2
                  }}><CheckCircle size={12} />{t("wastage_admin.verified")}</span>}
                        {item.status === "flagged" && <span style={{
                    color: "var(--color-error)",
                    display: "flex",
                    alignItems: "center",
                    gap: 2
                  }}><AlertTriangle size={12} />{t("wastage_admin.flagged")}</span>}
                        {item.verified_by && <div style={{
                    color: "var(--color-text-muted)",
                    marginTop: 2
                  }}>{item.verified_by}</div>}
                      </div>}
                  </td>
                </tr>)}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && <div style={{
      display: "flex",
      justifyContent: "center",
      gap: 8,
      marginTop: 16
    }}>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="btn btn-outline btn-sm">{t("hygiene.prev")}</button>
          <span style={{
        fontSize: 13,
        padding: "4px 8px",
        display: "flex",
        alignItems: "center"
      }}>{t("common.page_of", { page, total: totalPages })}</span>
          <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="btn btn-outline btn-sm">{t("hygiene.next")}</button>
        </div>}

      {modalImages && <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.7)",
      zIndex: 9999,
      display: "flex",
      alignItems: "center",
      justifyContent: "center"
    }} onClick={() => setModalImages(null)}>
          <div style={{
        background: "#fff",
        borderRadius: 12,
        padding: 24,
        maxWidth: 700,
        maxHeight: "80vh",
        overflow: "auto"
      }} onClick={e => e.stopPropagation()}>
            <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16
        }}>
              <h3 style={{
            margin: 0,
            fontSize: 16
          }}>{modalImages.label}</h3>
              <button onClick={() => setModalImages(null)} className="btn btn-ghost btn-sm" style={{
            fontSize: 18
          }}><XCircle size={20} /></button>
            </div>
            <div style={{
          display: "flex",
          gap: 8,
          flexWrap: "wrap"
        }}>
              {modalImages.images.map((url, i) =>
          // plain img: /uploads paths are served by the backend, not next/image
          <img key={i} src={url} alt="" style={{
            width: 150,
            height: 150,
            objectFit: "cover",
            borderRadius: 8,
            border: "1px solid var(--color-border-light)"
          }} />)}
            </div>
          </div>
        </div>}
    </div>;
}
