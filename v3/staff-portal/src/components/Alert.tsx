"use client";

import { useEffect } from "react";

interface AlertProps {
  variant?: "error" | "success" | "warning" | "info";
  children: React.ReactNode;
  onDismiss?: () => void;
  autoDismiss?: number;
  style?: React.CSSProperties;
}

export default function Alert({ variant = "info", children, onDismiss, autoDismiss, style }: AlertProps) {
  useEffect(() => {
    if (autoDismiss && onDismiss) {
      const t = setTimeout(onDismiss, autoDismiss);
      return () => clearTimeout(t);
    }
  }, [autoDismiss, onDismiss]);

  return (
    <div className={`alert alert-${variant}`} style={style} role="alert">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div>{children}</div>
        {onDismiss && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onDismiss} style={{ fontSize: 18, padding: 4 }} aria-label="Dismiss alert">×</button>
        )}
      </div>
    </div>
  );
}
