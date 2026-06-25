"use client";

import { useCallback, useRef, useEffect, useState } from "react";
import {
  Search, QrCode, Plus, Minus, Trash2,
  Pause, Wallet, User, Send, ImageOff, LayoutGrid
} from "lucide-react";
import Alert from "@/components/Alert";
import SkeletonCard from "@/components/SkeletonCard";
import EmptyState from "@/components/EmptyState";
import PosSuccessScreen from "@/components/pos/PosSuccessScreen";
import PosCheckoutPanel from "@/components/pos/PosCheckoutPanel";
import PosModifierDrawer from "@/components/pos/PosModifierDrawer";
import PosQrScannerModal from "@/components/pos/PosQrScannerModal";
import PosHeldOrdersDrawer from "@/components/pos/PosHeldOrdersDrawer";
import PosUnpaidOrdersDrawer from "@/components/pos/PosUnpaidOrdersDrawer";
import BundlePickerModal from "@/components/pos/BundlePickerModal";
import { usePosState } from "@/components/pos/usePosState";

export default function PosPage() {
  const pos = usePosState();
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [brokenImages, setBrokenImages] = useState<Set<number>>(new Set());

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  const handleToggleModifier = useCallback((groupId: number, modId: number, selectionType: string, maxSelections: number) => {
    pos.setSelectedModifiers((prev) => {
      const current = prev[groupId] || [];
      if (selectionType === "multiple" || maxSelections > 1) {
        return { ...prev, [groupId]: current.includes(modId) ? current.filter((id) => id !== modId) : [...current, modId] };
      }
      return { ...prev, [groupId]: [modId] };
    });
  }, [pos]);

  // ── Success Screen ──
  if (pos.state === "done" && pos.result) {
    return (
      <PosSuccessScreen
        mode={pos.mode}
        result={pos.result as { order_number?: string | number; order_id?: string | number; total?: number }}
        total={pos.total}
        change={pos.successChange}
        paymentMethod={pos.paymentMethod}
        onNewOrder={pos.newOrder}
      />
    );
  }

  // ── Checkout Mode ──
  if (pos.mode === "checkout" && pos.checkoutOrder) {
    return (
      <PosCheckoutPanel
        order={pos.checkoutOrder}
        orderId={pos.checkoutOrderId}
        customer={pos.checkoutCustomer}
        walletData={pos.checkoutWalletData}
        paymentMethod={pos.paymentMethod}
        amountTendered={pos.amountTendered}
        discountAmount={pos.discountAmount}
        discountType={pos.discountType}
        tipAmount={pos.tipAmount}
        saving={pos.saving}
        applyingDiscount={pos.applyingDiscount}
        discountsApplied={pos.checkoutDiscountsApplied}
        error={pos.error}
        msg={pos.msg}
        showDiscounts={pos.showCheckoutDiscounts}
        onSetPaymentMethod={pos.setPaymentMethod}
        onSetAmountTendered={pos.setAmountTendered}
        onSetDiscountAmount={pos.setDiscountAmount}
        onSetDiscountType={pos.setDiscountType}
        onSetTipAmount={pos.setTipAmount}
        onSetShowDiscounts={pos.setShowCheckoutDiscounts}
        onSetCustomer={pos.setCheckoutCustomer}
        onSetWalletData={pos.setCheckoutWalletData}
        onSetError={pos.setError}
        onSetMsg={pos.setMsg}
        onScanCustomer={() => { pos.setQrScanMode("customer"); pos.startScanner(); }}
        onApplyVoucher={pos.handleApplyCheckoutVoucher}
        onApplyReward={pos.handleApplyCheckoutReward}
        onWalletPayment={pos.handleCheckoutWalletPayment}
        onCheckout={pos.handleCheckout}
      />
    );
  }

  // ── New Order Mode ──
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 48px)" }}>
      {/* Header */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--color-border-light)", background: "var(--color-bg-card)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 6 }}>
            {(["dine_in", "takeaway", "delivery"] as const).map((t) => (
              <button
                key={t}
                className={`btn btn-sm ${pos.orderType === t ? "btn-primary" : "btn-ghost"}`}
                onClick={() => pos.setOrderType(t)}
              >
                {t === "dine_in" ? "Dine-in" : t === "takeaway" ? "Takeaway" : "Delivery"}
              </button>
            ))}
          </div>
          {pos.selectedCustomer && (
            <span className="badge badge-primary badge-sm flex items-center gap-1">
              <User size={10} /> {pos.selectedCustomer.display_name}
            </span>
          )}
          {pos.tableId && (
            <span className="badge badge-sm" style={{ background: "var(--color-accent-gold)", color: "#1E1B18" }}>
              Table {pos.tables.find((t) => t.id === pos.tableId)?.table_number || pos.tableId}
            </span>
          )}
          <div style={{ flex: 1 }} />
          {pos.cart.length > 0 && (
            <span style={{ fontSize: 15, fontWeight: 700 }}>RM {pos.total.toFixed(2)}</span>
          )}
        </div>

        {/* Customer Search */}
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <div style={{ flex: 1, position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", opacity: 0.4 }} />
            <input
              className="form-input"
              style={{ paddingLeft: 34 }}
              value={pos.searchQ}
              onChange={(e) => { pos.setSearchQ(e.target.value); pos.searchCustomersDebounced(e.target.value); }}
              placeholder="Search customer..."
            />
          </div>
          <button className="btn btn-ghost" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, padding: "8px 12px" }} onClick={() => { pos.setQrScanMode("table"); pos.startScanner(); }} aria-label="Scan table QR">
            <QrCode size={22} /> Scan Table
          </button>
          <button className="btn btn-ghost" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, padding: "8px 12px" }} onClick={() => { pos.setQrScanMode("customer"); pos.startScanner(); }} aria-label="Scan customer QR">
            <User size={22} /> Scan Customer
          </button>
          <button className="btn btn-ghost" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, padding: "6px 10px" }} onClick={() => { pos.fetchUnpaidOrders(); pos.setShowUnpaid(true); }} aria-label="View unpaid orders">
            <Wallet size={16} /> Unpaid{pos.unpaidOrders.length > 0 ? ` (${pos.unpaidOrders.length})` : ""}
          </button>
          <button className="btn btn-ghost" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, padding: "6px 10px" }} onClick={() => pos.setShowHeld(true)} aria-label="View parked orders">
            <Pause size={16} /> Park Order
          </button>
        </div>
        {pos.searchResults.length > 0 && (
          <div style={{ background: "white", borderRadius: 8, marginTop: 4, boxShadow: "0 2px 8px rgba(0,0,0,0.1)", overflow: "hidden", position: "absolute", zIndex: 50, left: 16, right: 16, maxWidth: 400 }}>
            <button onClick={() => { pos.setSelectedCustomer(null); pos.setSearchQ(""); pos.setSearchResults([]); pos.setCustomerWallet(null); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", border: "none", borderBottom: "1px solid #eee", background: "white", cursor: "pointer", fontSize: 13, opacity: 0.6 }}>Walk-in (No Customer)</button>
            {pos.searchResults.map((c) => (
              <button key={c.id} onClick={() => pos.handleCustomerSelect(c)} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", border: "none", borderBottom: "1px solid #eee", background: "white", cursor: "pointer", fontSize: 13 }}>
                {c.display_name} · {c.phone_number}
              </button>
            ))}
          </div>
        )}

        {/* Table Picker */}
        {pos.orderType === "dine_in" && (
          <div style={{ display: "flex", gap: 6, marginBottom: 8, overflowX: "auto" }}>
            <button className={`btn btn-sm ${pos.tableId === null ? "btn-primary" : "btn-ghost"}`} onClick={() => pos.setTableId(null)}>No Table</button>
            {pos.tables.filter((t) => t.current_status === "available" || t.id === pos.tableId).map((t) => (
              <button key={t.id} className={`btn btn-sm ${pos.tableId === t.id ? "btn-primary" : "btn-ghost"}`} onClick={() => pos.setTableId(t.id)}>
                {t.table_number}
              </button>
            ))}
          </div>
        )}

        {/* Category Tabs */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
          <button className={`btn btn-sm ${pos.activeCat === null && !pos.menuSearch ? "btn-primary" : "btn-ghost"}`} onClick={() => { pos.setActiveCat(null); pos.setMenuSearch(""); }}>
            All ({pos.items.length})
          </button>
          {pos.categories.map((c) => {
            const count = pos.items.filter((i) => i.category_id === c.id).length;
            return (
              <button key={c.id} className={`btn btn-sm ${pos.activeCat === c.id ? "btn-primary" : "btn-ghost"}`} onClick={() => { pos.setActiveCat(c.id); pos.setMenuSearch(""); }}>
                {c.category_name} ({count})
              </button>
            );
          })}
        </div>
      </div>

      {/* Menu Search Bar */}
      <div style={{ padding: "4px 16px", display: "flex", gap: 6 }}>
        <Search size={14} style={{ opacity: 0.4, marginTop: 10 }} />
        <input
          className="form-input"
          style={{ flex: 1, fontSize: 13 }}
          value={pos.menuSearchInput}
          onChange={(e) => {
            const val = e.target.value;
            pos.setMenuSearchInput(val);
            if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
            searchTimerRef.current = setTimeout(() => pos.setMenuSearch(val), 300);
          }}
          placeholder="Search menu items..."
        />
        {pos.menuSearchInput && (
          <button className="btn btn-sm btn-ghost" onClick={() => { pos.setMenuSearchInput(""); pos.setMenuSearch(""); if (searchTimerRef.current) clearTimeout(searchTimerRef.current); }}>Clear</button>
        )}
      </div>

      {pos.error && <Alert variant="error" onDismiss={() => pos.setError("")}>{pos.error}</Alert>}
      {pos.msg && <Alert variant="success" onDismiss={() => pos.setMsg("")} autoDismiss={3000}>{pos.msg}</Alert>}

      {/* Menu Items */}
      <div style={{ flex: 1, overflow: "auto", padding: "12px 16px", paddingBottom: pos.cart.length > 0 ? 300 : 16 }}>
        {pos.loading ? (
          <SkeletonCard count={6} />
        ) : (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
            {/* Bundle products shown inline in the grid, like regular menu items */}
            {pos.bundleProducts
              .filter(bp => pos.activeCat === null || bp.category_id === pos.activeCat)
              .map(bp => (
                <button
                  key={`bp-${bp.id}`}
                  onClick={() => pos.addBundleToCart(bp)}
                  className="card"
                  style={{
                    padding: 0, textAlign: "left", cursor: "pointer",
                    border: "1px solid var(--color-border-light)",
                    transition: "all 0.15s", overflow: "hidden",
                    display: "flex", flexDirection: "column",
                  }}
                >
                  <div style={{ width: "100%", height: 120, background: "var(--color-bg-muted)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {bp.image_url
                      ? <img src={bp.image_url} alt={bp.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
                      : <LayoutGrid size={32} style={{ opacity: 0.25 }} />
                    }
                    <span style={{ position: "absolute", bottom: 6, right: 6, fontSize: 9, fontWeight: 700, color: "var(--color-success)", background: "var(--color-success-light)", padding: "2px 8px", borderRadius: 20 }}>
                      {bp.pick_count && bp.pick_count > 0 ? `Pick ${bp.pick_count}` : 'COMBO'}
                    </span>
                  </div>
                  <div style={{ padding: "8px 10px" }}>
                    <div style={{ fontWeight: 700, fontSize: 13, lineHeight: 1.3 }}>{bp.title}</div>
                    <div style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>
                      {bp.pick_count && bp.pick_count > 0
                        ? `Pick ${bp.pick_count} items`
                        : `${(bp.components || []).map(c => c.menu_item_name || 'Item').slice(0, 3).join(" + ")}${(bp.components || []).length > 3 ? ` +${(bp.components || []).length - 3} more` : ""}`
                      }
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "var(--color-primary)", marginTop: 4 }}>RM {Number(bp.bundle_price ?? 0).toFixed(2)}</div>
                  </div>
                </button>
              ))}
            {pos.filteredItems.map((item) => (
              <button
                key={item.id}
                onClick={() => pos.handleItemClick(item)}
                className="card"
                style={{
                  padding: 0,
                  textAlign: "left",
                  cursor: "pointer",
                  border: "1px solid var(--color-border-light)",
                  transition: "all 0.15s",
                  overflow: "hidden",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div style={{
                  width: "100%",
                  height: 120,
                  background: item.image_url ? "transparent" : "var(--color-bg-muted)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                }}>
                  {item.image_url && /^(https?:|\/|data:image)/i.test(item.image_url) && !brokenImages.has(item.id) ? (
                    <img
                      src={item.image_url}
                      alt={item.item_name}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      loading="lazy"
                      onError={() => { setBrokenImages((prev) => new Set(prev).add(item.id)); }}
                    />
                  ) : (
                    <ImageOff size={32} style={{ opacity: 0.25 }} />
                  )}
                  {item.modifier_groups && item.modifier_groups.length > 0 && (
                    <span className="badge badge-sm badge-outline" style={{
                      position: "absolute",
                      bottom: 6,
                      right: 6,
                      background: "rgba(255,255,255,0.9)",
                      backdropFilter: "blur(4px)",
                    }}>
                      Custom
                    </span>
                  )}
                  {item.is_addon_deal_eligible && (
                    <span style={{
                      position: "absolute",
                      bottom: 6,
                      left: 6,
                      background: "var(--color-primary)",
                      color: "#fff",
                      fontSize: 9,
                      fontWeight: 700,
                      padding: "2px 6px",
                      borderRadius: 4,
                    }}>
                      {item.addon_discount_value ? (item.addon_discount_type === 'percentage' ? `-${item.addon_discount_value}%` : `-RM${item.addon_discount_value}`) : ""} ADD-ON
                    </span>
                  )}
                </div>
                <div style={{ padding: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, display: "block", marginBottom: 4, lineHeight: 1.3 }}>{item.item_name}</span>
                  <span style={{ fontSize: 14, color: "var(--color-primary)", fontWeight: 700 }}>RM {Number(item.base_price ?? 0).toFixed(2)}</span>
                </div>
              </button>
            ))}
            {pos.filteredItems.length === 0 && (
              <div style={{ gridColumn: "1/-1" }}>
                <EmptyState icon={<Search size={48} />} title="No items found" description="Try changing the category or search term" />
              </div>
            )}
          </div>
          </div>
        )}
      </div>

      {/* Add-on Deal Suggestions (when a bundle is in cart) */}
      {pos.cart.length > 0 && pos.bundleProducts.length > 0 && (() => {
        const cartBundleIds = new Set(pos.cart.filter((c) => c.bundle_product_id).map((c) => c.bundle_product_id!));
        if (cartBundleIds.size === 0) return null;
        const addonSuggestions = pos.filteredItems.filter((item) =>
          item.is_addon_deal_eligible &&
          item.addon_discount_value &&
          item.eligible_bundle_ids?.some((bid) => cartBundleIds.has(bid))
        );
        if (addonSuggestions.length === 0) return null;
        return (
          <div style={{ background: "var(--color-bg-muted)", borderTop: "1px solid var(--color-border-light)", padding: "8px 16px", flexShrink: 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--color-text-muted)", marginBottom: 6 }}>ADD-ON DEALS</div>
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4 }}>
              {addonSuggestions.slice(0, 8).map((item) => (
                <button
                  key={item.id}
                  onClick={() => pos.handleItemClick(item)}
                  style={{ minWidth: 120, maxWidth: 140, background: "var(--color-bg-card)", border: "1px solid var(--color-border-light)", borderRadius: 8, padding: 8, cursor: "pointer", textAlign: "left", flexShrink: 0 }}
                >
                  <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.25, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.item_name}</div>
                  <div style={{ display: "flex", gap: 4, alignItems: "baseline" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-primary)" }}>
                      RM {(item.addon_discount_type === "percentage"
                        ? item.base_price * (1 - (item.addon_discount_value ?? 0) / 100)
                        : Math.max(0, item.base_price - (item.addon_discount_value ?? 0))
                      ).toFixed(2)}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--color-text-muted)", textDecoration: "line-through" }}>RM {Number(item.base_price).toFixed(2)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Cart Panel */}
      {pos.cart.length > 0 && (
        <div style={{ position: "sticky", bottom: 0, background: "var(--color-bg-card)", borderTop: "2px solid var(--color-border-light)", padding: "12px 16px", flexShrink: 0, boxShadow: "0 -4px 12px rgba(0,0,0,0.08)" }}>
          <input
            className="form-input"
            style={{ marginBottom: 10, fontSize: 13 }}
            placeholder="Order notes (e.g., Extra spicy, Allergies...)"
            value={pos.orderNotes}
            onChange={(e) => pos.setOrderNotes(e.target.value)}
          />

          {/* Group cart items: standalone first, then bundle groups */}
          {(() => {
            const standalone = pos.cart.filter((c) => !c.bundle_product_id);
            const bundleGroups = new Map<number, typeof pos.cart>();
            for (const c of pos.cart) {
              if (c.bundle_product_id) {
                const arr = bundleGroups.get(c.bundle_product_id) || [];
                arr.push(c);
                bundleGroups.set(c.bundle_product_id, arr);
              }
            }
            const renderCartItem = (c: typeof pos.cart[number], indent = false) => (
              <div key={`${c.menu_item_id}-${(c.modifier_ids ?? []).join(',')}-${c.bundle_product_id ?? ''}-${c.bundle_component_id ?? ''}`} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, padding: "6px 0", borderBottom: "1px solid var(--color-border-light)", paddingLeft: indent ? 16 : 0 }}>
                <span style={{ flex: 1, fontSize: 14 }}>
                  <span style={{ fontWeight: 600 }}>{c.name}</span>
                  {c.modifiers_label && <span style={{ fontSize: 12, color: "var(--color-text-muted)", display: "block", marginTop: 2 }}>{c.modifiers_label}</span>}
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <button className="btn btn-ghost btn-icon" style={{ width: 36, height: 36 }} onClick={() => pos.updateQty(c.menu_item_id, c.modifier_ids, -1, c.bundle_product_id ?? undefined, c.bundle_component_id ?? undefined)} aria-label="Decrease quantity"><Minus size={16} /></button>
                  <span style={{ minWidth: 28, textAlign: "center", fontSize: 16, fontWeight: 700 }}>{c.qty}</span>
                  <button className="btn btn-ghost btn-icon" style={{ width: 36, height: 36 }} onClick={() => pos.updateQty(c.menu_item_id, c.modifier_ids, 1, c.bundle_product_id ?? undefined, c.bundle_component_id ?? undefined)} aria-label="Increase quantity"><Plus size={16} /></button>
                </div>
                <span style={{ minWidth: 70, textAlign: "right", fontSize: 14, fontWeight: 700 }}>RM {((c.price ?? 0) * c.qty).toFixed(2)}</span>
                <button className="btn btn-ghost btn-icon btn-sm" style={{ color: "var(--color-error)", width: 32, height: 32 }} onClick={() => pos.removeFromCart(c.menu_item_id, c.modifier_ids, c.bundle_product_id ?? undefined, c.bundle_component_id ?? undefined)} aria-label="Remove item"><Trash2 size={16} /></button>
              </div>
            );
            return (
              <>
                {standalone.map((c) => renderCartItem(c, false))}
                {Array.from(bundleGroups.entries()).map(([bpId, items]) => {
                  const bp = pos.bundleProducts.find((b) => b.id === bpId);
                  return (
                    <div key={`bundle-${bpId}`} style={{ marginBottom: 8, background: "var(--color-bg-muted)", borderRadius: 8, padding: "8px 10px", border: "1px solid var(--color-border-light)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--color-primary)" }}>{bp?.title || `Combo #${bpId}`}</span>
                        <button className="btn btn-ghost btn-icon btn-sm" style={{ color: "var(--color-error)", width: 28, height: 28 }} onClick={() => items.forEach((c) => pos.removeFromCart(c.menu_item_id, c.modifier_ids, c.bundle_product_id ?? undefined, c.bundle_component_id ?? undefined))} aria-label="Remove combo"><Trash2 size={14} /></button>
                      </div>
                      {items.map((c) => renderCartItem(c, true))}
                      <div style={{ textAlign: "right", fontSize: 12, color: "var(--color-text-muted)", marginTop: 2 }}>
                        Combo price: <span style={{ fontWeight: 700, color: "var(--color-primary)" }}>RM {(bp?.bundle_price ?? 0).toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })}
              </>
            );
          })()}
          {/* Discount breakdown */}
          {(pos.discountValue > 0 || pos.bundleDiscountPreview.total > 0) && (
            <div style={{ marginTop: 4, marginBottom: 4, fontSize: 12, color: "var(--color-text-muted)" }}>
              {pos.discountValue > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>Voucher/Reward discount</span><span>-RM {pos.discountValue.toFixed(2)}</span></div>}
              {pos.bundleDiscountPreview.bundleDiscount > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>Combo discount</span><span>-RM {pos.bundleDiscountPreview.bundleDiscount.toFixed(2)}</span></div>}
              {pos.bundleDiscountPreview.addonDiscount > 0 && <div style={{ display: "flex", justifyContent: "space-between" }}><span>Add-on discount</span><span>-RM {pos.bundleDiscountPreview.addonDiscount.toFixed(2)}</span></div>}
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--color-border-light)" }}>
            <div>
              <span style={{ fontSize: 18, fontWeight: 700 }}>RM {pos.total.toFixed(2)}</span>
              <span style={{ fontSize: 12, color: "var(--color-text-muted)", marginLeft: 8 }}>{pos.cart.reduce((s, c) => s + c.qty, 0)} items</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={pos.holdOrder}><Pause size={14} /> Park</button>
              <button className="btn btn-primary" onClick={pos.handleSendToKitchen} disabled={pos.saving}>
                <Send size={16} /> {pos.saving ? "Sending..." : "Send to Kitchen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modifier Drawer */}
      <PosModifierDrawer
        item={pos.modifierItem}
        selectedModifiers={pos.selectedModifiers}
        qty={pos.modifierQty}
        onToggleModifier={handleToggleModifier}
        onQtyChange={(delta) => pos.setModifierQty((q) => Math.max(1, q + delta))}
        onAdd={pos.applyModifiers}
        onCancel={() => { pos.setModifierItem(null); pos.setModifierQty(1); }}
      />

      {/* QR Scanner Modal */}
      <PosQrScannerModal
        open={pos.showQrScanner}
        mode={pos.qrScanMode}
        scannerError={pos.scannerError}
        onClose={pos.stopScanner}
      />

      {/* Held Orders Drawer */}
      <PosHeldOrdersDrawer
        open={pos.showHeld}
        orders={pos.heldOrders}
        tables={pos.tables}
        onClose={() => pos.setShowHeld(false)}
        onRecall={pos.recallOrder}
        onDelete={(id) => {
          pos.setHeldOrders((prev) => {
            const updated = prev.filter((h) => h.id !== id);
            localStorage.setItem("pos_held_orders", JSON.stringify(updated));
            return updated;
          });
        }}
      />

      {/* Unpaid Orders Drawer */}
      <PosUnpaidOrdersDrawer
        open={pos.showUnpaid}
        orders={pos.unpaidOrders}
        loading={pos.unpaidLoading}
        onClose={() => pos.setShowUnpaid(false)}
      />

      <BundlePickerModal
        open={pos.pickerBundle !== null}
        bundle={pos.pickerBundle}
        menuItems={pos.items}
        onClose={() => pos.setPickerBundle(null)}
        onAdd={pos.handleBundlePickerAdd}
      />
    </div>
  );
}
