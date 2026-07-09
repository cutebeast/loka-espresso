"use client";

import { useTranslation } from "@/hooks/useTranslation";
import { useEffect } from "react";
export default function Error({
  error,
  reset
}: {
  error: Error & {
    digest?: string;
  };
  reset: () => void;
}) {
  const {
    t
  } = useTranslation();
  useEffect(() => {
    console.error("Staff portal error:", error);
  }, [error]);
  const displayMessage = !error.message ? t("error.unexpected_error") : error.message.includes("Cannot read") || error.message.includes("undefined") ? t("error.something_went_wrong_try_again") : error.message.startsWith("{") || error.message.includes("Error:") ? t("error.unexpected_error_go_back") : error.message;
  return <div style={{
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "60vh",
    padding: 32,
    textAlign: "center",
    gap: 16
  }}>
      <h2 style={{
      fontSize: 20,
      fontWeight: 700,
      color: "var(--color-error, #dc2626)"
    }}>{t("error.something_went_wrong")}</h2>
      <p style={{
      fontSize: 14,
      color: "var(--color-text-muted)",
      maxWidth: 320
    }}>
        {displayMessage}
      </p>
      <button type="button" onClick={reset} style={{
      padding: "8px 20px",
      borderRadius: "var(--radius-sm)",
      background: "var(--color-primary, #3B4A1A)",
      color: "#fff",
      border: "none",
      cursor: "pointer",
      fontSize: 14,
      fontWeight: 600
    }} aria-label={t("error.retry_loading_the_page")}>{t("error.try_again")}</button>
    </div>;
}