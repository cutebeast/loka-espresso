"use client";

import { useTranslation } from "@/hooks/useTranslation";
import Drawer from "@/components/Drawer";
import { type MenuItem } from "@/lib/api";
interface PosModifierDrawerProps {
  item: MenuItem | null;
  selectedModifiers: Record<number, number[]>;
  qty: number;
  onToggleModifier: (groupId: number, modId: number, selectionType: string, maxSelections: number) => void;
  onQtyChange: (delta: number) => void;
  onAdd: () => void;
  onCancel: () => void;
}
export default function PosModifierDrawer({
  item,
  selectedModifiers,
  qty,
  onToggleModifier,
  onQtyChange,
  onAdd,
  onCancel
}: PosModifierDrawerProps) {
  const {
    t
  } = useTranslation();
  if (!item) return null;
  const modPrice = Object.values(selectedModifiers).flat().reduce((sum, modId) => {
    for (const g of item.modifier_groups || []) {
      const m = g.options.find(x => x.id === modId);
      if (m) return sum + m.price_adjustment;
    }
    return sum;
  }, 0);
  const totalPrice = ((item.base_price + modPrice) * qty).toFixed(2);
  const requiredMissing = item.modifier_groups?.some(g => g.is_required && !selectedModifiers[g.id]?.length);
  return <Drawer open={!!item} onClose={onCancel} title={item.item_name} position="bottom">
      {item.modifier_groups?.map(group => <div key={group.id} style={{
      marginBottom: 20
    }}>
          <h4 style={{
        fontSize: 14,
        fontWeight: 700,
        marginBottom: 8
      }}>
            {group.group_name}
            {group.is_required && <span style={{
          color: "var(--color-error)",
          fontSize: 12
        }}> *</span>}
          </h4>
          <div style={{
        display: "flex",
        flexDirection: "column",
        gap: 8
      }}>
            {group.options.map(mod => {
          const {
            t
          } = useTranslation();
          const isSelected = selectedModifiers[group.id]?.includes(mod.id);
          return <button key={mod.id} className={`btn ${isSelected ? "btn-primary" : "btn-ghost"}`} style={{
            justifyContent: "space-between"
          }} onClick={() => onToggleModifier(group.id, mod.id, group.selection_type || "single", group.max_selections || 1)}>
                  <span>{mod.option_name}</span>
                  {mod.price_adjustment > 0 && <span>{t("pos.rm")}{mod.price_adjustment.toFixed(2)}</span>}
                </button>;
        })}
          </div>
        </div>)}
      <div style={{
      borderTop: "1px solid var(--color-border-light)",
      paddingTop: 16,
      marginTop: 8
    }}>
        <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 16
      }}>
          <div style={{
          display: "flex",
          alignItems: "center",
          gap: 12
        }}>
            <span style={{
            fontSize: 14,
            fontWeight: 600
          }}>{t("pos.qty")}</span>
            <div style={{
            display: "flex",
            alignItems: "center",
            gap: 4
          }}>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => onQtyChange(-1)} style={{
              width: 36,
              padding: 0
            }} aria-label={t("pos.decrease_quantity")}>-</button>
              <span style={{
              minWidth: 32,
              textAlign: "center",
              fontWeight: 700,
              fontSize: 16
            }}>{qty}</span>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => onQtyChange(1)} style={{
              width: 36,
              padding: 0
            }} aria-label={t("pos.increase_quantity")}>+</button>
            </div>
          </div>
          <div style={{
          textAlign: "right"
        }}>
            <div style={{
            fontSize: 12,
            color: "var(--color-text-muted)"
          }}>{t("pos.total")}</div>
            <div style={{
            fontSize: 18,
            fontWeight: 800,
            color: "var(--color-primary)"
          }}>{t("pos.rm_2")}{totalPrice}
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>{t("pos.cancel")}</button>
          <button type="button" className="btn btn-primary" onClick={onAdd} disabled={requiredMissing}>{t("pos.add_to_cart")}</button>
        </div>
      </div>
    </Drawer>;
}