"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  getReservations, updateReservationStatus, getTables,
  Reservation, ReservationStatus, type Table,
} from "@/lib/api";
import { usePolling } from "@/hooks/usePolling";
import PageHeader from "@/components/PageHeader";
import Alert from "@/components/Alert";
import EmptyState from "@/components/EmptyState";
import StatusBadge from "@/components/StatusBadge";
import SkeletonCard from "@/components/SkeletonCard";
import Modal from "@/components/Modal";
import {
  RefreshCw, CalendarDays, AlertCircle, CheckCircle2,
  LogIn, Check, X, UtensilsCrossed, Users,
  Bell
} from "lucide-react";

const CANCELLED_STATUSES: ReservationStatus[] = ["cancelled_by_guest", "cancelled_by_merchant"];

const statusFilters: { label: string; value: ReservationStatus | "all" | "cancelled" }[] = [
  { label: "All", value: "all" },
  { label: "Requested", value: "requested" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Seated", value: "seated" },
  { label: "Completed", value: "completed" },
  { label: "No Show", value: "no_show" },
  { label: "Cancelled", value: "cancelled" },
];

function parseTime(timeStr: string): { hour: number; minute: number } | null {
  const clean = timeStr.trim();
  // 24-hour format: "14:30"
  const m24 = clean.match(/^(\d{1,2}):(\d{2})$/);
  if (m24 && m24[1] && m24[2]) {
    const h = parseInt(m24[1], 10);
    const min = parseInt(m24[2], 10);
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) return { hour: h, minute: min };
  }
  // 12-hour format: "2:30 PM", "9:00 AM"
  const m12 = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM|am|pm)$/i);
  if (m12 && m12[1] && m12[2] && m12[3]) {
    let h = parseInt(m12[1], 10);
    const min = parseInt(m12[2], 10);
    const period = m12[3].toUpperCase();
    if (period === "PM" && h !== 12) h += 12;
    if (period === "AM" && h === 12) h = 0;
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) return { hour: h, minute: min };
  }
  return null;
}

function isOverdue(reservation: Reservation): boolean {
  if (["completed", "no_show", ...CANCELLED_STATUSES].includes(reservation.status)) return false;
  const now = new Date();
  const t = parseTime(reservation.reservation_time);
  if (!t) return false;
  const resDateTime = new Date(`${reservation.reservation_date}T${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}:00`);
  if (isNaN(resDateTime.getTime())) return false;
  return now.getTime() > resDateTime.getTime() + 15 * 60 * 1000;
}

export default function ReservationsPage() {
  const router = useRouter();
  const [reservations, setReservations] = useState<Reservation[]>([]);

  const storeId = Number(typeof window !== "undefined" ? localStorage.getItem("staffStoreId") || "0" : "0");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [filter, setFilter] = useState<ReservationStatus | "all" | "cancelled">("all");
  const [dateFilter, setDateFilter] = useState<string>(() => new Date().toISOString().split("T")[0]!);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  // Confirm modal state
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [confirmRes, setConfirmRes] = useState<Reservation | null>(null);
  const [tables, setTables] = useState<Table[]>([]);
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);


  const fetchReservations = useCallback(async () => {
    try {
      const statusParam = filter === "all" || filter === "cancelled" ? undefined : filter;
      const data = await getReservations(storeId, dateFilter, statusParam);
      const all = Array.isArray(data) ? data : [];
      if (filter === "cancelled") {
        setReservations(all.filter(r => CANCELLED_STATUSES.includes(r.status)));
      } else {
        setReservations(all);
      }
      setError("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load reservations";
      console.error("Failed to load reservations:", err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [storeId, dateFilter, filter]);

  usePolling(fetchReservations, [storeId, dateFilter, filter], { interval: 30000 });

  const handleUpdateStatus = async (id: number, status: ReservationStatus) => {
    setUpdatingId(id);
    try {
      await updateReservationStatus(id, status);
      await fetchReservations();
      setSuccess(`Reservation ${status.replace(/_/g, " ")}`);
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => setSuccess(""), 3000);
    } catch (err: unknown) {
      console.error("Failed to update reservation:", err);
      setError(err instanceof Error ? err.message : "Failed to update reservation");
    } finally {
      setUpdatingId(null);
    }
  };

  const openConfirmModal = async (res: Reservation) => {
    setConfirmRes(res);
    setSelectedTableId(res.dining_table_id || null);
    setConfirmModalOpen(true);
    try {
      const tbls = await getTables(storeId);
      setTables(Array.isArray(tbls) ? tbls.filter((t) => (t.current_status === "available" && res.party_size != null && !isNaN(res.party_size) && t.capacity >= res.party_size) || t.id === res.dining_table_id) : []);
    } catch (e) { console.error("Failed to load tables for reservation:", e); setTables([]); }
  };

  const handleConfirmReservation = async () => {
    if (!confirmRes) return;
    setUpdatingId(confirmRes.id);
    try {
      await updateReservationStatus(confirmRes.id, "confirmed", selectedTableId);
      await fetchReservations();
      setSuccess("Reservation confirmed");
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => setSuccess(""), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to confirm reservation");
    } finally {
      setUpdatingId(null);
      setConfirmModalOpen(false);
      setConfirmRes(null);
      setSelectedTableId(null);
    }
  };

  const pendingCount = reservations.filter(r => r.status === "requested").length;

  const counts = statusFilters.reduce((acc, s) => {
    if (s.value === "all") acc[s.value] = reservations.length;
    else if (s.value === "cancelled") acc[s.value] = reservations.filter(r => CANCELLED_STATUSES.includes(r.status)).length;
    else acc[s.value] = reservations.filter((r) => r.status === s.value).length;
    return acc;
  }, {} as Record<string, number>);



  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <PageHeader
        title="Reservations"
        subtitle={`${reservations.length} reservations`}
       
        action={
          <button className="btn btn-ghost btn-sm" onClick={fetchReservations}>
            <RefreshCw size={14} /> Refresh
          </button>
        }
      />

      {error && <Alert variant="error" onDismiss={() => setError("")}>{error}</Alert>}
      {success && <Alert variant="success" onDismiss={() => setSuccess("")} autoDismiss={3000}>{success}</Alert>}

      {/* Pending requests banner */}
      {pendingCount > 0 && (
        <div className="card" style={{ marginBottom: 16, borderLeft: "4px solid var(--color-warning)", background: "#fffbeb" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Bell size={18} style={{ color: "var(--color-warning)" }} />
            <div>
              <strong style={{ fontSize: 14 }}>{pendingCount} pending reservation{pendingCount > 1 ? "s" : ""}</strong>
              <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: 0 }}>
                Review and confirm or cancel depending on seating availability.
              </p>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <div className="flex items-center gap-2">
          <CalendarDays size={16} style={{ color: "var(--color-text-muted)" }} />
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="form-input"
            style={{ width: 150 }}
          />
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, overflowX: "auto", paddingBottom: 4 }}>
        {statusFilters.map((s) => (
          <button
            key={s.value}
            onClick={() => setFilter(s.value)}
            className={`btn btn-sm ${filter === s.value ? "btn-primary" : "btn-ghost"}`}
          >
            {s.label} ({counts[s.value] ?? 0})
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonCard count={6} />
      ) : reservations.length === 0 ? (
        <EmptyState title="No reservations" description="No reservations found for the selected date." icon={<CalendarDays size={48} />} />
      ) : (
        <div className="table-container" style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--color-border-light)" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Guest</th><th>Party</th><th>Date</th><th>Time</th><th>Table</th><th>Status</th><th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {reservations.map((res) => {
                const overdue = isOverdue(res);
                return (
                  <tr key={res.id} style={overdue ? { background: "var(--color-error-bg)" } : {}}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {overdue && <AlertCircle size={14} style={{ color: "var(--color-error)", flexShrink: 0 }} />}
                        <div>
                          <p style={{ fontWeight: 600, fontSize: 14, margin: 0 }}>{res.customer_name}</p>
                          {res.customer_phone && <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: 0 }}>{res.customer_phone}</p>}
                          {res.special_requests && <p style={{ fontSize: 11, color: "var(--color-text-muted)", margin: "2px 0 0", fontStyle: "italic" }}>&ldquo;{res.special_requests}&rdquo;</p>}
                        </div>
                      </div>
                    </td>
                    <td>{res.party_size}</td>
                    <td>{res.reservation_date}</td>
                    <td style={overdue ? { color: "var(--color-error)", fontWeight: 700 } : {}}>{res.reservation_time}</td>
                    <td>{res.table_number || "—"}</td>
                    <td><StatusBadge status={res.status} /></td>
                    <td style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                        {res.status === "requested" && (
                          <button className="btn btn-sm btn-success" onClick={() => openConfirmModal(res)} disabled={updatingId === res.id}>
                            <CheckCircle2 size={12} /> Confirm
                          </button>
                        )}
                        {res.status === "confirmed" && (
                          <button className="btn btn-sm btn-primary" onClick={() => handleUpdateStatus(res.id, "seated")} disabled={updatingId === res.id}>
                            <LogIn size={12} /> Seat
                          </button>
                        )}
                        {(res.status === "confirmed" || res.status === "seated") && (
                          <button className="btn btn-sm btn-outline" onClick={() => handleUpdateStatus(res.id, "completed")} disabled={updatingId === res.id} aria-label="Complete reservation">
                            <Check size={12} />
                          </button>
                        )}
                        {(res.status === "requested" || res.status === "confirmed") && (
                          <button className="btn btn-sm btn-danger" onClick={() => handleUpdateStatus(res.id, "cancelled_by_merchant")} disabled={updatingId === res.id} aria-label="Cancel reservation">
                            <X size={12} />
                          </button>
                        )}
                        {res.status === "seated" && (
                          <button className="btn btn-sm btn-primary" onClick={() => router.push(`/pos?table=${res.dining_table_id}&type=dine_in`)}>
                            <UtensilsCrossed size={12} /> Order
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

      {/* Confirm Modal */}
      <Modal
        open={confirmModalOpen}
        onClose={() => { setConfirmModalOpen(false); setConfirmRes(null); }}
        title="Confirm Reservation"
        footer={
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button className="btn btn-ghost" onClick={() => { setConfirmModalOpen(false); setConfirmRes(null); }}>
              Cancel
            </button>
            <button
              className="btn btn-success"
              onClick={handleConfirmReservation}
              disabled={updatingId === confirmRes?.id}
            >
              {updatingId === confirmRes?.id ? "Confirming..." : "Confirm Reservation"}
            </button>
          </div>
        }
      >
        {confirmRes && (
          <div style={{ padding: "8px 0" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8, padding: 12, background: "var(--color-bg-muted)", borderRadius: "var(--radius-md)" }}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: "var(--color-primary)", color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>
                {(confirmRes.customer_name || "?").charAt(0).toUpperCase()}
              </div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{confirmRes.customer_name}</div>
                <div style={{ fontSize: 12, color: "var(--color-text-muted)" }}>
                  <Users size={10} style={{ display: "inline", marginRight: 4 }} />
                  {confirmRes.party_size} pax · {confirmRes.reservation_time}
                </div>
              </div>
            </div>
            <div style={{ marginTop: 12 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Assign Table</label>
              {tables.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--color-text-muted)" }}>No available tables</p>
              ) : (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <button className={`btn btn-sm ${selectedTableId === null ? "btn-primary" : "btn-ghost"}`} onClick={() => setSelectedTableId(null)}>No Table</button>
                  {tables.map((t) => (
                    <button key={t.id} className={`btn btn-sm ${selectedTableId === t.id ? "btn-primary" : "btn-ghost"}`} onClick={() => setSelectedTableId(t.id)}>
                      {t.table_number}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
