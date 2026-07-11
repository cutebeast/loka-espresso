"use client";
import { useStaffRole, canUseOps } from "@/hooks/useStaffRole";

import { useTranslation } from "@/hooks/useTranslation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import PageHeader from "@/components/PageHeader";
import Alert from "@/components/Alert";
import { AlertTriangle } from "lucide-react";
interface MenuItem {
  id: number;
  item_name: string;
}
export default function WastagePage() {
  const { role, isAdmin, loading: roleLoading } = useStaffRole();
  if (!roleLoading && !canUseOps(role, isAdmin)) return <div style={{ padding: 48, textAlign: "center" }}><h2>Access Denied</h2><p>You do not have permission to access this page.</p></div>;
  const {
    t
  } = useTranslation();
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState({
    menu_item_id: "",
    quantity: 0,
    reason: "",
    notes: ""
  });
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.getRaw<any>("/staff/menu/items?per_page=500").then(d => {
      if (!cancelled) setMenuItems(Array.isArray(d) ? d : d?.items || []);
    }).catch(err => {
      console.error("Failed to load menu items:", err);
      if (!cancelled) setLoadError(t("wastage.load_menu_failed"));
    });
    return () => {
      cancelled = true;
    };
  }, [t]);
  const handleSubmit = async () => {
    if (!form.menu_item_id) {
      setError(t("wastage.err_select_item"));
      return;
    }
    if (form.quantity <= 0) {
      setError(t("wastage.err_quantity"));
      return;
    }
    if (form.reason.trim().length < 3) {
      setError(t("wastage.err_reason"));
      return;
    }
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const combinedReason = form.notes.trim() ? `${form.reason} — ${form.notes.trim()}` : form.reason;
      await api.post("/staff/inventory/waste", {
        menu_item_id: Number(form.menu_item_id),
        quantity: form.quantity,
        reason: combinedReason
      });
      setSuccess(t("wastage.reported_successfully"));
      setForm({
        menu_item_id: "",
        quantity: 0,
        reason: "",
        notes: ""
      });
    } catch (e: unknown) {
      console.error("Wastage submit failed:", e);
      setError(parseApiError(e, "Failed to submit wastage"));
    } finally {
      setSubmitting(false);
    }
  };
  return <div style={{
    padding: 24,
    maxWidth: 700,
    margin: "0 auto"
  }}>
      <PageHeader title={t("wastage.wastage_report")} subtitle={t("wastage.subtitle")} />
      {success && <Alert variant="success" onDismiss={() => setSuccess("")} autoDismiss={3000}>{success}</Alert>}
      {error && <Alert variant="error" onDismiss={() => setError("")}>{error}</Alert>}
      {loadError && <Alert variant="error" onDismiss={() => setLoadError("")}>{loadError}</Alert>}

      <div className="card" style={{
      padding: 20
    }}>
        <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 16
      }}>
          <AlertTriangle size={20} style={{
          color: "var(--color-error)"
        }} />
          <span style={{
          fontSize: 12,
          color: "var(--color-text-muted)"
        }}>{t("wastage.all_wastage_entries_are_recorded_in")}</span>
        </div>

        <div style={{
        display: "flex",
        flexDirection: "column",
        gap: 16
      }}>
          <div className="form-group">
            <label className="form-label">{t("wastage.menu_item")}</label>
            <select className="form-input" value={form.menu_item_id} onChange={e => setForm({
            ...form,
            menu_item_id: e.target.value
          })} required>
              <option value="">{t("wastage.select_menu_item")}</option>
              {menuItems.map(m => <option key={m.id} value={m.id}>{m.item_name}</option>)}
            </select>
          </div>

          <div style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 12
        }}>
            <div className="form-group">
              <label className="form-label">{t("wastage.quantity_wasted")}</label>
              <input className="form-input" type="number" min={1} step={1} placeholder={t("wastage.e_g_3")} value={form.quantity || ""} onChange={e => setForm({
              ...form,
              quantity: Number(e.target.value)
            })} required />
            </div>
            <div className="form-group">
              <label className="form-label">{t("wastage.reason")}</label>
              <select className="form-input" value={form.reason} onChange={e => setForm({
              ...form,
              reason: e.target.value
            })}>
                <option value="">{t("wastage.select")}</option>
                <option value="Burnt during preparation">{t("wastage.burnt_during_preparation")}</option>
                <option value="Spilled or dropped">{t("wastage.spilled_or_dropped")}</option>
                <option value="Expired or spoiled">{t("wastage.expired_or_spoiled")}</option>
                <option value="Damaged packaging">{t("wastage.damaged_packaging")}</option>
                <option value="Overproduction">{t("wastage.overproduction")}</option>
                <option value="Quality control rejection">{t("wastage.quality_control_rejection")}</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">{t("wastage.additional_notes")}</label>
            <textarea className="form-input" value={form.notes} onChange={e => setForm({
            ...form,
            notes: e.target.value
          })} placeholder={t("wastage.supplementary_details_about_this_wastage")} rows={2} />
          </div>

          <button type="button" onClick={handleSubmit} disabled={submitting} className="btn btn-danger">
            <AlertTriangle size={16} />
            {submitting ? t("common.submitting") : t("wastage.submit_report")}
          </button>
        </div>
      </div>
    </div>;
}