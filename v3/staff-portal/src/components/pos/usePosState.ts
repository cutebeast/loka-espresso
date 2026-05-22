"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getMenuItems, getMenuCategories, getTables, searchCustomers, getOrders,
  createPosOrder, getOrderById, updateOrderPayment, getCustomerWallet, scanCustomerCode,
  useVoucher, useReward, applyOrderVoucher, applyOrderReward, payWithWallet,
  type MenuItem, type Category, type CartItem, type Customer, type Table,
  type CustomerWallet, type Reward, type Voucher, type Order
} from "@/lib/api";

export type PosMode = "new_order" | "checkout";
export type PosState = "menu" | "payment" | "done";
export type PaymentMethod = "cash" | "card" | "qr";

export interface HeldOrder {
  id: string;
  cart: CartItem[];
  tableId: number | null;
  customer: Customer | null;
  orderType: string;
  notes: string;
  createdAt: number;
  crewName: string;
}

export function usePosState() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const checkoutOrderId = searchParams.get("checkout");
  const initialTableId = searchParams.get("table");
  const initialOrderType = searchParams.get("type") || "dine_in";

  const [mode, setMode] = useState<PosMode>(checkoutOrderId ? "checkout" : "new_order");
  const [state, setState] = useState<PosState>("menu");

  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [activeCat, setActiveCat] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [tableId, setTableId] = useState<number | null>(initialTableId ? Number(initialTableId) : null);
  const [orderType, setOrderType] = useState<string>(initialOrderType);
  const [orderNotes, setOrderNotes] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [menuSearch, setMenuSearch] = useState("");

  const [modifierItem, setModifierItem] = useState<MenuItem | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<Record<number, number[]>>({});
  const [modifierQty, setModifierQty] = useState(1);

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [amountTendered, setAmountTendered] = useState("");
  const [discountAmount, setDiscountAmount] = useState(0);
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<unknown>(null);

  const [checkoutOrder, setCheckoutOrder] = useState<unknown>(null);

  const [customerWallet, setCustomerWallet] = useState<CustomerWallet | null>(null);
  const [showRewardsDrawer, setShowRewardsDrawer] = useState(false);
  const [redeemingId, setRedeemingId] = useState<number | null>(null);

  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>([]);
  const [showHeld, setShowHeld] = useState(false);

  const [unpaidOrders, setUnpaidOrders] = useState<Order[]>([]);
  const [showUnpaid, setShowUnpaid] = useState(false);
  const [unpaidLoading, setUnpaidLoading] = useState(false);

  const [checkoutCustomer, setCheckoutCustomer] = useState<Customer | null>(null);
  const [checkoutWalletData, setCheckoutWalletData] = useState<CustomerWallet | null>(null);
  const [showCheckoutDiscounts, setShowCheckoutDiscounts] = useState(false);
  const [checkoutDiscountsApplied, setCheckoutDiscountsApplied] = useState<{ voucher?: unknown; reward?: unknown; wallet?: number }>({});
  const [applyingDiscount, setApplyingDiscount] = useState(false);

  const [showQrScanner, setShowQrScanner] = useState(false);
  const [qrScanMode, setQrScanMode] = useState<"table" | "customer">("table");
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [menuSearchInput, setMenuSearchInput] = useState("");

  const storeId = Number(typeof window !== "undefined" ? localStorage.getItem("staffStoreId") || "0" : "0");
  const crewName = typeof window !== "undefined" ? localStorage.getItem("staffName") || "Staff" : "Staff";

  const fetchUnpaidOrders = useCallback(async () => {
    if (!storeId) return;
    setUnpaidLoading(true);
    try {
      const data = await getOrders(storeId, undefined);
      const list = Array.isArray(data) ? data : [];
      const unpaid = list.filter((o: { payment_status?: string; status?: string }) => {
        const ps = o.payment_status;
        return ps !== "paid" && ps !== "captured" && ps !== "settled" && ps !== "authorized"
          && !o.status?.includes("cancelled") && !o.status?.includes("delivered");
      });
      setUnpaidOrders(unpaid);
    } catch (e) { console.error("Failed to load unpaid orders:", e); }
    finally { setUnpaidLoading(false); }
  }, [storeId]);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [itemsData, catsData, tablesData] = await Promise.all([
          getMenuItems(),
          getMenuCategories(),
          getTables(storeId).catch((err) => { console.error("Failed to load tables:", err); return []; }),
        ]);
        if (!mounted) return;
        setItems((Array.isArray(itemsData) ? itemsData : []).filter((i: { is_available?: boolean }) => i.is_available));
        const cats = Array.isArray(catsData) ? catsData : [];
        setCategories(cats);
        if (cats.length > 0) setActiveCat(cats[0].id);
        setTables(Array.isArray(tablesData) ? tablesData : []);

        const held = localStorage.getItem("pos_held_orders");
        if (held) {
          try { setHeldOrders(JSON.parse(held)); } catch (e) { console.error("Failed to parse held orders:", e); setHeldOrders([]); }
        }

        if (checkoutOrderId) {
          const order = await getOrderById(checkoutOrderId);
          if (mounted) setCheckoutOrder(order);
        }
      } catch (e: unknown) {
        if (mounted) setError((e as Error).message);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [storeId, checkoutOrderId]);

  const filteredItems = menuSearch
    ? items.filter((i) => i.item_name.toLowerCase().includes(menuSearch.toLowerCase()))
    : activeCat
    ? items.filter((i) => i.category_id === activeCat)
    : items;

  const customerSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchCustomersDebounced = useCallback((q: string) => {
    if (customerSearchTimerRef.current) clearTimeout(customerSearchTimerRef.current);
    if (q.length < 2) { setSearchResults([]); return; }
    customerSearchTimerRef.current = setTimeout(async () => {
      try {
        const data = await searchCustomers(q);
        setSearchResults((Array.isArray(data) ? data : []).slice(0, 5));
      } catch (e: unknown) { console.error("Customer search failed:", e); setSearchResults([]); }
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      if (customerSearchTimerRef.current) clearTimeout(customerSearchTimerRef.current);
    };
  }, []);

  const loadCustomerWallet = async (customerId: number) => {
    try {
      const data = await getCustomerWallet(customerId);
      setCustomerWallet(data);
    } catch (e) { console.error("Failed to load customer wallet:", e); setCustomerWallet(null); }
  };

  const handleCustomerSelect = (c: Customer) => {
    setSelectedCustomer(c);
    setSearchQ(c.display_name);
    setSearchResults([]);
    loadCustomerWallet(c.id);
  };

  const handleCustomerQrScan = async (code: string) => {
    try {
      const data = await scanCustomerCode(code);
      const customer: Customer = {
        id: data.customer_id,
        display_name: data.customer_name,
        phone_number: data.customer_phone,
      };
      handleCustomerSelect(customer);
    } catch (e: unknown) {
      setError((e as Error).message || "Invalid customer QR");
    }
  };

  const handleBurnReward = async (reward: Reward) => {
    if (!selectedCustomer) return;
    setRedeemingId(reward.id);
    try {
      await useReward(selectedCustomer.id, reward.id, "Used at POS");
      setMsg("Reward redeemed!");
      if (selectedCustomer) loadCustomerWallet(selectedCustomer.id);
    } catch (e: unknown) { setError((e as Error).message); } finally { setRedeemingId(null); }
  };

  const handleBurnVoucher = async (voucher: Voucher) => {
    if (!selectedCustomer) return;
    setRedeemingId(voucher.id);
    try {
      await useVoucher(selectedCustomer.id, voucher.id, "Used at POS");
      setMsg("Voucher redeemed!");
      if (selectedCustomer) loadCustomerWallet(selectedCustomer.id);
    } catch (e: unknown) { setError((e as Error).message); } finally { setRedeemingId(null); }
  };

  const loadCheckoutCustomerData = async (customer: Customer) => {
    setCheckoutCustomer(customer);
    try {
      const walletData = await getCustomerWallet(customer.id);
      setCheckoutWalletData(walletData);
    } catch (e) { console.error("Failed to load checkout wallet:", e); setCheckoutWalletData(null); }
  };

  const handleCheckoutCustomerQrScan = async (code: string) => {
    try {
      const data = await scanCustomerCode(code);
      const customer: Customer = { id: data.customer_id, display_name: data.customer_name, phone_number: data.customer_phone };
      await loadCheckoutCustomerData(customer);
      setMsg("Customer linked for checkout");
    } catch (e: unknown) { setError((e as Error).message || "Invalid customer QR"); }
  };

  const handleApplyCheckoutVoucher = async (voucherCode: string) => {
    if (!checkoutOrderId) return;
    setApplyingDiscount(true);
    try {
      const res = await applyOrderVoucher(checkoutOrderId, voucherCode);
      setCheckoutDiscountsApplied((prev) => ({ ...prev, voucher: res }));
      setMsg((res as { message?: string }).message || "Voucher applied");
      const updated = await getOrderById(checkoutOrderId);
      setCheckoutOrder(updated);
    } catch (e: unknown) { setError((e as Error).message || "Failed to apply voucher"); }
    finally { setApplyingDiscount(false); }
  };

  const handleApplyCheckoutReward = async (rewardId: number) => {
    if (!checkoutOrderId) return;
    setApplyingDiscount(true);
    try {
      const res = await applyOrderReward(checkoutOrderId, rewardId);
      setCheckoutDiscountsApplied((prev) => ({ ...prev, reward: res }));
      setMsg((res as { message?: string }).message || "Reward applied");
      const updated = await getOrderById(checkoutOrderId);
      setCheckoutOrder(updated);
    } catch (e: unknown) { setError((e as Error).message || "Failed to apply reward"); }
    finally { setApplyingDiscount(false); }
  };

  const handleCheckoutWalletPayment = async (amount: number) => {
    if (!checkoutOrderId) return;
    setApplyingDiscount(true);
    try {
      const res = await payWithWallet(checkoutOrderId, amount);
      setCheckoutDiscountsApplied((prev) => ({ ...prev, wallet: (prev.wallet || 0) + amount }));
      setMsg((res as { message?: string }).message || "Wallet payment applied");
      const updated = await getOrderById(checkoutOrderId);
      setCheckoutOrder(updated);
      if (checkoutCustomer) loadCheckoutCustomerData(checkoutCustomer);
    } catch (e: unknown) { setError((e as Error).message || "Wallet payment failed"); }
    finally { setApplyingDiscount(false); }
  };

  const addToCart = (item: MenuItem, modifiers: Record<number, number[]> = {}, modifierLabel = "", qty = 1) => {
    const modPrice = Object.values(modifiers).flat().reduce((sum, modId) => {
      for (const g of item.modifier_groups || []) {
        const m = g.options.find((x) => x.id === modId);
        if (m) return sum + m.price_adjustment;
      }
      return sum;
    }, 0);

    setCart((prev) => {
      const existing = prev.find((c) => c.menu_item_id === item.id && JSON.stringify(c.modifier_ids) === JSON.stringify(Object.values(modifiers).flat()));
      if (existing) {
        return prev.map((c) => c.menu_item_id === item.id && JSON.stringify(c.modifier_ids) === JSON.stringify(Object.values(modifiers).flat()) ? { ...c, qty: c.qty + qty } : c);
      }
      return [...prev, {
        menu_item_id: item.id,
        name: item.item_name,
        qty,
        price: item.base_price + modPrice,
        modifier_ids: Object.values(modifiers).flat(),
        modifiers_label: modifierLabel,
      }];
    });
  };

  const handleItemClick = (item: MenuItem) => {
    if (item.modifier_groups && item.modifier_groups.length > 0) {
      setModifierItem(item);
      setSelectedModifiers({});
      setModifierQty(1);
    } else {
      addToCart(item);
      if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20);
    }
  };

  const applyModifiers = () => {
    if (!modifierItem) return;
    const label = Object.entries(selectedModifiers)
      .flatMap(([groupId, modIds]) => {
        const group = modifierItem.modifier_groups?.find((g) => g.id === Number(groupId));
        return modIds.map((id) => group?.options.find((m) => m.id === id)?.option_name).filter(Boolean);
      })
      .join(", ");
    addToCart(modifierItem, selectedModifiers, label, modifierQty);
    setModifierItem(null);
    setModifierQty(1);
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(20);
  };

  const removeFromCart = (menu_item_id: number, modifier_ids: number[]) => {
    setCart((prev) => prev.filter((c) => !(c.menu_item_id === menu_item_id && JSON.stringify(c.modifier_ids) === JSON.stringify(modifier_ids))));
  };

  const updateQty = (menu_item_id: number, modifier_ids: number[], delta: number) => {
    setCart((prev) => prev.map((c) => {
      if (c.menu_item_id !== menu_item_id || JSON.stringify(c.modifier_ids) !== JSON.stringify(modifier_ids)) return c;
      const newQty = Math.max(0, c.qty + delta);
      return newQty === 0 ? null : { ...c, qty: newQty };
    }).filter(Boolean) as CartItem[]);
  };

  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const discountValue = discountType === "percentage" ? subtotal * (discountAmount / 100) : discountAmount;
  const total = Math.max(0, subtotal - discountValue);
  const tenderedVal = paymentMethod === "cash" && amountTendered ? parseFloat(amountTendered) : NaN;
  const change = !isNaN(tenderedVal) ? Math.max(0, tenderedVal - total) : 0;

  const handleSendToKitchen = async () => {
    if (cart.length === 0) { setError("Cart is empty"); return; }
    if (orderType === "dine_in" && !tableId) { setError("Please assign a table for dine-in orders"); return; }
    setSaving(true);
    try {
      const res = await createPosOrder({
        customer_id: selectedCustomer?.id || null,
        dining_table_id: tableId || undefined,
        order_type: orderType,
        line_items: cart.map((c) => ({ menu_item_id: c.menu_item_id, quantity: c.qty, modifier_ids: c.modifier_ids, notes: c.modifiers_label })),
        order_notes: orderNotes,
      });
      setResult(res);
      setState("done");
    } catch (e: unknown) { setError((e as Error).message); } finally { setSaving(false); }
  };

  const handleCheckout = async () => {
    if (!checkoutOrderId) return;
    const orderBase = (checkoutOrder as { total_amount?: number; total?: number })?.total_amount || (checkoutOrder as { total?: number })?.total || 0;
    const manualDisc = discountType === "percentage" ? orderBase * (discountAmount / 100) : discountAmount;
    const walletPaid = checkoutDiscountsApplied.wallet || 0;
    const finalTotal = Math.max(0, orderBase - manualDisc - walletPaid);
    setSaving(true);
    try {
      await updateOrderPayment(checkoutOrderId, {
        payment_method: paymentMethod,
        amount_tendered: paymentMethod === "cash" ? (parseFloat(amountTendered || String(finalTotal)) || finalTotal) : finalTotal,
        amount: finalTotal,
        discount_amount: manualDisc,
        discount_type: discountType,
      });
      setResult({ order_id: checkoutOrderId, order_number: (checkoutOrder as { order_number?: string })?.order_number, total: finalTotal });
      setState("done");
    } catch (e: unknown) { setError((e as Error).message); } finally { setSaving(false); }
  };

  const holdOrder = () => {
    if (cart.length === 0) return;
    const held: HeldOrder = {
      id: `held_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      cart: [...cart],
      tableId,
      customer: selectedCustomer,
      orderType,
      notes: orderNotes,
      createdAt: Date.now(),
      crewName,
    };
    setHeldOrders((prev) => {
      const updated = [...prev.filter((h) => Date.now() - h.createdAt < 2 * 60 * 60 * 1000), held];
      localStorage.setItem("pos_held_orders", JSON.stringify(updated));
      return updated;
    });
    setMsg("Order parked successfully");
    newOrder();
  };

  const recallOrder = (held: HeldOrder) => {
    setCart(held.cart);
    setTableId(held.tableId);
    setSelectedCustomer(held.customer);
    setOrderType(held.orderType);
    setOrderNotes(held.notes);
    setShowHeld(false);
  };

  const newOrder = () => {
    setState("menu");
    setCart([]);
    setSelectedCustomer(null);
    setTableId(null);
    setOrderType("dine_in");
    setPaymentMethod("cash");
    setAmountTendered("");
    setDiscountAmount(0);
    setResult(null);
    setMsg("");
    setError("");
    setOrderNotes("");
    setCheckoutOrder(null);
    setMode("new_order");
    router.replace("/pos");
  };

  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null);
  const scannerMountedRef = useRef(true);
  const scannerStartingRef = useRef(false);
  useEffect(() => {
    return () => {
      scannerMountedRef.current = false;
      if (scannerRef.current) {
        scannerRef.current.stop().catch((err: unknown) => console.error("Scanner stop failed:", err));
        scannerRef.current = null;
      }
    };
  }, []);
  const [scannerError, setScannerError] = useState("");

  const startScanner = async () => {
    if (scannerRef.current || scannerStartingRef.current) return;
    scannerStartingRef.current = true;
    setScannerError("");
    setShowQrScanner(true);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (!scannerMountedRef.current) return;
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText: string) => {
          if (qrScanMode === "customer") {
            const custMatch = decodedText.match(/loka:customer:(\d+)/);
            let customerId: number | null = null;
            if (custMatch) {
              customerId = parseInt(custMatch[1], 10);
            } else {
              const rawId = parseInt(decodedText.trim(), 10);
              if (!isNaN(rawId)) customerId = rawId;
            }
            if (customerId) {
              const customer: Customer = { id: customerId, display_name: `Customer #${customerId}`, phone_number: "" };
              if (mode === "checkout") {
                loadCheckoutCustomerData(customer);
                setMsg("Customer linked for checkout");
              } else {
                handleCustomerSelect(customer);
              }
              setShowQrScanner(false);
              scanner.stop().catch((err: unknown) => console.error("Scanner stop failed:", err));
            }
            return;
          }
          const match = decodedText.match(/loka:table:(.+)/);
          if (match) {
            const token = match[1];
            const table = tables.find((t) => t.qr_code_token === token);
            if (table) {
              setTableId(table.id);
              setShowQrScanner(false);
              scanner.stop().catch((err: unknown) => console.error("Scanner stop failed:", err));
              return;
            }
          }
          const tableNum = tables.find((t) => t.table_number === decodedText.trim());
          if (tableNum) {
            setTableId(tableNum.id);
            setShowQrScanner(false);
            scanner.stop().catch((err: unknown) => console.error("Scanner stop failed:", err));
          }
        },
        () => {}
      );
    } catch (e: unknown) {
      if (!scannerMountedRef.current) return;
      console.error("Scanner start failed:", e);
      const msg = (e as { message?: string })?.message || String(e);
      if (msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("notallowed") || msg.toLowerCase().includes("denied")) {
        setScannerError("Camera permission denied. Please allow camera access in your browser settings.");
      } else if (msg.toLowerCase().includes("notfound") || msg.toLowerCase().includes("no camera")) {
        setScannerError("No camera found. Please connect a camera device.");
      } else {
        setScannerError("Could not start camera. " + msg);
      }
    } finally {
      scannerStartingRef.current = false;
    }
  };

  const stopScanner = () => {
    if (scannerRef.current) {
      scannerRef.current.stop().catch((err: unknown) => console.error("Scanner stop failed:", err));
      scannerRef.current = null;
    }
    setShowQrScanner(false);
  };

  return {
    router,
    mode, setMode,
    state, setState,
    categories, setCategories,
    items, setItems,
    tables, setTables,
    activeCat, setActiveCat,
    loading, setLoading,
    error, setError,
    msg, setMsg,
    cart, setCart,
    selectedCustomer, setSelectedCustomer,
    tableId, setTableId,
    orderType, setOrderType,
    orderNotes, setOrderNotes,
    searchQ, setSearchQ,
    searchResults, setSearchResults,
    menuSearch, setMenuSearch,
    modifierItem, setModifierItem,
    selectedModifiers, setSelectedModifiers,
    modifierQty, setModifierQty,
    paymentMethod, setPaymentMethod,
    amountTendered, setAmountTendered,
    discountAmount, setDiscountAmount,
    discountType, setDiscountType,
    saving, setSaving,
    result, setResult,
    checkoutOrder, setCheckoutOrder,
    customerWallet, setCustomerWallet,
    showRewardsDrawer, setShowRewardsDrawer,
    redeemingId, setRedeemingId,
    heldOrders, setHeldOrders,
    showHeld, setShowHeld,
    unpaidOrders, setUnpaidOrders,
    showUnpaid, setShowUnpaid,
    unpaidLoading, setUnpaidLoading,
    checkoutCustomer, setCheckoutCustomer,
    checkoutWalletData, setCheckoutWalletData,
    showCheckoutDiscounts, setShowCheckoutDiscounts,
    checkoutDiscountsApplied, setCheckoutDiscountsApplied,
    applyingDiscount, setApplyingDiscount,
    showQrScanner, setShowQrScanner,
    qrScanMode, setQrScanMode,
    searchTimerRef,
    menuSearchInput, setMenuSearchInput,
    storeId, crewName,
    fetchUnpaidOrders,
    filteredItems,
    searchCustomersDebounced,
    loadCustomerWallet,
    handleCustomerSelect,
    handleCustomerQrScan,
    handleBurnReward,
    handleBurnVoucher,
    loadCheckoutCustomerData,
    handleCheckoutCustomerQrScan,
    handleApplyCheckoutVoucher,
    handleApplyCheckoutReward,
    handleCheckoutWalletPayment,
    addToCart,
    handleItemClick,
    applyModifiers,
    removeFromCart,
    updateQty,
    subtotal,
    discountValue,
    total,
    tenderedVal,
    change,
    handleSendToKitchen,
    handleCheckout,
    holdOrder,
    recallOrder,
    newOrder,
    scannerRef,
    scannerError, setScannerError,
    startScanner,
    stopScanner,
    checkoutOrderId,
  };
}
