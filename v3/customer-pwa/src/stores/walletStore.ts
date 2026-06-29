import { create } from 'zustand';
import type { LedgerEntry, UserReward, UserVoucher, LoyaltySummary, WalletData } from '@/lib/api';
import api from '@/lib/api';

function normalizeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function extractCashBalance(data: WalletData | null | undefined): number {
  if (!data) return 0;
  return normalizeNumber(data.balance ?? 0, 0);
}

interface WalletState {
  balance: number;
  points: number;
  tier: string;
  tierId: number;
  rewards: UserReward[];
  vouchers: UserVoucher[];
  transactions: LedgerEntry[];
  isLoading: boolean;
  setBalance: (balance: number) => void;
  setPoints: (points: number) => void;
  setTier: (tier: string) => void;
  setTierId: (tierId: number) => void;
  setRewards: (rewards: UserReward[]) => void;
  setVouchers: (vouchers: UserVoucher[]) => void;
  setTransactions: (transactions: LedgerEntry[]) => void;
  setIsLoading: (isLoading: boolean) => void;
  refreshWallet: () => Promise<void>;
  resetAll: () => void;
}

export const useWalletStore = create<WalletState>((set, get) => ({
  balance: 0,
  points: 0,
  tier: 'Bronze',
  tierId: 0,
  rewards: [],
  vouchers: [],
  transactions: [],
  isLoading: false,
  setBalance: (balance) => set({ balance: normalizeNumber(balance, 0) }),
  setPoints: (points) => set({ points: normalizeNumber(points, 0) }),
  setTier: (tier) => set({ tier }),
  setTierId: (tierId) => set({ tierId: normalizeNumber(tierId, 0) }),
  setRewards: (rewards) => set({ rewards }),
  setVouchers: (vouchers) => set({ vouchers }),
  setTransactions: (transactions) => set({ transactions }),
  setIsLoading: (isLoading) => set({ isLoading }),
  refreshWallet: async () => {
    set({ isLoading: true });
    try {
      const [walletRes, loyaltyRes] = await Promise.allSettled([
        api.get('/wallet/me'),
        api.get('/loyalty/me'),
      ]);

      if (walletRes.status === 'fulfilled') {
        const data = walletRes.value.data as WalletData | undefined;
        if (data) {
          set({
            balance: extractCashBalance(data),
            rewards: data.rewards ?? [],
            vouchers: data.vouchers ?? [],
          });
        }
      }
      if (loyaltyRes.status === 'fulfilled') {
        const d = loyaltyRes.value.data as LoyaltySummary | undefined;
        if (d) {
          set({
            points: normalizeNumber(d.current_points ?? get().points, get().points),
            tier: d.tier_name ?? get().tier,
            tierId: normalizeNumber(d.tier_id ?? get().tierId, get().tierId),
          });
        }
      }
    } catch (err) {
      console.error('[WalletStore] Wallet refresh failed:', err);
      // keep existing values on error
    } finally {
      set({ isLoading: false });
    }
  },
  resetAll: () => set({
    balance: 0,
    points: 0,
    tier: 'Bronze',
    tierId: 0,
    rewards: [],
    vouchers: [],
    transactions: [],
  }),
}));
