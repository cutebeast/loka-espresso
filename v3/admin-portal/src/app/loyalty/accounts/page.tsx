"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getLoyaltyAccounts, type LoyaltyAccount } from "@/lib/api";

export default function LoyaltyAccountsPage() {
  const [items, setItems] = useState<LoyaltyAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const router = useRouter();

  const fetchData = useCallback(async () => {
    return getLoyaltyAccounts();
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchData()
      .then((data) => { if (!cancelled) setItems(data); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fetchData]);

  const tierBadge = (tierName: string | null, colorHex?: string) => {
    if (!tierName) return <span className="badge badge-sm badge-gray">None</span>;
    return (
      <span
        className="badge badge-sm"
        style={{
          background: colorHex || "var(--color-bg-muted)",
          color: colorHex ? "#fff" : "var(--color-text)",
        }}
      >
        {tierName}
      </span>
    );
  };

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Loyalty Accounts</h1>
          <p className="page-subtitle">
            Customer loyalty accounts — points balance and tier assignments
          </p>
        </div>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="table-header-bar">
        <span className="text-sm font-semibold">{items.length} accounts</span>
      </div>
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Tier</th>
              <th>Points Balance</th>
              <th>Lifetime Earned</th>
              <th>Lifetime Redeemed</th>
              <th>Last Activity</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="data-table-empty">Loading...</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="data-table-empty">No accounts found.</td>
              </tr>
            ) : (
              items.map((item) => (
                <tr
                  key={item.id}
                  className="clickable" role="button" tabIndex={0} onKeyDown={(e)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();(() => router.push(`/loyalty/ledger?account_id=${item.id}`))();}}}
                  onClick={() => router.push(`/loyalty/ledger?account_id=${item.id}`)}
                  style={{ cursor: "pointer" }}
                >
                  <td style={{ fontWeight: 600 }}>{item.customer_name || `Customer #${item.customer_id}`}</td>
                  <td>{tierBadge((item as any).tier_name || item.tier_name, (item as any).color_hex)}</td>
                  <td style={{ fontWeight: 600 }}>{item.points_balance ?? item.current_points ?? 0}</td>
                  <td>{(item as any).lifetime_points_earned ?? item.lifetime_points ?? 0}</td>
                  <td>{(item as any).lifetime_points_redeemed ?? 0}</td>
                  <td style={{ fontSize: 12 }}>
                    {(item as any).last_activity_at
                      ? new Date((item as any).last_activity_at).toLocaleString()
                      : item.last_activity
                        ? new Date(item.last_activity).toLocaleString()
                        : "—"}
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
