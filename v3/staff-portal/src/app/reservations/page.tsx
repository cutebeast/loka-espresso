"use client";

import { useEffect, useState, useCallback } from "react";
import {
  getReservations,
  updateReservationStatus,
  getStores,
  Reservation,
  ReservationStatus,
  Store,
} from "@/lib/api";
import StatusBadge from "@/components/StatusBadge";
import {
  RefreshCw,
  Filter,
  CheckCircle2,
  LogIn,
  Check,
  X,
  CalendarDays,
  Store as StoreIcon,
  AlertCircle,
} from "lucide-react";

const statusFilters: { label: string; value: ReservationStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Requested", value: "requested" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Seated", value: "seated" },
  { label: "Completed", value: "completed" },
  { label: "No Show", value: "no_show" },
  { label: "Cancelled", value: "cancelled" },
];

function isOverdue(reservation: Reservation): boolean {
  if (reservation.status === "cancelled" || reservation.status === "completed" || reservation.status === "no_show") {
    return false;
  }
  const now = new Date();
  const resDateTime = new Date(`${reservation.date}T${reservation.time}`);
  return now.getTime() > resDateTime.getTime() + 15 * 60 * 1000;
}

export default function ReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState<number>(2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<ReservationStatus | "all">("all");
  const [dateFilter, setDateFilter] = useState<string>(() => {
    const today = new Date();
    return today.toISOString().split("T")[0];
  });
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchStores = useCallback(async () => {
    try {
      const data = await getStores();
      setStores(Array.isArray(data) ? data : []);
      const physical = Array.isArray(data) ? data.find((s) => s.type === "physical" || s.id === 2) : undefined;
      if (physical) setStoreId(physical.id);
    } catch {
      // ignore store fetch errors
    }
  }, []);

  const fetchReservations = useCallback(async () => {
    try {
      const data = await getReservations(storeId, dateFilter, filter === "all" ? undefined : filter);
      setReservations(Array.isArray(data) ? data : []);
      setError("");
    } catch (err: any) {
      setError(err.message || "Failed to load reservations");
    } finally {
      setLoading(false);
    }
  }, [storeId, dateFilter, filter]);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  useEffect(() => {
    fetchReservations();
    const interval = setInterval(fetchReservations, 30000);
    return () => clearInterval(interval);
  }, [fetchReservations]);

  const handleUpdateStatus = async (id: string, status: ReservationStatus) => {
    setUpdatingId(id);
    try {
      await updateReservationStatus(id, status);
      await fetchReservations();
    } catch (err: any) {
      setError(err.message || "Failed to update reservation");
    } finally {
      setUpdatingId(null);
    }
  };

  const filteredReservations = reservations;

  const counts = statusFilters.reduce((acc, s) => {
    acc[s.value] = s.value === "all" ? reservations.length : reservations.filter((r) => r.status === s.value).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold">Reservations</h2>
        <button
          onClick={fetchReservations}
          className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-800 px-3 py-1.5 rounded border border-gray-200 hover:bg-gray-50 transition"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>}

      <div className="flex flex-col lg:flex-row lg:items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <StoreIcon size={16} className="text-gray-400" />
          <select
            value={storeId}
            onChange={(e) => setStoreId(Number(e.target.value))}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
          >
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
            {stores.length === 0 && <option value={2}>Store 2</option>}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <CalendarDays size={16} className="text-gray-400" />
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
        <Filter size={16} className="text-gray-400 shrink-0" />
        {statusFilters.map((s) => (
          <button
            key={s.value}
            onClick={() => setFilter(s.value)}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap transition ${
              filter === s.value
                ? "bg-slate-800 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {s.label} ({counts[s.value] ?? 0})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-gray-500 text-sm">Loading reservations...</div>
      ) : filteredReservations.length === 0 ? (
        <div className="text-gray-400 text-sm">No reservations found.</div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Guest</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Party</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Date</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Time</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Table</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Status</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredReservations.map((res) => {
                const overdue = isOverdue(res);
                return (
                  <tr key={res.id} className={overdue ? "bg-red-50" : ""}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {overdue && <AlertCircle size={14} className="text-red-500 shrink-0" />}
                        <div>
                          <p className="font-medium">{res.guest_name}</p>
                          {res.phone && <p className="text-xs text-gray-400">{res.phone}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{res.party_size}</td>
                    <td className="px-4 py-3 text-gray-700">{res.date}</td>
                    <td className={`px-4 py-3 ${overdue ? "text-red-700 font-medium" : "text-gray-700"}`}>{res.time}</td>
                    <td className="px-4 py-3 text-gray-700">{res.table_number || "—"}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={res.status} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {res.status === "requested" && (
                          <button
                            onClick={() => handleUpdateStatus(res.id, "confirmed")}
                            disabled={updatingId === res.id}
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-green-300 text-green-700 hover:bg-green-50 transition disabled:opacity-50"
                          >
                            <CheckCircle2 size={12} />
                            Confirm
                          </button>
                        )}
                        {res.status === "confirmed" && (
                          <button
                            onClick={() => handleUpdateStatus(res.id, "seated")}
                            disabled={updatingId === res.id}
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-blue-300 text-blue-700 hover:bg-blue-50 transition disabled:opacity-50"
                          >
                            <LogIn size={12} />
                            Seat
                          </button>
                        )}
                        {(res.status === "confirmed" || res.status === "seated") && (
                          <button
                            onClick={() => handleUpdateStatus(res.id, "completed")}
                            disabled={updatingId === res.id}
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
                          >
                            <Check size={12} />
                            Complete
                          </button>
                        )}
                        {(res.status === "requested" || res.status === "confirmed") && (
                          <button
                            onClick={() => handleUpdateStatus(res.id, "cancelled")}
                            disabled={updatingId === res.id}
                            className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-50 transition disabled:opacity-50"
                          >
                            <X size={12} />
                            Cancel
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
