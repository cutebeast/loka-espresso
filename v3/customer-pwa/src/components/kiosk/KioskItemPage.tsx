"use client";

// Full-screen kiosk item page — replaces the bottom-sheet modal (bad touch UX).
// Layout: image on the side (landscape) or top (portrait), NEVER cropped
// (object-fit contain on a cream backdrop), with qty stepper and add-ons.
import { ArrowLeft, Minus, Plus } from "lucide-react";
import { resolveAssetUrl, LOKA } from "@/lib/tokens";

export interface KioskItemPageItem {
  id: number;
  item_name: string;
  description?: string | null;
  base_price: string | number;
  image_url?: string | null;
  variants?: { id: number; variant_name: string; price_adjustment: number }[];
  modifier_groups?: {
    id: number;
    group_name: string;
    selection_type: string;
    min_selections: number;
    max_selections: number;
    options: { id: number; option_name: string; price_adjustment: number }[];
  }[];
}

interface Props {
  item: KioskItemPageItem;
  qty: number;
  onQtyChange: (delta: number) => void;
  selectedOptions: Record<number, number[]>;
  onToggleOption: (groupId: number, optionId: number, selectionType: string, maxSelections: number) => void;
  selectedVariant: number | null;
  onSelectVariant: (id: number) => void;
  canConfirm: boolean;
  confirmLabel: string;
  totalPrice: string;
  onConfirm: () => void;
  onBack: () => void;
  fs: (portrait: number, landscape: number) => number;
  isPortrait: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
  formatPrice: (v: string | number) => string;
}

export default function KioskItemPage({
  item, qty, onQtyChange, selectedOptions, onToggleOption,
  selectedVariant, onSelectVariant, canConfirm, confirmLabel, totalPrice,
  onConfirm, onBack, fs, isPortrait, t, formatPrice,
}: Props) {
  const img = item.image_url ? resolveAssetUrl(item.image_url) : null;

  const imageBlock = (
    <div style={{
      flex: isPortrait ? "0 0 38%" : "0 0 46%",
      background: "var(--loka-cream, #f5f2ea)",
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden", minHeight: 0,
    }}>
      {img ? (
        // contain — never crop the item photo
        <img src={img} alt={item.item_name} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      ) : null}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: isPortrait ? "column" : "row", height: "100%", background: "white" }}>
      {imageBlock}

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", padding: fs(16, 14), borderBottom: "2px solid #eee", gap: 12 }}>
          <button onClick={onBack} style={{
            display: "flex", alignItems: "center", gap: 8, padding: "12px 20px",
            fontSize: fs(20, 17), fontWeight: 600, background: "white",
            border: "2px solid #ddd", borderRadius: 10, cursor: "pointer", minHeight: 48,
          }}>
            <ArrowLeft size={fs(22, 18)} /> {t("kiosk.back_to_menu")}
          </button>
        </div>

        {/* scrollable content */}
        <div style={{ flex: 1, overflowY: "auto", padding: fs(24, 20) }}>
          <h1 style={{ fontSize: fs(36, 30), fontWeight: 800, margin: 0 }}>{item.item_name}</h1>
          {item.description ? (
            <p style={{ fontSize: fs(20, 16), color: "#777", margin: "8px 0 0" }}>{item.description}</p>
          ) : null}
          <div style={{ fontSize: fs(30, 26), fontWeight: 800, color: LOKA.primary, margin: "12px 0 20px" }}>
            {formatPrice(item.base_price)}
          </div>

          {(item.variants?.length ?? 0) > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: fs(22, 18), fontWeight: 700, marginBottom: 10 }}>{t("kiosk.choose_variant")}</div>
              {item.variants!.map(v => (
                <button key={v.id} onClick={() => onSelectVariant(v.id)} style={{
                  display: "flex", justifyContent: "space-between", width: "100%",
                  padding: "16px 20px", marginBottom: 10, borderRadius: 12, cursor: "pointer",
                  fontSize: fs(20, 17), minHeight: 56,
                  border: selectedVariant === v.id ? `2px solid ${LOKA.primary}` : "2px solid #eee",
                  background: selectedVariant === v.id ? "rgba(59,74,26,0.06)" : "white",
                }}>
                  <span>{v.variant_name}</span>
                  <span style={{ color: "#666" }}>{v.price_adjustment > 0 ? `+${formatPrice(v.price_adjustment)}` : t("cart.free")}</span>
                </button>
              ))}
            </div>
          )}

          {item.modifier_groups?.map(group => (
            <div key={group.id} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: fs(22, 18), fontWeight: 700, marginBottom: 10 }}>
                {group.group_name}
                {group.min_selections > 0 && <span style={{ color: "var(--color-danger)", marginLeft: 4 }}>*</span>}
                <span style={{ fontSize: fs(16, 14), color: "#999", marginLeft: 10, fontWeight: 500 }}>
                  {group.selection_type === "single" ? t("kiosk.choose_one") : t("kiosk.choose_up_to", { n: group.max_selections })}
                </span>
              </div>
              {group.options.map(opt => {
                const isSelected = (selectedOptions[group.id] || []).includes(opt.id);
                return (
                  <button key={opt.id}
                    onClick={() => onToggleOption(group.id, opt.id, group.selection_type, group.max_selections)}
                    style={{
                      display: "flex", justifyContent: "space-between", width: "100%",
                      padding: "16px 20px", marginBottom: 10, borderRadius: 12, cursor: "pointer",
                      fontSize: fs(20, 17), minHeight: 56,
                      border: isSelected ? `2px solid ${LOKA.primary}` : "2px solid #eee",
                      background: isSelected ? "rgba(59,74,26,0.06)" : "white",
                    }}>
                    <span>{opt.option_name}</span>
                    <span style={{ color: "#666" }}>{opt.price_adjustment > 0 ? `+${formatPrice(opt.price_adjustment)}` : t("cart.free")}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* footer: qty + add */}
        <div style={{
          display: "flex", alignItems: "center", gap: 16, padding: fs(18, 14),
          borderTop: "2px solid #eee", background: "white",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button onClick={() => onQtyChange(-1)} disabled={qty <= 1} style={{
              width: fs(56, 48), height: fs(56, 48), borderRadius: 12, border: "2px solid #ddd",
              background: "white", cursor: qty > 1 ? "pointer" : "not-allowed", opacity: qty > 1 ? 1 : 0.4,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}><Minus size={fs(24, 20)} /></button>
            <span style={{ fontSize: fs(30, 26), fontWeight: 800, minWidth: 44, textAlign: "center" }}>{qty}</span>
            <button onClick={() => onQtyChange(1)} style={{
              width: fs(56, 48), height: fs(56, 48), borderRadius: 12, border: "2px solid #ddd",
              background: "white", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}><Plus size={fs(24, 20)} /></button>
          </div>
          <button onClick={onConfirm} disabled={!canConfirm} style={{
            flex: 1, padding: "16px", fontSize: fs(22, 19), fontWeight: 700, minHeight: 56,
            background: LOKA.primary, color: "white", border: "none", borderRadius: 12,
            cursor: canConfirm ? "pointer" : "not-allowed", opacity: canConfirm ? 1 : 0.5,
          }}>
            {canConfirm ? `${confirmLabel} · ${totalPrice}` : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
