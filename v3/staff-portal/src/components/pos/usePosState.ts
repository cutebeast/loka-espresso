"use client";

/**
 * POS Orchestration Hook
 * 
 * Composes usePosCart, usePosCustomer, usePosCheckout, and usePosScanner
 * into a single unified hook that maintains backward compatibility
 * with the existing PosPage component.
 * 
 * After refactor (items 4): 608 lines → 132 lines orchestration
 * + 4 domain hooks (avg ~130 lines each = 520 lines total)
 * Net change: +44 lines, but each hook is independently testable.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getMenuItems, getMenuCategories, getTables, getOrders, getBundleProducts,
  createPosOrder,
  type MenuItem, type Category, type Customer, type Table,
  type BundleProduct
} from "@/lib/api";
import { api } from "@/lib/api";
import { pwaBaseUrl } from "@/lib/pwaBase";
import { usePosCart, type HeldOrder } from "./usePosCart";
import { usePosCustomer } from "./usePosCustomer";
import { usePosCheckout } from "./usePosCheckout";
import { usePosScanner } from "./usePosScanner";
import { usePosOffline } from "./usePosOffline";
import { isNetworkError, loadMenuSnapshot, saveMenuSnapshot } from "@/lib/offlineQueue";
import { parseApiError } from "@/lib/errors";
import { useTranslation } from "@/hooks/useTranslation";

export type PosMode = "new_order" | "checkout";
export type PosState = "menu" | "payment" | "qr_payment" | "done";
export type PaymentMethod = "cash" | "card" | "stripe_qr";
export type { HeldOrder };

export interface QrPaymentState {
  paymentUrl: string;
  pwaPayUrl?: string;
  payToken?: string;
  orderId: string;
  orderNumber?: string;
  total: number;
}

/** Return the regular price of ``consumeQty`` bundle items, consuming the
 *  highest unit-price lines first to maximize the customer-facing discount.
 */
function consumedItemsPrice(
  items: Array<{ price: number; qty: number }>,
  consumeQty: number,
): number {
  if (consumeQty <= 0 || items.length === 0) return 0;
  const sorted = [...items].sort((a, b) => b.price - a.price);
  let remaining = consumeQty;
  let total = 0;
  for (const it of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(it.qty, remaining);
    total += it.price * take;
    remaining -= take;
  }
  return total;
}

export function usePosState() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const checkoutOrderId = searchParams.get("checkout");

  // Shared state
  const [mode, setMode] = useState<PosMode>(checkoutOrderId ? "checkout" : "new_order");
  const [state, setState] = useState<PosState>("menu");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  // Menu / table data
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [bundleProducts, setBundleProducts] = useState<BundleProduct[]>([]);
  const [activeCat, setActiveCat] = useState<number | null>(null);
  const expCatId = categories.find((c) => c.slug === "experiences")?.id ?? null;
  const [menuSearch, setMenuSearch] = useState("");
  const [menuSearchInput, setMenuSearchInput] = useState("");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Payment state
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [amountTendered, setAmountTendered] = useState("");
  const [discountAmount, setDiscountAmount] = useState(0);
  const [tipAmount, setTipAmount] = useState(0);
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [successChange, setSuccessChange] = useState(0);
  const [qrPayment, setQrPayment] = useState<QrPaymentState | null>(null);
  const [pickerBundle, setPickerBundle] = useState<BundleProduct | null>(null);
  const [stripeEnabled, setStripeEnabled] = useState<boolean | null>(null);

  // Runtime helpers
  const { t } = useTranslation();
  const storeId = Number(typeof window !== "undefined" ? localStorage.getItem("staffStoreId") || "0" : "0");
  const crewName = typeof window !== "undefined" ? localStorage.getItem("staffName") || t("common.staff") : t("common.staff");

  // ── Composed hooks ──
  const cartHook = usePosCart(crewName);
  const customerHook = usePosCustomer();
  const checkoutHook = usePosCheckout(checkoutOrderId);
  const offline = usePosOffline();
  // True when the menu on screen came from the IndexedDB snapshot (stale prices possible)
  const [offlineMenuData, setOfflineMenuData] = useState(false);

  // Offline = cash only (QR / card terminals need connectivity)
  useEffect(() => {
    if (!offline.online) setPaymentMethod("cash");
  }, [offline.online]);

  // Scanner callbacks
  const handleCustomerScannerCb = useCallback((customer: Customer) => {
    if (mode === "checkout") {
      checkoutHook.loadCheckoutCustomerData(customer);
      setMsg(t("pos.customer_linked"));
    } else {
      cartHook.setSelectedCustomer(customer);
      customerHook.loadCustomerWallet(customer.id);
    }
  }, [mode, checkoutHook, cartHook, customerHook, t]);

  const handleTableScannerCb = useCallback((table: Table) => {
    cartHook.setTableId(table.id);
    setMsg(t("pos.table_selected", { number: table.table_number }));
  }, [cartHook, t]);

  const scannerHook = usePosScanner(tables, handleCustomerScannerCb, handleTableScannerCb);

  // ── Init ──
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [itemsData, catsData, tablesData, bpData] = await Promise.all([
          getMenuItems(),
          getMenuCategories(),
          getTables(storeId).catch((err) => {
            console.error("Failed to load tables:", err);
            setError(parseApiError(err, t("staff.errors.load_failed", { resource: t("tables.tables") })));
            return [];
          }),
          getBundleProducts().catch((err) => {
            console.error("Failed to load bundle products:", err);
            setError(parseApiError(err, t("staff.errors.load_failed", { resource: t("pos.combo") })));
            return [];
          }),
        ]);
        if (!mounted) return;
        const availableItems = (Array.isArray(itemsData) ? itemsData : []).filter((i: { is_available?: boolean }) => i.is_available);
        setItems(availableItems);
        const cats = Array.isArray(catsData) ? catsData : [];
        setCategories(cats);
        // Default to "All" (null) — don't force-select the first category
        setTables(Array.isArray(tablesData) ? (tablesData as Table[]).filter((t) => t.is_active !== false) : []);
        const activeBundles = (Array.isArray(bpData) ? bpData : []).filter((bp: BundleProduct) => bp.is_active !== false);
        setBundleProducts(activeBundles);
        // Menu loaded fine → we're online; keep the offline snapshot fresh.
        offline.reportSuccess();
        setOfflineMenuData(false);
        saveMenuSnapshot(storeId, { items: availableItems, categories: cats, bundleProducts: activeBundles })
          .catch((snapErr) => console.error("Failed to save menu snapshot:", snapErr));

        if (checkoutOrderId) {
          await checkoutHook.loadCheckoutOrder(checkoutOrderId);
        }

        // Load payment gateway config so we can disable QR when Stripe is off
        try {
          const configRes = await api.get<{ stripe_enabled?: boolean }>("/payments/config");
          const cfg = configRes || {};
          setStripeEnabled(Boolean(cfg.stripe_enabled));
        } catch (cfgErr) {
          console.error("Failed to load payment gateway config:", cfgErr);
          setError(parseApiError(cfgErr, t("staff.errors.load_failed", { resource: t("pos.payment") })));
          setStripeEnabled(false);
        }
      } catch (e: unknown) {
        if (!mounted) return;
        // Network (non-HTTP) failure → flip to offline and fall back to the
        // last good menu snapshot so the POS keeps selling.
        if (isNetworkError(e)) {
          offline.reportNetworkFailure();
          try {
            const snap = await loadMenuSnapshot(storeId);
            if (snap && mounted) {
              const snapItems = (snap.data.items as MenuItem[]) || [];
              setItems(snapItems.filter((i) => i.is_available));
              setCategories((snap.data.categories as Category[]) || []);
              setBundleProducts(((snap.data.bundleProducts as BundleProduct[]) || []).filter((bp) => bp.is_active !== false));
              setOfflineMenuData(true);
              return;
            }
          } catch (snapErr) {
            console.error("Failed to load menu snapshot:", snapErr);
          }
        }
        setError((e as Error).message);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- ref set asynchronously, must capture in cleanup
      const timer = searchTimerRef.current;
      if (timer) clearTimeout(timer);
    };
  }, [storeId, checkoutOrderId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ──
  const filteredItems = menuSearch
    ? items.filter((i) => i.item_name.toLowerCase().includes(menuSearch.toLowerCase()))
    : activeCat
    ? items.filter((i) => i.category_id === activeCat)
    : items;

  const discountValue = discountType === "percentage"
    ? cartHook.subtotal * (discountAmount / 100)
    : discountAmount;

  // Bundle + add-on discount preview (mirrors backend staff/pos.py logic)
  const bundleDiscountPreview = (() => {
    const cartBundleIds = new Set<number>();
    for (const c of cartHook.cart) {
      if (c.bundle_product_id) cartBundleIds.add(c.bundle_product_id);
    }
    if (cartBundleIds.size === 0) return { bundleDiscount: 0, addonDiscount: 0, total: 0 };

    const bundleMap = new Map<number, BundleProduct>();
    for (const bp of bundleProducts) bundleMap.set(bp.id, bp);

    let bundleDiscount = 0;
    for (const bid of cartBundleIds) {
      const bp = bundleMap.get(bid);
      if (!bp || bp.is_active === false) continue;
      const bundleItems = cartHook.cart.filter((c) => c.bundle_product_id === bid);

      let numSets = 0;
      let bundledSum = 0;
      if (bp.bundle_type === 'multi_course' && bp.groups && bp.groups.length > 0) {
        const componentGroupMap = new Map<number, { groupId: number; pickCount: number; minPick: number; maxPick: number }>();
        for (const g of bp.groups) {
          for (const comp of g.components || []) {
            componentGroupMap.set(comp.id, { groupId: g.id, pickCount: g.pick_count, minPick: g.min_pick, maxPick: g.max_pick });
          }
        }
        const groupQtys = new Map<number, number>();
        for (const c of bundleItems) {
          const mapping = c.bundle_component_id ? componentGroupMap.get(c.bundle_component_id) : undefined;
          if (mapping) {
            groupQtys.set(mapping.groupId, (groupQtys.get(mapping.groupId) || 0) + c.qty);
          }
        }
        let groupOk = true;
        const setsPerGroup: number[] = [];
        for (const g of bp.groups) {
          const qty = groupQtys.get(g.id) || 0;
          if (qty < g.min_pick || qty > g.max_pick) {
            groupOk = false;
            break;
          }
          setsPerGroup.push(Math.floor(qty / g.pick_count));
        }
        if (groupOk && setsPerGroup.length > 0) {
          numSets = Math.min(...setsPerGroup);
          numSets = Math.min(numSets, bp.max_per_order ?? 1);
          for (const g of bp.groups) {
            const groupItems = bundleItems.filter((ci) =>
              ci.bundle_component_id && g.components?.some((c) => c.id === ci.bundle_component_id)
            );
            bundledSum += consumedItemsPrice(groupItems, numSets * g.pick_count);
          }
        }
      } else if (bp.pick_count && bp.pick_count > 0) {
        const qtyByComponent = new Map<number | string, number>();
        for (const c of bundleItems) {
          const key = c.bundle_component_id || c.menu_item_id;
          qtyByComponent.set(key, (qtyByComponent.get(key) || 0) + c.qty);
        }
        const distinctCount = qtyByComponent.size;
        if (bp.allow_duplicates || distinctCount >= bp.pick_count) {
          const maxByTotal = Math.floor(bundleItems.reduce((s, c) => s + c.qty, 0) / bp.pick_count);
          if (!bp.allow_duplicates) {
            const maxByComponent = qtyByComponent.size > 0 ? Math.min(...qtyByComponent.values()) : 0;
            numSets = Math.min(maxByTotal, maxByComponent);
          } else {
            numSets = maxByTotal;
          }
          numSets = Math.min(numSets, bp.max_per_order ?? 1);
          bundledSum = consumedItemsPrice(bundleItems, numSets * bp.pick_count);
        }
      } else {
        // Standard / fixed bundles: require every component in default_quantity.
        const compQty = new Map<number, number>();
        for (const c of bundleItems) {
          const cid = c.bundle_component_id;
          if (cid) {
            compQty.set(cid, (compQty.get(cid) || 0) + c.qty);
          }
        }
        const setCounts: number[] = [];
        let complete = true;
        for (const comp of bp.components || []) {
          const qty = compQty.get(comp.id) || 0;
          const perSet = comp.default_quantity || 1;
          if (qty < perSet) {
            complete = false;
            break;
          }
          setCounts.push(Math.floor(qty / perSet));
        }
        if (complete && setCounts.length > 0) {
          numSets = Math.min(...setCounts);
          numSets = Math.min(numSets, bp.max_per_order ?? 1);
          for (const comp of bp.components || []) {
            const perSet = comp.default_quantity || 1;
            const compItems = bundleItems.filter((ci) => ci.bundle_component_id === comp.id);
            bundledSum += consumedItemsPrice(compItems, numSets * perSet);
          }
        }
      }

      if (numSets > 0 && bundledSum > 0) {
        const disc = bundledSum - Number(bp.bundle_price) * numSets;
        if (disc > 0) bundleDiscount += disc;
      }
    }

    let addonDiscount = 0;
    for (const c of cartHook.cart) {
      if (c.bundle_product_id) continue;
      const mi = items.find((i) => i.id === c.menu_item_id);
      if (!mi || !mi.is_addon_deal_eligible) continue;
      const eligibleIds = mi.eligible_bundle_ids;
      if (!eligibleIds || eligibleIds.length === 0) continue;
      if (!eligibleIds.some((bid) => cartBundleIds.has(bid))) continue;
      const lineUnit = c.price;
      const value = mi.addon_discount_value ?? 0;
      let disc = 0;
      if (mi.addon_discount_type === "percentage") {
        disc = (lineUnit * value) / 100;
      } else {
        disc = value;
      }
      disc = Math.min(disc, lineUnit) * c.qty;
      addonDiscount += Math.max(0, disc);
    }

    return { bundleDiscount, addonDiscount, total: bundleDiscount + addonDiscount };
  })();

  const total = Math.max(0, cartHook.subtotal - discountValue - bundleDiscountPreview.total);
  const tenderedVal = paymentMethod === "cash" && amountTendered ? parseFloat(amountTendered) : NaN;
  const change = !isNaN(tenderedVal) ? Math.max(0, tenderedVal - total) : 0;

  // ── Customer integration ──
  const handleCustomerSelect = useCallback((c: Customer) => {
    customerHook.handleCustomerSelect(c);
    cartHook.setSelectedCustomer(c);
    customerHook.loadCustomerWallet(c.id);
  }, [customerHook, cartHook]);

  const handleCustomerQrScan = useCallback(async (code: string) => {
    try {
      const customer = await customerHook.handleCustomerQrScan(code);
      handleCustomerSelect(customer);
    } catch (e: unknown) {
      setError((e as Error).message || t("pos.invalid_customer_qr"));
    }
  }, [customerHook, handleCustomerSelect, t]);

  // ── Order actions ──
  const isKitchenProcessingRef = useRef(false);
  const isCheckoutProcessingRef = useRef(false);

  // Queue the order in IndexedDB; the sync engine replays it when back online.
  const enqueueOfflineOrder = async (payload: Record<string, unknown>, clientRef: string) => {
    const itemCount = cartHook.cart.reduce((s, c) => s + c.qty, 0);
    const names = cartHook.cart.slice(0, 3).map((c) => c.name).join(", ");
    const totalDue = Math.round(total * 100) / 100;
    try {
      await offline.enqueue({
        client_ref: clientRef,
        order_payload: payload,
        // Offline = cash only (QR / card need connectivity); tendered is
        // re-read from the server total at sync time.
        payment: { payment_method: "cash", amount_tendered: totalDue },
        total: totalDue,
        summary: `${names}${cartHook.cart.length > 3 ? "…" : ""} (${itemCount})`,
        created_at: Date.now(),
        status: "pending",
      });
      cartHook.newOrder();
      setPaymentMethod("cash");
      setAmountTendered("");
      setDiscountAmount(0);
      setMsg(t("pos.offline_queued_confirm"));
    } catch (e: unknown) { setError((e as Error).message); }
  };

  const handleSendToKitchen = async () => {
    if (isKitchenProcessingRef.current) return;
    if (cartHook.cart.length === 0) { setError(t("pos.err_cart_empty")); return; }
    if (cartHook.orderType === "dine_in" && !cartHook.tableId) { setError(t("pos.err_table_required")); return; }

    // Validate bundle completeness before sending
    const bundleErrors: string[] = [];
    const cartBundleIds = new Set(cartHook.cart.map((c) => c.bundle_product_id).filter((bid): bid is number => !!bid));
    for (const bid of cartBundleIds) {
      const bp = bundleProducts.find((b) => b.id === bid);
      if (!bp) continue;
      const items = cartHook.cart.filter((c) => c.bundle_product_id === bid);

      if (bp.bundle_type === "multi_course" && bp.groups && bp.groups.length > 0) {
        const compGroupMap = new Map<number, number>();
        const groupSpec = new Map<number, { label: string; min: number; max: number; pick: number }>();
        for (const g of bp.groups) {
          for (const c of g.components || []) compGroupMap.set(c.id, g.id);
          groupSpec.set(g.id, { label: g.group_label, min: g.min_pick, max: g.max_pick, pick: g.pick_count });
        }
        const groupQtys = new Map<number, number>();
        for (const it of items) {
          const gid = it.bundle_component_id ? compGroupMap.get(it.bundle_component_id) : undefined;
          if (gid) groupQtys.set(gid, (groupQtys.get(gid) || 0) + it.qty);
        }
        for (const [gid, spec] of groupSpec) {
          const qty = groupQtys.get(gid) || 0;
          if (qty < spec.min || qty > spec.max) {
            bundleErrors.push(`${bp.title}: ${spec.label} requires ${spec.min}-${spec.max} items (got ${qty})`);
          }
        }
      } else if (bp.pick_count && bp.pick_count > 0) {
        const totalQty = items.reduce((s, c) => s + c.qty, 0);
        if (totalQty % bp.pick_count !== 0) {
          bundleErrors.push(`${bp.title}: selections must be in multiples of ${bp.pick_count}`);
        }
        if (!bp.allow_duplicates) {
          const distinct = new Set(items.map((c) => c.bundle_component_id || c.menu_item_id)).size;
          if (distinct < bp.pick_count) {
            bundleErrors.push(`${bp.title}: requires ${bp.pick_count} distinct choices`);
          }
        }
      } else {
        const compQtys = new Map<number, number>();
        for (const it of items) {
          if (it.bundle_component_id) compQtys.set(it.bundle_component_id, (compQtys.get(it.bundle_component_id) || 0) + it.qty);
        }
        for (const comp of bp.components || []) {
          const qty = compQtys.get(comp.id) || 0;
          const needed = comp.default_quantity || 1;
          if (qty < needed) {
            bundleErrors.push(`${bp.title}: missing ${comp.menu_item_name || "item"} (need ${needed}, got ${qty})`);
          }
        }
      }
    }
    if (bundleErrors.length > 0) {
      setError(t("pos.complete_combo", { errors: bundleErrors.join("\n") }));
      return;
    }

    // Workshop bookings need an identified customer (phone) — staff must
    // attach one before sending the order through.
    if (cartHook.cart.some((c) => c.class_session_id != null) && !cartHook.selectedCustomer) {
      setError(t("pos.workshop_customer_required"));
      return;
    }

    isKitchenProcessingRef.current = true;
    setSaving(true);
    try {
      const idempotencyKey = typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `pos-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const clientRef = typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `posref-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const orderPayload = {
        store_id: storeId || undefined,
        customer_id: cartHook.selectedCustomer?.id || null,
        dining_table_id: cartHook.tableId || undefined,
        order_type: cartHook.orderType,
        line_items: cartHook.cart.map((c) => ({
          menu_item_id: c.menu_item_id,
          quantity: c.qty,
          modifier_ids: c.modifier_ids,
          special_instructions: c.modifiers_label || undefined,
          bundle_product_id: c.bundle_product_id || undefined,
          bundle_component_id: c.bundle_component_id || undefined,
          class_session_id: c.class_session_id || undefined,
        })),
        order_notes: cartHook.orderNotes,
        is_byot: cartHook.isByot ?? false,
        idempotency_key: idempotencyKey,
        client_ref: clientRef,
      };
      // Already offline → skip the doomed request and queue immediately.
      if (!offline.online) {
        await enqueueOfflineOrder(orderPayload, clientRef);
        return;
      }
      try {
        const res = await createPosOrder(orderPayload);
        setResult(res);
        setState("done");
      } catch (e: unknown) {
        // Network (non-HTTP) failure mid-checkout → queue for auto-sync.
        if (isNetworkError(e)) {
          offline.reportNetworkFailure();
          await enqueueOfflineOrder(orderPayload, clientRef);
          return;
        }
        setError((e as Error).message);
      }
    } finally { isKitchenProcessingRef.current = false; setSaving(false); }
  };

  const handleCheckout = async (split?: import("./PosSplitBillSection").SplitSelection) => {
    if (isCheckoutProcessingRef.current) return;
    if (!checkoutOrderId) return;
    isCheckoutProcessingRef.current = true;
    setSaving(true);
    try {
      const walletPaid = checkoutHook.checkoutDiscountsApplied.wallet || 0;
      const orderBase = checkoutHook.checkoutOrder?.total_amount ?? 0;
      const discountBase = checkoutHook.checkoutOrder?.items_subtotal ?? orderBase;
      const manualDisc = discountType === "percentage" ? discountBase * (discountAmount / 100) : discountAmount;
      const checkoutTotal = Math.max(0, orderBase - manualDisc + tipAmount - walletPaid);
      // If wallet (or a 100% discount) covers the whole bill, record the wallet payment once.
      if (checkoutTotal <= 0) {
        try {
          let walletRes: Record<string, unknown>;
          if (walletPaid > 0) {
            // Wallet payment already applied via handleCheckoutWalletPayment; just finalize.
            walletRes = { message: t("pos.paid_with_wallet"), payment_status: "paid" };
          } else {
            // Fully discounted order; no wallet payment required.
            walletRes = { message: t("pos.no_payment_required"), payment_status: "paid" };
          }
          setResult({
            order_id: checkoutOrderId,
            total: 0,
            message: (walletRes.message as string) || "Paid with wallet",
            payment_status: walletRes.payment_status,
          });
        } catch (e: unknown) {
          setError(parseApiError(e, t("pos.wallet_payment_failed")));
          return;
        } finally {
          isCheckoutProcessingRef.current = false;
          setSaving(false);
        }
        setSuccessChange(0);
        setState("done");
        return;
      }
      const res = await checkoutHook.handleCheckoutPayment(
        checkoutOrderId, paymentMethod, discountAmount, discountType, amountTendered, tipAmount, split
      );
      // Split bill: a share was paid but the bill isn't settled — reload the
      // order and stay in checkout for the remaining share(s).
      if (split && split.mode !== "full" && (res as Record<string, unknown>).payment_status !== "captured") {
        await checkoutHook.loadCheckoutOrder(checkoutOrderId);
        setMsg(t("pos.split_share_paid_continue"));
        return;
      }
      const resRecord = res as Record<string, unknown>;
      if (resRecord.payment_url && typeof resRecord.payment_url === "string") {
        // Build the PWA deep-link so the staff-facing QR opens the PWA guest-pay
        // page (no login required).  The signed pay_token authorises the
        // walk-in customer to view + pay for this specific order only.
        const pwaBase = pwaBaseUrl();
        const payToken = (resRecord.pay_token as string | undefined) || "";
        const pwaPayUrl = payToken
          ? `${pwaBase}/#guest-pay?orderId=${checkoutOrderId}&token=${payToken}`
          : `${pwaBase}/#order-detail?orderId=${checkoutOrderId}`;
        setQrPayment({
          paymentUrl: resRecord.payment_url,
          pwaPayUrl,
          payToken,
          orderId: checkoutOrderId,
          orderNumber: (resRecord.order_number as string | undefined) || checkoutHook.checkoutOrder?.order_number,
          total: (resRecord.total as number | undefined) || total,
        });
        setState("qr_payment");
        return;
      }
      setResult(res);
      const serverTotal = resRecord.total as number | undefined;
      const actualChange = !isNaN(tenderedVal) ? Math.max(0, tenderedVal - (serverTotal ?? total)) : 0;
      setSuccessChange(actualChange);
      setState("done");
    } catch (e: unknown) { setError((e as Error).message); } finally { isCheckoutProcessingRef.current = false; setSaving(false); }
  };

  const cancelQrPayment = useCallback(() => {
    setQrPayment(null);
    setState("payment");
  }, []);

  const completeQrPayment = useCallback((finalResult: unknown) => {
    setQrPayment(null);
    setResult(finalResult);
    setState("done");
  }, []);

  const holdOrder = () => {
    const held = cartHook.holdOrder();
    if (held) {
      setMsg(t("pos.order_parked"));
    }
  };

  const newOrder = () => {
    setState("menu");
    cartHook.newOrder();
    setPaymentMethod("cash");
    setAmountTendered("");
    setDiscountAmount(0);
    setResult(null);
    setMsg("");
    setError("");
    checkoutHook.setCheckoutOrder(null);
    setMode("new_order");
    router.replace("/pos");
  };

  const addBundleToCart = (bp: BundleProduct) => {
    if (bp.bundle_type === "multi_course" || (bp.pick_count && bp.pick_count > 0)) {
      setPickerBundle(bp);
      return;
    }
    const unavailable: string[] = [];
    for (const comp of bp.components) {
      const menuItem = items.find(i => i.id === comp.menu_item_id);
      if (!menuItem || !menuItem.is_available) {
        unavailable.push(comp.menu_item_name || menuItem?.item_name || t("common.item_n", { id: comp.menu_item_id }));
      }
    }
    if (unavailable.length > 0) {
      setError(t("pos.bundle_unavailable", { title: bp.title, items: unavailable.join(", ") }));
      return;
    }
    for (const comp of bp.components) {
      const menuItem = items.find(i => i.id === comp.menu_item_id)!;
      cartHook.addToCart(menuItem, {}, "", comp.default_quantity || 1, bp.id, comp.id);
    }
    setMsg(t("pos.bundle_added", { title: bp.title }));
  };

  const handleBundlePickerAdd = (selections: Array<{ menu_item_id: number; quantity: number; bundle_component_id?: number }>) => {
    if (!pickerBundle) return;
    for (const sel of selections) {
      const menuItem = items.find(i => i.id === sel.menu_item_id);
      if (!menuItem || !menuItem.is_available) continue;
      cartHook.addToCart(menuItem, {}, "", sel.quantity, pickerBundle.id, sel.bundle_component_id);
    }
    setMsg(t("pos.bundle_added", { title: pickerBundle.title }));
    setPickerBundle(null);
  };

  // ── Return (backward-compatible interface) ──
  return {
    router,
    mode, setMode,
    state, setState,
    categories, setCategories,
    items, setItems,
    tables, setTables,
    activeCat, setActiveCat,
    expCatId,
    bundleProducts, setBundleProducts,
    loading, setLoading,
    error, setError,
    msg, setMsg,

    // Cart (from usePosCart)
    cart: cartHook.cart, setCart: cartHook.setCart,
    selectedCustomer: cartHook.selectedCustomer, setSelectedCustomer: cartHook.setSelectedCustomer,
    tableId: cartHook.tableId, setTableId: cartHook.setTableId,
    orderType: cartHook.orderType, setOrderType: cartHook.setOrderType,
    orderNotes: cartHook.orderNotes, setOrderNotes: cartHook.setOrderNotes,
    isByot: cartHook.isByot, setIsByot: cartHook.setIsByot,
    modifierItem: cartHook.modifierItem, setModifierItem: cartHook.setModifierItem,
    selectedModifiers: cartHook.selectedModifiers, setSelectedModifiers: cartHook.setSelectedModifiers,
    modifierQty: cartHook.modifierQty, setModifierQty: cartHook.setModifierQty,
    heldOrders: cartHook.heldOrders, setHeldOrders: cartHook.setHeldOrders,
    showHeld: cartHook.showHeld, setShowHeld: cartHook.setShowHeld,
    addToCart: cartHook.addToCart,
    handleItemClick: cartHook.handleItemClick,
    applyModifiers: cartHook.applyModifiers,
    sessionItem: cartHook.sessionItem,
    setSessionItem: cartHook.setSessionItem,
    openSessionPicker: cartHook.openSessionPicker,
    confirmSession: cartHook.confirmSession,
    removeFromCart: cartHook.removeFromCart,
    updateQty: cartHook.updateQty,
    subtotal: cartHook.subtotal,
    holdOrder,
    recallOrder: cartHook.recallOrder,
    addBundleToCart,
    pickerBundle,
    setPickerBundle,
    handleBundlePickerAdd,
    newOrder,

    // Customer (from usePosCustomer)
    searchQ: customerHook.searchQ, setSearchQ: customerHook.setSearchQ,
    searchResults: customerHook.searchResults, setSearchResults: customerHook.setSearchResults,
    customerWallet: customerHook.customerWallet, setCustomerWallet: customerHook.setCustomerWallet,
    showRewardsDrawer: customerHook.showRewardsDrawer, setShowRewardsDrawer: customerHook.setShowRewardsDrawer,
    searchCustomersDebounced: customerHook.searchCustomersDebounced,
    loadCustomerWallet: customerHook.loadCustomerWallet,
    handleCustomerSelect,
    handleCustomerQrScan,
    // Checkout (from usePosCheckout)
    checkoutOrder: checkoutHook.checkoutOrder, setCheckoutOrder: checkoutHook.setCheckoutOrder,
    checkoutCustomer: checkoutHook.checkoutCustomer, setCheckoutCustomer: checkoutHook.setCheckoutCustomer,
    checkoutWalletData: checkoutHook.checkoutWalletData, setCheckoutWalletData: checkoutHook.setCheckoutWalletData,
    showCheckoutDiscounts: checkoutHook.showCheckoutDiscounts, setShowCheckoutDiscounts: checkoutHook.setShowCheckoutDiscounts,
    checkoutDiscountsApplied: checkoutHook.checkoutDiscountsApplied, setCheckoutDiscountsApplied: checkoutHook.setCheckoutDiscountsApplied,
    applyingDiscount: checkoutHook.applyingDiscount, setApplyingDiscount: checkoutHook.setApplyingDiscount,
    unpaidOrders: checkoutHook.unpaidOrders, setUnpaidOrders: checkoutHook.setUnpaidOrders,
    showUnpaid: checkoutHook.showUnpaid, setShowUnpaid: checkoutHook.setShowUnpaid,
    unpaidLoading: checkoutHook.unpaidLoading, setUnpaidLoading: checkoutHook.setUnpaidLoading,
    loadCheckoutCustomerData: checkoutHook.loadCheckoutCustomerData,
    handleCheckoutCustomerQrScan: checkoutHook.handleCheckoutCustomerQrScan,
    handleApplyCheckoutVoucher: (voucherCode: string) =>
      checkoutHook.handleApplyCheckoutVoucher(voucherCode)
        .then((res) => { setMsg((res as { message?: string }).message || t("pos.apply")); })
        .catch((e) => setError((e as Error).message || t("staff.errors.update_failed", { resource: t("pos.vouchers") }))),
    handleApplyCheckoutReward: (rewardId: number) =>
      checkoutHook.handleApplyCheckoutReward(rewardId)
        .then((res) => { setMsg((res as { message?: string }).message || t("pos.apply_2")); })
        .catch((e) => setError((e as Error).message || t("staff.errors.update_failed", { resource: t("pos.rewards") }))),
    handleCheckoutWalletPayment: (amount: number) =>
      checkoutHook.handleCheckoutWalletPayment(amount)
        .then((res) => { setMsg((res as { message?: string }).message || t("pos.wallet_payment")); })
        .catch((e) => setError((e as Error).message || t("pos.wallet_payment_failed"))),
    fetchUnpaidOrders: () => checkoutHook.fetchUnpaidOrders(storeId, getOrders),

    // Scanner (from usePosScanner)
    showQrScanner: scannerHook.showQrScanner, setShowQrScanner: scannerHook.setShowQrScanner,
    qrScanMode: scannerHook.qrScanMode, setQrScanMode: scannerHook.setQrScanMode,
    scannerError: scannerHook.scannerError, setScannerError: scannerHook.setScannerError,
    startScanner: scannerHook.startScanner,
    stopScanner: scannerHook.stopScanner,

    // Payment
    paymentMethod, setPaymentMethod,
    stripeEnabled,
    amountTendered, setAmountTendered,
    discountAmount, setDiscountAmount,
    tipAmount, setTipAmount,
    discountType, setDiscountType,
    saving, setSaving,
    result, setResult,
    successChange,
    qrPayment, setQrPayment,
    cancelQrPayment,
    completeQrPayment,

    // Derived
    menuSearch, setMenuSearch,
    menuSearchInput, setMenuSearchInput,
    searchTimerRef,
    filteredItems,
    discountValue,
    bundleDiscountPreview,
    total,
    tenderedVal,
    change,

    // Runtime
    storeId,
    crewName,
    checkoutOrderId,

    // Offline mode
    online: offline.online,
    offlineMenuData,
    offlineQueue: offline.queueItems,
    retryQueuedOrder: offline.retryItem,
    syncQueuedOrders: offline.syncNow,

    // Actions
    handleSendToKitchen,
    handleCheckout,
  };
}
