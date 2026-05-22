"use client";

import { useEffect } from "react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Admin page error:", error);
  }, [error]);

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: 300,
      padding: 48,
      textAlign: "center",
    }}>
      <div style={{
        fontSize: 48,
        marginBottom: 16,
        color: "var(--color-danger, #ef4444)",
      }}>
        !
      </div>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8, color: "var(--color-text-primary, #111)" }}>
        Something went wrong
      </h2>
      <p style={{ fontSize: 14, color: "var(--color-text-muted, #6b7280)", marginBottom: 24, maxWidth: 400 }}>
        {error.message || "An unexpected error occurred while loading this page."}
      </p>
      <div style={{ display: "flex", gap: 12 }}>
        <button
          type="button"
          onClick={reset}
          className="btn btn-primary"
          style={{ padding: "8px 20px" }}
        >
          Try again
        </button>
        <button
          type="button"
          onClick={() => window.location.href = "/"}
          className="btn btn-outline"
          style={{ padding: "8px 20px" }}
        >
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}
