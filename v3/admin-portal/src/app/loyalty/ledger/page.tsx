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

  const eventBadge = (eventType: string) => {
    const colors: Record<string, string> = {
      earn: "badge-green",
      redeem: "badge-red",
      expire: "badge-gray",
      adjustment: "badge-blue",
    };
    return (
      <span className={`badge badge-sm ${colors[eventType] || "badge-gray"}`}>
        {eventType}
      </span>
    );
  };

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Points Ledger</h1>
          <p className="page-subtitle">
            {accountId ? `Transactions for account #${accountId}` : "All loyalty point transactions"}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <select
            value={eventTypeFilter}
            onChange={(e) => setEventTypeFilter(e.target.value)}
            style={{
              border: "1px solid var(--color-border-light)",
              borderRadius: "var(--radius-sm)",
              padding: "6px 12px",
              fontSize: 13,
            }}
          >
            <option value="">All Event Types</option>
            <option value="earn">Earn</option>
            <option value="redeem">Redeem</option>
            <option value="expire">Expire</option>
            <option value="adjustment">Adjustment</option>
          </select>
        </div>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="table-header-bar">
        <span className="text-sm font-semibold">{items.length} entries</span>
      </div>
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Event Type</th>
              <th>Points Delta</th>
              <th>Running Balance</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="data-table-empty">Loading...</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="data-table-empty">No ledger entries found.</td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id}>
                  <td style={{ fontWeight: 600 }}>{item.customer_name || `Customer #${item.customer_id}`}</td>
                  <td>{eventBadge(item.event_type)}</td>
                  <td
                    style={{
                      fontWeight: 600,
                      color: item.points_delta >= 0 ? "var(--color-success)" : "var(--color-error)",
                    }}
                  >
                    {item.points_delta > 0 ? `+${item.points_delta}` : item.points_delta}
                  </td>
                  <td>{item.running_balance}</td>
                  <td style={{ fontSize: 12 }}>{new Date(item.created_at).toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
