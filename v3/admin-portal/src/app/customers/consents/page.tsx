"use client";

import { useEffect, useState } from "react";
import { getCustomerConsents, type CustomerConsent } from "@/lib/api";

export default function CustomerConsentsPage() {
  const [items, setItems] = useState<CustomerConsent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [consentTypeFilter, setConsentTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const fetchData = () => {
    setLoading(true);
    getCustomerConsents({
      consent_type: consentTypeFilter || undefined,
      status: statusFilter || undefined,
    })
      .then((data) => setItems(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, [consentTypeFilter, statusFilter]);

  const statusClass = (status: string) => {
    switch (status) {
      case "granted":
        return "bg-green-100 text-green-700";
      case "withdrawn":
        return "bg-red-100 text-red-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div className="p-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
        <h1 className="text-2xl font-bold">Customer Consents</h1>
        <div className="flex flex-wrap gap-3">
          <input
            placeholder="Consent Type"
            value={consentTypeFilter}
            onChange={(e) => setConsentTypeFilter(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
          >
            <option value="">All Statuses</option>
            <option value="granted">Granted</option>
            <option value="withdrawn">Withdrawn</option>
          </select>
        </div>
      </div>
      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Customer</th>
              <th className="text-left px-4 py-3 font-semibold">Consent Type</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th className="text-left px-4 py-3 font-semibold">Granted At</th>
              <th className="text-left px-4 py-3 font-semibold">Withdrawn At</th>
              <th className="text-left px-4 py-3 font-semibold">IP</th>
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
                  No consents found.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-4 py-3">{item.customer_name}</td>
                  <td className="px-4 py-3">{item.consent_type}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${statusClass(item.status)}`}>
                      {item.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">{item.granted_at ? new Date(item.granted_at).toLocaleString() : "—"}</td>
                  <td className="px-4 py-3">{item.withdrawn_at ? new Date(item.withdrawn_at).toLocaleString() : "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{item.ip_address}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
