"use client";

// Full-screen kiosk bundle picker — McD/KFC-style combo builder, no modals.
// Handles all three mechanics:
//   combo        — fixed set, just confirm (qty per set)
//   pick_x       — choose N from one pool (allow_duplicates → qty per pick)
//   multi_course — several groups, each with its own min/max picks
import { useMemo, useState } from "react";
import { ArrowLeft, Check, Minus, Plus } from "lucide-react";
import { resolveAssetUrl, LOKA } from "@/lib/tokens";

export interface KioskBundleComponent {
  id: number; // BundleProductComponent.id → cart line bundle_component_id
  menu_item_id: number;
  menu_item_name: string;
  menu_item_price: string | number;
  menu_item_image_url?: string | null;
  default_quantity?: number;
  bundle_group_id?: number | null;
}

export interface KioskBundleGroup {
  id: number;
  group_label: string;
  pick_count?: number | null;
  min_pick?: number | null;
  max_pick?: number | null;
  sort_order: number;
  components: KioskBundleComponent[];
}

export interface KioskBundle {
  id: number;
  title: string;
  description?: string | null;
  bundle_type: string;
  bundle_price: string | number;
  image_url?: string | null;
  pick_count?: number | null;
  allow_duplicates?: boolean | null;
  max_per_order?: number | null;
  bundle_category_id?: number | null;
  components: KioskBundleComponent[];
  groups: KioskBundleGroup[];
}

interface Selection {
  // groupId (or -1 for the single pick_x pool) → componentId → qty
  [groupId: number]: Record<number, number>;
}

interface Props {
  bundle: KioskBundle;
  onBack: () => void;
  onConfirm: (bundle: KioskBundle, picked: { component: KioskBundleComponent; qty: number }[], setQty: number) => void;
  fs: (portrait: number, landscape: number) => number;
  isPortrait: boolean;
  t: (key: string, vars?: Record<string, string | number>) => string;
  formatPrice: (v: string | number) => string;
}

export default function KioskBundlePage({ bundle, onBack, onConfirm, fs, isPortrait, t, formatPrice }: Props) {
  const isMultiCourse = (bundle.groups?.length ?? 0) > 0;
  const isPickX = !isMultiCourse && (bundle.pick_count ?? 0) > 0;
  const allowDuplicates = bundle.allow_duplicates ?? false;
  const [selection, setSelection] = useState<Selection>({});
  const [setQty, setSetQty] = useState(1);

  const groupOf = (gid: number) => selection[gid] || {};
  const groupTotal = (gid: number) => Object.values(groupOf(gid)).reduce((s, q) => s + q, 0);

  const inc = (gid: number, cid: number, maxPerComp: number) => {
    setSelection(prev => {
      const g = { ...(prev[gid] || {}) };
      const total = Object.values(g).reduce((s, q) => s + q, 0);
      const cap = isPickX ? (bundle.pick_count ?? 0) : maxPerComp;
      if (!allowDuplicates) {
        if (g[cid]) return prev;
        if (total >= cap) return prev;
        g[cid] = 1;
      } else {
        if (total >= cap) return prev;
        g[cid] = Math.min((g[cid] || 0) + 1, 99);
      }
      return { ...prev, [gid]: g };
    });
  };
  const dec = (gid: number, cid: number) => {
    setSelection(prev => {
      const g = { ...(prev[gid] || {}) };
      if (!g[cid]) return prev;
      g[cid] -= 1;
      if (g[cid] <= 0) delete g[cid];
      return { ...prev, [gid]: g };
    });
  };

  // ── Constraints ──
  const groupsOk = useMemo(() => {
    if (isMultiCourse) {
      return bundle.groups.every(g => {
        const total = groupTotal(g.id);
        const min = g.min_pick ?? g.pick_count ?? 1;
        const max = g.max_pick ?? g.pick_count ?? min;
        return total >= min && total <= max;
      });
    }
    if (isPickX) return groupTotal(-1) === (bundle.pick_count ?? 0);
    return true; // combo — nothing to pick
  }, [selection, bundle, isMultiCourse, isPickX]); // eslint-disable-line react-hooks/exhaustive-deps

  const picked = useMemo(() => {
    const out: { component: KioskBundleComponent; qty: number }[] = [];
    if (isMultiCourse) {
      for (const g of bundle.groups) {
        for (const [cid, qty] of Object.entries(groupOf(g.id))) {
          const comp = g.components.find(c => c.id === Number(cid));
          if (comp) out.push({ component: comp, qty });
        }
      }
    } else if (isPickX) {
      for (const [cid, qty] of Object.entries(groupOf(-1))) {
        const comp = bundle.components.find(c => c.id === Number(cid));
        if (comp) out.push({ component: comp, qty });
      }
    } else {
      for (const comp of bundle.components) out.push({ component: comp, qty: comp.default_quantity || 1 });
    }
    return out;
  }, [selection, bundle, isMultiCourse, isPickX]); // eslint-disable-line react-hooks/exhaustive-deps

  const img = bundle.image_url ? resolveAssetUrl(bundle.image_url) : null;
  const bundlePrice = formatPrice(String(Number(bundle.bundle_price) * setQty));

  const ComponentCard = ({ gid, comp, cap }: { gid: number; comp: KioskBundleComponent; cap: number }) => {
    const qty = groupOf(gid)[comp.id] || 0;
    const total = groupTotal(gid);
    const capped = allowDuplicates ? total >= cap : total >= cap && qty === 0;
    const cImg = comp.menu_item_image_url ? resolveAssetUrl(comp.menu_item_image_url) : null;
    return (
      <div style={{
        display: "flex", alignItems: "center", gap: 14, padding: fs(14, 12),
        borderRadius: 14, marginBottom: 10,
        border: qty > 0 ? `2px solid ${LOKA.primary}` : "2px solid #eee",
        background: qty > 0 ? "rgba(59,74,26,0.05)" : "white",
        opacity: capped && qty === 0 ? 0.5 : 1,
      }}>
        {cImg ? <img src={cImg} alt="" style={{ width: fs(64, 52), height: fs(64, 52), borderRadius: 10, objectFit: "contain", background: "var(--loka-cream, #f5f2ea)" }} /> : null}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: fs(20, 17), fontWeight: 600 }}>{comp.menu_item_name}</div>
          <div style={{ fontSize: fs(16, 14), color: "#777" }}>
            {Number(comp.menu_item_price) > 0 ? formatPrice(comp.menu_item_price) : t("cart.free")}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {qty > 0 && (
            <button onClick={() => dec(gid, comp.id)} style={qtyBtn(fs)} aria-label="remove">
              {allowDuplicates ? <Minus size={fs(20, 18)} /> : <Check size={fs(20, 18)} />}
            </button>
          )}
          {qty > 0 && <span style={{ fontSize: fs(24, 20), fontWeight: 800, minWidth: 28, textAlign: "center" }}>{qty}</span>}
          <button onClick={() => inc(gid, comp.id, cap)} disabled={capped && qty === 0} style={{ ...qtyBtn(fs), background: LOKA.primary, color: "white", border: "none" }} aria-label="add">
            <Plus size={fs(20, 18)} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: isPortrait ? "column" : "row", height: "100%", background: "white" }}>
      <div style={{
        flex: isPortrait ? "0 0 34%" : "0 0 40%",
        background: "var(--loka-cream, #f5f2ea)",
        display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", minHeight: 0,
      }}>
        {img ? <img src={img} alt={bundle.title} style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : null}
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div style={{ display: "flex", alignItems: "center", padding: fs(16, 14), borderBottom: "2px solid #eee", gap: 12 }}>
          <button onClick={onBack} style={backBtn(fs)}>
            <ArrowLeft size={fs(22, 18)} /> {t("kiosk.back_to_menu")}
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: fs(24, 18) }}>
          <h1 style={{ fontSize: fs(34, 28), fontWeight: 800, margin: 0 }}>{bundle.title}</h1>
          {bundle.description ? <p style={{ fontSize: fs(19, 15), color: "#777", margin: "6px 0 0" }}>{bundle.description}</p> : null}
          <div style={{ fontSize: fs(28, 24), fontWeight: 800, color: LOKA.primary, margin: "10px 0 18px" }}>
            {formatPrice(bundle.bundle_price)}
            <span style={{ fontSize: fs(16, 14), color: "#888", fontWeight: 500, marginLeft: 10 }}>
              {isMultiCourse ? t("kiosk.bundle_multi_hint") : isPickX ? t("kiosk.bundle_pick_hint", { n: bundle.pick_count ?? 0 }) : t("kiosk.bundle_fixed_hint")}
            </span>
          </div>

          {!isMultiCourse && !isPickX && (
            <div>
              {bundle.components.map(comp => (
                <div key={comp.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: fs(14, 12), borderRadius: 14, marginBottom: 10, border: "2px solid #eee" }}>
                  {comp.menu_item_image_url ? <img src={resolveAssetUrl(comp.menu_item_image_url) || ""} alt="" style={{ width: fs(64, 52), height: fs(64, 52), borderRadius: 10, objectFit: "contain", background: "var(--loka-cream, #f5f2ea)" }} /> : null}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: fs(20, 17), fontWeight: 600 }}>{comp.menu_item_name}</div>
                  </div>
                  <div style={{ fontSize: fs(18, 15), color: LOKA.primary, fontWeight: 700 }}>× {comp.default_quantity || 1}</div>
                </div>
              ))}
            </div>
          )}

          {isPickX && (
            <div>
              {bundle.components.map(comp => (
                <ComponentCard key={comp.id} gid={-1} comp={comp} cap={bundle.pick_count ?? 0} />
              ))}
            </div>
          )}

          {isMultiCourse && bundle.groups.map(g => {
            const total = groupTotal(g.id);
            const min = g.min_pick ?? g.pick_count ?? 1;
            const max = g.max_pick ?? g.pick_count ?? min;
            return (
              <div key={g.id} style={{ marginBottom: 24 }}>
                <div style={{ fontSize: fs(22, 18), fontWeight: 700, marginBottom: 10 }}>
                  {g.group_label}
                  <span style={{ fontSize: fs(16, 14), color: total >= min && total <= max ? "var(--color-success)" : "#999", marginLeft: 10, fontWeight: 600 }}>
                    {total}/{max === min ? min : `${min}–${max}`}
                  </span>
                </div>
                {g.components.map(comp => (
                  <ComponentCard key={comp.id} gid={g.id} comp={comp} cap={max} />
                ))}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: fs(18, 14), borderTop: "2px solid #eee", background: "white" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button onClick={() => setSetQty(q => Math.max(1, q - 1))} disabled={setQty <= 1} style={{ ...qtyBtn(fs), opacity: setQty > 1 ? 1 : 0.4 }}><Minus size={fs(22, 18)} /></button>
            <span style={{ fontSize: fs(28, 24), fontWeight: 800, minWidth: 40, textAlign: "center" }}>{setQty}</span>
            <button onClick={() => setSetQty(q => Math.min(q + 1, bundle.max_per_order || 10))} style={qtyBtn(fs)}><Plus size={fs(22, 18)} /></button>
          </div>
          <button onClick={() => groupsOk && onConfirm(bundle, picked, setQty)} disabled={!groupsOk} style={{
            flex: 1, padding: "16px", fontSize: fs(22, 19), fontWeight: 700, minHeight: 56,
            background: LOKA.primary, color: "white", border: "none", borderRadius: 12,
            cursor: groupsOk ? "pointer" : "not-allowed", opacity: groupsOk ? 1 : 0.5,
          }}>
            {groupsOk ? `${t("kiosk.add_to_cart")} · ${bundlePrice}` : isMultiCourse || isPickX ? t("kiosk.select_required") : t("kiosk.add_to_cart")}
          </button>
        </div>
      </div>
    </div>
  );
}

const qtyBtn = (fs: (p: number, l: number) => number): React.CSSProperties => ({
  width: fs(52, 44), height: fs(52, 44), borderRadius: 12, border: "2px solid #ddd",
  background: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
});

const backBtn = (fs: (p: number, l: number) => number): React.CSSProperties => ({
  display: "flex", alignItems: "center", gap: 8, padding: "12px 20px",
  fontSize: fs(20, 17), fontWeight: 600, background: "white",
  border: "2px solid #ddd", borderRadius: 10, cursor: "pointer", minHeight: 48,
});
