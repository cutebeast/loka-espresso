"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  position?: "right" | "bottom";
}

export default function Drawer({ open, onClose, title, children, footer, position = "right" }: DrawerProps) {
  useEffect(() => {
    if (open) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape" && open) onClose(); };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className={position === "bottom" ? "drawer-bottom" : "drawer"} onClick={(e) => e.stopPropagation()}>
        {(title) && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            {title && <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{title}</h3>}
            <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} style={{ fontSize: 20 }} aria-label="Close drawer"><X size={20} /></button>
          </div>
        )}
        <div>{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </>
  );
}
