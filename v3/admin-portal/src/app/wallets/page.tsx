"use client";

import { useEffect, useState } from "react";
import { getWallets, getWalletLedger, type Wallet, type WalletLedgerEntry } from "@/lib/api";

export default function WalletsPage() {
  const [items, setItems] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedWallet, setSelectedWallet] = useState<Wallet | null>(null);
  const [ledger, setLedger] = useState<WalletLedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  const fetchData = () => {
    setLoading(true);
    getWallets()
      .then((data) => setItems(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openLedger = async (wallet: Wallet) => {
    setSelectedWallet(wallet);
    setLedgerLoading(true);
    try {
      const data = await getWalletLedger({ wallet_id: wallet.id });
      setLedger(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLedgerLoading(false);
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Wallets</h1>
      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Customer</th>
              <th className="text-left px-4 py-3 font-semibold">Balance</th>
              <th className="text-left px-4 py-3 font-semibold">Total Credited</th>
              <th className="text-left px-4 py-3 font-semibold">Total Debited</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th className="text-left px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-500">
                  No wallets found.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-4 py-3">{item.customer_name}</td>
                  <td className="px-4 py-3">{item.balance}</td>
                  <td className="px-4 py-3">{item.total_credited}</td>
                  <td className="px-4 py-3">{item.total_debited}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${
                        item.status === "active"
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => openLedger(item)} className="text-blue-600 hover:underline">
                      View Ledger
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedWallet && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-3xl max-h-[80vh] overflow-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">
                  Wallet Ledger — {selectedWallet.customer_name}
                </h2>
                <button
                  onClick={() => setSelectedWallet(null)}
                  className="text-gray-500 hover:text-gray-800 text-2xl leading-none"
                >
                  &times;
                </button>
              </div>
              {ledgerLoading ? (
                <div className="text-center py-6 text-gray-500">Loading...</div>
              ) : ledger.length === 0 ? (
                <div className="text-center py-6 text-gray-500">No ledger entries found.</div>
              ) : (
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="text-left px-4 py-2 font-semibold">Type</th>
                      <th className="text-left px-4 py-2 font-semibold">Amount</th>
                      <th className="text-left px-4 py-2 font-semibold">Balance After</th>
                      <th className="text-left px-4 py-2 font-semibold">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((entry) => (
                      <tr key={entry.id} className="border-t">
                        <td className="px-4 py-2">{entry.type}</td>
                        <td
                          className={`px-4 py-2 font-medium ${
                            entry.amount >= 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {entry.amount > 0 ? `+${entry.amount}` : entry.amount}
                        </td>
                        <td className="px-4 py-2">{entry.balance_after}</td>
                        <td className="px-4 py-2">{new Date(entry.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
