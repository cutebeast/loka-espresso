"use client";
import { useRef, useState, useEffect } from "react";
import { Upload } from "lucide-react";
import { api } from "@/lib/api";
import { useTranslation } from "@/lib/i18n";

interface Props {
  imageUrls: string[];
  videoUrl: string;
  onImagesChange: (urls: string[]) => void;
  onVideoChange: (url: string) => void;
  disabled?: boolean;
}

export default function GalleryUpload({ imageUrls, videoUrl, onImagesChange, onVideoChange, disabled: _disabled }: Props) {
  const { t } = useTranslation();
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

  const removeImageUrl = (url: string) => { onImagesChange(imageUrls.filter(u => u !== url)); };

  return (
    <>
      <div className="df-field" style={{ gridColumn: "1/-1" }}>
        <label className="form-label">{t("admin.gallery.imageGallery")}</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input ref={imgRef} type="file" accept="image/*" multiple onChange={handleImages} style={{ display: "none" }} />
          <button type="button" onClick={() => imgRef.current?.click()} className="btn btn-sm btn-outline" disabled={_disabled || uploading}><Upload size={14} /> {uploading ? t("admin.common.loading") : t("admin.gallery.addImages")}</button>
          <span style={{ fontSize: 11, color: "var(--color-text-muted)", display: "flex", alignItems: "center" }}>{t("admin.gallery.multipleImages")}</span>
        </div>
        {imageUrls.length > 0 && <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {imageUrls.map((url) => (
            <div key={url} style={{ position: "relative", width: 80, height: 80, borderRadius: 6, overflow: "hidden", border: "1px solid var(--color-border-light)" }}>
              <img src={url} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <button type="button" onClick={() => removeImageUrl(url)} style={{ position: "absolute", top: 2, right: 2, width: 18, height: 18, borderRadius: 9, background: "rgba(0,0,0,0.6)", color: "#fff", border: "none", cursor: "pointer", fontSize: 10, lineHeight: 1 }} aria-label={t("admin.gallery.remove")}>✕</button>
            </div>
          ))}
        </div>}
      </div>
      <div className="df-field" style={{ gridColumn: "1/-1" }}>
        <label className="form-label">{t("admin.gallery.galleryVideo")}</label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input ref={vidRef} type="file" accept="video/*" onChange={handleVideo} style={{ display: "none" }} />
          <button type="button" onClick={() => vidRef.current?.click()} className="btn btn-sm btn-outline" disabled={_disabled || uploading}><Upload size={14} /> {uploading ? t("admin.common.loading") : t("admin.gallery.uploadVideo")}</button>
          {videoUrl && <span style={{ fontSize: 12, color: "var(--color-success)" }}>✓ {videoUrl.split("/").pop()}</span>}
          {videoUrl && <button type="button" onClick={() => onVideoChange("")} className="btn btn-ghost btn-sm" style={{ color: "var(--color-error)", fontSize: 11 }}>{t("admin.gallery.remove")}</button>}
        </div>
      </div>
    </>
  );
}
