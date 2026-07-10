"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft } from "lucide-react";
import { logError } from "@/lib/logger";
import { renderMarkdown } from "@/lib/markdown";

interface HelpArticle {
  id: number;
  slug: string;
  title: string;
  audience: string;
  category: string | null;
  body_text: string | null;
  updated_at: string;
}

export default function AdminHelpArticleDetailPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { slug } = useParams();
  const [article, setArticle] = useState<HelpArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.get<HelpArticle>(`/public/help/articles/${slug}`);
      setArticle(d);
    } catch (e) {
      logError("Failed to load help article", e);
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <div style={{ padding: 32 }}>{t("common.loading")}</div>;
  }

  if (notFound || !article) {
    return (
      <div style={{ padding: 32, textAlign: "center" }}>
        <p style={{ marginBottom: 16, color: "var(--color-text-muted)" }}>{t("admin.common.noData")}</p>
        <button onClick={() => router.push("/help")} className="btn btn-outline btn-sm">{t("admin.common.back")}</button>
      </div>
    );
  }

  return (
    <div style={{ padding: 32, maxWidth: 800 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.push("/help")} className="btn btn-ghost btn-sm">
          <ArrowLeft size={18} />
        </button>
        <h1 className="page-title" style={{ margin: 0 }}>{article.title}</h1>
      </div>
      {article.category && (
        <div style={{ marginBottom: 16 }}>
          <span className="badge badge-sm badge-gray" style={{ textTransform: "capitalize" }}>{article.category}</span>
        </div>
      )}
      <div
        className="help-article-body"
        style={{ lineHeight: 1.7 }}
        dangerouslySetInnerHTML={{ __html: renderMarkdown(article.body_text || "") }}
      />
      <p style={{ marginTop: 32, fontSize: 12, color: "var(--color-text-muted)" }}>
        {t("help.last_updated")}: {new Date(article.updated_at).toLocaleString()}
      </p>
    </div>
  );
}

