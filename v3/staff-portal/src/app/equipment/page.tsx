"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import PageHeader from "@/components/PageHeader";
import Alert from "@/components/Alert";
import EmptyState from "@/components/EmptyState";
import SkeletonCard from "@/components/SkeletonCard";
import Badge, { type BadgeVariant } from "@/components/Badge";
import { Wrench, AlertTriangle, CheckCircle, Clock, MessageSquare, ImagePlus, X } from "lucide-react";

interface Equipment {
  id: number;
  name: string;
  equipment_type: string;
  serial_number?: string;
  status: string;
  location?: string;
}

export default function EquipmentPage() {
  const [items, setItems] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [reporting, setReporting] = useState<number | null>(null);
  const [reportDesc, setReportDesc] = useState("");
  const [reportStatus, setReportStatus] = useState("operational");
  const [reportFiles, setReportFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.getRaw<any>("/staff/equipment");
      setItems(Array.isArray(data) ? data : (data?.items || []));
    } catch (e: unknown) {
      setError(parseApiError(e, "Failed to load equipment"));
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length + reportFiles.length > 5) return;
    setReportFiles(prev => [...prev, ...files]);
    for (const f of files) {
      setPreviews(prev => [...prev, URL.createObjectURL(f)]);
    }
    if (fileRef.current) fileRef.current.value = "";
  };

  const removeFile = (idx: number) => {
    const url = previews[idx];
    if (url) URL.revokeObjectURL(url);
    setReportFiles(prev => prev.filter((_, i) => i !== idx));
    setPreviews(prev => prev.filter((_, i) => i !== idx));
  };

  const handleReport = async () => {
    if (!reporting || reportDesc.trim().length < 5) { setError("Please enter a note (min 5 characters)"); return; }
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const formData = new FormData();
      formData.set("status_field", reportStatus);
      formData.set("description", reportDesc.trim());
      for (const f of reportFiles) {
        formData.append("images", f, f.name);
      }
      await api.upload<any>(`/staff/equipment/${reporting}/report`, formData);
      setSuccess(`Report submitted — ${reportStatus}`);
      setReporting(null);
      setReportDesc("");
      setReportStatus("operational");
      for (const p of previews) URL.revokeObjectURL(p);
      setReportFiles([]);
      setPreviews([]);
      load();
    } catch (e: unknown) {
      setError(parseApiError(e, "Failed to submit report"));
    } finally { setSubmitting(false); }
  };

  const openReport = (id: number) => {
    setReporting(id);
    setReportDesc("");
    setReportStatus("operational");
    setError("");
    setSuccess("");
    for (const p of previews) URL.revokeObjectURL(p);
    setReportFiles([]);
    setPreviews([]);
  };

  const statusIcon = (s: string) => {
    switch (s) {
      case "operational": return <CheckCircle size={14} style={{ color: "var(--color-success)" }} />;
      case "maintenance": return <Wrench size={14} style={{ color: "var(--color-warning, #f59e0b)" }} />;
      case "broken": return <AlertTriangle size={14} style={{ color: "var(--color-error)" }} />;
      default: return <Clock size={14} />;
    }
  };

  const statusLabel = (s: string) => s?.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  const statusVariant = (s: string): BadgeVariant =>
    s === "broken" ? "red" : s === "maintenance" ? "amber" : "green";

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <PageHeader title="Equipment" subtitle="Daily equipment check and issue reporting" />
      {success && <Alert variant="success" onDismiss={() => setSuccess("")} autoDismiss={3000}>{success}</Alert>}
      {error && <Alert variant="error" onDismiss={() => setError("")}>{error}</Alert>}

      {reporting !== null && (
        <div className="card" style={{ padding: 16, marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700 }}>Equipment Check</h3>
          <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 4 }}>
            {items.find((e) => e.id === reporting)?.name}
          </p>
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Condition</label>
              <select
                className="form-input"
                value={reportStatus}
                onChange={(e) => {
                  setReportStatus(e.target.value);
                  if (e.target.value === "operational" && reportDesc.trim().length < 2) {
                    setReportDesc("Checked OK");
                  }
                }}
              >
                <option value="operational">Operational — Checked OK</option>
                <option value="maintenance">Maintenance Needed</option>
                <option value="broken">Broken / Not Working</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea
                className="form-input"
                value={reportDesc}
                onChange={(e) => setReportDesc(e.target.value)}
                placeholder="Describe the condition or issue (min 5 characters)..."
                rows={3}
              />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: "block", marginBottom: 4 }}>
                Photos ({reportFiles.length}/5)
              </label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                {previews.map((p, i) => (
                  <div key={i} style={{ position: "relative", width: 64, height: 64, borderRadius: "var(--radius-sm)", overflow: "hidden", border: "1px solid var(--color-border-light)" }}>
                    <img src={p} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      style={{ position: "absolute", top: 0, right: 0, background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", borderRadius: "0 0 0 var(--radius-sm)", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 10 }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {reportFiles.length < 5 && (
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    style={{ width: 64, height: 64, border: "1px dashed var(--color-border-light)", borderRadius: "var(--radius-sm)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", background: "var(--color-bg-secondary, #f8f6f3)" }}
                  >
                    <ImagePlus size={20} style={{ color: "var(--color-text-muted)" }} />
                  </button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFileSelect} style={{ display: "none" }} />
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setReporting(null)} className="btn btn-ghost btn-sm">Cancel</button>
              <button
                type="button"
                onClick={handleReport}
                disabled={submitting || reportDesc.trim().length < 5}
                className="btn btn-primary btn-sm"
              >
                {submitting ? "Submitting..." : "Submit Report"}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <SkeletonCard count={3} />
      ) : items.length === 0 ? (
        <EmptyState icon={<Wrench size={48} />} title="No equipment" description="No equipment registered for your store" />
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {items.map((e) => (
            <div key={e.id} className="card" style={{ padding: 16, display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{e.name || "Unnamed Equipment"}</div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  {e.equipment_type}{e.serial_number ? ` · SN: ${e.serial_number}` : ""}{e.location ? ` · ${e.location}` : ""}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {statusIcon(e.status)}
                <Badge variant={statusVariant(e.status)}>{statusLabel(e.status)}</Badge>
              </div>
              <button
                type="button"
                onClick={() => openReport(e.id)}
                className="btn btn-sm btn-outline"
                style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12 }}
                title="Check & report"
              >
                <MessageSquare size={14} /> Check
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
