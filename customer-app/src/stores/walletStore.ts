import { create } from 'zustand';
import type { Transaction } from '@/lib/api';

interface WalletState {
  balance: number;
  points: number;
  tier: string;
  transactions: Transaction[];
  isLoading: boolean;
  setBalance: (balance: number) => void;
  setPoints: (points: number) => void;
  setTier: (tier: string) => void;
  setTransactions: (transactions: Transaction[]) => void;
  setIsLoading: (isLoading: boolean) => void;
}

export const useWalletStore = create<WalletState>((set) => ({
  balance: 0,
  points: 0,
  tier: 'Bronze',
  transactions: [],
  isLoading: false,
  setBalance: (balance) => set({ balance }),
  setPoints: (points) => set({ points }),
  setTier: (tier) => set({ tier }),
  setTransactions: (transactions) => set({ transactions }),
  setIsLoading: (isLoading) => set({ isLoading }),
}));
