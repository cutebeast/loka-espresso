"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { getTables, generateTableQr, updateTableStatus, type Table } from "@/lib/api";
import { usePolling } from "@/hooks/usePolling";
import { useQrImages } from "@/hooks/useQrImages";
import { useQrExpiry } from "@/hooks/useQrExpiry";
import PageHeader from "@/components/PageHeader";
import Alert from "@/components/Alert";
import EmptyState from "@/components/EmptyState";
import Modal from "@/components/Modal";
import SkeletonCard from "@/components/SkeletonCard";
import {
  RefreshCw, QrCode, Download, Users, Circle, Receipt,
  UtensilsCrossed, ShoppingCart, CheckCircle, AlertTriangle,
  Armchair, MapPin
} from "lucide-react";

export default function TablesPage() {
  const router = useRouter();
  const storeId = Number(typeof window !== "undefined" ? localStorage.getItem("staffStoreId") || "0" : "0");
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [sectionFilter, setSectionFilter] = useState<string>("all");
  const [generatingQr, setGeneratingQr] = useState<number | null>(null);
  const [confirmClean, setConfirmClean] = useState<Table | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchTables = useCallback(async () => {
    if (!storeId) return;
    try {
      const data = await getTables(storeId);
      const list = Array.isArray(data) ? [...data] : [];
      list.sort((a, b) => (a.table_number || "").localeCompare(b.table_number || "", undefined, { numeric: true }));
      setTables(list);
      setError("");
    } catch (err: any) {
      console.error("Failed to load tables:", err);
      setError(err.message || "Failed to load tables");
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  usePolling(fetchTables, [storeId], { interval: 30000 });

  const qrInfo = useMemo(() => tables.map(t => ({ id: t.id, qr_code_url: t.qr_code_image_url, qr_code_token: t.qr_code_token, qr_generated_at: t.qr_generated_at })), [tables]);
  const qrImages = useQrImages(qrInfo, storeId);
  const qrExpiry = useQrExpiry(qrInfo);

  const sections = useMemo(() => {
    const set = new Set<string>();
    tables.forEach((t) => { if (t.section) set.add(t.section); });
    return Array.from(set).sort();
  }, [tables]);

  const filteredTables = useMemo(() => {
    if (sectionFilter === "all") return tables;
    return tables.filter((t) => t.section === sectionFilter);
  }, [tables, sectionFilter]);

  const statusCounts = useMemo(() => ({
    available: tables.filter((t) => t.current_status === "available").length,
    occupied: tables.filter((t) => t.current_status === "occupied").length,
    reserved: tables.filter((t) => t.current_status === "reserved").length,
    cleaning: tables.filter((t) => t.current_status === "cleaning").length,
  }), [tables]);

  const handleGenerateQr = async (table: Table) => {
    setGeneratingQr(table.id);
    try {
      await generateTableQr(storeId, table.id);
      await fetchTables();
      setSuccess(`QR generated for Table ${table.table_number}`);
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => setSuccess(""), 3000);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setGeneratingQr(null);
    }
  };

  const handleMarkCleaned = async (table: Table) => {
    setConfirmClean(table);
  };
  const confirmMarkCleaned = async () => {
    if (!confirmClean) return;
    try {
      await updateTableStatus(storeId, confirmClean.id, "available");
      await fetchTables();
      setSelectedTable(null);
      setConfirmClean(null);
      setSuccess(`Table ${confirmClean.table_number} marked as available`);
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => setSuccess(""), 3000);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const statusColor = (s: string) => {
    switch (s) {
      case "available": return "var(--color-success)";
      case "occupied": return "var(--color-error)";
      case "reserved": return "var(--color-warning)";
      case "cleaning": return "var(--color-text-muted)";
      default: return "var(--color-text-muted)";
    }
  };

  const downloadQr = (table: Table) => {
    const url = qrImages[table.id];
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `table-${table.table_number}-qr.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <PageHeader
        title="Tables"
        subtitle={`${tables.length} tables · ${statusCounts.available} available`}
       
        action={
          <button className="btn btn-ghost btn-sm" onClick={fetchTables}>
            <RefreshCw size={14} /> Refresh
          </button>
        }
      />

      {error && <Alert variant="error" onDismiss={() => setError("")}>{error}</Alert>}
      {success && <Alert variant="success" onDismiss={() => setSuccess("")} autoDismiss={3000}>{success}</Alert>}

      {/* Status Summary */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        {[
          { label: "Available", count: statusCounts.available, color: "var(--color-success)" },
          { label: "Occupied", count: statusCounts.occupied, color: "var(--color-error)" },
          { label: "Reserved", count: statusCounts.reserved, color: "var(--color-warning)" },
          { label: "Cleaning", count: statusCounts.cleaning, color: "var(--color-text-muted)" },
        ].map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", background: s.color }} />
            {s.label} ({s.count})
          </div>
        ))}
      </div>

      {/* Section Filter */}
      {sections.length > 0 && (
        <div style={{ display: "flex", gap: 8, marginBottom: 20, overflowX: "auto" }}>
          <button
            className={`badge badge-sm cursor-pointer ${sectionFilter === "all" ? "badge-primary" : "badge-outline"}`}
            onClick={() => setSectionFilter("all")}
          >
            <MapPin size={10} /> All Sections
          </button>
          {sections.map((s) => (
            <button
              key={s}
              className={`badge badge-sm cursor-pointer ${sectionFilter === s ? "badge-primary" : "badge-outline"}`}
              onClick={() => setSectionFilter(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <SkeletonCard count={8} />
      ) : filteredTables.length === 0 ? (
        <EmptyState title="No tables" description={sectionFilter !== "all" ? "No tables in this section." : "No tables configured for this store."} />
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
          {filteredTables.map((table) => {
            const expiry = qrExpiry[table.id];
            const hasQr = !!(table.qr_code_image_url || table.qr_code_token) && !expiry?.expired;
            const qrUrl = qrImages[table.id];

            return (
              <div
                key={table.id}
                className="card"
                style={{
                  borderLeft: `4px solid ${statusColor(table.current_status)}`,
                  cursor: "pointer",
                  padding: 16,
                  transition: "transform 0.1s",
                }}
                onClick={() => setSelectedTable(table)}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Armchair size={18} style={{ color: statusColor(table.current_status) }} />
                      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>{table.table_number}</h3>
                    </div>
                    {table.display_name && <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--color-text-muted)" }}>{table.display_name}</p>}
                  </div>
                  <span className="badge badge-sm" style={{ background: statusColor(table.current_status) + "20", color: statusColor(table.current_status) }}>
                    {table.current_status?.toUpperCase()}
                  </span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, fontSize: 12, color: "var(--color-text-muted)" }}>
                  <span className="flex items-center gap-1"><Users size={12} /> {table.capacity} seats</span>
                  {table.section && <span className="flex items-center gap-1"><MapPin size={12} /> {table.section}</span>}
                </div>

                {/* Active Order */}
                {table.active_order && (
                  <div style={{ marginBottom: 10, padding: 10, background: "var(--color-error-bg)", borderRadius: "var(--radius-md)", border: "1px solid rgba(220, 38, 38, 0.15)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <Receipt size={12} style={{ color: "var(--color-error)" }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--color-error)" }}>Active Order</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>#{table.active_order.order_number}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4, fontSize: 12, color: "var(--color-text-muted)" }}>
                      <span className="badge badge-sm badge-outline">{table.active_order.status}</span>
                      <span>{table.active_order.payment_status}</span>
                      <span style={{ fontWeight: 600 }}>RM {Number(table.active_order.total_amount || 0).toFixed(2)}</span>
                    </div>
                  </div>
                )}

                {/* QR Status */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "auto" }}>
                  {hasQr ? (
                    <span className="badge badge-sm badge-green flex items-center gap-1">
                      <QrCode size={10} /> QR Active
                    </span>
                  ) : (
                    <span className="badge badge-sm badge-outline flex items-center gap-1">
                      <AlertTriangle size={10} /> No QR
                    </span>
                  )}
                  {table.current_status === "occupied" && (
                    <span className="badge badge-sm badge-red flex items-center gap-1">
                      <Circle size={6} fill="currentColor" /> In Use
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Table Detail Modal */}
      <Modal
        open={!!selectedTable}
        onClose={() => setSelectedTable(null)}
        title={selectedTable ? `Table ${selectedTable.table_number}` : ""}
        size="md"
      >
        {selectedTable && (
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, color: "var(--color-text-muted)", fontSize: 13 }}>
                  {selectedTable.capacity} seats {selectedTable.section && `· ${selectedTable.section}`}
                </p>
              </div>
              <span className="badge badge-sm" style={{ background: statusColor(selectedTable.current_status) + "20", color: statusColor(selectedTable.current_status) }}>
                {selectedTable.current_status?.toUpperCase()}
              </span>
            </div>

            {/* QR Code */}
            <div style={{ textAlign: "center", marginBottom: 20, padding: 16, background: "var(--color-bg-muted)", borderRadius: "var(--radius-lg)" }}>
              {qrImages[selectedTable.id] ? (
                <>
                  <img src={qrImages[selectedTable.id]} alt={`QR for Table ${selectedTable.table_number}`} style={{ width: 180, height: 180, margin: "0 auto", borderRadius: "var(--radius-md)" }} />
                  <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 8 }}>
                    {qrExpiry[selectedTable.id]?.expired
                      ? "QR Expired"
                      : `Expires in ${Math.floor((qrExpiry[selectedTable.id]?.remaining || 0) / 60)}m ${(qrExpiry[selectedTable.id]?.remaining || 0) % 60}s`}
                  </p>
                  <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 12 }}>
                    <button className="btn btn-sm btn-primary" onClick={() => downloadQr(selectedTable)}>
                      <Download size={14} /> Download
                    </button>
                    <button className="btn btn-sm btn-outline" onClick={() => handleGenerateQr(selectedTable)} disabled={generatingQr === selectedTable.id}>
                      <RefreshCw size={14} className={generatingQr === selectedTable.id ? "animate-spin" : ""} /> Regenerate
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ width: 180, height: 180, margin: "0 auto", background: "var(--color-bg-card)", borderRadius: "var(--radius-md)", display: "flex", alignItems: "center", justifyContent: "center", border: "2px dashed var(--color-border-light)" }}>
                    <QrCode size={48} style={{ opacity: 0.3 }} />
                  </div>
                  <button className="btn btn-sm btn-primary" style={{ marginTop: 12 }} onClick={() => handleGenerateQr(selectedTable)} disabled={generatingQr === selectedTable.id}>
                    <QrCode size={14} /> Generate QR
                  </button>
                </>
              )}
            </div>

            {/* Active Order Actions */}
            <div style={{ marginBottom: 16 }}>
              <button className="btn btn-primary w-full" onClick={() => router.push(`/pos?table=${selectedTable.id}&type=dine_in`)}>
                <UtensilsCrossed size={16} /> Start Order
              </button>
            </div>

            {/* Table Actions */}
            <div style={{ display: "flex", gap: 8 }}>
              {selectedTable.current_status === "occupied" && (
                <button className="btn btn-outline flex-1" onClick={() => handleMarkCleaned(selectedTable)}>
                  <CheckCircle size={14} /> Mark as Cleaned
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Confirm Clean Modal */}
      <Modal
        open={!!confirmClean}
        onClose={() => setConfirmClean(null)}
        title="Mark as Cleaned?"
        size="sm"
      >
        {confirmClean && (
          <div>
            <p style={{ margin: "0 0 16px", fontSize: 14 }}>
              Mark Table <strong>{confirmClean.table_number}</strong> as available after cleaning?
            </p>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-outline flex-1" onClick={() => setConfirmClean(null)}>Cancel</button>
              <button className="btn btn-primary flex-1" onClick={confirmMarkCleaned}>
                <CheckCircle size={14} /> Confirm
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
