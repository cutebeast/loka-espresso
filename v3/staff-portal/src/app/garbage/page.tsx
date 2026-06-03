"use client";

import { useRef, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import PageHeader from "@/components/PageHeader";
import Alert from "@/components/Alert";
import { CheckCircle, Camera, X } from "lucide-react";

export default function GarbagePage() {
  const [desc, setDesc] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFiles = Array.from(e.target.files || []);
    if (newFiles.length + files.length > 8) return;
    setFiles(prev => [...prev, ...newFiles]);
    setPreviews(prev => [...prev, ...newFiles.map(f => URL.createObjectURL(f))]);
    if (fileRef.current) fileRef.current.value = "";
  };

  const removeFile = (idx: number) => {
    const url = previews[idx];
    if (url) URL.revokeObjectURL(url);
    setFiles(prev => prev.filter((_, i) => i !== idx));
    setPreviews(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSubmit = useCallback(async () => {
    if (files.length === 0) { setError("Please upload at least one image"); return; }
    setSubmitting(true); setError("");
    try {
      const fd = new FormData();
      fd.set("description", desc.trim());
      for (const f of files) fd.append("images", f, f.name);
      await api.upload<any>("/staff/hygiene/garbage", fd);
      setSuccess(true);
    } catch (e: unknown) {
      setError(parseApiError(e, "Failed to submit report"));
    } finally { setSubmitting(false); }
  }, [desc, files]);

  if (success) {
    return (
      <div style={{ padding: 24 }}>
        <PageHeader title="Garbage Disposal" />
        <div style={{ textAlign: "center", padding: "60px 20px" }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--color-success-light)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
            <CheckCircle size={32} style={{ color: "var(--color-success)" }} />
          </div>
          <h2 style={{ fontSize: 20, fontWeight: 700, margin: "0 0 8px" }}>Report Submitted</h2>
          <p style={{ color: "var(--color-text-muted)", margin: "0 0 24px" }}>Garbage disposal report has been submitted for admin review.</p>
          <button onClick={() => { setSuccess(false); setDesc(""); setFiles([]); setPreviews([]); }} className="btn btn-primary">Submit Another</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <PageHeader title="Garbage Disposal" />
      {error && <Alert variant="error" onDismiss={() => setError("")}>{error}</Alert>}
      <div style={{ maxWidth: 600 }}>
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 12px" }}>Notes (optional)</h3>
          <textarea className="form-input" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Any notes about the garbage takeout..." rows={3} maxLength={500} />
        </div>
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 4px" }}>Task Images</h3>
          <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: "0 0 12px" }}>Photos confirming garbage disposal completion (max 8)</p>
          <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFiles} style={{ display: "none" }} />
          {previews.length > 0 && (
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              {previews.map((url, i) => (
                <div key={i} style={{ position: "relative", width: 80, height: 80, borderRadius: 8, overflow: "hidden", border: "1px solid var(--color-border-light)" }}>
                  <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  <button type="button" onClick={() => removeFile(i)} style={{ position: "absolute", top: 2, right: 2, background: "rgba(0,0,0,0.6)", border: "none", color: "#fff", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 12 }}><X size={12} /></button>
                </div>
              ))}
            </div>
          )}
          <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-outline btn-sm" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Camera size={16} /> {files.length > 0 ? "Add More" : "Upload Images"}
          </button>
        </div>
        <button onClick={handleSubmit} disabled={submitting} className="btn btn-primary" style={{ width: "100%", padding: "12px 0", fontSize: 15, fontWeight: 600 }}>
          {submitting ? "Submitting..." : "Submit Garbage Report"}
        </button>
      </div>
    </div>
  );
}
