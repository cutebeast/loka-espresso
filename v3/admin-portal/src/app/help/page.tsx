"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, BookOpen } from "lucide-react";

interface HelpArticle {
  id: number;
  slug: string;
  title: string;
  audience: string;
  category: string | null;
  body_text: string | null;
}

const AUDIENCES = ["admin", "staff", "customer"] as const;
type Audience = (typeof AUDIENCES)[number];

export default function AdminHelpReaderPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Deep-linkable audience (/help?audience=staff) — sidebar has one entry per portal
  const urlAudience = searchParams.get("audience");
  const [items, setItems] = useState<HelpArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [audience, setAudience] = useState<Audience>(
    AUDIENCES.includes(urlAudience as Audience) ? (urlAudience as Audience) : "admin",
  );

  const fetch = useCallback(() => {
    setLoading(true);
    api
      .get<{ items: HelpArticle[] }>(`/public/help/articles?audience=${audience}&per_page=500`)
      .then((d) => setItems(Array.isArray(d) ? d : d.items || []))
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, [audience]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const categories = Array.from(new Set(items.map((i) => i.category).filter(Boolean)));

  return (
    <div style={{ padding: 32, maxWidth: 900 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.push("/")} className="btn btn-ghost btn-sm">
          <ArrowLeft size={18} />
        </button>
        <h1 className="page-title" style={{ margin: 0 }}>{t("help.help_center")}</h1>
      </div>
      <div style={{ marginBottom: 20 }}>
        <label style={{ marginRight: 8 }}>{t("help.audience")}:</label>
        <select value={audience} onChange={(e) => setAudience(e.target.value as Audience)}>
          <option value="admin">admin</option>
          <option value="staff">staff</option>
          <option value="customer">customer</option>
        </select>
      </div>
      {loading ? (
        <div>{t("common.loading")}</div>
      ) : items.length === 0 ? (
        <div className="data-table-empty">{t("admin.common.noResults")}</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {categories.map((category) => (
            <div key={category}>
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, textTransform: "capitalize" }}>{category}</h2>
              <div style={{ display: "grid", gap: 10 }}>
                {items
                  .filter((i) => i.category === category)
                  .map((item) => (
                    <button
                      key={item.id}
                      onClick={() => router.push(`/help/${item.slug}`)}
                      className="card"
                      style={{ textAlign: "left", padding: 16, cursor: "pointer", border: "1px solid var(--color-border-light)" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <BookOpen size={18} color="var(--color-primary)" />
                        <span style={{ fontWeight: 600 }}>{item.title}</span>
                      </div>
                    </button>
                  ))}
              </div>
            </div>
          ))}
          {items.some((i) => !i.category) && (
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>{t("help.uncategorized")}</h2>
              <div style={{ display: "grid", gap: 10 }}>
                {items
                  .filter((i) => !i.category)
                  .map((item) => (
                    <button
                      key={item.id}
                      onClick={() => router.push(`/help/${item.slug}`)}
                      className="card"
                      style={{ textAlign: "left", padding: 16, cursor: "pointer", border: "1px solid var(--color-border-light)" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <BookOpen size={18} color="var(--color-primary)" />
                        <span style={{ fontWeight: 600 }}>{item.title}</span>
                      </div>
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
