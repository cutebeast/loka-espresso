"use client";

import { useEffect, useState } from "react";
import { getReservations, updateReservationStatus, type Reservation } from "@/lib/api";

export default function ReservationsPage() {
  const [items, setItems] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  const fetchData = () => {
    setLoading(true);
    getReservations({ status: statusFilter || undefined, date: dateFilter || undefined })
      .then((data) => setItems(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchData();
  }, [statusFilter, dateFilter]);

  const handleStatusChange = async (id: number, status: Reservation["status"]) => {
    try {
      await updateReservationStatus(id, status);
      fetchData();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const badgeClass = (status: string) => {
    switch (status) {
      case "confirmed":
        return "bg-green-100 text-green-700";
      case "seated":
        return "bg-blue-100 text-blue-700";
      case "no_show":
      case "cancelled":
        return "bg-red-100 text-red-700";
      case "requested":
      case "completed":
        return "bg-gray-100 text-gray-700";
      default:
        return "bg-gray-100 text-gray-700";
    }
  };

  return (
    <div className="p-8">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
        <h1 className="text-2xl font-bold">Reservations</h1>
        <div className="flex gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border rounded px-3 py-2 text-sm"
          >
            <option value="">All Statuses</option>
            <option value="requested">Requested</option>
            <option value="confirmed">Confirmed</option>
            <option value="seated">Seated</option>
            <option value="no_show">No Show</option>
            <option value="cancelled">Cancelled</option>
            <option value="completed">Completed</option>
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
              <th className="text-left px-4 py-3 font-semibold">ID</th>
              <th className="text-left px-4 py-3 font-semibold">Store</th>
              <th className="text-left px-4 py-3 font-semibold">Customer</th>
              <th className="text-left px-4 py-3 font-semibold">Party Size</th>
              <th className="text-left px-4 py-3 font-semibold">Date</th>
              <th className="text-left px-4 py-3 font-semibold">Time</th>
              <th className="text-left px-4 py-3 font-semibold">Status</th>
              <th className="text-left px-4 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-gray-500">
                  Loading...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-gray-500">
                  No reservations found.
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-t">
                  <td className="px-4 py-3">{item.id}</td>
                  <td className="px-4 py-3">{item.store_name}</td>
                  <td className="px-4 py-3">{item.customer_name}</td>
                  <td className="px-4 py-3">{item.party_size}</td>
                  <td className="px-4 py-3">{item.date}</td>
                  <td className="px-4 py-3">{item.time}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-1 rounded-full text-xs font-medium ${badgeClass(
                        item.status
                      )}`}
                    >
                      {item.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {item.status === "requested" && (
                      <button
                        onClick={() => handleStatusChange(item.id, "confirmed")}
                        className="text-green-600 hover:underline mr-2"
                      >
                        Confirm
                      </button>
                    )}
                    {item.status === "confirmed" && (
                      <button
                        onClick={() => handleStatusChange(item.id, "seated")}
                        className="text-blue-600 hover:underline mr-2"
                      >
                        Seat
                      </button>
                    )}
                    {item.status === "seated" && (
                      <button
                        onClick={() => handleStatusChange(item.id, "completed")}
                        className="text-gray-600 hover:underline mr-2"
                      >
                        Complete
                      </button>
                    )}
                    {(item.status === "requested" || item.status === "confirmed") && (
                      <button
                        onClick={() => handleStatusChange(item.id, "cancelled")}
                        className="text-red-600 hover:underline"
                      >
                        Cancel
                      </button>
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
