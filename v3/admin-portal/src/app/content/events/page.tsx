"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Plus, Edit2, Trash2 } from "lucide-react";
interface Card {
  id: number;
  title: string;
  start_date?: string;
  end_date?: string;
  position: number;
  is_active: boolean;
}
export default function EventsPage() {
  const {
    t
  } = useTranslation();
  const router = useRouter();
  const [items, setItems] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const fetch = useCallback(() => {
    api.get<{
      items: Card[];
    }>("/admin/event-cards?per_page=100").then(d => setItems(Array.isArray(d) ? d : d.items || [])).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    fetch();
  }, [fetch]);
  const handleDelete = async (id: number) => {
    if (!confirm("Delete?")) return;
    try {
      await api.del(`/admin/event-cards/${id}`);
      fetch();
    } catch (e) {
      console.error(e);
    }
  };
  return <div style={{
    padding: 32
  }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("content_events.events")}</h1>
          <p className="page-subtitle">{items.length}{t("content_events.events_2")}</p>
        </div>
        <button type="button" onClick={() => router.push("/content/events/new")} className="btn btn-primary btn-sm">
          <Plus size={16} />{t("content_events.add_event")}</button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="table-header-bar"><span className="text-sm font-semibold">{items.length}{t("content_events.events_3")}</span></div>
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("content_events.title")}</th>
              <th>{t("content_events.dates")}</th>
              <th>{t("content_events.pos")}</th>
              <th style={{
              width: 80
            }}>{t("content_events.status")}</th>
              <th style={{
              width: 80
            }}>{t("content_events.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={5} className="data-table-empty">{t("content_events.loading")}</td></tr> : items.map(item => <tr key={item.id} className="clickable" role="button" tabIndex={0} onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              router.push(`/content/events/${item.id}`);
            }
          }} onClick={() => router.push(`/content/events/${item.id}`)} style={{
            cursor: "pointer"
          }}>
                <td style={{
              fontWeight: 600
            }}>{item.title}</td>
                <td style={{
              fontSize: 12
            }}>
                  {item.start_date?.slice(0, 10) || "—"}
                  {item.end_date ? ` → ${item.end_date.slice(0, 10)}` : ""}
                </td>
                <td>{item.position}</td>
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
                    <button type="button" onClick={() => router.push(`/content/events/${item.id}`)} className="btn btn-ghost btn-sm" style={{
                  color: "var(--color-info)"
                }} aria-label={t("content_events.edit_event")}>
                      <Edit2 size={14} />
                    </button>
                    <button type="button" onClick={() => handleDelete(item.id)} className="btn btn-ghost btn-sm" style={{
                  color: "var(--color-error)"
                }} aria-label={t("content_events.delete_event")}>
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