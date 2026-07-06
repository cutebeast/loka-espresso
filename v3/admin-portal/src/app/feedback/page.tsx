"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { Star, Reply, Edit2, Trash2, X, ChevronLeft, ChevronRight } from "lucide-react";
const PAGE_SIZE = 20;
interface FeedbackItem {
  id: number;
  customer_id: number;
  store_id?: number | null;
  title: string;
  body?: string | null;
  rating: number;
  admin_reply?: string | null;
  replied_at?: string | null;
  is_read: boolean;
  created_at: string;
  customer_name?: string | null;
  store_name?: string | null;
}
interface FeedbackStats {
  average_rating: number;
  total_reviews: number;
  rating_distribution: Record<number, number>;
}
export default function FeedbackPage() {
  const {
    t
  } = useTranslation();
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Reply modal
  const [replyModal, setReplyModal] = useState<FeedbackItem | null>(null);
  const [replyText, setReplyText] = useState("");
  const [replySubmitting, setReplySubmitting] = useState(false);
  const [replyError, setReplyError] = useState("");
  const fetchData = useCallback(async (p: number = 1) => {
    try {
      const params = new URLSearchParams({
        page: String(p),
        per_page: String(PAGE_SIZE)
      });
      if (fromDate) params.set("from_date", fromDate + "T00:00:00");
      if (toDate) params.set("to_date", toDate + "T23:59:59");
      const d = await api.getRaw<{
        items: FeedbackItem[];
        total: number;
        total_pages: number;
      }>(`/admin/feedback?${params}`);
      setItems(d.items || []);
      setTotal(d.total || 0);
      setTotalPages(d.total_pages || 1);
      setPage(p);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);
  const fetchStats = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set("from_date", fromDate + "T00:00:00");
      if (toDate) params.set("to_date", toDate + "T23:59:59");
      const s = await api.getRaw<FeedbackStats>(`/admin/feedback/stats?${params}`);
      setStats(s);
    } catch (e: any) {
      console.error("Failed to load feedback stats:", e);
    }
  }, [fromDate, toDate]);
  useEffect(() => {
    (async () => {
      fetchData(1);
      fetchStats();
    })();
  }, [fetchData, fetchStats]);
  const openReply = (item: FeedbackItem, isEdit: boolean = false) => {
    setReplyModal(item);
    setReplyText(isEdit ? item.admin_reply || "" : "");
    setReplyError("");
  };
  const submitReply = async () => {
    if (!replyModal) return;
    setReplySubmitting(true);
    setReplyError("");
    try {
      await api.post(`/admin/feedback/${replyModal.id}/reply`, {
        admin_reply: replyText.trim()
      });
      setReplyModal(null);
      setReplyText("");
      fetchData(page);
      fetchStats();
    } catch (e: any) {
      setReplyError(e.message);
    } finally {
      setReplySubmitting(false);
    }
  };
  const deleteReply = async (item: FeedbackItem) => {
    if (!confirm("Delete this reply?")) return;
    try {
      await api.post(`/admin/feedback/${item.id}/reply`, {
        admin_reply: "",
        clear_reply: true
      });
      fetchData(page);
      fetchStats();
    } catch (e: any) {
      console.error("Failed to delete reply:", e);
    }
  };
  const renderStars = (rating: number) => <span style={{
    display: "inline-flex",
    gap: 2
  }}>
      {[1, 2, 3, 4, 5].map(i => <Star key={i} size={16} fill={i <= rating ? "#F59E0B" : "none"} color={i <= rating ? "#F59E0B" : "#D1D5DB"} />)}
    </span>;
  const formatDate = (s: string) => new Date(s).toLocaleDateString();
  return <div style={{
    padding: 32
  }}>
      <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 24
    }}>
        <div>
          <h1 className="page-title" style={{
          margin: 0
        }}>{t("feedback.feedback")}</h1>
          <p className="page-subtitle" style={{
          marginTop: 4
        }}>{t("feedback.customer_complaints_praise_submitted_directly_to")}</p>
        </div>
      </div>
      {error && <div className="alert alert-error" style={{
      marginBottom: 12
    }}>{error}</div>}

      {/* Stats Dashboard */}
      {stats && <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
      gap: 12,
      marginBottom: 20
    }}>
          <div className="card" style={{
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 4
      }}>
            <div style={{
          fontSize: 12,
          color: "var(--color-text-muted)"
        }}>{t("feedback.average_rating")}</div>
            <div style={{
          fontSize: 28,
          fontWeight: 700
        }}>{typeof stats.average_rating === "number" ? stats.average_rating.toFixed(1) : "—"}</div>
            <div>{renderStars(Math.round(stats.average_rating))}</div>
          </div>
          <div className="card" style={{
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 4
      }}>
            <div style={{
          fontSize: 12,
          color: "var(--color-text-muted)"
        }}>{t("feedback.total_reviews")}</div>
            <div style={{
          fontSize: 28,
          fontWeight: 700
        }}>{stats.total_reviews}</div>
          </div>
          <div className="card" style={{
        padding: 16
      }}>
            <div style={{
          fontSize: 12,
          color: "var(--color-text-muted)",
          marginBottom: 8
        }}>{t("feedback.rating_distribution")}</div>
            {[5, 4, 3, 2, 1].map(star => {
          const count = stats.rating_distribution[star] || 0;
          const pct = stats.total_reviews > 0 ? count / stats.total_reviews * 100 : 0;
          return <div key={star} style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 2,
            fontSize: 12
          }}>
                  <span style={{
              width: 20,
              textAlign: "right"
            }}>{star}★</span>
                  <div style={{
              flex: 1,
              height: 8,
              background: "var(--color-bg-muted)",
              borderRadius: 4,
              overflow: "hidden"
            }}>
                    <div style={{
                width: `${pct}%`,
                height: "100%",
                background: "#F59E0B",
                borderRadius: 4
              }} />
                  </div>
                  <span style={{
              width: 24,
              color: "var(--color-text-muted)"
            }}>{count}</span>
                </div>;
        })}
          </div>
        </div>}

      {/* Date filter */}
      <div style={{
      display: "flex",
      gap: 8,
      alignItems: "center",
      marginBottom: 16
    }}>
        <input type="date" value={fromDate} onChange={e => {
        setFromDate(e.target.value);
        setPage(1);
      }} style={{
        padding: "6px 8px",
        fontSize: 12,
        borderRadius: "var(--radius-sm)",
        width: 140
      }} />
        <span style={{
        fontSize: 12,
        color: "var(--color-text-muted)"
      }}>{t("feedback.to")}</span>
        <input type="date" value={toDate} onChange={e => {
        setToDate(e.target.value);
        setPage(1);
      }} style={{
        padding: "6px 8px",
        fontSize: 12,
        borderRadius: "var(--radius-sm)",
        width: 140
      }} />
        {(fromDate || toDate) && <button onClick={() => {
        setFromDate("");
        setToDate("");
      }} className="btn btn-ghost btn-sm">{t("feedback.clear")}</button>}
      </div>

      {/* Stats bar */}
      <div style={{
      display: "flex",
      justifyContent: "space-between",
      marginBottom: 12,
      fontSize: 13,
      color: "var(--color-text-muted)"
    }}>
        <span>{t("feedback.showing")}<strong>{items.length}</strong>{t("feedback.of")}<strong>{total}</strong>{t("feedback.feedback_items")}</span>
        <span>{t("feedback.page")}{page}{t("feedback.of_2")}{totalPages || 1}</span>
      </div>

      {/* Feedback cards */}
      {loading ? <p>{t("feedback.loading")}</p> : items.length === 0 ? <div className="card" style={{
      padding: 24,
      textAlign: "center",
      color: "var(--color-text-muted)"
    }}>{t("feedback.no_feedback_yet")}</div> : <div style={{
      display: "flex",
      flexDirection: "column",
      gap: 10
    }}>
          {items.map(item => <div key={item.id} className="card" style={{
        padding: 14
      }}>
              <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start"
        }}>
                <div style={{
            flex: 1
          }}>
                  <div style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              marginBottom: 4
            }}>
                    <strong style={{
                fontSize: 14
              }}>{item.customer_name || `Customer #${item.customer_id}`}</strong>
                    {renderStars(item.rating)}
                  </div>
                  <div style={{
              fontSize: 12,
              color: "var(--color-text-muted)",
              marginBottom: 4
            }}>
                    {item.store_name && <span>{item.store_name} · </span>}
                    {formatDate(item.created_at)}
                    {!item.is_read && <span style={{
                marginLeft: 8,
                color: "var(--color-info)",
                fontWeight: 600
              }}>{t("feedback.new")}</span>}
                  </div>
                  <p style={{
              fontSize: 14,
              margin: 0,
              whiteSpace: "pre-wrap"
            }}>{item.body || item.title}</p>
                </div>
                <div style={{
            display: "flex",
            gap: 4,
            flexShrink: 0,
            marginLeft: 12
          }}>
                  {!item.admin_reply ? <button onClick={() => openReply(item)} className="btn btn-sm btn-outline"><Reply size={12} />{t("feedback.reply")}</button> : <>
                      <button onClick={() => openReply(item, true)} className="btn btn-sm btn-ghost" style={{
                color: "var(--color-info)"
              }}><Edit2 size={12} />{t("feedback.edit")}</button>
                      <button onClick={() => deleteReply(item)} className="btn btn-sm btn-ghost" style={{
                color: "var(--color-error)"
              }}><Trash2 size={12} /></button>
                    </>}
                </div>
              </div>
              {item.admin_reply && <div style={{
          marginTop: 10,
          padding: 10,
          background: "var(--color-bg-muted)",
          borderRadius: "var(--radius-sm)",
          borderLeft: "3px solid var(--color-info)"
        }}>
                  <div style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--color-text-muted)",
            marginBottom: 4
          }}>{t("feedback.hq_reply")}</div>
                  <div style={{
            fontSize: 13
          }}>{item.admin_reply}</div>
                </div>}
            </div>)}
        </div>}

      {/* Pagination */}
      {totalPages > 1 && <div style={{
      display: "flex",
      justifyContent: "center",
      gap: 8,
      alignItems: "center",
      marginTop: 16
    }}>
          <button className="btn btn-sm btn-ghost" disabled={page <= 1} onClick={() => fetchData(page - 1)}><ChevronLeft size={14} />{t("feedback.prev")}</button>
          <span style={{
        fontSize: 13,
        color: "var(--color-text-muted)"
      }}>{t("feedback.page_2")}{page}{t("feedback.of_3")}{totalPages}</span>
          <button className="btn btn-sm btn-ghost" disabled={page >= totalPages} onClick={() => fetchData(page + 1)}>{t("feedback.next")}<ChevronRight size={14} /></button>
        </div>}

      {/* Reply Modal */}
      {replyModal && <>
          <div className="drawer-overlay" onClick={() => setReplyModal(null)} />
          <div className="drawer">
            <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16
        }}>
              <h3 style={{
            fontSize: 16,
            fontWeight: 700
          }}>{replyModal.admin_reply ? "Edit" : "Reply to"}{t("feedback.feedback_2")}</h3>
              <button onClick={() => setReplyModal(null)} className="btn btn-icon btn-ghost"><X size={18} /></button>
            </div>
            <div style={{
          marginBottom: 12,
          padding: 10,
          background: "var(--color-bg-muted)",
          borderRadius: "var(--radius-sm)"
        }}>
              <div style={{
            fontWeight: 600,
            fontSize: 13
          }}>{replyModal.customer_name || `Customer #${replyModal.customer_id}`}</div>
              <div style={{
            display: "flex",
            gap: 4,
            marginTop: 2
          }}>{renderStars(replyModal.rating)}</div>
              <p style={{
            fontSize: 13,
            marginTop: 4
          }}>{replyModal.body || replyModal.title}</p>
            </div>
            {replyError && <div className="alert alert-error" style={{
          marginBottom: 8,
          fontSize: 12
        }}>{replyError}</div>}
            <textarea rows={4} value={replyText} onChange={e => setReplyText(e.target.value)} placeholder={t("feedback.write_your_reply")} style={{
          width: "100%",
          padding: "8px 12px",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--color-border-light)",
          fontSize: 13
        }} />
            <div style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
          marginTop: 12
        }}>
              <button onClick={() => setReplyModal(null)} className="btn btn-ghost">{t("feedback.cancel")}</button>
              <button onClick={submitReply} className="btn btn-primary" disabled={replySubmitting || !replyText.trim()}>
                {replySubmitting ? "Sending..." : replyModal.admin_reply ? "Update" : "Send"}
              </button>
            </div>
          </div>
        </>}
    </div>;
}