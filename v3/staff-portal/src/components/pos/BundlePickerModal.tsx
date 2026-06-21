"use client";

import { useState, useMemo, useEffect } from "react";
import Modal from "@/components/Modal";
import { Minus, Plus, Check, ArrowLeft, ArrowRight } from "lucide-react";
import type { BundleProduct } from "@/lib/api";

interface BundlePickerModalProps {
  open: boolean;
  bundle: BundleProduct | null;
  menuItems: Array<{ id: number; item_name: string; base_price: number; image_url?: string | null; is_available: boolean }>;
  onClose: () => void;
  onAdd: (selections: Array<{ menu_item_id: number; quantity: number; bundle_component_id?: number }>) => void;
}

export default function BundlePickerModal({ open, bundle, menuItems, onClose, onAdd }: BundlePickerModalProps) {
  const isMultiCourse = bundle?.bundle_type === "multi_course";
  const groups = bundle?.groups || [];
  const pickCount = bundle?.pick_count ?? 0;
  const allowDuplicates = bundle?.allow_duplicates ?? false;

  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [currentGroupIdx, setCurrentGroupIdx] = useState(0);
  const [groupSelections, setGroupSelections] = useState<Record<number, Set<number>>>({});

  useEffect(() => {
    if (!open) {
      setQuantities({});
      setSelectedIds(new Set());
      setCurrentGroupIdx(0);
      setGroupSelections({});
    }
  }, [open]);

  const poolItems = useMemo(() => {
    if (!bundle) return [];
    if (bundle.bundle_type === "multi_course") {
      const currentGroup = bundle.groups?.[currentGroupIdx];
      if (!currentGroup) return [];
      return (currentGroup.components || []).map((comp) => {
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
    }
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
  }, [bundle, menuItems, currentGroupIdx]);

  const currentSelections = isMultiCourse ? (groupSelections[currentGroupIdx] || new Set<number>()) : selectedIds;
  const currentMaxPick = isMultiCourse ? (groups[currentGroupIdx]?.max_pick ?? (groups[currentGroupIdx]?.pick_count ?? 0)) : pickCount;

  const totalSelected = allowDuplicates
    ? Object.values(quantities).reduce((sum, q) => sum + q, 0)
    : currentSelections.size;

  const canAdd = isMultiCourse
    ? groups.every((g, gi) => {
        const sel = groupSelections[gi] || new Set<number>();
        return sel.size >= g.pick_count;
      })
    : (allowDuplicates ? totalSelected === pickCount : totalSelected === pickCount);

  const toggleItem = (componentId: number) => {
    if (allowDuplicates) return;

    if (isMultiCourse) {
      setGroupSelections((prev) => {
        const current = new Set(prev[currentGroupIdx] || []);
        if (current.has(componentId)) {
          current.delete(componentId);
        } else if (current.size < currentMaxPick) {
          current.add(componentId);
        }
        return { ...prev, [currentGroupIdx]: current };
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(componentId)) {
          next.delete(componentId);
        } else if (next.size < pickCount) {
          next.add(componentId);
        }
        return next;
      });
    }
  };

  const incQty = (componentId: number) => {
    if (!allowDuplicates) return;
    setQuantities((prev) => {
      const cur = prev[componentId] || 0;
      const runningTotal = Object.values({ ...prev, [componentId]: cur + 1 }).reduce((sum, q) => sum + q, 0);
      if (runningTotal > pickCount) return prev;
      return { ...prev, [componentId]: cur + 1 };
    });
  };

  const decQty = (componentId: number) => {
    if (!allowDuplicates) return;
    setQuantities((prev) => {
      const cur = prev[componentId] || 0;
      if (cur <= 0) return prev;
      const next = { ...prev, [componentId]: cur - 1 };
      if (next[componentId] === 0) delete next[componentId];
      return next;
    });
  };

  const handleAdd = () => {
    if (!canAdd) return;

    if (isMultiCourse) {
      const selections: Array<{ menu_item_id: number; quantity: number; bundle_component_id?: number }> = [];
      for (let gi = 0; gi < groups.length; gi++) {
        const sel = groupSelections[gi] || new Set<number>();
        for (const componentId of sel) {
          const comp = groups[gi]?.components?.find((c) => c.id === componentId);
          if (comp) {
            selections.push({
              menu_item_id: comp.menu_item_id,
              quantity: 1,
              bundle_component_id: comp.id,
            });
          }
        }
      }
      onAdd(selections);
    } else if (allowDuplicates) {
      const selections: Array<{ menu_item_id: number; quantity: number; bundle_component_id?: number }> = [];
      for (const [componentIdStr, qty] of Object.entries(quantities)) {
        if (qty <= 0) continue;
        const componentId = Number(componentIdStr);
        const comp = bundle?.components?.find((c) => c.id === componentId);
        selections.push({ menu_item_id: comp?.menu_item_id ?? 0, quantity: qty, bundle_component_id: componentId });
      }
      onAdd(selections);
    } else {
      const selections: Array<{ menu_item_id: number; quantity: number; bundle_component_id?: number }> = [];
      for (const componentId of selectedIds) {
        const comp = bundle?.components?.find((c) => c.id === componentId);
        if (comp) selections.push({ menu_item_id: comp.menu_item_id, quantity: 1, bundle_component_id: comp.id });
      }
      onAdd(selections);
    }
    setQuantities({});
    setSelectedIds(new Set());
    setGroupSelections({});
    setCurrentGroupIdx(0);
  };

  const isItemSelected = (componentId: number) => {
    if (allowDuplicates) return (quantities[componentId] || 0) > 0;
    if (isMultiCourse) return currentSelections.has(componentId);
    return selectedIds.has(componentId);
  };

  const isSelectable = (componentId: number) => {
    if (allowDuplicates) return totalSelected < pickCount;
    if (isMultiCourse) return currentSelections.has(componentId) || currentSelections.size < currentMaxPick;
    if (selectedIds.has(componentId)) return true;
    return selectedIds.size < pickCount;
  };

  const modalTitle = isMultiCourse
    ? `Build ${bundle?.title || 'Combo'}`
    : `Pick ${pickCount} for ${bundle?.title || 'Combo'}`;

  return (
    <Modal open={open} onClose={onClose} title={modalTitle} size="lg" footer={
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>
          {isMultiCourse
            ? `${groups.filter((g, gi) => (groupSelections[gi] || new Set<number>()).size >= g.pick_count).length}/${groups.length} groups done`
            : `${totalSelected} / ${pickCount} selected`}
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
        {isMultiCourse && groups.length > 0 && (
          <div style={{ display: "flex", gap: 4, marginBottom: 12, flexWrap: "wrap" }}>
            {groups.map((g, gi) => {
              const sel = groupSelections[gi] || new Set<number>();
              const done = sel.size >= g.pick_count;
              return (
                <button
                  key={gi}
                  type="button"
                  onClick={() => setCurrentGroupIdx(gi)}
                  style={{
                    padding: "6px 12px", fontSize: 11, fontWeight: currentGroupIdx === gi ? 600 : 400,
                    border: currentGroupIdx === gi ? "1px solid var(--color-primary)" : "1px solid var(--color-border-light)",
                    borderRadius: 20, background: currentGroupIdx === gi ? "rgba(59,74,26,0.08)" : "var(--color-bg-white)",
                    cursor: "pointer", whiteSpace: "nowrap", color: done ? "var(--color-success)" : "inherit",
                  }}
                >
                  {done && "✓ "}{g.group_label} ({sel.size}/{g.pick_count})
                </button>
              );
            })}
          </div>
        )}
        {isMultiCourse && groups[currentGroupIdx] && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h4 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>{groups[currentGroupIdx].group_label}</h4>
                <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: "2px 0 0" }}>
                  Pick {groups[currentGroupIdx].pick_count} (up to {groups[currentGroupIdx].max_pick})
                </p>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button type="button" className="btn btn-ghost btn-sm" disabled={currentGroupIdx <= 0} onClick={() => setCurrentGroupIdx(currentGroupIdx - 1)}><ArrowLeft size={14} /></button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={currentGroupIdx >= groups.length - 1} onClick={() => setCurrentGroupIdx(currentGroupIdx + 1)}><ArrowRight size={14} /></button>
              </div>
            </div>
          </div>
        )}
        {!isMultiCourse && !allowDuplicates && (
          <p style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 12 }}>
            {selectedIds.size >= pickCount
              ? "Maximum selected. Remove one to pick another."
              : `Select ${pickCount} items to continue`}
          </p>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 10 }}>
          {poolItems.map((item) => {
            const selected = isItemSelected(item.componentId);
            const selectable = isSelectable(item.componentId);
            const qty = quantities[item.componentId] || 0;

            return (
              <div
                key={item.componentId}
                onClick={() => toggleItem(item.componentId)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleItem(item.componentId); } }}
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
                      onClick={() => decQty(item.componentId)}
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
                      onClick={() => incQty(item.componentId)}
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
