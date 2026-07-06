"use client";

import { useTranslation } from "@/lib/i18n";
import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { getLoyaltyLedger, type LoyaltyLedgerEntry } from "@/lib/api";
export default function LoyaltyLedgerPage() {
  const {
    t
  } = useTranslation();
  const [items, setItems] = useState<LoyaltyLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const searchParams = useSearchParams();
  const accountId = searchParams.get("account_id");
  const fetchData = useCallback(async () => {
    return getLoyaltyLedger({
      event_type: eventTypeFilter || undefined,
      account_id: accountId ? Number(accountId) : undefined
    });
  }, [eventTypeFilter, accountId]);
  useEffect(() => {
    let cancelled = false;
    fetchData().then(data => {
      if (!cancelled) setItems(data);
    }).catch(err => {
      if (!cancelled) setError(err.message);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchData]);
  const eventBadge = (eventType: string) => {
    const colors: Record<string, string> = {
      earn: "badge-green",
      redeem: "badge-red",
      expire: "badge-gray",
      adjustment: "badge-blue"
    };
    return <span className={`badge badge-sm ${colors[eventType] || "badge-gray"}`}>
        {eventType}
      </span>;
  };
  return <div style={{
    padding: 32
  }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("loyalty_ledger.points_ledger")}</h1>
          <p className="page-subtitle">
            {accountId ? `Transactions for account #${accountId}` : "All loyalty point transactions"}
          </p>
        </div>
        <div style={{
        display: "flex",
        gap: 8
      }}>
          <select value={eventTypeFilter} onChange={e => setEventTypeFilter(e.target.value)} style={{
          border: "1px solid var(--color-border-light)",
          borderRadius: "var(--radius-sm)",
          padding: "6px 12px",
          fontSize: 13
        }}>
            <option value="">{t("loyalty_ledger.all_event_types")}</option>
            <option value="earn">{t("loyalty_ledger.earn")}</option>
            <option value="redeem">{t("loyalty_ledger.redeem")}</option>
            <option value="expire">{t("loyalty_ledger.expire")}</option>
            <option value="adjustment">{t("loyalty_ledger.adjustment")}</option>
          </select>
        </div>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="table-header-bar">
        <span className="text-sm font-semibold">{items.length}{t("loyalty_ledger.entries")}</span>
      </div>
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t("loyalty_ledger.customer")}</th>
              <th>{t("loyalty_ledger.event_type")}</th>
              <th>{t("loyalty_ledger.points_delta")}</th>
              <th>{t("loyalty_ledger.running_balance")}</th>
              <th>{t("loyalty_ledger.date")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? <tr>
                <td colSpan={5} className="data-table-empty">{t("loyalty_ledger.loading")}</td>
              </tr> : items.length === 0 ? <tr>
                <td colSpan={5} className="data-table-empty">{t("loyalty_ledger.no_ledger_entries_found")}</td>
              </tr> : items.map(item => <tr key={item.id}>
                  <td style={{
              fontWeight: 600
            }}>{item.customer_name || `Customer #${item.customer_id}`}</td>
                  <td>{eventBadge(item.event_type)}</td>
                  <td style={{
              fontWeight: 600,
              color: item.points_delta >= 0 ? "var(--color-success)" : "var(--color-error)"
            }}>
                    {item.points_delta > 0 ? `+${item.points_delta}` : item.points_delta}
                  </td>
                  <td>{item.running_balance}</td>
                  <td style={{
              fontSize: 12
            }}>{new Date(item.created_at).toLocaleString()}</td>
                </tr>)}
          </tbody>
        </table>
      </div>
    </div>;
}