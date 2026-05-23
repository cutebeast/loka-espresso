"use client";

import { useState, useCallback, useRef } from "react";
import { getOrderById, applyOrderVoucher, applyOrderReward, payWithWallet, getCustomerWallet, scanCustomerCode, updateOrderPayment } from "@/lib/api";
import type { Customer, CustomerWallet, Order, OrderDetail, OrderStatus } from "@/lib/api";

export function usePosCheckout(checkoutOrderId: string | null) {
  const isPaymentProcessingRef = useRef(false);

  const [checkoutOrder, setCheckoutOrder] = useState<OrderDetail | null>(null);
  const [checkoutCustomer, setCheckoutCustomer] = useState<Customer | null>(null);
  const [checkoutWalletData, setCheckoutWalletData] = useState<CustomerWallet | null>(null);
  const [showCheckoutDiscounts, setShowCheckoutDiscounts] = useState(false);
  const [checkoutDiscountsApplied, setCheckoutDiscountsApplied] = useState<{
    voucher?: unknown;
    reward?: unknown;
    wallet?: number;
  }>({});
  const [applyingDiscount, setApplyingDiscount] = useState(false);

  const [unpaidOrders, setUnpaidOrders] = useState<Order[]>([]);
  const [showUnpaid, setShowUnpaid] = useState(false);
  const [unpaidLoading, setUnpaidLoading] = useState(false);

  const loadCheckoutOrder = useCallback(async (orderId: string) => {
    try {
      const order = await getOrderById(orderId);
      setCheckoutOrder(order);
      return order;
    } catch (e: unknown) {
      console.error("Failed to load checkout order:", e);
      return null;
    }
  }, []);

  const loadCheckoutCustomerData = useCallback(async (customer: Customer) => {
    setCheckoutCustomer(customer);
    try {
      const walletData = await getCustomerWallet(customer.id);
      setCheckoutWalletData(walletData);
    } catch (e) { console.error("Failed to load checkout wallet:", e); setCheckoutWalletData(null); }
  }, []);

  const handleCheckoutCustomerQrScan = useCallback(async (code: string) => {
    try {
      const data = await scanCustomerCode(code);
      const customer: Customer = { id: data.customer_id, display_name: data.customer_name, phone_number: data.customer_phone };
      await loadCheckoutCustomerData(customer);
      return customer;
    } catch (e: unknown) { throw e; }
  }, [loadCheckoutCustomerData]);

  const handleApplyCheckoutVoucher = useCallback(async (voucherCode: string) => {
    if (!checkoutOrderId) throw new Error("No order selected");
    if (applyingDiscount || isPaymentProcessingRef.current) throw new Error("Already applying a discount");
    setApplyingDiscount(true);
    try {
      const res = await applyOrderVoucher(checkoutOrderId, voucherCode);
      setCheckoutDiscountsApplied((prev) => ({ ...prev, voucher: res }));
      const updated = await getOrderById(checkoutOrderId);
      setCheckoutOrder(updated);
      return res;
    } finally { setApplyingDiscount(false); }
  }, [checkoutOrderId, applyingDiscount]);

  const handleApplyCheckoutReward = useCallback(async (rewardId: number) => {
    if (!checkoutOrderId) throw new Error("No order selected");
    if (applyingDiscount || isPaymentProcessingRef.current) throw new Error("Already applying a discount");
    setApplyingDiscount(true);
    try {
      const res = await applyOrderReward(checkoutOrderId, rewardId);
      setCheckoutDiscountsApplied((prev) => ({ ...prev, reward: res }));
      const updated = await getOrderById(checkoutOrderId);
      setCheckoutOrder(updated);
      return res;
    } finally { setApplyingDiscount(false); }
  }, [checkoutOrderId, applyingDiscount]);

  const handleCheckoutWalletPayment = useCallback(async (amount: number) => {
    if (!checkoutOrderId) throw new Error("No order selected");
    setApplyingDiscount(true);
    try {
      const res = await payWithWallet(checkoutOrderId, amount);
      setCheckoutDiscountsApplied((prev) => ({ ...prev, wallet: (prev.wallet || 0) + amount }));
      const updated = await getOrderById(checkoutOrderId);
      setCheckoutOrder(updated);
      if (checkoutCustomer) loadCheckoutCustomerData(checkoutCustomer);
      return res;
    } finally { setApplyingDiscount(false); }
  }, [checkoutOrderId, checkoutCustomer, loadCheckoutCustomerData]);

  const handleCheckoutPayment = useCallback(async (
    orderId: string,
    paymentMethod: string,
    manualDisc: number,
    discountType: "percentage" | "fixed",
    walletPaid: number,
    amountTendered: string,
  ) => {
    if (isPaymentProcessingRef.current) return null;
    isPaymentProcessingRef.current = true;
    try {
    const orderBase = checkoutOrder?.total_amount ?? 0;
    const computedDisc = discountType === "percentage" ? orderBase * (manualDisc / 100) : manualDisc;
    const finalTotal = Math.max(0, orderBase - computedDisc - walletPaid);
    const tenderedNum = parseFloat(amountTendered || "");
    await updateOrderPayment(orderId, {
      payment_method: paymentMethod,
      amount_tendered: paymentMethod === "cash" && !isNaN(tenderedNum) && tenderedNum > 0
        ? tenderedNum
        : finalTotal,
      amount: finalTotal,
      discount_amount: computedDisc,
      discount_type: discountType,
    });
    return { order_id: orderId, order_number: checkoutOrder?.order_number, total: finalTotal };
    } finally { isPaymentProcessingRef.current = false; }
  }, [checkoutOrder]);

  const fetchUnpaidOrders = useCallback(async (storeId: number, getOrdersFn: (storeId?: number, status?: OrderStatus, paymentStatus?: string) => Promise<Order[]>) => {
    if (!storeId) return;
    setUnpaidLoading(true);
    try {
      const data = await getOrdersFn(storeId, undefined);
      const list = Array.isArray(data) ? data : [];
      const unpaid = list.filter((o) => {
        const ps = o.payment_status;
        return ps !== "paid" && ps !== "captured" && ps !== "settled" && ps !== "authorized"
          && !o.status.includes("cancelled") && !o.status.includes("delivered");
      });
      setUnpaidOrders(unpaid);
    } catch (e) { console.error("Failed to load unpaid orders:", e); }
    finally { setUnpaidLoading(false); }
  }, []);

  return {
    checkoutOrder, setCheckoutOrder,
    checkoutCustomer, setCheckoutCustomer,
    checkoutWalletData, setCheckoutWalletData,
    showCheckoutDiscounts, setShowCheckoutDiscounts,
    checkoutDiscountsApplied, setCheckoutDiscountsApplied,
    applyingDiscount, setApplyingDiscount,
    unpaidOrders, setUnpaidOrders,
    showUnpaid, setShowUnpaid,
    unpaidLoading, setUnpaidLoading,
    loadCheckoutOrder,
    loadCheckoutCustomerData,
    handleCheckoutCustomerQrScan,
    handleApplyCheckoutVoucher,
    handleApplyCheckoutReward,
    handleCheckoutWalletPayment,
    handleCheckoutPayment,
    fetchUnpaidOrders,
  };
}
