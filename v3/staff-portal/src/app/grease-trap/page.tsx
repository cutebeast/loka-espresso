"use client";

import { useRef, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import PageHeader from "@/components/PageHeader";
import Alert from "@/components/Alert";
import { CheckCircle, Camera, X } from "lucide-react";

export default function GreaseTrapPage() {
  const [desc, setDesc] = useState("");
  const [beforeFiles, setBeforeFiles] = useState<File[]>([]);
  const [beforePreviews, setBeforePreviews] = useState<string[]>([]);
  const [afterFiles, setAfterFiles] = useState<File[]>([]);
  const [afterPreviews, setAfterPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const beforeRef = useRef<HTMLInputElement>(null);
  const afterRef = useRef<HTMLInputElement>(null);

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>, setFiles: React.Dispatch<React.SetStateAction<File[]>>, setPreviews: React.Dispatch<React.SetStateAction<string[]>>, existing: File[]) => {
    const files = Array.from(e.target.files || []);
    if (files.length + existing.length > 5) return;
    setFiles([...existing, ...files]);
    setPreviews((prev: string[]) => [...prev, ...files.map((f: File) => URL.createObjectURL(f))]);
    if (e.target) e.target.value = "";
  };

  const removeFile = (idx: number, setFiles: React.Dispatch<React.SetStateAction<File[]>>, allFiles: File[], setPreviews: React.Dispatch<React.SetStateAction<string[]>>, allPreviews: string[]) => {
    const url = allPreviews[idx];
    if (url) URL.revokeObjectURL(url);
    setFiles(allFiles.filter((_, i) => i !== idx));
    setPreviews(allPreviews.filter((_, i) => i !== idx));
  };

  const handleSubmit = useCallback(async () => {
    if (beforeFiles.length === 0) { setError("Please upload at least one 'before' image"); return; }
    if (afterFiles.length === 0) { setError("Please upload at least one 'after' image"); return; }
    setSubmitting(true); setError("");
    try {
      const fd = new FormData();
      fd.set("description", desc.trim());
      for (const f of beforeFiles) fd.append("before_images", f, f.name);
      for (const f of afterFiles) fd.append("after_images", f, f.name);
      await api.upload<any>("/staff/hygiene/grease-trap", fd);
      setSuccess(true);
    } catch (e: unknown) {
      setError(parseApiError(e, "Failed to submit report"));
    } finally { setSubmitting(false); }
  }, [desc, beforeFiles, afterFiles]);

  if (success) {
    return (
      <div style={{ padding: 24 }}>
        <PageHeader title="Grease Trap" />
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--color-success-light)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
            <CheckCircle size={32} style={{ color: "var(--color-success)" }} />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>Report Submitted</h2>
          <p style={{ color: "var(--color-text-muted)", margin: "0 0 24px" }}>Grease trap report has been submitted for admin review.</p>
          <button onClick={() => { setSuccess(false); setDesc(""); setBeforeFiles([]); setAfterFiles([]); setBeforePreviews([]); setAfterPreviews([]); }} className="btn btn-primary">Submit Another</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <PageHeader title="Grease Trap" />
      {error && <Alert variant="error" onDismiss={() => setError("")}>{error}</Alert>}
      <div style={{ maxWidth: 600 }}>
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px" }}>Notes (optional)</h3>
          <textarea className="form-input" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Any notes about the grease trap cleaning..." rows={3} maxLength={500} />
        </div>
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>Before Images</h3>
          <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "0 0 12px" }}>Photos of the grease trap before cleaning (max 5)</p>
          <input ref={beforeRef} type="file" accept="image/*" multiple onChange={e => handleFiles(e, setBeforeFiles, setBeforePreviews, beforeFiles)} style={{ display: "none" }} />
          {beforePreviews.length > 0 && (
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              {beforePreviews.map((url, i) => (
                <div key={i} style={{ position: "relative", width: 80, height: 80, borderRadius: 8, overflow: "hidden", border: "1px solid var(--color-border-light)" }}>
                  <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <button type="button" onClick={() => removeFile(i, setBeforeFiles, beforeFiles, setBeforePreviews, beforePreviews)} style={{ position: "absolute", top: 2, right: 2, background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 12 }}><X size={12} /></button>
                </div>
              ))}
            </div>
          )}
          <button type="button" onClick={() => beforeRef.current?.click()} className="btn btn-outline btn-sm" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Camera size={16} /> {beforeFiles.length > 0 ? "Add More" : "Upload Before Images"}
          </button>
        </div>
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>After Images</h3>
          <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "0 0 12px" }}>Photos of the grease trap after cleaning (max 5)</p>
          <input ref={afterRef} type="file" accept="image/*" multiple onChange={e => handleFiles(e, setAfterFiles, setAfterPreviews, afterFiles)} style={{ display: "none" }} />
          {afterPreviews.length > 0 && (
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              {afterPreviews.map((url, i) => (
                <div key={i} style={{ position: "relative", width: 80, height: 80, borderRadius: 8, overflow: "hidden", border: "1px solid var(--color-border-light)" }}>
                  <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <button type="button" onClick={() => removeFile(i, setAfterFiles, afterFiles, setAfterPreviews, afterPreviews)} style={{ position: "absolute", top: 2, right: 2, background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 12 }}><X size={12} /></button>
                </div>
              ))}
            </div>
          )}
          <button type="button" onClick={() => afterRef.current?.click()} className="btn btn-outline btn-sm" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Camera size={16} /> {afterFiles.length > 0 ? "Add More" : "Upload After Images"}
          </button>
        </div>
        <button onClick={handleSubmit} disabled={submitting} className="btn btn-primary" style={{ width: "100%", padding: "12px 0", fontSize: 15, fontWeight: 600 }}>
          {submitting ? "Submitting..." : "Submit Grease Trap Report"}
        </button>
      </div>
    </div>
  );
}
