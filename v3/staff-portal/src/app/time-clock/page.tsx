"use client";

import { useEffect, useState, useCallback } from "react";
import { clockIn, clockOut, startBreak, endBreak, getMyTimeEvents, type TimeEvent } from "@/lib/api";
import { Clock, Play, Pause, Coffee, LogOut, Timer } from "lucide-react";

type ShiftStatus = "out" | "in" | "break";

export default function TimeClockPage() {
  const [events, setEvents] = useState<TimeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const today = new Date().toISOString().split("T")[0];

  const fetchEvents = useCallback(async () => {
    try {
      const data = await getMyTimeEvents(today);
      setEvents(Array.isArray(data) ? data : []);
      setError("");
    } catch (err: any) {
      setError(err.message || "Failed to load time events");
    } finally {
      setLoading(false);
    }
  }, [today]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const shiftStatus: ShiftStatus = (() => {
    if (events.length === 0) return "out";
    const last = events[events.length - 1];
    if (last.event_type === "clock_out") return "out";
    if (last.event_type === "start_break") return "break";
    if (last.event_type === "end_break") return "in";
    if (last.event_type === "clock_in") return "in";
    return "out";
  })();

  const lastClockIn = (() => {
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].event_type === "clock_in") return new Date(events[i].timestamp);
    }
    return null;
  })();

  useEffect(() => {
    if (shiftStatus !== "in" || !lastClockIn) {
      setElapsed(0);
      return;
    }
    const interval = setInterval(() => {
      const now = Date.now();
      const start = lastClockIn.getTime();
      setElapsed(Math.floor((now - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [shiftStatus, lastClockIn]);

  const formatElapsed = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const handleAction = async (action: string, fn: () => Promise<TimeEvent>) => {
    setActionLoading(action);
    try {
      await fn();
      await fetchEvents();
    } catch (err: any) {
      setError(err.message || `Failed to ${action}`);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Clock size={20} />
          Time Clock
        </h2>
        <div className="text-sm text-gray-500">{new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</div>
      </div>

      {error && <div className="mb-4 text-sm text-red-600 bg-red-50 p-3 rounded">{error}</div>}

      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex flex-col items-center justify-center gap-4">
          <div className="text-sm text-gray-500 uppercase tracking-wider font-medium">
            Current Status
          </div>
          <div className={`text-2xl font-bold ${shiftStatus === "in" ? "text-green-600" : shiftStatus === "break" ? "text-amber-600" : "text-gray-600"}`}>
            {shiftStatus === "in" ? "Clocked In" : shiftStatus === "break" ? "On Break" : "Clocked Out"}
          </div>
          {shiftStatus === "in" && (
            <div className="flex items-center gap-2 text-lg font-mono text-slate-700 bg-slate-50 px-4 py-2 rounded-lg border border-slate-200">
              <Timer size={18} />
              {formatElapsed(elapsed)}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-8">
          <button
            onClick={() => handleAction("clock_in", clockIn)}
            disabled={shiftStatus !== "out" || actionLoading !== null}
            className="flex flex-col items-center justify-center gap-2 px-4 py-5 rounded-lg border-2 border-green-200 bg-green-50 text-green-700 hover:bg-green-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play size={24} />
            <span className="text-sm font-semibold">CLOCK IN</span>
          </button>

          <button
            onClick={() => handleAction("start_break", startBreak)}
            disabled={shiftStatus !== "in" || actionLoading !== null}
            className="flex flex-col items-center justify-center gap-2 px-4 py-5 rounded-lg border-2 border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Coffee size={24} />
            <span className="text-sm font-semibold">START BREAK</span>
          </button>

          <button
            onClick={() => handleAction("end_break", endBreak)}
            disabled={shiftStatus !== "break" || actionLoading !== null}
            className="flex flex-col items-center justify-center gap-2 px-4 py-5 rounded-lg border-2 border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Pause size={24} />
            <span className="text-sm font-semibold">END BREAK</span>
          </button>

          <button
            onClick={() => handleAction("clock_out", clockOut)}
            disabled={shiftStatus !== "in" || actionLoading !== null}
            className="flex flex-col items-center justify-center gap-2 px-4 py-5 rounded-lg border-2 border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <LogOut size={24} />
            <span className="text-sm font-semibold">CLOCK OUT</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Today&apos;s Events</h3>
          <span className="text-xs text-gray-400">{events.length} event{events.length !== 1 ? "s" : ""}</span>
        </div>
        {loading ? (
          <div className="p-6 text-gray-500 text-sm">Loading events...</div>
        ) : events.length === 0 ? (
          <div className="p-6 text-gray-400 text-sm">No time events recorded today.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Time</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Event</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Location</th>
                <th className="text-left px-5 py-3 font-medium text-gray-500">Verified</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {events.map((evt) => (
                <tr key={evt.id}>
                  <td className="px-5 py-3 text-gray-600">{new Date(evt.timestamp).toLocaleTimeString()}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      evt.event_type === "clock_in" ? "bg-green-100 text-green-700" :
                      evt.event_type === "clock_out" ? "bg-red-100 text-red-700" :
                      evt.event_type === "start_break" ? "bg-amber-100 text-amber-700" :
                      "bg-blue-100 text-blue-700"
                    }`}>
                      {evt.event_type.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-gray-500">{evt.location || "—"}</td>
                  <td className="px-5 py-3 text-gray-500">{evt.verified_by || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
