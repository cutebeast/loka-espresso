"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Plus, Edit2, Trash2 } from "lucide-react";

export default function DietaryTagsPage() {
  const router = useRouter();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getRaw<{ items: any[] }>("/admin/menu/dietary-tags?per_page=50").then(d => setItems(d.items || [])).catch((e) => { console.error('dietary-tags:', e); }).finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header">
        <div><h1 className="page-title">Dietary Tags</h1><p className="page-subtitle">{items.length} tags</p></div>
        <button onClick={() => router.push("/menu/dietary-tags/new")} className="btn btn-primary btn-sm"><Plus size={16} /> Add Tag</button>
      </div>
      <div className="table-container" style={{ marginTop: 16 }}>
        <table className="data-table">
          <thead><tr><th>Tag</th><th>Key</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={4} className="data-table-empty">Loading...</td></tr>
            : items.map(item => (
              <tr key={item.id}>
                <td><div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: item.color_hex || "#22C55E", display: "inline-block" }} />{item.icon} {item.display_name}</div></td>
                <td className="font-mono" style={{ fontSize: 12 }}>{item.tag_key}</td>
                <td><span className={`badge badge-sm ${item.is_active ? "badge-green" : "badge-gray"}`}>{item.is_active ? "Active" : "Inactive"}</span></td>
                <td>
                  <button onClick={() => router.push(`/menu/dietary-tags/${item.id}`)} className="btn btn-ghost btn-sm" style={{ color: "var(--color-info)", marginRight: 4 }}><Edit2 size={14} /></button>
                  <button onClick={async () => { if (confirm("Delete?")) { await api.del(`/admin/menu/dietary-tags/${item.id}`); const d = await api.getRaw<{ items: any[] }>("/admin/menu/dietary-tags?per_page=50"); setItems(d.items || []); } }} className="btn btn-ghost btn-sm" style={{ color: "var(--color-error)" }}><Trash2 size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
