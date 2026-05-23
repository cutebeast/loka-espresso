import { create } from 'zustand';
import type { Transaction, UserReward, UserVoucher } from '@/lib/api';
import api from '@/lib/api';

function normalizeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function extractCashBalance(data: { cash?: unknown; balance?: unknown } | null | undefined): number {
  if (!data) return 0;
  const cashValue = data.cash;
  if (cashValue && typeof cashValue === 'object' && 'balance' in cashValue) {
    return normalizeNumber((cashValue as { balance?: unknown }).balance, 0);
  }
  return normalizeNumber(data.balance ?? cashValue ?? 0, 0);
}

interface WalletState {
  balance: number;
  points: number;
  tier: string;
  tierId: number;
  rewards: UserReward[];
  vouchers: UserVoucher[];
  transactions: Transaction[];
  isLoading: boolean;
  setBalance: (balance: number) => void;
  setPoints: (points: number) => void;
  setTier: (tier: string) => void;
  setTierId: (tierId: number) => void;
  setRewards: (rewards: UserReward[]) => void;
  setVouchers: (vouchers: UserVoucher[]) => void;
  setTransactions: (transactions: Transaction[]) => void;
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
        api.get('/me/wallet'),
        api.get('/loyalty/balance'),
      ]);

      if (walletRes.status === 'fulfilled') {
        const data = walletRes.value.data;
        if (data) {
          set({
            balance: extractCashBalance(data),
            rewards: data.rewards ?? [],
            vouchers: data.vouchers ?? [],
          });
        }
      }
      if (loyaltyRes.status === 'fulfilled') {
        const d = loyaltyRes.value.data;
        if (d) {
          set({
            points: normalizeNumber(d.points_balance ?? d.points ?? get().points, get().points),
            tier: d.tier_name ?? d.tier ?? get().tier,
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
