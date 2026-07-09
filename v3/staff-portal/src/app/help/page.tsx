"use client";

import { useTranslation } from "@/hooks/useTranslation";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getHelpArticles } from "@/lib/api";
import { ArrowLeft, BookOpen } from "lucide-react";

interface HelpArticle {
  id: number;
  slug: string;
  title: string;
  audience: string;
  category: string | null;
}

export default function StaffHelpPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [items, setItems] = useState<HelpArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetch = useCallback(async () => {
    try {
      const res = await getHelpArticles("staff");
      setItems(Array.isArray(res) ? res : ((res as any).items || []));
    } catch (e) {
      console.error(e);
      setError(t("help.load_failed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const categories = Array.from(new Set(items.map((i) => i.category).filter(Boolean)));

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.push("/")} className="btn btn-ghost btn-sm" aria-label={t("common.back")}>
          <ArrowLeft size={20} />
        </button>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{t("help.help_center")}</h1>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {loading ? (
        <div>{t("common.loading")}</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--color-text-muted)" }}>{t("help.no_articles")}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {categories.map((category) => (
            <div key={category}>
              <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, textTransform: "capitalize", color: "var(--color-text-muted)" }}>{category}</h2>
              <div style={{ display: "grid", gap: 8 }}>
                {items
                  .filter((i) => i.category === category)
                  .map((item) => (
                    <button
                      key={item.id}
                      onClick={() => router.push(`/help/${item.slug}`)}
                      style={{
                        textAlign: "left",
                        padding: 14,
                        borderRadius: 10,
                        border: "1px solid var(--color-border-light)",
                        background: "var(--color-bg-card)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <BookOpen size={18} />
                      <span style={{ fontWeight: 600 }}>{item.title}</span>
                    </button>
                  ))}
              </div>
            </div>
          ))}
          {items.some((i) => !i.category) && (
            <div>
              <h2 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: "var(--color-text-muted)" }}>{t("help.uncategorized")}</h2>
              <div style={{ display: "grid", gap: 8 }}>
                {items
                  .filter((i) => !i.category)
                  .map((item) => (
                    <button
                      key={item.id}
                      onClick={() => router.push(`/help/${item.slug}`)}
                      style={{
                        textAlign: "left",
                        padding: 14,
                        borderRadius: 10,
                        border: "1px solid var(--color-border-light)",
                        background: "var(--color-bg-card)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                      }}
                    >
                      <BookOpen size={18} />
                      <span style={{ fontWeight: 600 }}>{item.title}</span>
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
