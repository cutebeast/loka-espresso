"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
export default function InventoryIndex() {
  const {
    t
  } = useTranslation();
  const router = useRouter();
  useEffect(() => {
    router.replace("/inventory/items");
  }, [router]);
  return <div style={{
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 200
  }}>
      <div style={{
      display: "flex",
      alignItems: "center",
      gap: 8,
      color: "var(--color-text-muted)"
    }}>
        <div className="spinner" style={{
        width: 16,
        height: 16,
        border: "2px solid var(--color-border-light)",
        borderTopColor: "var(--color-primary)",
        borderRadius: "50%",
        animation: "spin 0.6s linear infinite"
      }} />{t("inventory.loading_inventory")}</div>
    </div>;
}