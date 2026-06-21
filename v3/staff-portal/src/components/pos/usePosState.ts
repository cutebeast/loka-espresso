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
  type Reward, type Voucher, type BundleProduct
} from "@/lib/api";
import { usePosCart, type HeldOrder } from "./usePosCart";
import { usePosCustomer } from "./usePosCustomer";
import { usePosCheckout } from "./usePosCheckout";
import { usePosScanner } from "./usePosScanner";

export type PosMode = "new_order" | "checkout";
export type PosState = "menu" | "payment" | "done";
export type PaymentMethod = "cash" | "card" | "qr";
export type { HeldOrder };

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
  const [pickerBundle, setPickerBundle] = useState<BundleProduct | null>(null);

  // Runtime helpers
  const storeId = Number(typeof window !== "undefined" ? localStorage.getItem("staffStoreId") || "0" : "0");
  const crewName = typeof window !== "undefined" ? localStorage.getItem("staffName") || "Staff" : "Staff";

  // ── Composed hooks ──
  const cartHook = usePosCart(storeId, crewName);
  const customerHook = usePosCustomer();
  const checkoutHook = usePosCheckout(checkoutOrderId);

  // Scanner callbacks
  const handleCustomerScannerCb = useCallback((customer: Customer) => {
    if (mode === "checkout") {
      checkoutHook.loadCheckoutCustomerData(customer);
      setMsg("Customer linked for checkout");
    } else {
      cartHook.setSelectedCustomer(customer);
      customerHook.loadCustomerWallet(customer.id);
    }
  }, [mode, checkoutHook, cartHook, customerHook]);

  const handleTableScannerCb = useCallback((table: Table) => {
    cartHook.setTableId(table.id);
    setMsg(`Table ${table.table_number} selected`);
  }, [cartHook]);

  const scannerHook = usePosScanner(tables, handleCustomerScannerCb, handleTableScannerCb);

  // ── Init ──
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [itemsData, catsData, tablesData, bpData] = await Promise.all([
          getMenuItems(),
          getMenuCategories(),
          getTables(storeId).catch((err) => { console.error("Failed to load tables:", err); return []; }),
          getBundleProducts().catch(() => []),
        ]);
        if (!mounted) return;
        setItems((Array.isArray(itemsData) ? itemsData : []).filter((i: { is_available?: boolean }) => i.is_available));
        const cats = Array.isArray(catsData) ? catsData : [];
        setCategories(cats);
        if (cats.length > 0) {
          const firstCat = cats[0];
          if (firstCat) setActiveCat(firstCat.id);
        }
        setTables(Array.isArray(tablesData) ? (tablesData as Table[]).filter((t) => t.is_active !== false) : []);
        setBundleProducts((Array.isArray(bpData) ? bpData : []).filter((bp: BundleProduct) => bp.is_active !== false));

        if (checkoutOrderId) {
          await checkoutHook.loadCheckoutOrder(checkoutOrderId);
        }
      } catch (e: unknown) {
        if (mounted) setError((e as Error).message);
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

  // Bundle + add-on discount preview (mirrors backend staff_ops.py logic)
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
      const componentSum = bundleItems.reduce((s, c) => s + c.price * c.qty, 0);

      let numSets = 0;
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
        }
      }

      if (numSets > 0) {
        const maxAllowed = bp.max_per_order ?? 1;
        numSets = Math.min(numSets, maxAllowed);
        const disc = componentSum - bp.bundle_price * numSets;
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
      setError((e as Error).message || "Invalid customer QR");
    }
  }, [customerHook, handleCustomerSelect]);

  // ── Order actions ──
  const isKitchenProcessingRef = useRef(false);
  const isCheckoutProcessingRef = useRef(false);

  const handleSendToKitchen = async () => {
    if (isKitchenProcessingRef.current) return;
    if (cartHook.cart.length === 0) { setError("Cart is empty"); return; }
    if (cartHook.orderType === "dine_in" && !cartHook.tableId) { setError("Please assign a table for dine-in orders"); return; }

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
      setError(`Complete the combo before sending:\n${bundleErrors.join("\n")}`);
      return;
    }

    isKitchenProcessingRef.current = true;
    setSaving(true);
    try {
      const idempotencyKey = typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `pos-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const res = await createPosOrder({
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
        })),
        order_notes: cartHook.orderNotes,
        idempotency_key: idempotencyKey,
      });
      setResult(res);
      setState("done");
    } catch (e: unknown) { setError((e as Error).message); } finally { isKitchenProcessingRef.current = false; setSaving(false); }
  };

  const handleCheckout = async () => {
    if (isCheckoutProcessingRef.current) return;
    if (!checkoutOrderId) return;
    isCheckoutProcessingRef.current = true;
    setSaving(true);
    try {
      const walletPaid = checkoutHook.checkoutDiscountsApplied.wallet || 0;
      const res = await checkoutHook.handleCheckoutPayment(
        checkoutOrderId, paymentMethod, discountAmount, discountType, walletPaid, amountTendered, tipAmount
      );
      setResult(res);
      const serverTotal = (res as Record<string, unknown>).total as number | undefined;
      const actualChange = !isNaN(tenderedVal) ? Math.max(0, tenderedVal - (serverTotal ?? total)) : 0;
      setSuccessChange(actualChange);
      setState("done");
    } catch (e: unknown) { setError((e as Error).message); } finally { isCheckoutProcessingRef.current = false; setSaving(false); }
  };

  const holdOrder = () => {
    const held = cartHook.holdOrder();
    if (held) {
      setMsg("Order parked successfully");
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
        unavailable.push(comp.menu_item_name || menuItem?.item_name || `Item #${comp.menu_item_id}`);
      }
    }
    if (unavailable.length > 0) {
      setError(`Cannot add ${bp.title}: ${unavailable.join(", ")} unavailable`);
      return;
    }
    for (const comp of bp.components) {
      const menuItem = items.find(i => i.id === comp.menu_item_id)!;
      cartHook.addToCart(menuItem, {}, "", comp.default_quantity || 1, bp.id, comp.id);
    }
    setMsg(`${bp.title} added`);
  };

  const handleBundlePickerAdd = (selections: Array<{ menu_item_id: number; quantity: number; bundle_component_id?: number }>) => {
    if (!pickerBundle) return;
    for (const sel of selections) {
      const menuItem = items.find(i => i.id === sel.menu_item_id);
      if (!menuItem || !menuItem.is_available) continue;
      cartHook.addToCart(menuItem, {}, "", sel.quantity, pickerBundle.id, sel.bundle_component_id);
    }
    setMsg(`${pickerBundle.title} added`);
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
    modifierItem: cartHook.modifierItem, setModifierItem: cartHook.setModifierItem,
    selectedModifiers: cartHook.selectedModifiers, setSelectedModifiers: cartHook.setSelectedModifiers,
    modifierQty: cartHook.modifierQty, setModifierQty: cartHook.setModifierQty,
    heldOrders: cartHook.heldOrders, setHeldOrders: cartHook.setHeldOrders,
    showHeld: cartHook.showHeld, setShowHeld: cartHook.setShowHeld,
    addToCart: cartHook.addToCart,
    handleItemClick: cartHook.handleItemClick,
    applyModifiers: cartHook.applyModifiers,
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
    redeemingId: customerHook.redeemingId, setRedeemingId: customerHook.setRedeemingId,
    searchCustomersDebounced: customerHook.searchCustomersDebounced,
    loadCustomerWallet: customerHook.loadCustomerWallet,
    handleCustomerSelect,
    handleCustomerQrScan,
    handleBurnReward: (reward: Reward) =>
      cartHook.selectedCustomer
        ? customerHook.handleBurnReward(cartHook.selectedCustomer, reward)
            .then(() => { setMsg("Reward redeemed!"); customerHook.loadCustomerWallet(cartHook.selectedCustomer!.id); })
            .catch((e) => setError((e as Error).message))
        : undefined,
    handleBurnVoucher: (voucher: Voucher) =>
      cartHook.selectedCustomer
        ? customerHook.handleBurnVoucher(cartHook.selectedCustomer, voucher)
            .then(() => { setMsg("Voucher redeemed!"); customerHook.loadCustomerWallet(cartHook.selectedCustomer!.id); })
            .catch((e) => setError((e as Error).message))
        : undefined,

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
        .then((res) => { setMsg((res as { message?: string }).message || "Voucher applied"); })
        .catch((e) => setError((e as Error).message || "Failed to apply voucher")),
    handleApplyCheckoutReward: (rewardId: number) =>
      checkoutHook.handleApplyCheckoutReward(rewardId)
        .then((res) => { setMsg((res as { message?: string }).message || "Reward applied"); })
        .catch((e) => setError((e as Error).message || "Failed to apply reward")),
    handleCheckoutWalletPayment: (amount: number) =>
      checkoutHook.handleCheckoutWalletPayment(amount)
        .then((res) => { setMsg((res as { message?: string }).message || "Wallet payment applied"); })
        .catch((e) => setError((e as Error).message || "Wallet payment failed")),
    fetchUnpaidOrders: () => checkoutHook.fetchUnpaidOrders(storeId, getOrders),

    // Scanner (from usePosScanner)
    showQrScanner: scannerHook.showQrScanner, setShowQrScanner: scannerHook.setShowQrScanner,
    qrScanMode: scannerHook.qrScanMode, setQrScanMode: scannerHook.setQrScanMode,
    scannerError: scannerHook.scannerError, setScannerError: scannerHook.setScannerError,
    startScanner: scannerHook.startScanner,
    stopScanner: scannerHook.stopScanner,

    // Payment
    paymentMethod, setPaymentMethod,
    amountTendered, setAmountTendered,
    discountAmount, setDiscountAmount,
    tipAmount, setTipAmount,
    discountType, setDiscountType,
    saving, setSaving,
    result, setResult,
    successChange,

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

    // Actions
    handleSendToKitchen,
    handleCheckout,
  };
}
