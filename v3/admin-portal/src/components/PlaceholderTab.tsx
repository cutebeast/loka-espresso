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
      padding: 32,
      textAlign: "center",
      color: "var(--color-text-muted, #6b7280)",
    }}>
      <h2 style={{ fontWeight: 500, fontSize: 14, marginBottom: 6, color: "var(--color-text-muted, #6b7280)" }}>
        {title}
      </h2>
      <p style={{ maxWidth: 360, margin: "0 auto", lineHeight: 1.5, fontSize: 12, opacity: 0.6 }}>
        {description}
      </p>
    </div>
  );
}
