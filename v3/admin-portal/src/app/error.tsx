"use client";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ padding: 48, textAlign: "center" }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Something went wrong</h2>
      <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 16 }}>
        {error.message || "An unexpected error occurred"}
      </p>
      <button type="button" onClick={() => reset()} className="btn btn-primary btn-sm">
        Try again
      </button>
    </div>
  );
}
