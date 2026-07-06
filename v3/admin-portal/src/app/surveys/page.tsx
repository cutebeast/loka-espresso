"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Plus, Edit2, Trash2 } from "lucide-react";
interface Survey {
  id: number;
  survey_key: string;
  survey_name: string;
  description?: string;
  is_active: boolean;
  question_count?: number;
  response_count?: number;
}
export default function SurveysPage() {
  const {
    t
  } = useTranslation();
  const router = useRouter();
  const [items, setItems] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const fetchData = useCallback(() => {
    setLoading(true);
    api.get<{
      items: Survey[];
    }>("/admin/surveys?per_page=100").then(d => setItems(Array.isArray(d) ? d : d.items || [])).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  const handleDelete = async (id: number) => {
    if (!confirm("Delete this survey?")) return;
    try {
      await api.del(`/admin/surveys/${id}`);
      fetchData();
    } catch (e) {
      console.error(e);
    }
  };
  return <div style={{
    padding: 32
  }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("surveys.surveys")}</h1>
          <p className="page-subtitle">{items.length}{t("surveys.surveys_2")}</p>
        </div>
        <button type="button" onClick={() => router.push("/surveys/new")} className="btn btn-primary btn-sm">
          <Plus size={16} />{t("surveys.add_survey")}</button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="table-header-bar"><span className="text-sm font-semibold">{items.length}{t("surveys.surveys_3")}</span></div>
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("surveys.key")}</th>
              <th>{t("surveys.title")}</th>
              <th>{t("surveys.questions")}</th>
              <th>{t("surveys.responses")}</th>
              <th style={{
              width: 80
            }}>{t("surveys.status")}</th>
              <th style={{
              width: 80
            }}>{t("surveys.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className="data-table-empty">{t("surveys.loading")}</td></tr> : items.map(item => <tr key={item.id} className="clickable" role="button" tabIndex={0} onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              router.push(`/surveys/${item.id}`);
            }
          }} onClick={() => router.push(`/surveys/${item.id}`)} style={{
            cursor: "pointer"
          }}>
                <td style={{
              fontSize: 11
            }} className="font-mono">{item.survey_key}</td>
                <td style={{
              fontWeight: 600
            }}>{item.survey_name}</td>
                <td>{item.question_count ?? "—"}</td>
                <td>{item.response_count ?? 0}</td>
                <td onClick={e => e.stopPropagation()}>
                  <span className={`badge badge-sm ${item.is_active ? "badge-green" : "badge-gray"}`}>
                    {item.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td onClick={e => e.stopPropagation()}>
                  <div style={{
                display: "flex",
                gap: 4,
                alignItems: "center"
              }}>
                    <button type="button" onClick={() => router.push(`/surveys/${item.id}`)} className="btn btn-ghost btn-sm" style={{
                  color: "var(--color-info)"
                }} aria-label={t("surveys.edit_survey")}>
                      <Edit2 size={14} />
                    </button>
                    <button type="button" onClick={() => handleDelete(item.id)} className="btn btn-ghost btn-sm" style={{
                  color: "var(--color-error)"
                }} aria-label={t("surveys.delete_survey")}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>)}
          </tbody>
        </table>
      </div>
    </div>;
}