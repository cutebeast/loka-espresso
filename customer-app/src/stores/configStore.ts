import { create } from 'zustand';
import api from '@/lib/api';

interface AppConfig {
  delivery_fee: number;
  min_order_delivery: number;
  pickup_lead_minutes: number;
  currency_symbol: string;
}

interface ConfigState {
  config: AppConfig;
  isLoaded: boolean;
  loadConfig: () => Promise<void>;
}

const DEFAULT_CONFIG: AppConfig = {
  delivery_fee: 3.0,
  min_order_delivery: 0,
  pickup_lead_minutes: 15,
  currency_symbol: 'RM',
};

export const useConfigStore = create<ConfigState>((set) => ({
  config: DEFAULT_CONFIG,
  isLoaded: false,
  loadConfig: async () => {
    try {
      const res = await api.get('/config');
      const data = res.data as Record<string, unknown>;
      set({
        config: {
          delivery_fee: typeof data.delivery_fee === 'number' ? data.delivery_fee : DEFAULT_CONFIG.delivery_fee,
          min_order_delivery: typeof data.min_order_delivery === 'number' ? data.min_order_delivery : DEFAULT_CONFIG.min_order_delivery,
          pickup_lead_minutes: typeof data.pickup_lead_minutes === 'number' ? data.pickup_lead_minutes : DEFAULT_CONFIG.pickup_lead_minutes,
          currency_symbol: typeof data.currency_symbol === 'string' ? data.currency_symbol : DEFAULT_CONFIG.currency_symbol,
        },
        isLoaded: true,
      });
    } catch {
      set({ isLoaded: true });
    }
  },
}));