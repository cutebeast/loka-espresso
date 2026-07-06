"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";

interface ConfigItem {
  id: number;
  config_key: string;
  config_value: string | null;
  value_type: string;
  is_sensitive: boolean;
  is_editable: boolean;
}

interface UseCurrencyReturn {
  currency: string;
  symbol: string;
  loading: boolean;
  format: (amount: number | string | null | undefined) => string;
}

const DEFAULT_CURRENCY = "MYR";
const DEFAULT_SYMBOL = "RM";

export function useCurrency(): UseCurrencyReturn {
  const [currency, setCurrency] = useState<string>(DEFAULT_CURRENCY);
  const [symbol, setSymbol] = useState<string>(DEFAULT_SYMBOL);
  const [loading, setLoading] = useState<boolean>(true);

  const format = useCallback(
    (amount: number | string | null | undefined) =>
      `${symbol} ${Number(amount || 0).toFixed(2)}`,
    [symbol]
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get<ConfigItem[]>("/admin/config?prefix=app.")
      .then((items) => {
        if (cancelled) return;
        const map = new Map<string, string>();
        for (const item of items || []) {
          if (item.config_value != null) {
            map.set(item.config_key, item.config_value);
          }
        }
        setCurrency(map.get("app.currency") || DEFAULT_CURRENCY);
        setSymbol(map.get("app.currency_symbol") || DEFAULT_SYMBOL);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("Failed to load currency config:", err);
          setCurrency(DEFAULT_CURRENCY);
          setSymbol(DEFAULT_SYMBOL);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { currency, symbol, loading, format };
}

export default useCurrency;
