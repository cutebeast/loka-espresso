"use client";

import { useTranslation } from "@/hooks/useTranslation";
import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { getHelpArticle } from "@/lib/api";
import { ArrowLeft } from "lucide-react";
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

export default function StaffHelpArticlePage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { slug } = useParams();
  const [article, setArticle] = useState<HelpArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await getHelpArticle(slug as string);
      setArticle(d);
      setError("");
    } catch (e) {
      console.error(e);
      setError(t("help.load_article_failed"));
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [slug, t]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return <div style={{ padding: 24 }}>{t("common.loading")}</div>;
  }

  if (error || notFound || !article) {
    return (
      <div style={{ padding: 24, textAlign: "center" }}>
        {error && <div className="alert alert-error" style={{ marginBottom: 16 }}>{error}</div>}
        <p style={{ marginBottom: 16, color: "var(--color-text-muted)" }}>{t("help.not_found")}</p>
        <button onClick={() => router.push("/help")} className="btn btn-outline btn-sm">{t("common.back")}</button>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, maxWidth: 720, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => router.push("/help")} className="btn btn-ghost btn-sm" aria-label={t("common.back")}>
          <ArrowLeft size={20} />
        </button>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{article.title}</h1>
      </div>
      {article.category && (
        <div style={{ marginBottom: 16 }}>
          <span className="badge badge-sm" style={{ textTransform: "capitalize" }}>{article.category}</span>
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

