"use client";

export default function AdminLoading() {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: 16,
      padding: 24,
      maxWidth: 1200,
      margin: "0 auto",
    }}>
      {/* Page title skeleton */}
      <div style={{ height: 32, width: 200, background: "var(--color-bg-muted, #e5e7eb)", borderRadius: 6, animation: "shimmer 1.5s infinite" }} />
      {/* Table header skeleton */}
      <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
        <div style={{ height: 36, width: 120, background: "var(--color-bg-muted, #e5e7eb)", borderRadius: 6, animation: "shimmer 1.5s infinite", animationDelay: "0.1s" }} />
        <div style={{ height: 36, width: 120, background: "var(--color-bg-muted, #e5e7eb)", borderRadius: 6, animation: "shimmer 1.5s infinite", animationDelay: "0.2s" }} />
      </div>
      {/* Table row skeletons */}
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} style={{
          height: 48,
          background: "var(--color-bg-muted, #e5e7eb)",
          borderRadius: 6,
          animation: "shimmer 1.5s infinite",
          animationDelay: `${(i * 0.1).toFixed(1)}s`,
        }} />
      ))}
      <style>{`
        @keyframes shimmer {
          0% { opacity: 0.6; }
          50% { opacity: 1; }
          100% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
