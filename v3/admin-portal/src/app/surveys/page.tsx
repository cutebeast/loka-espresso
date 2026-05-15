"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Plus, Edit2, Trash2 } from "lucide-react";

interface Survey { id: number; survey_key: string; survey_name: string; description?: string; is_active: boolean; question_count?: number; response_count?: number; }

export default function SurveysPage() {
  const router = useRouter();
  const [items, setItems] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = () => { setLoading(true); api.get<{items:Survey[]}>("/admin/surveys?per_page=100").then(d => setItems(Array.isArray(d) ? d : (d.items||[]))).catch(e => setError(e.message)).finally(() => setLoading(false)); };
  useEffect(() => { fetchData(); }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this survey?")) return;
    try { await api.del(`/admin/surveys/${id}`); fetchData(); } catch { /* ignore */ }
  };

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header"><div><h1 className="page-title">Surveys</h1><p className="page-subtitle">{items.length} surveys</p></div><button onClick={() => router.push("/surveys/new")} className="btn btn-primary btn-sm"><Plus size={16} /> Add Survey</button></div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="table-header-bar"><span className="text-sm font-semibold">{items.length} surveys</span></div>
      <div className="table-container"><table className="data-table">
        <thead><tr><th>Key</th><th>Title</th><th>Questions</th><th>Responses</th><th style={{ width: 80 }}>Status</th><th style={{ width: 80 }}>Actions</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={6} className="data-table-empty">Loading...</td></tr>
          : items.map(item => (
            <tr key={item.id} className="clickable" onClick={() => router.push(`/surveys/${item.id}`)} style={{ cursor: "pointer" }}>
              <td className="font-mono" style={{ fontSize: 11 }}>{item.survey_key}</td>
              <td style={{ fontWeight: 600 }}>{item.survey_name}</td>
              <td>{item.question_count ?? "—"}</td>
              <td>{item.response_count ?? 0}</td>
              <td onClick={e => e.stopPropagation()}><span className={`badge badge-sm ${item.is_active ? "badge-green" : "badge-gray"}`}>{item.is_active ? "Active" : "Inactive"}</span></td>
              <td onClick={e => e.stopPropagation()}>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <button onClick={() => router.push(`/surveys/${item.id}`)} className="btn btn-ghost btn-sm" style={{ color: "var(--color-info)" }}><Edit2 size={14} /></button>
                  <button onClick={() => handleDelete(item.id)} className="btn btn-ghost btn-sm" style={{ color: "var(--color-error)" }}><Trash2 size={14} /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}
