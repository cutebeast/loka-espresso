"use client";

import { useEffect } from "react";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Admin Portal Error:", error);
  }, [error]);

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", padding: 24 }}>
      <div style={{ textAlign: "center", maxWidth: 400 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
        <h2 style={{ margin: "0 0 8px", fontSize: 20 }}>Something went wrong</h2>
        <p style={{ fontSize: 14, color: "var(--color-text-muted)", marginBottom: 24 }}>
          {error.message || "An unexpected error occurred. Please try again."}
        </p>
        <button className="btn btn-primary" onClick={reset}>
          Try Again
        </button>
      </div>
    </div>
  );
}
