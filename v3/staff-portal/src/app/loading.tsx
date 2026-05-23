export default function Loading() {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      minHeight: "60vh", padding: 32,
    }}>
      <div style={{
        width: 40, height: 40, border: "4px solid var(--color-border-light, #e5e7eb)",
        borderTopColor: "var(--color-primary, #3B4A1A)", borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
