"use client";

import { useTranslation } from "@/hooks/useTranslation";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getMyShifts, type StaffShift } from "@/lib/api";
import { ChevronLeft, CalendarDays, Clock } from "lucide-react";
function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}
function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}
function statusBadge(status: string) {
  const map: Record<string, string> = {
    scheduled: "#6B7280",
    confirmed: "#2563EB",
    in_progress: "#D97706",
    completed: "#059669",
    cancelled: "#DC2626",
    no_show: "#991B1B"
  };
  return <span style={{
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    padding: "2px 8px",
    borderRadius: 999,
    color: "white",
    background: map[status] || "#6B7280"
  }}>
      {status.replace("_", " ")}
    </span>;
}
export default function ShiftsPage() {
  const {
    t
  } = useTranslation();
  const router = useRouter();
  const [shifts, setShifts] = useState<StaffShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    getMyShifts(today, future).then(data => setShifts(data || [])).catch(e => {
      console.error(e);
      setError("Could not load shifts");
    }).finally(() => setLoading(false));
  }, []);
  return <div style={{
    padding: 24,
    maxWidth: 720,
    margin: "0 auto"
  }}>
      <div style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: 20
    }}>
        <button onClick={() => router.push("/")} className="btn btn-ghost btn-sm" style={{
        padding: 8
      }}>
          <ChevronLeft size={20} />
        </button>
        <h1 style={{
        fontSize: 20,
        fontWeight: 800,
        margin: 0
      }}>{t("shifts.my_shifts")}</h1>
      </div>

      {loading ? <p style={{
      color: "var(--color-text-muted)"
    }}>{t("shifts.loading")}</p> : error ? <p style={{
      color: "var(--color-error)"
    }}>{error}</p> : shifts.length === 0 ? <div className="card" style={{
      padding: 24,
      textAlign: "center"
    }}>
          <CalendarDays size={40} style={{
        opacity: 0.3,
        marginBottom: 12
      }} />
          <p style={{
        color: "var(--color-text-muted)"
      }}>{t("shifts.no_upcoming_shifts_scheduled")}</p>
        </div> : <div style={{
      display: "flex",
      flexDirection: "column",
      gap: 12
    }}>
          {shifts.map(s => <div key={s.id} className="card" style={{
        padding: 16
      }}>
              <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: 8
        }}>
                <div style={{
            display: "flex",
            alignItems: "center",
            gap: 8
          }}>
                  <CalendarDays size={16} style={{
              opacity: 0.5
            }} />
                  <span style={{
              fontWeight: 700
            }}>{formatDate(s.shift_date)}</span>
                </div>
                {statusBadge(s.status)}
              </div>
              <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          color: "var(--color-text-muted)",
          fontSize: 14
        }}>
                <Clock size={16} />
                <span>{formatTime(s.planned_start)} – {formatTime(s.planned_end)}</span>
              </div>
              {s.notes && <p style={{
          margin: "8px 0 0",
          fontSize: 13,
          color: "var(--color-text-muted)"
        }}>{s.notes}</p>}
            </div>)}
        </div>}
    </div>;
}