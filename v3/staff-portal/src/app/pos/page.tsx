"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getMenuItems, getMenuCategories, getTables, searchCustomers, getOrders,
  createPosOrder, getOrderById, updateOrderPayment, getCustomerWallet, scanCustomerCode,
  useVoucher, useReward, applyOrderVoucher, applyOrderReward, payWithWallet,
  type MenuItem, type Category, type Modifier, type ModifierGroup, type CartItem, type Customer, type Table,
  type CustomerWallet, type Voucher, type Reward, type Order
} from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import Alert from "@/components/Alert";
import Drawer from "@/components/Drawer";
import Modal from "@/components/Modal";
import EmptyState from "@/components/EmptyState";
import SkeletonCard from "@/components/SkeletonCard";
import NumericKeypad from "@/components/NumericKeypad";
import {
  Search, QrCode, Plus, Minus, Trash2, CreditCard, X,
  UtensilsCrossed, ShoppingCart, Send, Receipt, Banknote, Smartphone,
  Pause, RotateCcw, Printer, Archive, CheckCircle, User,
  Gift, Ticket, Coins, ImageOff, Wallet
} from "lucide-react";

type PosMode = "new_order" | "checkout";
type PosState = "menu" | "payment" | "done";
type PaymentMethod = "cash" | "card" | "qr";

interface HeldOrder {
  id: string;
  cart: CartItem[];
  tableId: number | null;
  customer: Customer | null;
  orderType: string;
  notes: string;
  createdAt: number;
  crewName: string;
}

export default function PosPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const checkoutOrderId = searchParams.get("checkout");
  const initialTableId = searchParams.get("table");
  const initialOrderType = searchParams.get("type") || "dine_in";

  const [mode, setMode] = useState<PosMode>(checkoutOrderId ? "checkout" : "new_order");
  const [state, setState] = useState<PosState>("menu");

  // Data
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [activeCat, setActiveCat] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  // Cart / Order
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [tableId, setTableId] = useState<number | null>(initialTableId ? Number(initialTableId) : null);
  const [orderType, setOrderType] = useState<string>(initialOrderType);
  const [orderNotes, setOrderNotes] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [menuSearch, setMenuSearch] = useState("");

  // Modifiers
  const [modifierItem, setModifierItem] = useState<MenuItem | null>(null);
  const [selectedModifiers, setSelectedModifiers] = useState<Record<number, number[]>>({});
  const [modifierQty, setModifierQty] = useState(1);

  // Payment
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [amountTendered, setAmountTendered] = useState("");
  const [discountAmount, setDiscountAmount] = useState(0);
  const [discountType, setDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<any>(null);

  // Checkout mode
  const [checkoutOrder, setCheckoutOrder] = useState<any>(null);

  // Customer wallet (rewards/vouchers)
  const [customerWallet, setCustomerWallet] = useState<CustomerWallet | null>(null);
  const [showRewardsDrawer, setShowRewardsDrawer] = useState(false);
  const [redeemingId, setRedeemingId] = useState<number | null>(null);

  // Hold orders
  const [heldOrders, setHeldOrders] = useState<HeldOrder[]>([]);
  const [showHeld, setShowHeld] = useState(false);

  // Unpaid orders
  const [unpaidOrders, setUnpaidOrders] = useState<Order[]>([]);
  const [showUnpaid, setShowUnpaid] = useState(false);
  const [unpaidLoading, setUnpaidLoading] = useState(false);

  // Checkout customer / discounts
  const [checkoutCustomer, setCheckoutCustomer] = useState<Customer | null>(null);
  const [checkoutWalletData, setCheckoutWalletData] = useState<CustomerWallet | null>(null);
  const [showCheckoutDiscounts, setShowCheckoutDiscounts] = useState(false);
  const [checkoutDiscountsApplied, setCheckoutDiscountsApplied] = useState<{ voucher?: any; reward?: any; wallet?: number }>({});
  const [applyingDiscount, setApplyingDiscount] = useState(false);

  // QR Scanner
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
      const unpaid = list.filter((o: any) => {
        const ps = o.payment_status;
        return ps !== "paid" && ps !== "captured" && ps !== "settled" && ps !== "authorized"
          && !o.status.includes("cancelled") && !o.status.includes("delivered");
      });
      setUnpaidOrders(unpaid);
    } catch (e) { console.error("Failed to load unpaid orders:", e); }
    finally { setUnpaidLoading(false); }
  }, [storeId]);

  // Load data
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
        setItems((Array.isArray(itemsData) ? itemsData : []).filter((i: any) => i.is_available));
        const cats = Array.isArray(catsData) ? catsData : [];
        setCategories(cats);
        if (cats.length > 0) setActiveCat(cats[0].id);
        setTables(Array.isArray(tablesData) ? tablesData : []);

        // Load held orders
        const held = localStorage.getItem("pos_held_orders");
        if (held) {
          try { setHeldOrders(JSON.parse(held)); } catch { setHeldOrders([]); }
        }

        // Checkout mode: load existing order
        if (checkoutOrderId) {
          const order = await getOrderById(checkoutOrderId);
          if (mounted) setCheckoutOrder(order);
        }
      } catch (e: any) {
        if (mounted) setError(e.message);
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
      } catch (e: any) { console.error("Customer search failed:", e); setSearchResults([]); }
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
    } catch (e: any) {
      setError(e.message || "Invalid customer QR");
    }
  };

  const handleBurnReward = async (reward: Reward) => {
    if (!selectedCustomer) return;
    setRedeemingId(reward.id);
    try {
      await useReward(selectedCustomer.id, reward.id, "Used at POS");
      setMsg("Reward redeemed!");
      if (selectedCustomer) loadCustomerWallet(selectedCustomer.id);
    } catch (e: any) { setError(e.message); } finally { setRedeemingId(null); }
  };

  const handleBurnVoucher = async (voucher: Voucher) => {
    if (!selectedCustomer) return;
    setRedeemingId(voucher.id);
    try {
      await useVoucher(selectedCustomer.id, voucher.id, "Used at POS");
      setMsg("Voucher redeemed!");
      if (selectedCustomer) loadCustomerWallet(selectedCustomer.id);
    } catch (e: any) { setError(e.message); } finally { setRedeemingId(null); }
  };

  // ── Checkout customer / discount helpers ──
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
    } catch (e: any) { setError(e.message || "Invalid customer QR"); }
  };

  const handleApplyCheckoutVoucher = async (voucherCode: string) => {
    if (!checkoutOrderId) return;
    setApplyingDiscount(true);
    try {
      const res = await applyOrderVoucher(checkoutOrderId, voucherCode);
      setCheckoutDiscountsApplied((prev) => ({ ...prev, voucher: res }));
      setMsg(res.message || "Voucher applied");
      const updated = await getOrderById(checkoutOrderId);
      setCheckoutOrder(updated);
    } catch (e: any) { setError(e.message || "Failed to apply voucher"); }
    finally { setApplyingDiscount(false); }
  };

  const handleApplyCheckoutReward = async (rewardId: number) => {
    if (!checkoutOrderId) return;
    setApplyingDiscount(true);
    try {
      const res = await applyOrderReward(checkoutOrderId, rewardId);
      setCheckoutDiscountsApplied((prev) => ({ ...prev, reward: res }));
      setMsg(res.message || "Reward applied");
      const updated = await getOrderById(checkoutOrderId);
      setCheckoutOrder(updated);
    } catch (e: any) { setError(e.message || "Failed to apply reward"); }
    finally { setApplyingDiscount(false); }
  };

  const handleCheckoutWalletPayment = async (amount: number) => {
    if (!checkoutOrderId) return;
    setApplyingDiscount(true);
    try {
      const res = await payWithWallet(checkoutOrderId, amount);
      setCheckoutDiscountsApplied((prev) => ({ ...prev, wallet: (prev.wallet || 0) + amount }));
      setMsg(res.message || "Wallet payment applied");
      const updated = await getOrderById(checkoutOrderId);
      setCheckoutOrder(updated);
      if (checkoutCustomer) loadCheckoutCustomerData(checkoutCustomer);
    } catch (e: any) { setError(e.message || "Wallet payment failed"); }
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
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
  };

  const handleCheckout = async () => {
    if (!checkoutOrderId) return;
    const orderBase = checkoutOrder?.total_amount || checkoutOrder?.total || 0;
    const manualDisc = discountType === "percentage" ? orderBase * (discountAmount / 100) : discountAmount;
    const remainingAfterManual = Math.max(0, orderBase - manualDisc);
    const walletPaid = checkoutDiscountsApplied.wallet || 0;
    const finalTotal = Math.max(0, remainingAfterManual - walletPaid);
    setSaving(true);
    try {
      await updateOrderPayment(checkoutOrderId, {
        payment_method: paymentMethod,
        amount_tendered: paymentMethod === "cash" ? (parseFloat(amountTendered || String(finalTotal)) || finalTotal) : finalTotal,
        amount: finalTotal,
        discount_amount: manualDisc,
        discount_type: discountType,
      });
      setResult({ order_id: checkoutOrderId, order_number: checkoutOrder?.order_number, total: finalTotal });
      setState("done");
    } catch (e: any) { setError(e.message); } finally { setSaving(false); }
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
    // Clear query params
    router.replace("/pos");
  };

  // QR Scanner using html5-qrcode
  const scannerRef = useRef<any>(null);
  useEffect(() => {
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch((err: any) => console.error("Scanner stop failed:", err));
        scannerRef.current = null;
      }
    };
  }, []);
  const [scannerError, setScannerError] = useState("");
  const startScanner = async () => {
    setScannerError("");
    setShowQrScanner(true);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText: string) => {
        if (qrScanMode === "customer") {
          // Parse loka:customer:ID
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
            scanner.stop().catch((err: any) => console.error("Scanner stop failed:", err));
          }
          return;
        }
        // Parse loka:table:TOKEN or table number
        const match = decodedText.match(/loka:table:(.+)/);
        if (match) {
          const token = match[1];
          const table = tables.find((t) => t.qr_code_token === token);
          if (table) {
            setTableId(table.id);
            setShowQrScanner(false);
            scanner.stop().catch((err: any) => console.error("Scanner stop failed:", err));
            return;
          }
        }
        // Try direct table number
        const tableNum = tables.find((t) => t.table_number === decodedText.trim());
        if (tableNum) {
          setTableId(tableNum.id);
          setShowQrScanner(false);
          scanner.stop().catch((err: any) => console.error("Scanner stop failed:", err));
        }
      },
        () => {}
      );
    } catch (e: any) {
      console.error("Scanner start failed:", e);
      const msg = e?.message || String(e);
      if (msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("notallowed") || msg.toLowerCase().includes("denied")) {
        setScannerError("Camera permission denied. Please allow camera access in your browser settings.");
      } else if (msg.toLowerCase().includes("notfound") || msg.toLowerCase().includes("no camera")) {
        setScannerError("No camera found. Please connect a camera device.");
      } else {
        setScannerError("Could not start camera. " + msg);
      }
    }
  };

  const stopScanner = () => {
    if (scannerRef.current) {
      scannerRef.current.stop().catch((err: any) => console.error("Scanner stop failed:", err));
      scannerRef.current = null;
    }
    setShowQrScanner(false);
  };

  // ── Success Screen ──
  if (state === "done" && result) {
    return (
      <div style={{ padding: 24, maxWidth: 500, margin: "0 auto", textAlign: "center" }}>
        <div style={{ fontSize: 56, marginBottom: 16, color: "var(--color-success)" }}><CheckCircle size={56} /></div>
        <h2 style={{ margin: "0 0 4px" }}>{mode === "checkout" ? "Payment Successful" : "Order Sent to Kitchen"}</h2>
        <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>#{result.order_number || result.order_id}</p>
        <p style={{ fontSize: 13, opacity: 0.7, margin: "4px 0 0" }}>
          {mode === "checkout" ? `${paymentMethod.toUpperCase()}` : "Kitchen notified"} · Total: RM {(result.total ?? total).toFixed(2)}
        </p>
        {change > 0 && <p style={{ fontSize: 13, opacity: 0.7 }}>Change: RM {change.toFixed(2)}</p>}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 24 }}>
          <button className="btn btn-primary" style={{ padding: "14px", fontSize: 16 }} onClick={newOrder}>
            <ShoppingCart size={18} /> New Order
          </button>
          {mode === "checkout" && (
            <>
              <button className="btn btn-outline" disabled title="Printer integration pending">
                <Printer size={16} /> Print Receipt
              </button>
              {paymentMethod === "cash" && (
                <button className="btn btn-outline" disabled title="Cash drawer integration pending">
                  <Archive size={16} /> Open Cash Drawer
                </button>
              )}
            </>
          )}
          {mode === "new_order" && (
            <button className="btn btn-outline" disabled title="Kitchen ticket printing pending">
              <Receipt size={16} /> Print Kitchen Ticket
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Checkout Mode ──
  if (mode === "checkout" && checkoutOrder) {
    const originalTotal = (checkoutOrder.total_amount || checkoutOrder.total || 0) + (checkoutOrder.voucher_discount || 0) + (checkoutOrder.reward_discount || 0) + (checkoutOrder.discount_amount || 0);
    const voucherDisc = checkoutOrder.voucher_discount || 0;
    const rewardDisc = checkoutOrder.reward_discount || 0;
    const orderBase = checkoutOrder.total_amount || checkoutOrder.total || 0;
    const manualDisc = discountType === "percentage" ? orderBase * (discountAmount / 100) : discountAmount;
    const walletPaid = checkoutDiscountsApplied.wallet || 0;
    const remainingTotal = Math.max(0, (checkoutOrder.total_amount || checkoutOrder.total || 0) - manualDisc);
    const checkoutTotal = Math.max(0, remainingTotal - walletPaid);

    return (
      <div style={{ padding: 24, maxWidth: 600, margin: "0 auto" }}>
        <PageHeader title="Checkout" subtitle={checkoutOrder.order_number} />
        {error && <Alert variant="error" onDismiss={() => setError("")}>{error}</Alert>}
        {msg && <Alert variant="success" onDismiss={() => setMsg("")} autoDismiss={3000}>{msg}</Alert>}

        {/* Customer Identification */}
        {!checkoutCustomer ? (
          <div className="card" style={{ marginBottom: 16 }}>
            <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700 }}>Customer</h4>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => { setQrScanMode("customer"); setShowQrScanner(true); }}>
                <QrCode size={14} /> Scan Customer
              </button>
              <span style={{ fontSize: 12, color: "var(--color-text-muted)", alignSelf: "center" }}>or search to apply rewards/vouchers</span>
            </div>
          </div>
        ) : (
          <div className="card" style={{ marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <User size={16} />
              <span style={{ fontWeight: 600 }}>{checkoutCustomer.display_name}</span>
              {checkoutWalletData && (
                <span className="badge badge-sm badge-outline">Wallet: RM {checkoutWalletData.balance.toFixed(2)}</span>
              )}
            </div>
            <button className="btn btn-ghost btn-sm" onClick={() => { setCheckoutCustomer(null); setCheckoutWalletData(null); }}>
              <X size={14} /> Change
            </button>
          </div>
        )}

        <div className="card" style={{ marginBottom: 16 }}>
          <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700 }}>Order Summary</h4>
          <div className="table-container" style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--color-border-light)", marginBottom: 12 }}>
            <table className="data-table">
              <thead><tr><th>Item</th><th style={{ textAlign: "center" }}>Qty</th><th style={{ textAlign: "right" }}>Price</th></tr></thead>
              <tbody>
                {(checkoutOrder.line_items || checkoutOrder.items || []).map((li: any) => (
                  <tr key={`${li.menu_item_id || li.id || li.item_name}-${li.modifiers_label || "none"}`}>
                    <td>{li.item_name || li.name}</td>
                    <td style={{ textAlign: "center" }}>{li.quantity}</td>
                    <td style={{ textAlign: "right" }}>RM {Number(li.unit_price || li.price || 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
            <span>Subtotal</span><span>RM {originalTotal.toFixed(2)}</span>
          </div>
          {voucherDisc > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "var(--color-success)", marginBottom: 4 }}>
              <span>Voucher Discount</span><span>-RM {voucherDisc.toFixed(2)}</span>
            </div>
          )}
          {rewardDisc > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "var(--color-success)", marginBottom: 4 }}>
              <span>Reward Discount</span><span>-RM {rewardDisc.toFixed(2)}</span>
            </div>
          )}
          {manualDisc > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "var(--color-success)", marginBottom: 4 }}>
              <span>Staff Discount</span><span>-RM {manualDisc.toFixed(2)}</span>
            </div>
          )}
          {walletPaid > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, color: "var(--color-info)", marginBottom: 4 }}>
              <span>Wallet Payment</span><span>-RM {walletPaid.toFixed(2)}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20, fontWeight: 700, marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--color-border-light)" }}>
            <span>Total Due</span><span>RM {checkoutTotal.toFixed(2)}</span>
          </div>
        </div>

        {/* Apply Discounts Button */}
        {checkoutCustomer && checkoutWalletData && (
          <button className="btn btn-outline w-full" style={{ marginBottom: 16 }} onClick={() => setShowCheckoutDiscounts(true)}>
            <Gift size={16} /> Apply Discounts & Wallet
          </button>
        )}

        {/* Manual Discount */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700 }}>Staff Discount</h4>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {["percentage", "fixed"].map((t) => (
              <button key={t} className={`btn btn-sm ${discountType === t ? "btn-primary" : "btn-ghost"}`} onClick={() => setDiscountType(t as any)}>
                {t === "percentage" ? "%" : "RM"}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {(discountType === "percentage" ? [5, 10, 15, 20] : [5, 10, 20, 50]).map((v) => (
              <button key={v} className={`btn btn-sm ${discountAmount === v ? "btn-primary" : "btn-ghost"}`} onClick={() => setDiscountAmount(v)}>
                {discountType === "percentage" ? `${v}%` : `RM ${v}`}
              </button>
            ))}
            <button className={`btn btn-sm ${discountAmount === 0 ? "btn-primary" : "btn-ghost"}`} onClick={() => setDiscountAmount(0)}>None</button>
          </div>
        </div>

        {/* Payment */}
        <div className="card" style={{ marginBottom: 16 }}>
          <h4 style={{ margin: "0 0 12px", fontSize: 14, fontWeight: 700 }}>Payment</h4>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {(["cash", "card", "qr"] as PaymentMethod[]).map((m) => (
              <button key={m} className={`btn flex-1 ${paymentMethod === m ? "btn-primary" : "btn-ghost"}`} onClick={() => setPaymentMethod(m)}>
                {m === "cash" ? <Banknote size={16} /> : m === "card" ? <CreditCard size={16} /> : <Smartphone size={16} />}
                {m.toUpperCase()}
              </button>
            ))}
          </div>

          {paymentMethod === "cash" && (
            <div>
              <div style={{ fontSize: 32, fontWeight: 700, textAlign: "center", marginBottom: 12 }}>RM {checkoutTotal.toFixed(2)}</div>
              <NumericKeypad
                onPress={(key) => setAmountTendered((prev) => prev + key)}
                onBackspace={() => setAmountTendered((prev) => prev.slice(0, -1))}
                onClear={() => setAmountTendered("")}
              />
              <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
                {[checkoutTotal, Math.ceil(checkoutTotal / 5) * 5, Math.ceil(checkoutTotal / 10) * 10].filter((v, i, a) => a.indexOf(v) === i).map((v) => (
                  <button key={v} className="btn btn-sm btn-ghost flex-1" onClick={() => setAmountTendered(String(v))}>RM {v.toFixed(0)}</button>
                ))}
              </div>
              {amountTendered && !isNaN(parseFloat(amountTendered)) && parseFloat(amountTendered) >= checkoutTotal && (
                <div style={{ marginTop: 12, fontSize: 16, color: "var(--color-success)", fontWeight: 700, textAlign: "center" }}>
                  Change: RM {Math.max(0, parseFloat(amountTendered) - checkoutTotal).toFixed(2)}
                </div>
              )}
            </div>
          )}

          {paymentMethod === "card" && (
            <div style={{ textAlign: "center", padding: 24 }}>
              <CreditCard size={48} style={{ opacity: 0.3, marginBottom: 12 }} />
              <p style={{ fontSize: 16, fontWeight: 600 }}>Tap / Swipe / Insert Card</p>
              <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Customer pays via card terminal</p>
            </div>
          )}

          {paymentMethod === "qr" && (
            <div style={{ textAlign: "center", padding: 24 }}>
              <Smartphone size={48} style={{ opacity: 0.3, marginBottom: 12 }} />
              <p style={{ fontSize: 16, fontWeight: 600 }}>Show QR to Customer</p>
              <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>Payment gateway QR integration pending</p>
              <div style={{ width: 200, height: 200, margin: "16px auto", background: "var(--color-bg-muted)", borderRadius: "var(--radius-md)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <QrCode size={64} style={{ opacity: 0.2 }} />
              </div>
            </div>
          )}
        </div>

        <button className="btn btn-primary btn-lg w-full" onClick={handleCheckout} disabled={saving || (paymentMethod === "cash" && checkoutTotal > 0 && (!amountTendered || isNaN(parseFloat(amountTendered)) || parseFloat(amountTendered) < checkoutTotal))}>
          {saving ? "Processing..." : checkoutTotal <= 0 ? "Complete Checkout" : `Confirm Payment — RM ${checkoutTotal.toFixed(2)}`}
        </button>

        {/* Checkout Discounts Drawer */}
        <Drawer open={showCheckoutDiscounts} onClose={() => setShowCheckoutDiscounts(false)} title="Apply Discounts & Wallet" position="bottom">
          {applyingDiscount && <div style={{ padding: 20, textAlign: "center" }}>Applying...</div>}
          {checkoutWalletData && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "0 0 20px" }}>
              {/* Wallet */}
              {checkoutWalletData.balance > 0 && (
                <div className="card" style={{ background: "var(--color-bg-muted)" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontWeight: 700 }}>Wallet Balance</span>
                    <span className="badge badge-primary">RM {checkoutWalletData.balance.toFixed(2)}</span>
                  </div>
                  {checkoutOrder.total_amount > 0 && (
                    <button
                      className="btn btn-primary w-full"
                      onClick={() => handleCheckoutWalletPayment(Math.min(checkoutWalletData.balance, checkoutOrder.total_amount))}
                    >
                      Pay RM {Math.min(checkoutWalletData.balance, checkoutOrder.total_amount).toFixed(2)} from Wallet
                    </button>
                  )}
                </div>
              )}

              {/* Vouchers */}
              {checkoutWalletData.vouchers && checkoutWalletData.vouchers.length > 0 && (
                <div>
                  <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Vouchers</h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {checkoutWalletData.vouchers.map((v: any) => (
                      <div key={v.id} className="card" style={{ padding: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{v.title || v.code}</div>
                          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                            {v.discount_type === "percent" ? `${v.discount_value}% off` : `RM ${v.discount_value} off`}
                            {v.min_spend ? ` · Min spend RM ${v.min_spend}` : ""}
                          </div>
                        </div>
                        <button className="btn btn-sm btn-primary" onClick={() => handleApplyCheckoutVoucher(v.code)}>
                          Apply
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Rewards */}
              {checkoutWalletData.rewards && checkoutWalletData.rewards.length > 0 && (
                <div>
                  <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Rewards</h4>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {checkoutWalletData.rewards.map((r: any) => (
                      <div key={r.id} className="card" style={{ padding: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{r.name || r.redemption_code}</div>
                          <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{r.points_spent} pts · Exp: {r.expires_at?.slice(0, 10)}</div>
                        </div>
                        <button className="btn btn-sm btn-primary" onClick={() => handleApplyCheckoutReward(r.id)}>
                          Apply
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Drawer>
      </div>
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
                className={`btn btn-sm ${orderType === t ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setOrderType(t)}
              >
                {t === "dine_in" ? "Dine-in" : t === "takeaway" ? "Takeaway" : "Delivery"}
              </button>
            ))}
          </div>
          {selectedCustomer && (
            <span className="badge badge-primary badge-sm flex items-center gap-1">
              <User size={10} /> {selectedCustomer.display_name}
            </span>
          )}
          {tableId && (
            <span className="badge badge-sm" style={{ background: "var(--color-accent-gold)", color: "#1E1B18" }}>
              Table {tables.find((t) => t.id === tableId)?.table_number || tableId}
            </span>
          )}
          <div style={{ flex: 1 }} />
          {cart.length > 0 && (
            <span style={{ fontSize: 15, fontWeight: 700 }}>RM {total.toFixed(2)}</span>
          )}
        </div>

        {/* Customer Search */}
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <div style={{ flex: 1, position: "relative" }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", opacity: 0.4 }} />
            <input
              className="form-input"
              style={{ paddingLeft: 34 }}
              value={searchQ}
              onChange={(e) => { setSearchQ(e.target.value); searchCustomersDebounced(e.target.value); }}
              placeholder="Search customer..."
            />
          </div>
          <button className="btn btn-ghost" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, padding: "8px 12px" }} onClick={() => { setQrScanMode("table"); startScanner(); }} aria-label="Scan table QR">
            <QrCode size={22} /> Scan Table
          </button>
          <button className="btn btn-ghost" style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, padding: "8px 12px" }} onClick={() => { setQrScanMode("customer"); startScanner(); }} aria-label="Scan customer QR">
            <User size={22} /> Scan Customer
          </button>
          <button className="btn btn-ghost" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, padding: "6px 10px" }} onClick={() => { fetchUnpaidOrders(); setShowUnpaid(true); }} aria-label="View unpaid orders">
            <Wallet size={16} /> Unpaid{unpaidOrders.length > 0 ? ` (${unpaidOrders.length})` : ""}
          </button>
          <button className="btn btn-ghost" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, padding: "6px 10px" }} onClick={() => setShowHeld(true)} aria-label="View parked orders">
            <Pause size={16} /> Park Order
          </button>
        </div>
        {searchResults.length > 0 && (
          <div style={{ background: "white", borderRadius: 8, marginTop: 4, boxShadow: "0 2px 8px rgba(0,0,0,0.1)", overflow: "hidden", position: "absolute", zIndex: 50, left: 16, right: 16, maxWidth: 400 }}>
            <button onClick={() => { setSelectedCustomer(null); setSearchQ(""); setSearchResults([]); setCustomerWallet(null); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", border: "none", borderBottom: "1px solid #eee", background: "white", cursor: "pointer", fontSize: 13, opacity: 0.6 }}>Walk-in (No Customer)</button>
            {searchResults.map((c) => (
              <button key={c.id} onClick={() => handleCustomerSelect(c)} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", border: "none", borderBottom: "1px solid #eee", background: "white", cursor: "pointer", fontSize: 13 }}>
                {c.display_name} · {c.phone_number}
              </button>
            ))}
          </div>
        )}

        {/* Table Picker */}
        {orderType === "dine_in" && (
          <div style={{ display: "flex", gap: 6, marginBottom: 8, overflowX: "auto" }}>
            <button className={`btn btn-sm ${tableId === null ? "btn-primary" : "btn-ghost"}`} onClick={() => setTableId(null)}>No Table</button>
            {tables.filter((t) => t.current_status === "available" || t.id === tableId).map((t) => (
              <button key={t.id} className={`btn btn-sm ${tableId === t.id ? "btn-primary" : "btn-ghost"}`} onClick={() => setTableId(t.id)}>
                {t.table_number}
              </button>
            ))}
          </div>
        )}

        {/* Category Tabs */}
        <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }}>
          <button className={`btn btn-sm ${activeCat === null && !menuSearch ? "btn-primary" : "btn-ghost"}`} onClick={() => { setActiveCat(null); setMenuSearch(""); }}>
            All ({items.length})
          </button>
          {categories.map((c) => {
            const count = items.filter((i) => i.category_id === c.id).length;
            return (
              <button key={c.id} className={`btn btn-sm ${activeCat === c.id ? "btn-primary" : "btn-ghost"}`} onClick={() => { setActiveCat(c.id); setMenuSearch(""); }}>
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
          value={menuSearchInput}
          onChange={(e) => {
            const val = e.target.value;
            setMenuSearchInput(val);
            if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
            searchTimerRef.current = setTimeout(() => setMenuSearch(val), 200);
          }}
          placeholder="Search menu items..."
        />
        {menuSearchInput && (
          <button className="btn btn-sm btn-ghost" onClick={() => { setMenuSearchInput(""); setMenuSearch(""); if (searchTimerRef.current) clearTimeout(searchTimerRef.current); }}>Clear</button>
        )}
      </div>

      {error && <Alert variant="error" onDismiss={() => setError("")}>{error}</Alert>}
      {msg && <Alert variant="success" onDismiss={() => setMsg("")} autoDismiss={3000}>{msg}</Alert>}

      {/* Menu Items */}
      <div style={{ flex: 1, overflow: "auto", padding: "12px 16px", paddingBottom: cart.length > 0 ? 300 : 16 }}>
        {loading ? (
          <SkeletonCard count={6} />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
            {filteredItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleItemClick(item)}
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
                {/* Image area */}
                <div style={{
                  width: "100%",
                  height: 120,
                  background: item.image_url ? "transparent" : "var(--color-bg-muted)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                }}>
                  {item.image_url && /^(https?:|\/|data:image)/i.test(item.image_url) ? (
                    <img
                      src={item.image_url}
                      alt={item.item_name}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      loading="lazy"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
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
                </div>
                {/* Text area */}
                <div style={{ padding: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, display: "block", marginBottom: 4, lineHeight: 1.3 }}>{item.item_name}</span>
                  <span style={{ fontSize: 14, color: "var(--color-primary)", fontWeight: 700 }}>RM {Number(item.base_price ?? 0).toFixed(2)}</span>
                </div>
              </button>
            ))}
            {filteredItems.length === 0 && (
              <div style={{ gridColumn: "1/-1", textAlign: "center", padding: 40, color: "var(--color-text-muted)" }}>
                No items found.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cart Panel */}
      {cart.length > 0 && (
        <div style={{ position: "sticky", bottom: 0, background: "var(--color-bg-card)", borderTop: "2px solid var(--color-border-light)", padding: "12px 16px", flexShrink: 0, boxShadow: "0 -4px 12px rgba(0,0,0,0.08)" }}>
          {/* Order Notes */}
          <input
            className="form-input"
            style={{ marginBottom: 10, fontSize: 13 }}
            placeholder="Order notes (e.g., Extra spicy, Allergies...)"
            value={orderNotes}
            onChange={(e) => setOrderNotes(e.target.value)}
          />

          {cart.map((c) => (
            <div key={`${c.menu_item_id}-${c.modifiers_label}`} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, padding: "6px 0", borderBottom: "1px solid var(--color-border-light)" }}>
              <span style={{ flex: 1, fontSize: 14 }}>
                <span style={{ fontWeight: 600 }}>{c.name}</span>
                {c.modifiers_label && <span style={{ fontSize: 12, color: "var(--color-text-muted)", display: "block", marginTop: 2 }}>{c.modifiers_label}</span>}
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <button className="btn btn-ghost btn-icon" style={{ width: 36, height: 36 }} onClick={() => updateQty(c.menu_item_id, c.modifier_ids, -1)} aria-label="Decrease quantity"><Minus size={16} /></button>
                <span style={{ minWidth: 28, textAlign: "center", fontSize: 16, fontWeight: 700 }}>{c.qty}</span>
                <button className="btn btn-ghost btn-icon" style={{ width: 36, height: 36 }} onClick={() => updateQty(c.menu_item_id, c.modifier_ids, 1)} aria-label="Increase quantity"><Plus size={16} /></button>
              </div>
              <span style={{ minWidth: 70, textAlign: "right", fontSize: 14, fontWeight: 700 }}>RM {((c.price ?? 0) * c.qty).toFixed(2)}</span>
              <button className="btn btn-ghost btn-icon btn-sm" style={{ color: "var(--color-error)", width: 32, height: 32 }} onClick={() => removeFromCart(c.menu_item_id, c.modifier_ids)} aria-label="Remove item"><Trash2 size={16} /></button>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--color-border-light)" }}>
            <div>
              <span style={{ fontSize: 18, fontWeight: 700 }}>RM {total.toFixed(2)}</span>
              <span style={{ fontSize: 12, color: "var(--color-text-muted)", marginLeft: 8 }}>{cart.reduce((s, c) => s + c.qty, 0)} items</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={holdOrder}><Pause size={14} /> Park</button>
              <button className="btn btn-primary" onClick={handleSendToKitchen} disabled={saving}>
                <Send size={16} /> {saving ? "Sending..." : "Send to Kitchen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modifier Drawer */}
      <Drawer open={!!modifierItem} onClose={() => setModifierItem(null)} title={modifierItem?.item_name} position="bottom">
        {modifierItem?.modifier_groups?.map((group) => (
          <div key={group.id} style={{ marginBottom: 20 }}>
            <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>
              {group.group_name}
              {group.is_required && <span style={{ color: "var(--color-error)", fontSize: 12 }}> *</span>}
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {group.options.map((mod) => {
                const isSelected = selectedModifiers[group.id]?.includes(mod.id);
                return (
                  <button
                    key={mod.id}
                    className={`btn ${isSelected ? "btn-primary" : "btn-ghost"}`}
                    style={{ justifyContent: "space-between" }}
                    onClick={() => {
                      setSelectedModifiers((prev) => {
                        const current = prev[group.id] || [];
                        if (group.selection_type === "multiple" || (group.max_selections ?? 1) > 1) {
                          return { ...prev, [group.id]: current.includes(mod.id) ? current.filter((id) => id !== mod.id) : [...current, mod.id] };
                        }
                        return { ...prev, [group.id]: [mod.id] };
                      });
                    }}
                  >
                    <span>{mod.option_name}</span>
                    {mod.price_adjustment > 0 && <span>+RM {mod.price_adjustment.toFixed(2)}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        <div style={{ borderTop: "1px solid var(--color-border-light)", paddingTop: 16, marginTop: 8 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Qty</span>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button className="btn btn-sm btn-ghost" onClick={() => setModifierQty((q) => Math.max(1, q - 1))} style={{ width: 36, padding: 0 }}>-</button>
                <span style={{ minWidth: 32, textAlign: "center", fontWeight: 700, fontSize: 16 }}>{modifierQty}</span>
                <button className="btn btn-sm btn-ghost" onClick={() => setModifierQty((q) => q + 1)} style={{ width: 36, padding: 0 }}>+</button>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>Total</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--color-primary)" }}>
                RM {(() => {
                  if (!modifierItem) return "0.00";
                  const modPrice = Object.values(selectedModifiers).flat().reduce((sum, modId) => {
                    for (const g of modifierItem.modifier_groups || []) {
                      const m = g.options.find((x) => x.id === modId);
                      if (m) return sum + m.price_adjustment;
                    }
                    return sum;
                  }, 0);
                  return ((modifierItem.base_price + modPrice) * modifierQty).toFixed(2);
                })()}
              </div>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn btn-ghost" onClick={() => { setModifierItem(null); setModifierQty(1); }}>Cancel</button>
            <button
              className="btn btn-primary"
              onClick={applyModifiers}
              disabled={modifierItem?.modifier_groups?.some((g) => g.is_required && !(selectedModifiers[g.id]?.length))}
            >
              Add to Cart
            </button>
          </div>
        </div>
      </Drawer>

      {/* QR Scanner Modal */}
      <Modal open={showQrScanner} onClose={stopScanner} title={qrScanMode === "customer" ? "Scan Customer QR" : "Scan Table QR"} size="sm">
        {scannerError ? (
          <div style={{ padding: 20, textAlign: "center" }}>
            <div style={{ fontSize: 14, color: "var(--color-error)", fontWeight: 600, marginBottom: 12 }}>{scannerError}</div>
            <button className="btn btn-primary" onClick={stopScanner}>Close</button>
          </div>
        ) : (
          <>
            <div id="qr-reader" style={{ width: "100%", minHeight: 250 }} />
            <p style={{ textAlign: "center", fontSize: 12, color: "var(--color-text-muted)", marginTop: 12 }}>
              Point camera at the QR code
            </p>
          </>
        )}
      </Modal>

      {/* Held Orders Drawer */}
      <Drawer open={showHeld} onClose={() => setShowHeld(false)} title="Parked Orders" position="bottom">
        {heldOrders.length === 0 ? (
          <EmptyState title="No parked orders" description="Orders you park will appear here for up to 2 hours." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {heldOrders.map((held) => (
              <div key={held.id} className="card" style={{ padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 14 }}>{held.crewName}</span>
                  <span style={{ fontSize: 12, color: "var(--color-text-muted)" }}>{(() => { const d = new Date(held.createdAt); return isNaN(d.getTime()) ? "—" : d.toLocaleTimeString(); })()}</span>
                </div>
                <div style={{ fontSize: 13, color: "var(--color-text-muted)", marginBottom: 8 }}>
                  {held.cart.length} items · RM {held.cart.reduce((s: number, ci: CartItem) => s + (ci.price ?? 0) * ci.qty, 0).toFixed(2)} · {held.orderType.replace("_", "-")}
                  {held.tableId && ` · Table ${tables.find((t) => t.id === held.tableId)?.table_number || held.tableId}`}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn btn-sm btn-primary flex-1" onClick={() => recallOrder(held)}><RotateCcw size={14} /> Recall</button>
                  <button className="btn btn-sm btn-danger" onClick={() => {
                    setHeldOrders((prev) => {
                      const updated = prev.filter((h) => h.id !== held.id);
                      localStorage.setItem("pos_held_orders", JSON.stringify(updated));
                      return updated;
                    });
                  }} aria-label="Delete held order"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Drawer>

      {/* Unpaid Orders Drawer */}
      <Drawer open={showUnpaid} onClose={() => setShowUnpaid(false)} title="Unpaid Orders" position="bottom">
        {unpaidLoading ? (
          <div style={{ padding: 20, textAlign: "center" }}>Loading...</div>
        ) : unpaidOrders.length === 0 ? (
          <EmptyState title="All paid up" description="No unpaid orders right now." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Takeaway / Delivery — flagged */}
            {unpaidOrders.filter((o: any) => o.order_type !== "dine_in").length > 0 && (
              <div>
                <h4 style={{ fontSize: 13, fontWeight: 700, color: "#DC2626", marginBottom: 8 }}>Needs Payment (Do Not Hand Over)</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {unpaidOrders.filter((o: any) => o.order_type !== "dine_in").map((order: any) => (
                    <div key={order.id} className="card" style={{ padding: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{order.order_number}</div>
                        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                          {order.order_type === "takeaway" ? "Takeaway" : "Delivery"} · {order.customer_name || "Walk-in"} · {order.item_count} items
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 700 }}>RM {(order.total_amount ?? 0).toFixed(2)}</div>
                        <button className="btn btn-sm btn-primary" style={{ marginTop: 4 }} onClick={() => { setShowUnpaid(false); router.push(`/pos?checkout=${order.id}`); }}>
                          Checkout
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Dine-in — normal */}
            {unpaidOrders.filter((o: any) => o.order_type === "dine_in").length > 0 && (
              <div>
                <h4 style={{ fontSize: 13, fontWeight: 700, color: "#D97706", marginBottom: 8 }}>Dine-in Checks (Pay After Meal)</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {unpaidOrders.filter((o: any) => o.order_type === "dine_in").map((order: any) => (
                    <div key={order.id} className="card" style={{ padding: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{order.order_number}</div>
                        <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                          Dine-in · {order.customer_name || "Walk-in"} · {order.table_number ? `Table ${order.table_number}` : "No table"}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 700 }}>RM {(order.total_amount ?? 0).toFixed(2)}</div>
                        <button className="btn btn-sm btn-primary" style={{ marginTop: 4 }} onClick={() => { setShowUnpaid(false); router.push(`/pos?checkout=${order.id}`); }}>
                          Checkout
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
