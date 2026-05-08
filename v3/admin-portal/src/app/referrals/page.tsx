"use client";

import { useEffect, useState } from "react";
import { getReferralEvents, fulfillReferral, type ReferralEvent } from "@/lib/api";

export default function ReferralsPage() {
  const [items, setItems] = useState<ReferralEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchData = () => {
    setLoading(true);
    getReferralEvents()
      .then((data) => setItems(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleFulfill = async (id: number) => {
    if (!confirm("Mark this referral as fulfilled?")) return;
    try {
      await fulfillReferral(id);
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const statusClass = (status: string) => {
    switch (status) {
      case "pending":
        return "bg-amber-100 text-amber-700";
      case "fulfilled":
        return "bg-green-100 text-green-700";
      case "cancelled":
        return "bg-red-100 text-red-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Referral Events</h1>
      </div>
      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Referrer</th>
              <th className="text-left px-4 py-3 font-semibold">Referred</th>
              <th className="text-left px-4 py-3 font-semibold">Code</th>
              <th className="text-left px-4 py-3 font-semibold">Reward</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th className="text-left px-4 py-3 font-semibold">Date</th>
              <th className="text-left px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-500">
                  No referral events found.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-4 py-3">{item.referrer_name}</td>
                  <td className="px-4 py-3">{item.referred_name}</td>
                  <td className="px-4 py-3 font-mono">{item.referral_code}</td>
                  <td className="px-4 py-3">{item.reward || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${statusClass(item.status)}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">{new Date(item.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3">
                    {item.status === "pending" ? (
                      <button onClick={() => handleFulfill(item.id)} className="text-green-600 hover:underline text-sm">
                        Mark Fulfilled
                      </button>
                    ) : (
                      <span className="text-gray-400 text-xs">—</span>
                    )}
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
