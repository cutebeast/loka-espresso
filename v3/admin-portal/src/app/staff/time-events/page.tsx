"use client";

import { useEffect, useState } from "react";
import { getStaffTimeEvents, verifyTimeEvent, type StaffTimeEvent } from "@/lib/api";

export default function StaffTimeEventsPage() {
  const [items, setItems] = useState<StaffTimeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [eventTypeFilter, setEventTypeFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  const fetchData = () => {
    setLoading(true);
    getStaffTimeEvents({
      event_type: eventTypeFilter || undefined,
      date: dateFilter || undefined,
    })
      .then((data) => setItems(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, [eventTypeFilter, dateFilter]);

  const handleVerify = async (id: number) => {
    try {
      await verifyTimeEvent(id);
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const eventClass = (type: string) => {
    switch (type) {
      case "clock_in":
        return "bg-green-100 text-green-700";
      case "clock_out":
        return "bg-red-100 text-red-700";
      case "start_break":
        return "bg-amber-100 text-amber-700";
      case "end_break":
        return "bg-blue-100 text-blue-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div className="p-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
        <h1 className="text-2xl font-bold">Staff Time Events</h1>
        <div className="flex flex-wrap gap-3">
          <select
            value={eventTypeFilter}
            onChange={(e) => setEventTypeFilter(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
          >
            <option value="">All Events</option>
            <option value="clock_in">Clock In</option>
            <option value="clock_out">Clock Out</option>
            <option value="start_break">Start Break</option>
            <option value="end_break">End Break</option>
          </select>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
          />
        </div>
      </div>
      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Staff</th>
              <th className="text-left px-4 py-3 font-semibold">Store</th>
              <th className="text-left px-4 py-3 font-semibold">Event Type</th>
              <th className="text-left px-4 py-3 font-semibold">Timestamp</th>
              <th className="text-left px-4 py-3 font-semibold">Location</th>
              <th className="text-left px-4 py-3 font-semibold">Verified By</th>
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
                  No time events found.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-4 py-3">{item.staff_name}</td>
                  <td className="px-4 py-3">{item.store_name}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${eventClass(item.event_type)}`}>
                      {item.event_type}
                    </span>
                  </td>
                  <td className="px-4 py-3">{new Date(item.timestamp).toLocaleString()}</td>
                  <td className="px-4 py-3">{item.location || "—"}</td>
                  <td className="px-4 py-3">{item.verified_by || "—"}</td>
                  <td className="px-4 py-3">
                    {!item.verified_by ? (
                      <button onClick={() => handleVerify(item.id)} className="text-blue-600 hover:underline text-sm">
                        Verify
                      </button>
                    ) : (
                      <span className="text-gray-400 text-xs">Verified</span>
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
