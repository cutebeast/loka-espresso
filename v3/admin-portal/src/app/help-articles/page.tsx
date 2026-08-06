"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Plus, Edit2, Trash2, BookOpen } from "lucide-react";

type HelpAudience = "admin" | "staff" | "customer";

interface HelpArticle {
  id: number;
  slug: string;
  title: string;
  audience: HelpAudience;
  category: string | null;
  is_active: boolean;
}

export default function HelpArticlesPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlAudience = searchParams.get("audience");
  const [audience] = useState<HelpAudience>(
    (["admin", "staff", "customer"] as const).includes(urlAudience as HelpAudience)
      ? (urlAudience as HelpAudience)
      : "admin",
  );
  const [items, setItems] = useState<HelpArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetch = useCallback(() => {
    setLoading(true);
    api
      .get<{ items: HelpArticle[] }>(`/admin/help-articles?per_page=500&audience=${audience}`)
      .then((d) => setItems(Array.isArray(d) ? d : d.items || []))
      .catch((e) => setError(typeof e === "object" && e && "message" in e ? (e as Error).message : String(e)))
      .finally(() => setLoading(false));
  }, [audience]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const handleDelete = async (id: number) => {
    if (!confirm(t("common.confirm_delete"))) return;
    try {
      await api.del(`/admin/help-articles/${id}`);
      fetch();
    } catch (e: any) {console.error(e); setError(typeof e === "object" && e && "message" in e ? e.message : String(e)); }
  };

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t(`help.manage_title_${audience}`)}</h1>
          <p className="page-subtitle">{t("help.manage_articles")}</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select value={audience} onChange={(e) => router.push(`/help-articles?audience=${e.target.value}`)} style={{ alignSelf: "center" }}>
            <option value="admin">{t("help.manage_title_admin")}</option>
            <option value="staff">{t("help.manage_title_staff")}</option>
            <option value="customer">{t("help.manage_title_customer")}</option>
          </select>
          <button onClick={() => router.push(`/help?audience=${audience}`)} className="btn btn-outline btn-sm">
            <BookOpen size={16} /> {t("help.preview")}
          </button>
          <button onClick={() => router.push(`/help-articles/new?audience=${audience}`)} className="btn btn-primary btn-sm">
            <Plus size={16} /> {t("help.add_article")}
          </button>
        </div>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("help.title")}</th>
              <th>{t("help.slug")}</th>
              <th>{t("help.audience")}</th>
              <th>{t("help.category")}</th>
              <th style={{ width: 80 }}>{t("help.status")}</th>
              <th style={{ width: 80 }}>{t("help.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="data-table-empty">{t("common.loading")}</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="data-table-empty">{t("admin.common.noResults")}</td>
              </tr>
            ) : (
              items.map((item) => (
                <tr
                  key={item.id}
                  className="clickable"
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(`/help-articles/${item.id}`);
                    }
                  }}
                  onClick={() => router.push(`/help-articles/${item.id}`)}
                  style={{ cursor: "pointer" }}
                >
                  <td style={{ fontWeight: 600 }}>{item.title}</td>
                  <td className="font-mono" style={{ fontSize: 11 }}>{item.slug}</td>
                  <td>{item.audience}</td>
                  <td>{item.category || "—"}</td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <span className={`badge badge-sm ${item.is_active ? "badge-green" : "badge-gray"}`}>
                      {item.is_active ? t("common.active") : t("common.inactive")}
                    </span>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <button
                        onClick={() => router.push(`/help-articles/${item.id}`)}
                        className="btn btn-ghost btn-sm"
                        style={{ color: "var(--color-info)" }}
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="btn btn-ghost btn-sm"
                        style={{ color: "var(--color-error)" }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
