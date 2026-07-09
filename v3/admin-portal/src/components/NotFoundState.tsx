"use client";

import { useTranslation } from "@/lib/i18n";

interface NotFoundStateProps {
  title: string;
  message: string;
  onBack: () => void;
}

export default function NotFoundState({ title, message, onBack }: NotFoundStateProps) {
  const { t } = useTranslation();
  return (
    <div style={{ padding: 48, textAlign: "center" }}>
      <h2 className="page-title" style={{ marginBottom: 12 }}>
        {title}
      </h2>
      <p style={{ marginBottom: 24, color: "var(--color-text-muted)" }}>
        {message}
      </p>
      <button onClick={onBack} className="btn btn-outline btn-sm">
        {t("admin.common.back", "Back")}
      </button>
    </div>
  );
}
