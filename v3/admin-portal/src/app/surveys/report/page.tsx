"use client";
import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { ChevronLeft, ChevronRight, Download, ChevronDown, ChevronUp } from "lucide-react";

const PAGE_SIZE = 10;

interface Survey {
  id: number; survey_name: string; is_active: boolean;
  question_count?: number; response_count?: number;
}
interface Answer { question_id: number; question_text?: string; question_type?: string; answer_value?: string; }
interface Response {
  id: number; customer_id?: number; customer_name?: string; respondent_email?: string;
  nps_score?: number; overall_satisfaction?: number;
  created_at: string; answers?: Answer[];
}

export default function SurveyReportPage() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [responses, setResponses] = useState<Response[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalResponses, setTotalResponses] = useState(0);
  const [loading, setLoading] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    api.get<{ items: Survey[] }>("/admin/surveys?per_page=100")
      .then(d => {
        const list = (Array.isArray(d) ? d : (d.items || [])) as Survey[];
        setSurveys(list);
      })
      .catch(() => {});
  }, []);

  const fetchResponses = useCallback(async (p: number = 1) => {
    if (!selectedId) return;
    setLoading(true);
    try {
      const d = await api.getRaw<{ items: Response[]; total: number; page: number; total_pages: number }>(
        `/admin/surveys/${selectedId}/responses?page=${p}&per_page=${PAGE_SIZE}`
      );
      setResponses(d.items || []);
      setTotalPages(d.total_pages || 1);
      setTotalResponses(d.total || 0);
      setPage(p);
    } catch { setResponses([]); }
    finally { setLoading(false); }
  }, [selectedId]);

  useEffect(() => {
    if (selectedId) fetchResponses(1);
    else { setResponses([]); setTotalPages(1); setTotalResponses(0); setPage(1); }
  }, [selectedId, fetchResponses]);

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selected = surveys.find(s => s.id === selectedId);
  const totalNps = responses.reduce((s, r) => s + (r.nps_score || 0), 0);
  const avgNps = responses.length ? (totalNps / responses.length).toFixed(1) : "—";

  const renderAnswer = (a: Answer) => {
    const val = a.answer_value;
    if (!val) return <span style={{ color: "var(--color-text-muted)" }}>—</span>;
    if (a.question_type === "rating_scale") {
      const stars = parseInt(val) || 0;
      return <span>{Array.from({ length: 5 }, (_, i) => <span key={i} style={{ color: i < stars ? "#F59E0B" : "#D1D5DB" }}>★</span>)}</span>;
    }
    return <span>{val}</span>;
  };

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Survey Report</h1>
          <p className="page-subtitle" style={{ marginTop: 4 }}>View responses per survey</p>
        </div>
        {selectedId && (
          <button
            className="btn btn-sm btn-outline"
            onClick={async () => {
              try {
                const res = await api.fetchRaw("GET", `/admin/surveys/${selectedId}/responses/export`);
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url; a.download = `survey-${selectedId}-responses.json`; a.click();
                URL.revokeObjectURL(url);
              } catch { /* ignore */ }
            }}
          >
            <Download size={14} /> Export JSON
          </button>
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <select
          value={selectedId || ""}
          onChange={e => { const v = e.target.value; setSelectedId(v ? Number(v) : null); }}
          style={{ padding: "8px 12px", fontSize: 13, borderRadius: "var(--radius-sm)", minWidth: 300 }}
        >
          <option value="">— Select a survey —</option>
          {surveys.map(s => (
            <option key={s.id} value={s.id}>
              {s.survey_name} ({s.response_count ?? 0} response{(s.response_count ?? 0) !== 1 ? "s" : ""})
            </option>
          ))}
        </select>
        {surveys.length === 0 && (
          <p style={{ color: "var(--color-text-muted)", fontSize: 13, marginTop: 8 }}>
            No surveys with responses yet.
          </p>
        )}
      </div>

      {selected && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ margin: 0 }}>{selected.survey_name}</h3>
          <div style={{ display: "flex", gap: 24, marginTop: 8, fontSize: 13 }}>
            <div><strong>{totalResponses}</strong> response{totalResponses !== 1 ? "s" : ""}</div>
            <div><strong>Avg NPS: {avgNps}</strong></div>
            <div style={{ color: "var(--color-text-muted)" }}>
              Showing {responses.length} on page {page} of {totalPages || 1}
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <p>Loading...</p>
      ) : responses.length > 0 ? (
        <>
          <div className="table-container" style={{ marginBottom: 16 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 50 }}>#</th>
                  <th>Customer</th>
                  <th>NPS</th>
                  <th>Satisfaction</th>
                  <th>Date</th>
                  <th style={{ width: 50 }}></th>
                </tr>
              </thead>
              <tbody>
                {responses.map((r, i) => {
                  const globalIdx = (page - 1) * PAGE_SIZE + i + 1;
                  const isExpanded = expandedIds.has(r.id);
                  return (
                    <>
                      <tr key={r.id} onClick={() => toggleExpand(r.id)} style={{ cursor: "pointer" }}>
                        <td style={{ color: "var(--color-text-muted)", fontSize: 12 }}>{globalIdx}</td>
                        <td>
                          <div style={{ fontWeight: 600 }}>{r.customer_name || `#${r.customer_id || "—"}`}</div>
                          {r.respondent_email && <div style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{r.respondent_email}</div>}
                        </td>
                        <td>{r.nps_score ?? "—"}</td>
                        <td>{r.overall_satisfaction ?? "—"}</td>
                        <td style={{ fontSize: 12 }}>{r.created_at?.slice(0, 10)}</td>
                        <td>{isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</td>
                      </tr>
                      {isExpanded && r.answers && (
                        <tr key={`${r.id}-exp`}>
                          <td colSpan={6} style={{ background: "var(--color-bg-muted)", padding: "12px 16px" }}>
                            {r.answers.map((a, ai) => (
                              <div key={ai} style={{ marginBottom: ai < (r.answers?.length || 0) - 1 ? 8 : 0 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-text-muted)", marginBottom: 2 }}>
                                  Q{ai + 1}: {a.question_text || `Question #${a.question_id}`}
                                  {a.question_type && <span style={{ fontWeight: 400, marginLeft: 6 }}>({a.question_type})</span>}
                                </div>
                                <div style={{ fontSize: 13 }}>{renderAnswer(a)}</div>
                              </div>
                            ))}
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, alignItems: "center" }}>
              <button
                className="btn btn-sm btn-ghost"
                disabled={page <= 1}
                onClick={() => fetchResponses(page - 1)}
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <span style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                Page {page} of {totalPages}
              </span>
              <button
                className="btn btn-sm btn-ghost"
                disabled={page >= totalPages}
                onClick={() => fetchResponses(page + 1)}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          )}
        </>
      ) : selectedId ? (
        <p style={{ color: "var(--color-text-muted)" }}>No responses yet for this survey.</p>
      ) : null}
    </div>
  );
}
