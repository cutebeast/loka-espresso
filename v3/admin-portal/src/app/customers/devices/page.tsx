"use client";

import { useEffect, useState } from "react";
import { getCustomerDevices, type CustomerDevice } from "@/lib/api";

export default function CustomerDevicesPage() {
  const [items, setItems] = useState<CustomerDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deviceTypeFilter, setDeviceTypeFilter] = useState("");
  const [activeFilter, setActiveFilter] = useState("");

  const fetchData = () => {
    setLoading(true);
    getCustomerDevices({
      device_type: deviceTypeFilter || undefined,
      is_active: activeFilter === "" ? undefined : activeFilter === "true",
    })
      .then((data) => setItems(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, [deviceTypeFilter, activeFilter]);

  return (
    <div className="p-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
        <h1 className="text-2xl font-bold">Customer Devices</h1>
        <div className="flex flex-wrap gap-3">
          <input
            placeholder="Device Type"
            value={deviceTypeFilter}
            onChange={(e) => setDeviceTypeFilter(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
          />
          <select
            value={activeFilter}
            onChange={(e) => setActiveFilter(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
          >
            <option value="">All</option>
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </div>
      </div>
      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Customer</th>
              <th className="text-left px-4 py-3 font-semibold">Device Type</th>
              <th className="text-left px-4 py-3 font-semibold">Provider</th>
              <th className="text-left px-4 py-3 font-semibold">OS Version</th>
              <th className="text-left px-4 py-3 font-semibold">Last Active</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
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
                  No devices found.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-4 py-3">{item.customer_name}</td>
                  <td className="px-4 py-3">{item.device_type}</td>
                  <td className="px-4 py-3">{item.provider}</td>
                  <td className="px-4 py-3">{item.os_version}</td>
                  <td className="px-4 py-3">{item.last_active_at ? new Date(item.last_active_at).toLocaleString() : "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${item.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}`}>
                      {item.is_active ? "Active" : "Inactive"}
                    </span>
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
