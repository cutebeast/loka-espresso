"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getLoyaltyAccounts, type LoyaltyAccount } from "@/lib/api";

export default function LoyaltyAccountsPage() {
  const [items, setItems] = useState<LoyaltyAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();

  const fetchData = () => {
    setLoading(true);
    getLoyaltyAccounts()
      .then((data) => setItems(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Loyalty Accounts</h1>
      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Customer</th>
              <th className="text-left px-4 py-3 font-semibold">Tier</th>
              <th className="text-left px-4 py-3 font-semibold">Points Balance</th>
              <th className="text-left px-4 py-3 font-semibold">Lifetime Points</th>
              <th className="text-left px-4 py-3 font-semibold">Last Activity</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                  No accounts found.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr
                  key={item.id}
                  className="border-t cursor-pointer hover:bg-gray-50"
                  onClick={() => router.push(`/loyalty/ledger?account_id=${item.id}`)}
                >
                  <td className="px-4 py-3">{item.customer_name}</td>
                  <td className="px-4 py-3">{item.tier}</td>
                  <td className="px-4 py-3">{item.points_balance}</td>
                  <td className="px-4 py-3">{item.lifetime_points}</td>
                  <td className="px-4 py-3">
                    {item.last_activity ? new Date(item.last_activity).toLocaleString() : "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
