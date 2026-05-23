"use client";
import { useRef, useState, useEffect } from "react";
import { Upload } from "lucide-react";
import { api } from "@/lib/api";

interface Props {
  imageUrls: string[];
  videoUrl: string;
  onImagesChange: (urls: string[]) => void;
  onVideoChange: (url: string) => void;
  disabled?: boolean;
}

export default function GalleryUpload({ imageUrls, videoUrl, onImagesChange, onVideoChange, disabled: _disabled }: Props) {
  const imgRef = useRef<HTMLInputElement>(null);
  const vidRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const handleImages = async () => {
    const files = imgRef.current?.files; if (!files?.length) return;
    setUploading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const newUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        if (controller.signal.aborted) return;
        const file = files[i];
        if (!file) continue;
        const fd = new FormData(); fd.append("file", file);
        const j = await api.upload("/upload/image", fd);
        newUrls.push(j.url || j.filename);
      }
      if (!controller.signal.aborted) onImagesChange([...imageUrls, ...newUrls]);
    } catch (e) { if (!controller.signal.aborted) console.error(e); } finally { setUploading(false); if (imgRef.current) imgRef.current.value = ""; }
  };

  const handleVideo = async () => {
    const file = vidRef.current?.files?.[0]; if (!file) return;
    setUploading(true);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const fd = new FormData(); fd.append("file", file);
      const j = await api.upload("/upload/image", fd);
      if (!controller.signal.aborted) onVideoChange(j.url || j.filename);
    } catch (e) { if (!controller.signal.aborted) console.error(e); } finally { setUploading(false); if (vidRef.current) vidRef.current.value = ""; }
  };

  const removeImage = (idx: number) => { const u = [...imageUrls]; u.splice(idx, 1); onImagesChange(u); };

  return (
    <>
      <div className="df-field" style={{ gridColumn: "1/-1" }}>
        <label className="form-label">Image Gallery</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input ref={imgRef} type="file" accept="image/*" multiple onChange={handleImages} style={{ display: "none" }} />
          <button type="button" onClick={() => imgRef.current?.click()} className="btn btn-sm btn-outline" disabled={uploading}><Upload size={14} /> {uploading ? "Uploading..." : "Add Images"}</button>
          <span style={{ fontSize: 11, color: "var(--color-text-muted)", display: "flex", alignItems: "center" }}>Multiple images</span>
        </div>
        {imageUrls.length > 0 && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {imageUrls.map((url, idx) => (
            <div key={idx} style={{ position: "relative", width: 80, height: 80, borderRadius: 6, overflow: "hidden", border: "1px solid var(--color-border-light)" }}>
              <img src={url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <button type="button" onClick={() => removeImage(idx)} style={{ position: "absolute", top: 2, right: 2, width: 18, height: 18, borderRadius: 9, background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", cursor: "pointer", fontSize: 10, lineHeight: 1 }}>✕</button>
            </div>
          ))}
        </div>}
      </div>
      <div className="df-field" style={{ gridColumn: "1/-1" }}>
        <label className="form-label">Gallery Video</label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input ref={vidRef} type="file" accept="video/*" onChange={handleVideo} style={{ display: "none" }} />
          <button type="button" onClick={() => vidRef.current?.click()} className="btn btn-sm btn-outline" disabled={uploading}><Upload size={14} /> {uploading ? "Uploading..." : "Upload Video"}</button>
          {videoUrl && <span style={{ fontSize: 12, color: "var(--color-success)" }}>✓ {videoUrl.split("/").pop()}</span>}
          {videoUrl && <button type="button" onClick={() => onVideoChange("")} className="btn btn-ghost btn-sm" style={{ color: "var(--color-error)", fontSize: 11 }}>Remove</button>}
        </div>
      </div>
    </>
  );
}
