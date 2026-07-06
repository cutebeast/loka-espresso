"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { api } from "@/lib/api";
import { ArrowLeft, Save } from "lucide-react";
interface StockRecord {
  id: number;
  inventory_item_id: number;
  store_id: number;
  current_stock: number;
  reserved_stock: number;
  reorder_level: number;
  reorder_quantity: number;
  par_level: number;
  storage_location: string | null;
  item_name?: string;
  item_code?: string;
}
export default function StockEditPage() {
  const {
    t
  } = useTranslation();
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string;
  const [record, setRecord] = useState<StockRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({
    current_stock: 0,
    reserved_stock: 0,
    reorder_level: 0,
    reorder_quantity: 0,
    par_level: 0,
    storage_location: ""
  });
  useEffect(() => {
    api.getRaw<StockRecord>(`/admin/inventory/stocks/${id}`).then((d: any) => {
      const item = d?.items?.[0] || d;
      setRecord(item);
      setForm({
        current_stock: item.current_stock ?? 0,
        reserved_stock: item.reserved_stock ?? 0,
        reorder_level: item.reorder_level ?? 0,
        reorder_quantity: item.reorder_quantity ?? 0,
        par_level: item.par_level ?? 0,
        storage_location: item.storage_location || ""
      });
    }).catch((e: any) => setError(e.message || "Failed to load stock record")).finally(() => setLoading(false));
  }, [id]);
  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await api.patch(`/admin/inventory/stocks/${id}`, {
        current_stock: Number(form.current_stock),
        reserved_stock: Number(form.reserved_stock),
        reorder_level: Number(form.reorder_level),
        reorder_quantity: Number(form.reorder_quantity),
        par_level: Number(form.par_level),
        storage_location: form.storage_location || null
      });
      setMsg("Stock updated");
      setTimeout(() => router.back(), 800);
    } catch (e: any) {
      setError(e.message || "Failed to update stock");
    } finally {
      setSaving(false);
    }
  };
  if (loading) {
    return <div style={{
      padding: 32
    }}>
        <div className="page-header">
          <h1 className="page-title">{t("inventory_stocks_[id].edit_stock")}</h1>
        </div>
        <p>{t("inventory_stocks_[id].loading")}</p>
      </div>;
  }
  if (!loading && !record) {
    return <div style={{
      padding: 32
    }}>
        <div className="page-header">
          <h1 className="page-title">{t("inventory_stocks_[id].edit_stock_2")}</h1>
        </div>
        <div className="alert alert-error">{error || "Stock record not found"}</div>
        <button type="button" onClick={() => router.back()} className="btn btn-outline" style={{
        marginTop: 12
      }}>
          <ArrowLeft size={14} />{t("inventory_stocks_[id].go_back")}</button>
      </div>;
  }
  return <div style={{
    padding: 32
  }}>
      <div style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: 20
    }}>
        <button type="button" onClick={() => router.back()} className="btn btn-ghost btn-sm">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="page-title" style={{
          margin: 0
        }}>
            {record?.item_name || `Stock #${id}`}
          </h1>
          <p className="page-subtitle" style={{
          marginTop: 2
        }}>{t("inventory_stocks_[id].store")}{record?.store_id}{t("inventory_stocks_[id].item")}{record?.inventory_item_id}
            {record?.item_code ? ` | Code: ${record.item_code}` : ""}
          </p>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{
      marginBottom: 12
    }}>{error}</div>}
      {msg && <div className="alert alert-success" style={{
      marginBottom: 12
    }}>{msg}</div>}

      <div className="card" style={{
      padding: 24,
      maxWidth: 720
    }}>
        <div className="df-grid">
          <div className="df-field">
            <label className="form-label">{t("inventory_stocks_[id].current_stock")}</label>
            <input type="number" step="0.01" value={form.current_stock} onChange={e => setForm(f => ({
            ...f,
            current_stock: Number(e.target.value)
          }))} />
          </div>
          <div className="df-field">
            <label className="form-label">{t("inventory_stocks_[id].reserved_stock")}</label>
            <input type="number" step="0.01" value={form.reserved_stock} onChange={e => setForm(f => ({
            ...f,
            reserved_stock: Number(e.target.value)
          }))} />
          </div>
          <div className="df-field">
            <label className="form-label">{t("inventory_stocks_[id].reorder_level")}</label>
            <input type="number" step="0.01" value={form.reorder_level} onChange={e => setForm(f => ({
            ...f,
            reorder_level: Number(e.target.value)
          }))} />
          </div>
          <div className="df-field">
            <label className="form-label">{t("inventory_stocks_[id].reorder_quantity")}</label>
            <input type="number" step="0.01" value={form.reorder_quantity} onChange={e => setForm(f => ({
            ...f,
            reorder_quantity: Number(e.target.value)
          }))} />
          </div>
          <div className="df-field">
            <label className="form-label">{t("inventory_stocks_[id].par_level")}</label>
            <input type="number" step="0.01" value={form.par_level} onChange={e => setForm(f => ({
            ...f,
            par_level: Number(e.target.value)
          }))} />
          </div>
          <div className="df-field" style={{
          gridColumn: "1/-1"
        }}>
            <label className="form-label">{t("inventory_stocks_[id].storage_location")}</label>
            <input value={form.storage_location} onChange={e => setForm(f => ({
            ...f,
            storage_location: e.target.value
          }))} placeholder={t("inventory_stocks_[id].e_g_shelf_a_3_cold")} />
          </div>
        </div>
        <div className="df-actions" style={{
        marginTop: 20
      }}>
          <button type="button" onClick={() => router.back()} className="btn btn-ghost">{t("inventory_stocks_[id].cancel")}</button>
          <button type="button" onClick={handleSave} disabled={saving} className="btn btn-primary">
            <Save size={16} /> {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>;
}