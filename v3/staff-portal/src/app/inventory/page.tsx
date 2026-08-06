"use client";
import { RoleGuard, canReportHygiene } from "@/hooks/useStaffRole";

import { useTranslation } from "@/hooks/useTranslation";
import { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import PageHeader from "@/components/PageHeader";
import Alert from "@/components/Alert";
import EmptyState from "@/components/EmptyState";
import SkeletonCard from "@/components/SkeletonCard";
import Badge from "@/components/Badge";
import { Package, RefreshCw, X, Search, Camera } from "lucide-react";
interface InventoryItem {
  id: number;
  item_name: string;
  item_code: string;
  item_type: string;
  current_stock: number;
  unit_of_measure: string;
  reorder_level: number;
  par_level?: number;
  category_name?: string;
}
export default function InventoryPage() {
  return <RoleGuard allowed={canReportHygiene}>
    <InventoryPageContent />
  </RoleGuard>;
}
function InventoryPageContent() {
  const {
    t
  } = useTranslation();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editStock, setEditStock] = useState("");
  const [editReason, setEditReason] = useState("");
  const [editFile, setEditFile] = useState<File | null>(null);
  const [editPreview, setEditPreview] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [updateSubmitting, setUpdateSubmitting] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = await api.getRaw<any>("/staff/inventory");
      setItems(Array.isArray(data) ? data : data?.items || []);
    } catch (e: unknown) {
      setError(parseApiError(e, "Failed to load inventory"));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const categories = useMemo(() => {
    const seen = new Set<string>();
    const cats: {
      name: string;
    }[] = [];
    items.forEach(i => {
      if (i.category_name && !seen.has(i.category_name)) {
        seen.add(i.category_name);
        cats.push({
          name: i.category_name
        });
      }
    });
    return cats;
  }, [items]);
  const filtered = useMemo(() => catFilter ? items.filter(i => i.category_name === catFilter) : items, [items, catFilter]);
  const openUpdate = (item: InventoryItem) => {
    setEditingId(item.id);
    setEditStock(String(item.current_stock));
    setEditReason("");
    setEditFile(null);
    if (editPreview) URL.revokeObjectURL(editPreview);
    setEditPreview("");
    setError("");
    setSuccess("");
  };
  const cancelUpdate = () => {
    setEditingId(null);
    setEditStock("");
    setEditReason("");
    setEditFile(null);
    if (editPreview) URL.revokeObjectURL(editPreview);
    setEditPreview("");
  };
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] || null;
    if (editPreview) URL.revokeObjectURL(editPreview);
    setEditFile(f);
    setEditPreview(f ? URL.createObjectURL(f) : "");
    if (fileRef.current) fileRef.current.value = "";
  };
  const handleUpdate = async (itemId: number) => {
    // Number("") is 0 — treat a cleared input as invalid instead of zeroing stock.
    if (editStock.trim() === "") {
      setError(t("inventory.err_invalid_count"));
      return;
    }
    const newCount = Number(editStock);
    if (isNaN(newCount) || newCount < 0) {
      setError(t("inventory.err_invalid_count"));
      return;
    }
    setUpdateSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const fd = new FormData();
      fd.set("item_id", String(itemId));
      fd.set("current_stock", String(newCount));
      fd.set("reason", editReason.trim());
      if (editFile) fd.append("images", editFile, editFile.name);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await api.upload<any>("/staff/inventory/update", fd);
      setSuccess(t("inventory.stock_updated"));
      setEditingId(null);
      setEditStock("");
      setEditFile(null);
      if (editPreview) URL.revokeObjectURL(editPreview);
      setEditPreview("");
      load();
    } catch (e: unknown) {
      setError(parseApiError(e, "Failed to update stock"));
    } finally {
      setUpdateSubmitting(false);
    }
  };
  return <div style={{
    padding: 24,
    maxWidth: 900,
    margin: "0 auto"
  }}>
      <PageHeader title={t("inventory.inventory")} subtitle={t("inventory.subtitle")} action={<button type="button" onClick={load} className="btn btn-ghost btn-sm" aria-label={t("inventory.refresh")} style={{
      display: "flex",
      alignItems: "center",
      gap: 4
    }}>
            <RefreshCw size={16} />{t("inventory.refresh_2")}</button>} />
      {success && <Alert variant="success" onDismiss={() => setSuccess("")} autoDismiss={3000}>{success}</Alert>}
      {error && <Alert variant="error" onDismiss={() => setError("")}>{error}</Alert>}

      {/* Category Filter */}
      <div style={{
      marginBottom: 12,
      display: "flex",
      gap: 8,
      alignItems: "center"
    }}>
        <Search size={14} style={{
        color: "var(--color-text-muted)"
      }} />
        <select className="form-input" style={{
        width: "auto",
        marginBottom: 0
      }} value={catFilter} onChange={e => setCatFilter(e.target.value)}>
          <option value="">{t("inventory.all_categories")} ({items.length})</option>
          {categories.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
        </select>
        <span style={{
        fontSize: 12,
        color: "var(--color-text-muted)"
      }}>{filtered.length}{t("inventory.items")}</span>
      </div>

      {loading ? <SkeletonCard count={3} /> : items.length === 0 ? <EmptyState icon={<Package size={48} />} title={t("inventory.no_inventory_items")} description={t("inventory.no_inventory_items_registered_for_your")} /> : <div style={{
      display: "grid",
      gap: 12
    }}>
          {filtered.map(item => <div key={item.id} className="card" style={{
        padding: 16
      }}>
              <div style={{
          display: "flex",
          alignItems: "center",
          gap: 16
        }}>
                <div style={{
            flex: 1
          }}>
                  <div style={{
              fontWeight: 700,
              fontSize: 15
            }}>{item.item_name || t("common.unnamed_item")}</div>
                  <div style={{
              fontSize: 12,
              color: "var(--color-text-muted)"
            }}>
                    {item.item_code}{item.category_name ? ` · ${item.category_name}` : ""}{item.item_type ? ` · ${item.item_type === "non_fnb" ? "Non-FnB" : "FnB"}` : ""}
                  </div>
                </div>
                <Badge variant={item.item_type === "non_fnb" ? "purple" : "blue"}>{item.item_type === "non_fnb" ? t("inventory.item_type_non_fnb") : t("inventory.item_type_fnb")}</Badge>
              </div>
              <div style={{
          display: "flex",
          gap: 24,
          marginTop: 12,
          fontSize: 13
        }}>
                <div>
                  <span style={{
              color: "var(--color-text-muted)"
            }}>{t("inventory.stock")}</span>{" "}
                  <span style={{
              fontWeight: 700,
              color: item.current_stock <= (item.reorder_level || 0) ? "var(--color-error)" : "var(--color-success)"
            }}>
                    {item.current_stock}
                  </span>
                </div>
                <div><span style={{
              color: "var(--color-text-muted)"
            }}>{t("inventory.unit")}</span> {item.unit_of_measure}</div>
                <div><span style={{
              color: "var(--color-text-muted)"
            }}>{t("inventory.par")}</span> {item.par_level ?? item.reorder_level ?? "—"}</div>
              </div>

              {editingId === item.id ? <div style={{
          marginTop: 12,
          display: "flex",
          flexDirection: "column",
          gap: 8
        }}>
                  <div style={{
            display: "flex",
            gap: 8,
            alignItems: "center"
          }}>
                    <input type="number" className="form-input" style={{
              width: 100,
              marginBottom: 0
            }} value={editStock} onChange={e => setEditStock(e.target.value)} />
                    <button type="button" onClick={() => handleUpdate(item.id)} disabled={updateSubmitting} className="btn btn-primary btn-sm">{updateSubmitting ? "..." : t("inventory.save")}</button>
                    <button type="button" onClick={cancelUpdate} className="btn btn-ghost btn-sm"><X size={14} /></button>
                  </div>
                  <input type="text" className="form-input" style={{
            maxWidth: 300,
            marginBottom: 0
          }} value={editReason} onChange={e => setEditReason(e.target.value)} placeholder={t("inventory.remark_reason_for_update")} />
                  <div style={{
            display: "flex",
            gap: 8,
            alignItems: "center"
          }}>
                    <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{
              display: "none"
            }} />
                    <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-outline btn-sm" style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12
            }}>
                      <Camera size={14} />{editFile ? (editFile.name.length > 18 ? editFile.name.slice(0, 15) + "…" : editFile.name) : t("inventory.upload_image")}
                    </button>
                    {editPreview && <div style={{
              position: "relative",
              width: 48,
              height: 48,
              borderRadius: 8,
              overflow: "hidden",
              border: "1px solid var(--color-border-light)"
            }}>
                        <img src={editPreview} alt="" style={{
                width: "100%",
                height: "100%",
                objectFit: "cover"
              }} />
                        <button type="button" onClick={() => {
                if (editPreview) URL.revokeObjectURL(editPreview);
                setEditFile(null);
                setEditPreview("");
              }} style={{
                position: "absolute",
                top: 1,
                right: 1,
                background: "rgba(0,0,0,0.6)",
                border: "none",
                color: "#fff",
                borderRadius: "50%",
                width: 16,
                height: 16,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer"
              }}><X size={10} /></button>
                      </div>}
                  </div>
                </div> : <div style={{
          marginTop: 12
        }}>
                  <button type="button" onClick={() => openUpdate(item)} className="btn btn-sm btn-outline" style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 12
          }}>
                    <Package size={14} />{t("inventory.update_count")}</button>
                </div>}
            </div>)}
        </div>}
    </div>;
}