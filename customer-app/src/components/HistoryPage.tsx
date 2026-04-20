'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowDownLeft,
  ArrowUpRight,
  Star,
  Wallet,
} from 'lucide-react';
import { useWalletStore } from '@/stores/walletStore';
import { useUIStore } from '@/stores/uiStore';
import { Skeleton } from '@/components/ui';
import api from '@/lib/api';
import type { LoyaltyHistoryEntry, Transaction } from '@/lib/api';

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};

const staggerItem = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

function formatPrice(val: number): string {
  return `RM ${val.toFixed(2)}`;
}

type Tab = 'loyalty' | 'wallet';

export default function HistoryPage() {
  const { setPage, showToast } = useUIStore();
  const { setTransactions: setWalletTransactions } = useWalletStore();

  const [activeTab, setActiveTab] = useState<Tab>('loyalty');
  const [loyaltyHistory, setLoyaltyHistory] = useState<LoyaltyHistoryEntry[]>([]);
  const [walletHistory, setWalletHistory] = useState<Transaction[]>([]);
  const [loadingLoyalty, setLoadingLoyalty] = useState(false);
  const [loadingWallet, setLoadingWallet] = useState(false);

  const fetchLoyalty = useCallback(async () => {
    setLoadingLoyalty(true);
    try {
      const res = await api.get('/loyalty/history', { params: { page_size: 30 } });
      setLoyaltyHistory(Array.isArray(res.data) ? res.data : []);
    } catch {
      showToast('Failed to load loyalty history', 'error');
    } finally {
      setLoadingLoyalty(false);
    }
  }, [showToast]);

  const fetchWallet = useCallback(async () => {
    setLoadingWallet(true);
    try {
      const res = await api.get('/wallet/transactions', { params: { page_size: 30 } });
      const txs = Array.isArray(res.data) ? res.data : [];
      setWalletHistory(txs);
      setWalletTransactions(txs);
    } catch {
      showToast('Failed to load wallet history', 'error');
    } finally {
      setLoadingWallet(false);
    }
  }, [showToast, setWalletTransactions]);

  useEffect(() => {
    fetchLoyalty();
    fetchWallet();
  }, [fetchLoyalty, fetchWallet]);

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString('en-MY', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="px-4 pt-4 pb-6">
      <motion.div variants={staggerItem} className="flex items-center gap-3 mb-5">
        <button
          onClick={() => setPage('profile')}
          className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center"
        >
          <ArrowLeft size={18} className="text-gray-600" />
        </button>
        <h1 className="text-xl font-bold text-gray-900">Transaction History</h1>
      </motion.div>

      <motion.div variants={staggerItem} className="flex bg-gray-100 rounded-xl p-1 mb-5">
        {(['loyalty', 'wallet'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold capitalize transition-all ${
              activeTab === tab
                ? 'bg-primary text-white shadow-sm'
                : 'text-gray-500'
            }`}
          >
            {tab === 'loyalty' ? 'Loyalty' : 'Wallet'}
          </button>
        ))}
      </motion.div>

      {activeTab === 'loyalty' && (
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
        >
          {loadingLoyalty ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                  <Skeleton className="h-4 w-2/3 mb-2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              ))}
            </div>
          ) : loyaltyHistory.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center">
              <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Star size={24} className="text-gray-300" />
              </div>
              <p className="text-sm text-gray-500">No loyalty transactions yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {loyaltyHistory.map((entry) => {
                const isEarned = entry.points > 0;
                return (
                  <motion.div
                    key={entry.id}
                    variants={staggerItem}
                    className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex items-center gap-3"
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                        isEarned ? 'bg-green-50' : 'bg-red-50'
                      }`}
                    >
                      <Star
                        size={18}
                        className={isEarned ? 'text-green-600' : 'text-red-500'}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {entry.description || entry.type}
                      </p>
                      <p className="text-xs text-gray-400">{formatDate(entry.created_at)}</p>
                    </div>
                    <span
                      className={`text-sm font-bold ${
                        isEarned ? 'text-green-600' : 'text-red-500'
                      }`}
                    >
                      {isEarned ? '+' : ''}
                      {entry.points} pts
                    </span>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>
      )}

      {activeTab === 'wallet' && (
        <motion.div
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.2 }}
        >
          {loadingWallet ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
                  <Skeleton className="h-4 w-2/3 mb-2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              ))}
            </div>
          ) : walletHistory.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100 text-center">
              <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Wallet size={24} className="text-gray-300" />
              </div>
              <p className="text-sm text-gray-500">No wallet transactions yet</p>
            </div>
          ) : (
            <div className="space-y-2">
              {walletHistory.map((tx) => {
                const isPositive = tx.amount > 0;
                return (
                  <motion.div
                    key={tx.id}
                    variants={staggerItem}
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
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {tx.description}
                      </p>
                      <p className="text-xs text-gray-400">{formatDate(tx.created_at)}</p>
                    </div>
                    <span
                      className={`text-sm font-bold ${
                        isPositive ? 'text-green-600' : 'text-red-500'
                      }`}
                    >
                      {isPositive ? '+' : '-'}
                      {formatPrice(Math.abs(tx.amount))}
                    </span>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
