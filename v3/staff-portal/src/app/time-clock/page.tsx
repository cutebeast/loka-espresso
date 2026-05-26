"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { clockIn, clockOut, startBreak, endBreak, getMyTimeEvents, api, type TimeEvent } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { usePolling } from "@/hooks/usePolling";
import PageHeader from "@/components/PageHeader";
import Alert from "@/components/Alert";
import Card from "@/components/Card";
import SkeletonCard from "@/components/SkeletonCard";
import { Play, Pause, Coffee, LogOut, Timer, AlertCircle } from "lucide-react";

type ShiftStatus = "out" | "in" | "break";

interface ActionConfig {
  key: string;
  label: string;
  sublabel: string;
  icon: typeof Play;
  color: string;
  bg: string;
  border: string;
  action: () => Promise<TimeEvent>;
}

const ACTIONS: Record<ShiftStatus, ActionConfig> = {
  out: {
    key: "clock_in",
    label: "CLOCK IN",
    sublabel: "Tap to start your shift",
    icon: Play,
    color: "#166534",
    bg: "#DCFCE7",
    border: "#86EFAC",
    action: clockIn,
  },
  in: {
    key: "start_break",
    label: "START BREAK",
    sublabel: "Tap for break time",
    icon: Coffee,
    color: "#92400E",
    bg: "#FEF3C7",
    border: "#FDE68A",
    action: startBreak,
  },
  break: {
    key: "end_break",
    label: "END BREAK",
    sublabel: "Tap to resume work",
    icon: Pause,
    color: "#1E40AF",
    bg: "#DBEAFE",
    border: "#BFDBFE",
    action: endBreak,
  },
};

const ALL_ACTIONS: Record<string, () => Promise<TimeEvent>> = {
  clock_in: clockIn,
  clock_out: clockOut,
  break_start: startBreak,
  break_end: endBreak,
};

export default function TimeClockPage() {
  const isAdmin = useIsAdmin();
  const [events, setEvents] = useState<TimeEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [attemptCount, setAttemptCount] = useState(0);
  const breakAccumulatedRef = useRef(0);
  const breakStartMsRef = useRef<number | null>(null);

  const today = new Date().toISOString().split("T")[0];

  const fetchEvents = useCallback(async () => {
    try {
      const data = await getMyTimeEvents(today);
      setEvents(Array.isArray(data) ? data : []);
      setError("");
    } catch (err: unknown) {
      console.error("Time clock: Failed to load events:", err);
      setError(parseApiError(err, "Failed to load"));
    } finally {
      setLoading(false);
    }
  }, [today]);

  usePolling(fetchEvents, [today], { interval: 30000 });

  const shiftStatus: ShiftStatus = (() => {
    if (events.length === 0) return "out";
    const last = events[events.length - 1];
    if (!last) return "out";
    if (last.event_type === "clock_out") return "out";
    if (last.event_type === "break_start") return "break";
    if (last.event_type === "break_end") return "in";
    if (last.event_type === "clock_in") return "in";
    return "out";
  })();

  const lastClockInMs = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i];
      if (!ev) continue;
      if (ev.event_type === "clock_in") {
        const d = new Date(ev.event_timestamp);
        return isNaN(d.getTime()) ? null : d.getTime();
      }
    }
    return null;
  }, [events]);

  useEffect(() => {
    if (shiftStatus !== "in" || !lastClockInMs) {
      setElapsed(0);
      return;
    }
    const getBreakOffset = () => breakAccumulatedRef.current + (breakStartMsRef.current ? Date.now() - breakStartMsRef.current : 0);
    const updateElapsed = () => setElapsed(Math.floor((Date.now() - lastClockInMs - getBreakOffset()) / 1000));
    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [shiftStatus, lastClockInMs]);

  useEffect(() => {
    if (shiftStatus === "break" && breakStartMsRef.current === null) {
      breakStartMsRef.current = Date.now();
    } else if (shiftStatus !== "break" && breakStartMsRef.current !== null) {
      breakAccumulatedRef.current += Date.now() - breakStartMsRef.current;
      breakStartMsRef.current = null;
    }
    if (shiftStatus === "out") {
      breakAccumulatedRef.current = 0;
      breakStartMsRef.current = null;
    }
  }, [shiftStatus]);

  const formatElapsed = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const handleMainAction = () => {
    if (isAdmin) return;
    const cfg = ACTIONS[shiftStatus];
    if (!cfg) return;
    setPendingAction(cfg.key);
    setShowPin(true);
    setPin("");
  };

  const verifyAndExecute = async () => {
    if (!pendingAction || !pin || pin.length < 4) {
      setError("Enter 4-digit PIN");
      return;
    }
    setActionLoading(true);
    try {
      const delay = Math.min(3000, attemptCount * 1000);
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      const vd = await api.post<{ valid?: boolean; data?: { valid?: boolean } }>("/staff/auth/verify-pin", { pin });
      if (!(vd?.valid || vd?.data?.valid)) {
        setAttemptCount((c) => c + 1);
        setError("Wrong PIN. Try again.");
        setActionLoading(false);
        return;
      }
      setAttemptCount(0);
      const actionFn = ALL_ACTIONS[pendingAction];
      if (!actionFn) {
        setError("Invalid action selected");
        setActionLoading(false);
        return;
      }
      await actionFn();
      await fetchEvents();
      setShowPin(false);
      setPin("");
      setPendingAction(null);
    } catch (err: unknown) {
      console.error("Time clock: Action failed:", err);
      setError(parseApiError(err, "Failed"));
    } finally {
      setActionLoading(false);
    }
  };

  const handleClockOut = () => {
    if (isAdmin) return;
    setPendingAction("clock_out");
    setShowPin(true);
    setPin("");
  };

  if (loading) {
    return (
      <div style={{ padding: 24, maxWidth: 600, margin: "0 auto" }}>
        <PageHeader title="Time Clock" />
        <SkeletonCard count={3} />
      </div>
    );
  }

  const cfg = ACTIONS[shiftStatus];
  const Icon = cfg?.icon || Play;

  return (
    <div style={{ padding: 24, maxWidth: 600, margin: "0 auto" }}>
      <PageHeader title="Time Clock" />

      {isAdmin && (
        <Alert variant="warning" style={{ marginBottom: 16 }}>
          <div className="flex items-start gap-3">
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>Admin view only. You cannot clock in/out.</span>
          </div>
        </Alert>
      )}

      {error && <Alert variant="error" onDismiss={() => setError("")}>{error}</Alert>}

      {/* Big Status Circle */}
      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <div style={{
          width: 140, height: 140, borderRadius: "50%", margin: "0 auto 16px",
          display: "flex", alignItems: "center", justifyContent: "center",
          background: shiftStatus === "in" ? "#DCFCE7" : shiftStatus === "break" ? "#FEF3C7" : "#F3F4F6",
          border: `6px solid ${shiftStatus === "in" ? "#86EFAC" : shiftStatus === "break" ? "#FDE68A" : "#E5E7EB"}`,
        }}>
          <Icon size={56} style={{
            color: shiftStatus === "in" ? "#166534" : shiftStatus === "break" ? "#92400E" : "#6B7280",
          }} />
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, color: "var(--color-text-primary)" }}>
          {shiftStatus === "in" ? "Working Now" : shiftStatus === "break" ? "On Break" : "Not Clocked In"}
        </div>
        {shiftStatus === "in" && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8, marginTop: 12,
            fontSize: 32, fontFamily: "var(--font-mono)", fontWeight: 700,
            background: "var(--color-bg-muted)", padding: "10px 24px", borderRadius: "var(--radius-md)",
            border: "2px solid var(--color-border-light)",
          }}>
            <Timer size={24} />
            {formatElapsed(elapsed)}
          </div>
        )}
      </div>

      {/* One Big Action Button */}
      {!showPin && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
          <button
            onClick={handleMainAction}
            disabled={isAdmin || actionLoading}
            className="btn"
            style={{
              width: "100%",
              padding: "32px 16px",
              flexDirection: "column",
              gap: 8,
              border: `4px solid ${cfg?.border || "#E5E7EB"}`,
              background: cfg?.bg || "#F9FAFB",
              color: cfg?.color || "#374151",
              fontSize: 22,
              fontWeight: 800,
              borderRadius: "var(--radius-lg)",
              opacity: isAdmin ? 0.4 : 1,
              cursor: isAdmin ? "not-allowed" : "pointer",
            }}
          >
            {actionLoading ? <Timer size={40} /> : <cfg.icon size={40} />}
            {actionLoading ? "Please wait..." : cfg?.label}
            <span style={{ fontSize: 13, fontWeight: 400, opacity: 0.7 }}>{cfg?.sublabel}</span>
          </button>

          {/* Clock Out button - only when clocked in */}
          {shiftStatus === "in" && (
            <button
              onClick={handleClockOut}
              disabled={isAdmin || actionLoading}
              className="btn"
              style={{
                width: "100%",
                padding: "20px 16px",
                flexDirection: "column",
                gap: 6,
                border: "2px solid #FECACA",
                background: "#FEF2F2",
                color: "#991B1B",
                fontSize: 16,
                fontWeight: 700,
                borderRadius: "var(--radius-lg)",
                opacity: isAdmin ? 0.4 : 1,
                cursor: isAdmin ? "not-allowed" : "pointer",
              }}
            >
              <LogOut size={28} />
              CLOCK OUT
              <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.7 }}>End your shift</span>
            </button>
          )}
        </div>
      )}

      {/* PIN Entry */}
      {showPin && (
        <Card style={{ marginBottom: 24, textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
            Enter your PIN
          </div>
          <form onSubmit={e => e.preventDefault()} style={{ display: "inline" }}>
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={e => setPin(e.target.value)}
            placeholder="4 digits"
            maxLength={6}
            className="form-input"
            style={{ textAlign: "center", fontSize: 24, letterSpacing: 8, marginBottom: 16 }}
            autoFocus
          />
          </form>
          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-ghost flex-1" onClick={() => { setShowPin(false); setPin(""); setPendingAction(null); }}>
              Cancel
            </button>
            <button
              className="btn btn-primary flex-1"
              onClick={verifyAndExecute}
              disabled={actionLoading || pin.length < 4}
            >
              {actionLoading ? "Checking..." : "OK"}
            </button>
          </div>
        </Card>
      )}

      {/* Today's Events - simplified */}
      <Card title="Today">
        {events.length === 0 ? (
          <div style={{ textAlign: "center", padding: 24, color: "var(--color-text-muted)", fontSize: 14 }}>
            No records yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {events.slice().reverse().map((evt) => (
              <div key={evt.id} style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "10px 12px", background: "var(--color-bg-muted)", borderRadius: "var(--radius-md)"
              }}>
                <span style={{ fontSize: 14, fontWeight: 600, textTransform: "capitalize" }}>
                  {evt.event_type.replace(/_/g, " ")}
                </span>
                <span style={{ fontSize: 13, color: "var(--color-text-muted)", fontFamily: "var(--font-mono)" }}>
                  {(() => { const d = new Date(evt.event_timestamp); return isNaN(d.getTime()) ? "—" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); })()}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
