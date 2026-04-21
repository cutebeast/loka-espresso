'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Wallet,
  Star,
  Plus,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';
import { useWalletStore } from '@/stores/walletStore';
import { useUIStore } from '@/stores/uiStore';
import { Button, Skeleton } from '@/components/ui';
import api from '@/lib/api';

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};

const staggerItem = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

function formatPrice(val: number | string): string {
  return `RM ${Number(val).toFixed(2)}`;
}

const TOPUP_AMOUNTS = [50, 100, 200, 300, 500];

export default function WalletPage() {
  const { balance, points, setBalance, transactions, setTransactions } = useWalletStore();
  const { setPage, showToast } = useUIStore();

  const [selectedAmount, setSelectedAmount] = useState<number | null>(null);
  const [toppingUp, setToppingUp] = useState(false);
  const [loadingTx, setLoadingTx] = useState(false);

  const fetchBalance = useCallback(async () => {
    try {
      const res = await api.get('/wallet');
      setBalance(res.data?.balance ?? balance);
    } catch {
      // keep existing
    }
  }, [balance, setBalance]);

  const fetchTransactions = useCallback(async () => {
    setLoadingTx(true);
    try {
      const res = await api.get('/wallet/transactions', { params: { page_size: 20 } });
      setTransactions(Array.isArray(res.data) ? res.data : []);
    } catch {
      // keep existing
    } finally {
      setLoadingTx(false);
    }
  }, [setTransactions]);

  useEffect(() => {
    fetchBalance();
    fetchTransactions();
  }, [fetchBalance, fetchTransactions]);

  const handleTopUp = async () => {
    if (!selectedAmount) {
      showToast('Select a top-up amount', 'error');
      return;
    }
    setToppingUp(true);
    try {
      await api.post('/wallet/topup', { amount: selectedAmount });
      showToast(`Successfully topped up ${formatPrice(selectedAmount)}`, 'success');
      await fetchBalance();
      await fetchTransactions();
      setSelectedAmount(null);
    } catch {
      showToast('Top-up failed. Please try again.', 'error');
    } finally {
      setToppingUp(false);
    }
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="px-4 pt-4 pb-6">
      <motion.div variants={staggerItem} className="flex items-center gap-3 mb-5">
        <button
          onClick={() => setPage('profile')}
          className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center"
        >
          <ArrowLeft size={18} className="text-gray-600" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Wallet</h1>
      </motion.div>

      <motion.div variants={staggerItem} className="mb-6">
        <div className="bg-gradient-to-br from-[#384B16] to-[#6b8f3a] rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-center gap-2 mb-1">
            <Wallet size={18} className="opacity-80" />
            <span className="text-sm opacity-80">Balance</span>
          </div>
          <p className="text-3xl font-bold mb-3">{formatPrice(balance)}</p>
          <div className="flex items-center gap-1.5">
            <Star size={14} className="text-yellow-300" />
            <span className="text-sm font-medium">{points} points</span>
          </div>
        </div>
      </motion.div>

      <motion.div variants={staggerItem} className="mb-6">
        <h2 className="text-sm font-bold text-gray-900 mb-3">Top Up</h2>
        <p className="text-xs text-gray-500 mb-3">
          Wallet top-up is currently running on the internal stub flow and will be replaced during payment gateway integration.
        </p>
        <div className="flex flex-wrap gap-2 mb-4">
          {TOPUP_AMOUNTS.map((amount) => (
            <motion.button
              key={amount}
              whileTap={{ scale: 0.95 }}
              onClick={() => setSelectedAmount(amount)}
              className={`px-5 py-2.5 rounded-full text-sm font-semibold transition-colors ${
                selectedAmount === amount
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              RM {amount}
            </motion.button>
          ))}
        </div>
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={handleTopUp}
          isLoading={toppingUp}
          disabled={!selectedAmount}
          leftIcon={<Plus size={18} />}
        >
          {selectedAmount ? `Top Up ${formatPrice(selectedAmount)}` : 'Select Amount'}
        </Button>
      </motion.div>

      <motion.div variants={staggerItem}>
        <h2 className="text-sm font-bold text-gray-900 mb-3">Recent Transactions</h2>
        {loadingTx ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                <Skeleton className="h-4 w-2/3 mb-2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            ))}
          </div>
        ) : transactions.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Wallet size={24} className="text-gray-300" />
            </div>
            <p className="text-sm text-gray-500">No transactions yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map((tx) => {
              const isPositive = tx.amount > 0;
              return (
                <div
                  key={tx.id}
                  className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-3"
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                      isPositive ? 'bg-green-50' : 'bg-red-50'
                    }`}
                  >
                    {isPositive ? (
                      <ArrowDownLeft size={18} className="text-green-600" />
                    ) : (
                      <ArrowUpRight size={18} className="text-red-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{tx.description}</p>
                    <p className="text-xs text-gray-400">
                      {new Date(tx.created_at).toLocaleDateString('en-MY', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <span
                    className={`text-sm font-bold ${
                      isPositive ? 'text-green-600' : 'text-red-500'
                    }`}
                  >
                    {isPositive ? '+' : '-'}
                    {formatPrice(Math.abs(tx.amount))}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
