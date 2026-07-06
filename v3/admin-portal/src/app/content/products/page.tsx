"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Plus, Edit2, Trash2 } from "lucide-react";
import { useCurrency } from "@/hooks/useCurrency";
interface Card {
  id: number;
  title: string;
  slug: string;
  image_url?: string;
  position: number;
  price?: number;
  is_active: boolean;
}
export default function ProductsPage() {
  const {
    t
  } = useTranslation();
  const router = useRouter();
  const {
    format
  } = useCurrency();
  const [items, setItems] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const fetch = useCallback(() => {
    setLoading(true);
    api.get<{
      items: Card[];
    }>("/admin/product-cards?per_page=100").then(d => setItems(Array.isArray(d) ? d : d.items || [])).catch(e => setError(e.message)).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    fetch();
  }, [fetch]);
  const handleDelete = async (id: number) => {
    if (!confirm("Delete?")) return;
    try {
      await api.del(`/admin/product-cards/${id}`);
      fetch();
    } catch (e) {
      console.error(e);
    }
  };
  return <div style={{
    padding: 32
  }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("content_products.products")}</h1>
          <p className="page-subtitle">{items.length}{t("content_products.products_2")}</p>
        </div>
        <button type="button" onClick={() => router.push("/content/products/new")} className="btn btn-primary btn-sm">
          <Plus size={16} />{t("content_products.add_product")}</button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="table-header-bar"><span className="text-sm font-semibold">{items.length}{t("content_products.products_3")}</span></div>
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("content_products.img")}</th>
              <th>{t("content_products.title")}</th>
              <th>{t("content_products.price")}</th>
              <th>{t("content_products.pos")}</th>
              <th style={{
              width: 80
            }}>{t("content_products.status")}</th>
              <th style={{
              width: 80
            }}>{t("content_products.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={6} className="data-table-empty">{t("content_products.loading")}</td></tr> : items.map(item => <tr key={item.id} className="clickable" role="button" tabIndex={0} onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              router.push(`/content/products/${item.id}`);
            }
          }} onClick={() => router.push(`/content/products/${item.id}`)} style={{
            cursor: "pointer"
          }}>
                <td>
                  {item.image_url ? <img src={item.image_url} alt="" loading="lazy" style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                objectFit: "cover"
              }} /> : <span>—</span>}
                </td>
                <td style={{
              fontWeight: 600
            }}>{item.title}</td>
                <td style={{
              fontWeight: 600,
              color: "var(--color-success)"
            }}>
                  {item.price != null && !isNaN(Number(item.price)) ? format(item.price) : "—"}
                </td>
                <td>{item.position}</td>
                <td onClick={e => e.stopPropagation()}>
                  <span className={`badge badge-sm ${item.is_active ? "badge-green" : "badge-gray"}`}>
                    {item.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td onClick={e => e.stopPropagation()}>
                  <div style={{
                display: "flex",
                gap: 4,
                alignItems: "center"
              }}>
                    <button type="button" onClick={() => router.push(`/content/products/${item.id}`)} className="btn btn-ghost btn-sm" style={{
                  color: "var(--color-info)"
                }} aria-label={t("content_products.edit_product")}>
                      <Edit2 size={14} />
                    </button>
                    <button type="button" onClick={() => handleDelete(item.id)} className="btn btn-ghost btn-sm" style={{
                  color: "var(--color-error)"
                }} aria-label={t("content_products.delete_product")}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>)}
          </tbody>
        </table>
      </div>
    </div>;
}