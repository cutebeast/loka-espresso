/**
 * Placeholder tabs for Admin Portal and Staff Portal translations.
 */
"use client";

interface PlaceholderTabProps {
  title: string;
  description: string;
}

export default function PlaceholderTab({ title, description }: PlaceholderTabProps) {
  return (
    <div style={{
      padding: 64,
      textAlign: "center",
      color: "var(--color-text-muted, #6b7280)",
    }}>
      <div style={{ fontSize: 40, marginBottom: 16, opacity: 0.3 }}>🚧</div>
      <h2 style={{ fontWeight: 600, fontSize: 18, marginBottom: 8, color: "var(--color-text-primary, #111)" }}>
        {title} — Coming Soon
      </h2>
      <p style={{ maxWidth: 400, margin: "0 auto", lineHeight: 1.6, fontSize: 14 }}>
        {description}
      </p>
      <p style={{ fontSize: 12, marginTop: 12, opacity: 0.5 }}>
        This section will use the same infrastructure as the Customer PWA tab above.
      </p>
    </div>
  );
}
