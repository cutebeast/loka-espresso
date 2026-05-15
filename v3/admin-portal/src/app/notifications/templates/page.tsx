"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Plus, Edit2, Trash2, ArrowLeft } from "lucide-react";

interface Template { id: number; name: string; title: string; body?: string; notification_type: string; audience_segment: string; }

export default function TemplatesPage() {
  const router = useRouter();
  const [items, setItems] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const fetch = () => { setLoading(true);
    api.get<{items:Template[]}>("/admin/notifications/templates/list").then(d => setItems(Array.isArray(d)?d:(d.items||[]))).catch(e=>setError(e.message)).finally(()=>setLoading(false));
  };
  useEffect(()=>{fetch();},[]);

  const handleDelete = async (id: number) => { if(!confirm("Delete?"))return; try{await api.del(`/admin/notifications/templates/${id}`);setConfirmDelete(null);fetch();}catch{}; };

  const typeBadge = (t: string) => <span className="badge badge-sm badge-outline">{t}</span>;

  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={()=>router.push("/notifications")} className="btn btn-ghost btn-sm"><ArrowLeft size={18}/></button>
        <div style={{ flex: 1 }}><h1 className="page-title" style={{ margin: 0 }}>Notification Templates</h1><p className="page-subtitle">{items.length} templates — reusable notification blueprints</p></div>
        <button onClick={()=>router.push("/notifications/templates/new")} className="btn btn-primary btn-sm"><Plus size={16}/> Add Template</button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="table-header-bar"><span className="text-sm font-semibold">{items.length} templates</span></div>
      <div className="table-container"><table className="data-table">
        <thead><tr><th>Name</th><th>Title</th><th>Type</th><th>Audience</th><th style={{ width: 80 }}>Actions</th></tr></thead>
        <tbody>
          {loading ? <tr><td colSpan={5} className="data-table-empty">Loading...</td></tr>
          : items.map(t => (
            <tr key={t.id} className="clickable" onClick={()=>router.push(`/notifications/templates/${t.id}`)} style={{ cursor: "pointer" }}>
              <td style={{ fontWeight: 600 }}>{t.name}</td>
              <td>{t.title}</td>
              <td>{typeBadge(t.notification_type)}</td>
              <td style={{ fontSize: 12 }}>{t.audience_segment.replace(/_/g, " ")}</td>
              <td onClick={e=>e.stopPropagation()}>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={()=>router.push(`/notifications/templates/${t.id}`)} className="btn btn-ghost btn-sm" style={{ color: "var(--color-info)" }}><Edit2 size={14}/></button>
                  {confirmDelete===t.id ? <><button onClick={()=>handleDelete(t.id)} className="btn btn-ghost btn-sm" style={{ color: "var(--color-error)", fontWeight: 600 }}>✓</button><button onClick={()=>setConfirmDelete(null)} className="btn btn-ghost btn-sm">✕</button></> : <button onClick={()=>setConfirmDelete(t.id)} className="btn btn-ghost btn-sm" style={{ color: "var(--color-error)" }}><Trash2 size={14}/></button>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
    </div>
  );
}
