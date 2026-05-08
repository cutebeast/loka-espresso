"use client";

import { useEffect, useState } from "react";
import { getAuditLog, type AuditLogEntry } from "@/lib/api";

export default function AuditLogPage() {
  const [items, setItems] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [resourceTypeFilter, setResourceTypeFilter] = useState("");
  const [severityFilter, setSeverityFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const fetchData = () => {
    setLoading(true);
    getAuditLog({
      action: actionFilter || undefined,
      resource_type: resourceTypeFilter || undefined,
      severity: severityFilter || undefined,
      from: fromDate || undefined,
      to: toDate || undefined,
    })
      .then((data) => setItems(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, [actionFilter, resourceTypeFilter, severityFilter, fromDate, toDate]);

  const severityClass = (severity: string) => {
    switch (severity) {
      case "low":
        return "bg-gray-100 text-gray-700";
      case "medium":
        return "bg-yellow-100 text-yellow-700";
      case "high":
        return "bg-orange-100 text-orange-700";
      case "critical":
        return "bg-red-100 text-red-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Audit Log</h1>
      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>}
      <div className="flex flex-wrap gap-3 mb-6">
        <input
          placeholder="Action"
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="border rounded px-3 py-2 text-sm"
        />
        <input
          placeholder="Resource Type"
          value={resourceTypeFilter}
          onChange={(e) => setResourceTypeFilter(e.target.value)}
          className="border rounded px-3 py-2 text-sm"
        />
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="border rounded px-3 py-2 text-sm"
        >
          <option value="">All Severities</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          className="border rounded px-3 py-2 text-sm"
        />
        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          className="border rounded px-3 py-2 text-sm"
        />
      </div>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Timestamp</th>
              <th className="text-left px-4 py-3 font-semibold">Action</th>
              <th className="text-left px-4 py-3 font-semibold">Resource</th>
              <th className="text-left px-4 py-3 font-semibold">Resource ID</th>
              <th className="text-left px-4 py-3 font-semibold">User</th>
              <th className="text-left px-4 py-3 font-semibold">Severity</th>
              <th className="text-left px-4 py-3 font-semibold">IP</th>
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
                  No audit entries found.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-4 py-3">{new Date(item.timestamp).toLocaleString()}</td>
                  <td className="px-4 py-3">{item.action}</td>
                  <td className="px-4 py-3">{item.resource_type}</td>
                  <td className="px-4 py-3 font-mono">{item.resource_id}</td>
                  <td className="px-4 py-3">{item.user_email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${severityClass(
                        item.severity
                      )}`}
                    >
                      {item.severity}
                    </span>
                  </td>
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
