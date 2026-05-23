"use client";

import { useRouter } from "next/navigation";

export default function OrderDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  return (
    <div style={{ padding: 48, textAlign: "center" }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Failed to load order</h2>
      <p style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 16 }}>
        {error.message || "An unexpected error occurred"}
      </p>
      <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
        <button type="button" onClick={() => reset()} className="btn btn-primary btn-sm">
          Try again
        </button>
        <button type="button" onClick={() => router.push("/orders")} className="btn btn-ghost btn-sm">
          Back to orders
        </button>
      </div>
    </div>
  );
}
