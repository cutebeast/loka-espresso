"use client";

import { useState, useMemo, useEffect } from "react";
import Modal from "@/components/Modal";
import { Minus, Plus, Check } from "lucide-react";
import type { BundleProduct } from "@/lib/api";

interface BundlePickerModalProps {
  open: boolean;
  bundle: BundleProduct | null;
  menuItems: Array<{ id: number; item_name: string; base_price: number; image_url?: string | null; is_available: boolean }>;
  onClose: () => void;
  onAdd: (selections: Array<{ menu_item_id: number; quantity: number }>) => void;
}

export default function BundlePickerModal({ open, bundle, menuItems, onClose, onAdd }: BundlePickerModalProps) {
  const pickCount = bundle?.pick_count ?? 0;
  const allowDuplicates = bundle?.allow_duplicates ?? false;

  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!open) {
      setQuantities({});
      setSelectedIds(new Set());
    }
  }, [open]);

  const poolItems = useMemo(() => {
    if (!bundle) return [];
    return (bundle.components || []).map((comp) => {
      const mi = menuItems.find((i) => i.id === comp.menu_item_id);
      return {
        componentId: comp.id,
        menu_item_id: comp.menu_item_id,
        name: mi?.item_name || comp.menu_item_name || `Item #${comp.menu_item_id}`,
        price: mi?.base_price ?? comp.menu_item_price ?? 0,
        image_url: mi?.image_url || comp.menu_item_image_url || null,
        is_available: mi?.is_available ?? true,
      };
    }).filter((item) => item.is_available);
  }, [bundle, menuItems]);

  const totalSelected = allowDuplicates
    ? Object.values(quantities).reduce((sum, q) => sum + q, 0)
    : selectedIds.size;

  const canAdd = totalSelected === pickCount;

  const toggleItem = (menuItemId: number) => {
    if (allowDuplicates) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(menuItemId)) {
        next.delete(menuItemId);
      } else if (next.size < pickCount) {
        next.add(menuItemId);
      }
      return next;
    });
  };

  const incQty = (menuItemId: number) => {
    if (!allowDuplicates) return;
    setQuantities((prev) => {
      const cur = prev[menuItemId] || 0;
      if (totalSelected >= pickCount) return prev;
      return { ...prev, [menuItemId]: cur + 1 };
    });
  };

  const decQty = (menuItemId: number) => {
    if (!allowDuplicates) return;
    setQuantities((prev) => {
      const cur = prev[menuItemId] || 0;
      if (cur <= 0) return prev;
      const next = { ...prev, [menuItemId]: cur - 1 };
      if (next[menuItemId] === 0) delete next[menuItemId];
      return next;
    });
  };

  const handleAdd = () => {
    if (!canAdd) return;
    const selections: Array<{ menu_item_id: number; quantity: number }> = [];
    if (allowDuplicates) {
      for (const [menuItemIdStr, qty] of Object.entries(quantities)) {
        if (qty <= 0) continue;
        selections.push({ menu_item_id: Number(menuItemIdStr), quantity: qty });
      }
    } else {
      for (const menuItemId of selectedIds) {
        selections.push({ menu_item_id: menuItemId, quantity: 1 });
      }
    }
    onAdd(selections);
    setQuantities({});
    setSelectedIds(new Set());
  };

  const isItemSelected = (menuItemId: number) => {
    if (allowDuplicates) return (quantities[menuItemId] || 0) > 0;
    return selectedIds.has(menuItemId);
  };

  const isSelectable = (menuItemId: number) => {
    if (allowDuplicates) return totalSelected < pickCount;
    if (selectedIds.has(menuItemId)) return true;
    return selectedIds.size < pickCount;
  };

  return (
    <Modal open={open} onClose={onClose} title={`Pick ${pickCount} for ${bundle?.title || 'Combo'}`} size="lg" footer={
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>
          {totalSelected} / {pickCount} selected
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!canAdd}
            onClick={handleAdd}
          >
            Add to Cart — RM {bundle?.bundle_price?.toFixed(2) ?? '0.00'}
          </button>
        </div>
      </div>
    }>
      <div style={{ maxHeight: "60vh", overflowY: "auto", padding: "0 4px" }}>
        {!allowDuplicates && (
          <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 12 }}>
            {selectedIds.size >= pickCount
              ? "Maximum selected. Remove one to pick another."
              : `Select ${pickCount} items to continue`}
          </p>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
          {poolItems.map((item) => {
            const selected = isItemSelected(item.menu_item_id);
            const selectable = isSelectable(item.menu_item_id);
            const qty = quantities[item.menu_item_id] || 0;

            return (
              <div
                key={item.componentId}
                onClick={() => toggleItem(item.menu_item_id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleItem(item.menu_item_id); } }}
                role="button"
                tabIndex={0}
                style={{
                  border: selected ? "2px solid var(--color-primary)" : "1px solid var(--color-border-light)",
                  borderRadius: 12,
                  padding: 12,
                  cursor: selectable || selected ? "pointer" : "default",
                  opacity: !selectable && !selected ? 0.5 : 1,
                  background: selected ? "rgba(59,74,26,0.05)" : "var(--color-bg-white)",
                  transition: "all 0.15s",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  position: "relative",
                }}
              >
                {item.image_url && (
                  <div style={{ width: "100%", height: 80, borderRadius: 8, overflow: "hidden", background: "var(--color-bg-muted)" }}>
                    <img src={item.image_url} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
                  </div>
                )}
                {selected && !allowDuplicates && (
                  <div style={{
                    position: "absolute", top: 8, right: 8,
                    width: 22, height: 22, borderRadius: "50%",
                    background: "var(--color-primary)", color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Check size={12} />
                  </div>
                )}
                <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3 }}>{item.name}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "var(--color-primary)" }}>
                  RM {Number(item.price ?? 0).toFixed(2)}
                </div>

                {allowDuplicates && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }} onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      style={{
                        width: 28, height: 28, borderRadius: "50%",
                        border: "1px solid var(--color-border)", background: "var(--color-bg-white)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: qty > 0 ? "pointer" : "default", opacity: qty > 0 ? 1 : 0.3,
                      }}
                      disabled={qty <= 0}
                      onClick={() => decQty(item.menu_item_id)}
                    >
                      <Minus size={14} />
                    </button>
                    <span style={{ fontWeight: 700, fontSize: 14, minWidth: 20, textAlign: "center" }}>{qty}</span>
                    <button
                      type="button"
                      style={{
                        width: 28, height: 28, borderRadius: "50%",
                        border: "1px solid var(--color-border)", background: "var(--color-bg-white)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: totalSelected < pickCount ? "pointer" : "default",
                        opacity: totalSelected < pickCount ? 1 : 0.3,
                      }}
                      disabled={totalSelected >= pickCount}
                      onClick={() => incQty(item.menu_item_id)}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
