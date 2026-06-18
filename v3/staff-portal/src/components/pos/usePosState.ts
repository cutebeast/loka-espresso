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
      const disc = componentSum - bp.bundle_price;
      if (disc > 0) bundleDiscount += disc;
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
    isKitchenProcessingRef.current = true;
    setSaving(true);
    try {
      const res = await createPosOrder({
        customer_id: cartHook.selectedCustomer?.id || null,
        dining_table_id: cartHook.tableId || undefined,
        order_type: cartHook.orderType,
        line_items: cartHook.cart.map((c) => ({
          menu_item_id: c.menu_item_id,
          quantity: c.qty,
          modifier_ids: c.modifier_ids,
          notes: c.modifiers_label || undefined,
          bundle_product_id: c.bundle_product_id || undefined,
        })),
        order_notes: cartHook.orderNotes,
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
    let skipped = 0;
    for (const comp of bp.components) {
      const menuItem = items.find(i => i.id === comp.menu_item_id);
      if (!menuItem || !menuItem.is_available) { skipped++; continue; }
      cartHook.addToCart(menuItem, {}, "", comp.default_quantity, bp.id);
    }
    setMsg(skipped > 0 ? `${bp.title} added (${skipped} item${skipped > 1 ? "s" : ""} unavailable, skipped)` : `${bp.title} added`);
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
