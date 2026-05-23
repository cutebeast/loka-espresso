"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Plus, Info, ChevronDown } from "lucide-react";
import TableCard, { type TableItem } from "@/components/tables/TableCard";
import { useQrImages, useQrExpiry, type TableQrInfo } from "@/components/tables/QRCodeGenerator";

interface Store { id: number; store_name: string; is_active: boolean; }

export default function TablesPage() {
  const router = useRouter();
  const [tables, setTables] = useState<TableItem[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStore, setSelectedStore] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showDrawer, setShowForm] = useState(false);
  const [editing, setEditing] = useState<TableItem | null>(null);
  const [form, setForm] = useState({ table_number: "", display_name: "", capacity: 4, section: "" });
  const [saving, setSaving] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const qrInfo: TableQrInfo[] = useMemo(() => tables.map(t => ({ id: t.id, qr_code_url: t.qr_code_url, qr_code_token: t.qr_code_token, qr_generated_at: t.qr_generated_at })), [tables]);
  const qrImages = useQrImages(qrInfo, selectedStore);
  const qrExpiry = useQrExpiry(qrInfo);
  const physicalStores = stores.filter(s => s.id > 0);

  const fetchStores = useCallback(async () => {
    return api.get<{ items: Store[] }>("/admin/stores?per_page=50");
  }, []);

  const fetchTables = useCallback(async () => {
    if (!selectedStore) return null;
    return api.get<TableItem[]>(`/admin/stores/${selectedStore}/tables`);
  }, [selectedStore]);

  const applyTables = useCallback((data: TableItem[] | null) => {
    if (data === null) return;
    const list = Array.isArray(data) ? data : [];
    list.sort((a, b) => (a.table_number || "").localeCompare(b.table_number || "", undefined, { numeric: true }));
    setTables(list);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchStores()
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setStores(list);
        if (list.length > 0) setSelectedStore(list[0].id);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [fetchStores]);

  useEffect(() => {
    let cancelled = false;
    fetchTables()
      .then((data) => { if (!cancelled) applyTables(data); })
      .catch((err: any) => { if (!cancelled) setError(err.message || "Failed to load tables"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fetchTables, applyTables]);

  const resetForm = () => { setForm({ table_number: "", display_name: "", capacity: 4, section: "" }); setEditing(null); setShowForm(false); setConfirmDelete(null); };
  const openEdit = (t: TableItem) => { setForm({ table_number: t.table_number, display_name: t.display_name || "", capacity: t.capacity || 4, section: t.section || "" }); setEditing(t); setShowForm(true); };

  const handleSubmit = async (e: React.FormEvent) => { e.preventDefault(); setSaving(true); setError("");
    try {
      if (editing) { await api.patch(`/admin/stores/${selectedStore}/tables/${editing.id}`, form); setSuccess(`Table ${form.table_number} updated`); }
      else { await api.post(`/admin/stores/${selectedStore}/tables`, form); setSuccess(`Table ${form.table_number} created`); }
      resetForm(); applyTables(await fetchTables()); setTimeout(() => setSuccess(""), 3000);
    } catch (err: any) { setError(err.message); } finally { setSaving(false); }
  };

  const handleToggle = async (t: TableItem) => { try { await api.patch(`/admin/stores/${selectedStore}/tables/${t.id}`, { is_active: !t.is_active }); applyTables(await fetchTables()); } catch (err: any) { setError(err.message); } };
  const handleDelete = async (t: TableItem) => { try { await api.del(`/admin/stores/${selectedStore}/tables/${t.id}`); setConfirmDelete(null); applyTables(await fetchTables()); } catch (err: any) { setError(err.message); } };
  const handleGenerateQr = async (t: TableItem) => { try { await api.post(`/admin/stores/${selectedStore}/tables/${t.id}/generate-qr`); applyTables(await fetchTables()); } catch (err: any) { setError(err.message); } };
  const handleRegenerateQr = async (t: TableItem) => { try { await api.post(`/admin/stores/${selectedStore}/tables/${t.id}/generate-qr`); applyTables(await fetchTables()); } catch (err: any) { setError(err.message); } };

  const handleDownloadQr = async (t: TableItem) => {
    const dataUrl = qrImages[t.id];
    if (dataUrl) { const a = document.createElement("a"); a.href = dataUrl; a.download = `table-${t.table_number}-qr.png`; a.click(); return; }
    try {
      const res = await api.fetchRaw("GET", `/admin/stores/${selectedStore}/tables/${t.id}/qr-image`);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob(); const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = `table-${t.table_number}-qr.png`; a.click(); URL.revokeObjectURL(url);
    } catch (err: any) { setError(err.message); }
  };

  const selectedStoreName = physicalStores.find(s => s.id === selectedStore)?.store_name;

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header" style={{ marginBottom: 12 }}>
        <div><h1 className="page-title">Tables</h1><p className="page-subtitle">{tables.length} tables</p></div>
        {selectedStore > 0 && <button onClick={() => { resetForm(); setShowForm(true); }} className="btn btn-primary btn-sm"><Plus size={16} /> Add Table</button>}
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 16 }}>
        <select value={selectedStore || ""} onChange={e => setSelectedStore(Number(e.target.value))} style={{ padding: "6px 12px", fontSize: 13, borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)" }}>
          <option value="" disabled>Select a store</option>
          {physicalStores.map(s => <option key={s.id} value={s.id}>{s.store_name}</option>)}
        </select>
      </div>

      {!selectedStore && <div style={{ textAlign: "center", padding: 60, color: "var(--color-text-muted)" }}><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: "0 auto 12px", opacity: 0.4 }}><rect x="4" y="2" width="16" height="20" rx="2" /><line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="2" /></svg><p style={{ fontSize: 14 }}>Select a store to manage tables</p></div>}

      {selectedStore > 0 && (<>
        {error && <div className="alert alert-error">{error}</div>}
        {success && <div className="alert alert-success">{success}</div>}

        <div className="tp-guide-card">
          <div className="tp-guide-header" onClick={() => setShowGuide(!showGuide)} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <Info size={18} /><span>QR Table Workflow</span><ChevronDown size={16} style={{ transform: showGuide ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />
          </div>
          {showGuide && <div className="tp-guide-content">
            <ol style={{ margin: 0, padding: "0 0 0 20px", fontSize: 13, color: "var(--color-text-muted)" }}>
              <li style={{ marginBottom: 4 }}>Generate a QR code for the table</li>
              <li style={{ marginBottom: 4 }}>Download and place the QR code on the physical table</li>
              <li style={{ marginBottom: 4 }}>Customer scans QR to start dine-in ordering</li>
            </ol>
          </div>}
        </div>

        {showDrawer && (<>
          <div className="drawer-overlay" onClick={resetForm} />
          <div className="drawer" style={{ width: 480 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}><h3 style={{ margin: 0 }}>{editing ? `Edit Table ${editing.table_number}` : "New Table"}</h3><button onClick={resetForm} className="btn btn-ghost btn-sm" style={{ fontSize: 20 }}>✕</button></div>
            <form onSubmit={handleSubmit}><div className="df-grid">
              <div className="df-field"><label className="df-label">Table Number *</label><input required value={form.table_number} onChange={e => setForm({ ...form, table_number: e.target.value })} placeholder="e.g. A1" /></div>
              <div className="df-field"><label className="df-label">Display Name</label><input value={form.display_name} onChange={e => setForm({ ...form, display_name: e.target.value })} placeholder="Window Seat" /></div>
              <div className="df-field"><label className="df-label">Capacity</label><input type="number" min={1} max={50} value={form.capacity} onChange={e => setForm({ ...form, capacity: Number(e.target.value) })} /></div>
              <div className="df-field"><label className="df-label">Section</label><input value={form.section} onChange={e => setForm({ ...form, section: e.target.value })} placeholder="Indoor / Outdoor" /></div>
              <div className="df-actions" style={{ gridColumn: "1/-1" }}><button type="button" onClick={resetForm} className="btn btn-ghost">Cancel</button><button type="submit" disabled={saving} className="btn btn-primary">{saving ? "Saving..." : editing ? "Update Table" : "Create Table"}</button></div>
            </div></form>
          </div>
        </>)}

        {!loading && tables.length === 0 && <div style={{ textAlign: "center", padding: 60, color: "var(--color-text-muted)" }}><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ margin: "0 auto 12px", opacity: 0.4 }}><rect x="4" y="2" width="16" height="20" rx="2" /><line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="2" /></svg><p style={{ fontSize: 14 }}>No tables yet for {selectedStoreName}</p><button onClick={() => { resetForm(); setShowForm(true); }} className="btn btn-primary btn-sm" style={{ marginTop: 12 }}>Add First Table</button></div>}

        {loading && <p style={{ textAlign: "center", padding: 60, color: "var(--color-text-muted)" }}>Loading tables...</p>}

        {!loading && tables.length > 0 && <div className="tp-32" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16, marginTop: 16 }}>
          {tables.map(t => <TableCard key={t.id} table={t} qrImageUrl={qrImages[t.id]} expiry={qrExpiry[t.id] || { remaining: 0, expired: true }} onGenerateQr={handleGenerateQr} onDownloadQr={handleDownloadQr} onRegenerateQr={handleRegenerateQr} onToggle={handleToggle} onEdit={openEdit} onDelete={handleDelete} onViewOrder={(id: number) => router.push(`/orders/${id}`)} confirmDelete={confirmDelete} onConfirmDelete={setConfirmDelete} />)}
        </div>}
      </>)}
    </div>
  );
}
