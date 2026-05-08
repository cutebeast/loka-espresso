import { create } from 'zustand';
import api from '@/lib/api';

export interface TierInfo {
  id: number;
  name: string;
  min_points: number;
  points_multiplier: number;
  benefits: Record<string, unknown> | null;
  sort_order: number;
}

export interface AppConfig {
  delivery_fee: number;
  min_order_delivery: number;
  pickup_lead_minutes: number;
  currency_symbol: string;
  earn_rate: number;
  loyalty_enabled: boolean;
  loyalty_points_per_rmse: number;
  referral_reward_points: number;
  referral_min_orders: number;
  topup_presets: number[];
  topup_min_amount: number;
  max_vouchers_per_user: number | null;
  voucher_expiry_days: number | null;
  points_redemption_rate: number;
  payment_gateway_provider: string | null;
  order_polling_interval_seconds: number;
}

interface ConfigState {
  config: AppConfig;
  tiers: TierInfo[];
  isLoaded: boolean;
  loadConfig: () => Promise<void>;
}

const DEFAULT_CONFIG: AppConfig = {
  delivery_fee: 3.0,
  min_order_delivery: 0,
  pickup_lead_minutes: 15,
  currency_symbol: 'RM',
  earn_rate: 1,
  loyalty_enabled: true,
  loyalty_points_per_rmse: 1,
  referral_reward_points: 50,
  referral_min_orders: 1,
  topup_presets: [10, 20, 50, 100, 200],
  topup_min_amount: 5,
  max_vouchers_per_user: null,
  voucher_expiry_days: null,
  points_redemption_rate: 0.01,
  payment_gateway_provider: null,
  order_polling_interval_seconds: 30,
};

function parseNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && !isNaN(value)) return value;
  if (typeof value === 'string') {
    const n = parseFloat(value);
    if (!isNaN(n)) return n;
  }
  return fallback;
}

function parseBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value.toLowerCase() === 'true';
  if (typeof value === 'number') return value !== 0;
  return fallback;
}

function parseNumberArray(value: unknown, fallback: number[]): number[] {
  if (Array.isArray(value)) {
    return value.map(v => parseNumber(v, 0)).filter(n => n > 0);
  }
  if (typeof value === 'string') {
    return value.split(',').map(v => parseFloat(v.trim())).filter(n => !isNaN(n) && n > 0);
  }
  return fallback;
}

export const useConfigStore = create<ConfigState>((set) => ({
  config: DEFAULT_CONFIG,
  tiers: [],
  isLoaded: false,
  loadConfig: async () => {
    try {
      const res = await api.get('/config/bootstrap');
      const data = res.data as { config: Record<string, unknown>; tiers: Array<Record<string, unknown>> };
      const rawConfig = data.config || {};
      const rawTiers = data.tiers || [];

      set({
        config: {
          delivery_fee: parseNumber(rawConfig.delivery_fee, DEFAULT_CONFIG.delivery_fee),
          min_order_delivery: parseNumber(rawConfig.min_order_delivery, DEFAULT_CONFIG.min_order_delivery),
          pickup_lead_minutes: parseNumber(rawConfig.pickup_lead_minutes, DEFAULT_CONFIG.pickup_lead_minutes),
          currency_symbol: typeof rawConfig.currency_symbol === 'string' ? rawConfig.currency_symbol : DEFAULT_CONFIG.currency_symbol,
          earn_rate: parseNumber(rawConfig.earn_rate, DEFAULT_CONFIG.earn_rate),
          loyalty_enabled: parseBoolean(rawConfig.loyalty_enabled, DEFAULT_CONFIG.loyalty_enabled),
          loyalty_points_per_rmse: parseNumber(rawConfig.loyalty_points_per_rmse, DEFAULT_CONFIG.loyalty_points_per_rmse),
          referral_reward_points: parseNumber(rawConfig.referral_reward_points, DEFAULT_CONFIG.referral_reward_points),
          referral_min_orders: parseNumber(rawConfig.referral_min_orders, DEFAULT_CONFIG.referral_min_orders),
          topup_presets: parseNumberArray(rawConfig.topup_presets, DEFAULT_CONFIG.topup_presets),
          topup_min_amount: parseNumber(rawConfig.topup_min_amount, DEFAULT_CONFIG.topup_min_amount),
          max_vouchers_per_user: typeof rawConfig.max_vouchers_per_user === 'number' ? rawConfig.max_vouchers_per_user : DEFAULT_CONFIG.max_vouchers_per_user,
          voucher_expiry_days: typeof rawConfig.voucher_expiry_days === 'number' ? rawConfig.voucher_expiry_days : DEFAULT_CONFIG.voucher_expiry_days,
          points_redemption_rate: parseNumber(rawConfig.points_redemption_rate, DEFAULT_CONFIG.points_redemption_rate),
          payment_gateway_provider: typeof rawConfig.payment_gateway_provider === 'string' ? rawConfig.payment_gateway_provider : null,
          order_polling_interval_seconds: parseNumber(rawConfig.order_polling_interval_seconds, DEFAULT_CONFIG.order_polling_interval_seconds),
        },
        tiers: rawTiers.map((t) => ({
          id: t.id as number,
          name: t.name as string,
          min_points: parseNumber(t.min_points, 0),
          points_multiplier: parseNumber(t.points_multiplier, 1),
          benefits: (t.benefits as Record<string, unknown>) || null,
          sort_order: parseNumber(t.sort_order, 0),
        })).sort((a, b) => a.sort_order - b.sort_order),
        isLoaded: true,
      });
    } catch {
      set({ isLoaded: true });
    }
  },
}));
