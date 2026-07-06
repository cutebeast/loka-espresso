"use client";

import { useTranslation } from "@/lib/i18n";
export default function Loading() {
  const {
    t
  } = useTranslation();
  return <div style={{
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "100vh"
  }}>
      <div style={{
      textAlign: "center"
    }}>
        <div style={{
        width: 40,
        height: 40,
        border: "3px solid var(--color-border-light)",
        borderTopColor: "var(--color-primary)",
        borderRadius: "50%",
        animation: "spin 0.8s linear infinite",
        margin: "0 auto 16px"
      }} />
        <p style={{
        fontSize: 14,
        color: "var(--color-text-muted)",
        margin: 0
      }}>{t("loading.loading")}</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>;
}