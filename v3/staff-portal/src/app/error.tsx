"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Staff portal error:", error);
  }, [error]);

  const displayMessage =
    !error.message
      ? "An unexpected error occurred. Please try again."
      : error.message.includes("Cannot read") || error.message.includes("undefined")
        ? "Something went wrong. Please try again."
        : error.message.startsWith("{") || error.message.includes("Error:")
          ? "An unexpected error occurred. Please go back and try again."
          : error.message;

  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", minHeight: "60vh", padding: 32,
      textAlign: "center", gap: 16,
    }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--color-error, #dc2626)" }}>
        Something went wrong
      </h2>
      <p style={{ fontSize: 14, color: "var(--color-text-muted)", maxWidth: 320 }}>
        {displayMessage}
      </p>
      <button
        type="button"
        onClick={reset}
        style={{
          padding: "8px 20px", borderRadius: "var(--radius-sm)",
          background: "var(--color-primary, #3B4A1A)", color: "#fff",
          border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600,
        }}
        aria-label="Retry loading the page"
      >
        Try again
      </button>
    </div>
  );
}
