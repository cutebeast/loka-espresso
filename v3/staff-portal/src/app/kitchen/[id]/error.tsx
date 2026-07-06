"use client";

import { useTranslation } from "@/hooks/useTranslation";
import { useEffect } from "react";
export default function KitchenOrderError({
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
    console.error("Kitchen order error:", error);
  }, [error]);
  return <div style={{
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "60vh",
    gap: 12,
    textAlign: "center",
    padding: 24
  }}>
      <h2 style={{
      fontSize: 18,
      fontWeight: 700,
      color: "var(--color-error)",
      margin: 0
    }}>{t("common.order_not_available")}</h2>
      <p style={{
      fontSize: 13,
      color: "var(--color-text-muted)",
      margin: 0
    }}>{t("common.this_order_could_not_be_loaded")}</p>
      <button type="button" onClick={() => reset()} style={{
      padding: "8px 20px",
      fontSize: 13,
      fontWeight: 600,
      backgroundColor: "var(--color-primary)",
      color: "#fff",
      border: "none",
      borderRadius: 8,
      cursor: "pointer"
    }}>{t("common.try_again")}</button>
    </div>;
}