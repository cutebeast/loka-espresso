"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getLoyaltyLedger, type LoyaltyLedgerEntry } from "@/lib/api";

export default function LoyaltyLedgerPage() {
  const [items, setItems] = useState<LoyaltyLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const searchParams = useSearchParams();
  const accountId = searchParams.get("account_id");

  const fetchData = () => {
    setLoading(true);
    getLoyaltyLedger({
      event_type: eventTypeFilter || undefined,
      account_id: accountId ? Number(accountId) : undefined,
    })
      .then((data) => setItems(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, [eventTypeFilter, accountId]);

  return (
    <div className="p-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
        <h1 className="text-2xl font-bold">Points Ledger</h1>
        <div className="flex gap-3">
          <select
            value={eventTypeFilter}
            onChange={(e) => setEventTypeFilter(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
          >
            <option value="">All Event Types</option>
            <option value="earn">Earn</option>
            <option value="redeem">Redeem</option>
            <option value="expire">Expire</option>
            <option value="adjustment">Adjustment</option>
          </select>
        </div>
      </div>
      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Customer</th>
              <th className="text-left px-4 py-3 font-semibold">Event Type</th>
              <th className="text-left px-4 py-3 font-semibold">Points Delta</th>
              <th className="text-left px-4 py-3 font-semibold">Running Balance</th>
              <th className="text-left px-4 py-3 font-semibold">Date</th>
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
                  No ledger entries found.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-4 py-3">{item.customer_name}</td>
                  <td className="px-4 py-3">{item.event_type}</td>
                  <td
                    className={`px-4 py-3 font-medium ${
                      item.points_delta >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {item.points_delta > 0 ? `+${item.points_delta}` : item.points_delta}
                  </td>
                  <td className="px-4 py-3">{item.running_balance}</td>
                  <td className="px-4 py-3">{new Date(item.created_at).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
