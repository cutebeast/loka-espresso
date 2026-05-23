"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { searchCustomers, getCustomerWallet, markVoucherUsed, markRewardUsed, scanCustomerCode } from "@/lib/api";
import type { Customer, CustomerWallet, Reward, Voucher } from "@/lib/api";

export function usePosCustomer() {
  const [searchQ, setSearchQ] = useState("");
  const [searchResults, setSearchResults] = useState<Customer[]>([]);
  const [customerWallet, setCustomerWallet] = useState<CustomerWallet | null>(null);
  const [showRewardsDrawer, setShowRewardsDrawer] = useState(false);
  const [redeemingId, setRedeemingId] = useState<number | null>(null);
  const customerSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (customerSearchTimerRef.current) clearTimeout(customerSearchTimerRef.current);
    };
  }, []);

  const loadCustomerWallet = useCallback(async (customerId: number) => {
    try {
      const data = await getCustomerWallet(customerId);
      setCustomerWallet(data);
    } catch (e) { console.error("Failed to load customer wallet:", e); setCustomerWallet(null); }
  }, []);

  const handleCustomerSelect = useCallback((c: Customer) => {
    setSearchQ(c.display_name);
    setSearchResults([]);
    return c;
  }, []);

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

  const handleCustomerQrScan = useCallback(async (code: string): Promise<Customer> => {
    const data = await scanCustomerCode(code);
    const customer: Customer = {
      id: data.customer_id,
      display_name: data.customer_name,
      phone_number: data.customer_phone,
    };
    return customer;
  }, []);

  const handleBurnReward = useCallback(async (customer: Customer, reward: Reward) => {
    setRedeemingId(reward.id);
    try {
      await markRewardUsed(customer.id, reward.id, "Used at POS");
      await loadCustomerWallet(customer.id);
      return true;
    } catch (e: unknown) { throw e; } finally { setRedeemingId(null); }
  }, [loadCustomerWallet]);

  const handleBurnVoucher = useCallback(async (customer: Customer, voucher: Voucher) => {
    setRedeemingId(voucher.id);
    try {
      await markVoucherUsed(customer.id, voucher.id, "Used at POS");
      await loadCustomerWallet(customer.id);
      return true;
    } catch (e: unknown) { throw e; } finally { setRedeemingId(null); }
  }, [loadCustomerWallet]);

  return {
    searchQ, setSearchQ,
    searchResults, setSearchResults,
    customerWallet, setCustomerWallet,
    showRewardsDrawer, setShowRewardsDrawer,
    redeemingId, setRedeemingId,
    loadCustomerWallet,
    handleCustomerSelect,
    searchCustomersDebounced,
    handleCustomerQrScan,
    handleBurnReward,
    handleBurnVoucher,
  };
}
