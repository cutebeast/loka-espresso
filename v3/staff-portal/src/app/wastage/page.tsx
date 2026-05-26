"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
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
    api.getRaw<any>("/admin/menu/items?per_page=500")
      .then(d => setMenuItems(Array.isArray(d) ? d : (d?.items || [])))
      .catch(() => {});
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
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: 24 }}>
      <PageHeader
        title="Wastage Report"
        subtitle="Record F&B waste — burnt, spilled, expired, or damaged items"
        back
      />
      {success && <Alert variant="success">{success}</Alert>}
      {error && <Alert variant="error">{error}</Alert>}

      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <AlertTriangle size={20} style={{ color: "var(--color-error)" }} />
          <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
            All wastage entries are recorded in inventory movements for audit
          </span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Menu Item</label>
            <select
              value={form.menu_item_id}
              onChange={e => setForm({ ...form, menu_item_id: e.target.value })}
              style={{ width: "100%", padding: "8px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)", fontSize: 14 }}
              required
            >
              <option value="">— Select menu item —</option>
              {menuItems.map(m => <option key={m.id} value={m.id}>{m.item_name}</option>)}
            </select>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Quantity Wasted</label>
              <input
                type="number"
                min={1}
                step={1}
                placeholder="e.g. 3"
                value={form.quantity || ""}
                onChange={e => setForm({ ...form, quantity: Number(e.target.value) })}
                style={{ width: "100%", padding: "8px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)", fontSize: 14 }}
                required
              />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Reason</label>
              <select
                value={form.reason}
                onChange={e => setForm({ ...form, reason: e.target.value })}
                style={{ width: "100%", padding: "8px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)", fontSize: 14 }}
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

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, display: "block", marginBottom: 4 }}>Additional Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              placeholder="Supplementary details about this wastage..."
              rows={2}
              style={{ width: "100%", padding: "8px 12px", borderRadius: "var(--radius-sm)", border: "1px solid var(--color-border-light)", resize: "vertical", fontSize: 14 }}
            />
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            style={{
              marginTop: 8,
              padding: "10px 20px",
              background: "var(--color-error)",
              color: "#fff",
              border: "none",
              borderRadius: "var(--radius-sm)",
              fontSize: 14,
              fontWeight: 600,
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.6 : 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <AlertTriangle size={16} />
            {submitting ? "Submitting..." : "Submit Wastage Report"}
          </button>
        </div>
      </div>
    </div>
  );
}
