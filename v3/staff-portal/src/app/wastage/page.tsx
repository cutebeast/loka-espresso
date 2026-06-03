"use client";

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
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ menu_item_id: "", quantity: 0, reason: "", notes: "" });

  useEffect(() => {
    let cancelled = false;
    api.getRaw<any>("/admin/menu/items?per_page=500")
      .then(d => { if (!cancelled) setMenuItems(Array.isArray(d) ? d : (d?.items || [])); })
      .catch((err) => { console.error("Failed to load menu items:", err); });
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async () => {
    if (!form.menu_item_id) { setError("Select a menu item"); return; }
    if (form.quantity <= 0) { setError("Quantity must be greater than 0"); return; }
    if (form.reason.trim().length < 3) { setError("Please select a reason"); return; }
    setSubmitting(true);
    setError("");
    setSuccess("");
    try {
      const combinedReason = form.notes.trim()
        ? `${form.reason} — ${form.notes.trim()}`
        : form.reason;
      await api.post("/staff/inventory/waste", {
        menu_item_id: Number(form.menu_item_id),
        quantity: form.quantity,
        reason: combinedReason,
      });
      setSuccess("Wastage reported successfully");
      setForm({ menu_item_id: "", quantity: 0, reason: "", notes: "" });
    } catch (e: unknown) {
      console.error("Wastage submit failed:", e);
      setError(parseApiError(e, "Failed to submit wastage"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 700, margin: "0 auto" }}>
      <PageHeader
        title="Wastage Report"
        subtitle="Record F&B waste — burnt, spilled, expired, or damaged items"
      />
      {success && <Alert variant="success" onDismiss={() => setSuccess("")} autoDismiss={3000}>{success}</Alert>}
      {error && <Alert variant="error" onDismiss={() => setError("")}>{error}</Alert>}

      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <AlertTriangle size={20} style={{ color: "var(--color-error)" }} />
          <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            All wastage entries are recorded in inventory movements for audit
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="form-group">
            <label className="form-label">Menu Item</label>
            <select
              className="form-input"
              value={form.menu_item_id}
              onChange={e => setForm({ ...form, menu_item_id: e.target.value })}
              required
            >
              <option value="">— Select menu item —</option>
              {menuItems.map(m => <option key={m.id} value={m.id}>{m.item_name}</option>)}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div className="form-group">
              <label className="form-label">Quantity Wasted</label>
              <input
                className="form-input"
                type="number"
                min={1}
                step={1}
                placeholder="e.g. 3"
                value={form.quantity || ""}
                onChange={e => setForm({ ...form, quantity: Number(e.target.value) })}
                required
              />
            </div>
            <div className="form-group">
              <label className="form-label">Reason</label>
              <select
                className="form-input"
                value={form.reason}
                onChange={e => setForm({ ...form, reason: e.target.value })}
              >
                <option value="">— Select —</option>
                <option value="Burnt during preparation">Burnt during preparation</option>
                <option value="Spilled or dropped">Spilled or dropped</option>
                <option value="Expired or spoiled">Expired or spoiled</option>
                <option value="Damaged packaging">Damaged packaging</option>
                <option value="Overproduction">Overproduction</option>
                <option value="Quality control rejection">Quality control rejection</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Additional Notes</label>
            <textarea
              className="form-input"
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              placeholder="Supplementary details about this wastage..."
              rows={2}
            />
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="btn btn-danger"
          >
            <AlertTriangle size={16} />
            {submitting ? "Submitting..." : "Submit Wastage Report"}
          </button>
        </div>
      </div>
    </div>
  );
}
