"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n";
import { useCurrency } from "@/hooks/useCurrency";
import { Edit2, ChevronLeft, ChevronRight } from "lucide-react";

interface Variant {
  id: number;
  variant_name: string;
  price_adjustment: number;
}
interface ExperienceItem {
  id: number;
  item_code: string;
  item_name: string;
  description: string | null;
  base_price: number;
  image_url: string | null;
  is_available: boolean;
  variants?: Variant[];
}
interface Category {
  id: number;
  category_name: string;
  slug: string;
}
interface BookingOrder {
  id: number;
  order_number: string;
  status: string;
  payment_status?: string;
  total_amount: number;
  customer_name?: string;
  created_at: string;
}
interface ClassSession {
  id: number;
  menu_item_id: number;
  session_date: string;
  start_time: string;
  capacity: number;
  booked_pax: number;
  location: string | null;
  notes: string | null;
  is_active: boolean;
}

const PAGE_SIZE = 10;

export default function ExperiencesPage() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const { format } = useCurrency();
  const [items, setItems] = useState<ExperienceItem[]>([]);
  const [sessions, setSessions] = useState<Record<number, ClassSession[]>>({});
  const [sessionForm, setSessionForm] = useState<Record<number, { date: string; time: string; capacity: string; location: string }>>({});
  const [sessionSaving, setSessionSaving] = useState<number | null>(null);
  const [bookings, setBookings] = useState<BookingOrder[]>([]);
  const [bookingsTotal, setBookingsTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const cats = await api.getRaw<{ items: Category[] }>("/admin/menu/categories?per_page=50");
      const expCat = (cats.items || []).find(c => c.slug === "experiences");
      if (!expCat) {
        setItems([]);
        setBookings([]);
        setBookingsTotal(0);
        return;
      }
      const [itemsRes, ordersRes] = await Promise.all([
        api.getRaw<{ items: ExperienceItem[] }>(`/admin/menu/items?category_id=${expCat.id}&per_page=50`),
        api.getRaw<{ items: BookingOrder[]; total: number }>(`/admin/orders?category_slug=experiences&per_page=${PAGE_SIZE}&page=${page}`),
      ]);
      setItems(itemsRes.items || []);
      setBookings(ordersRes.items || []);
      setBookingsTotal(ordersRes.total || 0);
      // Load sessions per class
      const sessMap: Record<number, ClassSession[]> = {};
      await Promise.all((itemsRes.items || []).map(async item => {
        try {
          const r = await api.getRaw<ClassSession[]>(`/admin/menu/items/${item.id}/sessions`);
          sessMap[item.id] = Array.isArray(r) ? r : [];
        } catch { sessMap[item.id] = []; }
      }));
      setSessions(sessMap);
    } catch (e: any) {
      setError(e.message || t("admin.errors.loadFailed", "Failed to load"));
    } finally {
      setLoading(false);
    }
  }, [page, t]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(bookingsTotal / PAGE_SIZE));

  const formFor = (itemId: number) =>
    sessionForm[itemId] ?? { date: "", time: "10:00", capacity: "4", location: "" };
  const setFormFor = (itemId: number, patch: Partial<{ date: string; time: string; capacity: string; location: string }>) =>
    setSessionForm(prev => ({ ...prev, [itemId]: { ...formFor(itemId), ...patch } }));

  const addSession = async (itemId: number) => {
    const f = formFor(itemId);
    if (!f.date || !f.time || !f.capacity) return;
    setSessionSaving(itemId);
    try {
      await api.post(`/admin/menu/items/${itemId}/sessions`, {
        session_date: f.date,
        start_time: f.time,
        capacity: Number(f.capacity),
        location: f.location || null,
      });
      setSessionForm(prev => ({ ...prev, [itemId]: { date: "", time: "10:00", capacity: "4", location: "" } }));
      const r = await api.getRaw<ClassSession[]>(`/admin/menu/items/${itemId}/sessions`);
      setSessions(prev => ({ ...prev, [itemId]: Array.isArray(r) ? r : [] }));
    } catch (e: any) {
      setError(e.message || t("menu_experiences.session_save_failed", "Failed to save session"));
    } finally {
      setSessionSaving(null);
    }
  };

  const toggleSession = async (sess: ClassSession) => {
    try {
      await api.put(`/admin/class-sessions/${sess.id}`, { is_active: !sess.is_active });
      const r = await api.getRaw<ClassSession[]>(`/admin/menu/items/${sess.menu_item_id}/sessions`);
      setSessions(prev => ({ ...prev, [sess.menu_item_id]: Array.isArray(r) ? r : [] }));
    } catch (e: any) {
      setError(e.message || t("menu_experiences.session_save_failed", "Failed to save session"));
    }
  };

  const deleteSession = async (sess: ClassSession) => {
    if (!window.confirm(t("menu_experiences.delete_session_confirm", "Delete this session?"))) return;
    try {
      await api.del(`/admin/class-sessions/${sess.id}`);
      const r = await api.getRaw<ClassSession[]>(`/admin/menu/items/${sess.menu_item_id}/sessions`);
      setSessions(prev => ({ ...prev, [sess.menu_item_id]: Array.isArray(r) ? r : [] }));
    } catch (e: any) {
      setError(e.message || t("menu_experiences.session_delete_failed", "Cannot delete session"));
    }
  };

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("menu_experiences.experiences_workshops", "Experiences & Workshops")}</h1>
          <p className="page-subtitle">
            {items.length} {t("menu_experiences.classes", "classes")} · {bookingsTotal} {t("menu_experiences.bookings", "bookings")}
          </p>
        </div>
        <button onClick={() => router.push("/menu/items/new")} className="btn btn-primary btn-sm">
          {t("menu_experiences.add_class", "Add Class")}
        </button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      {/* Classes */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>{t("menu_experiences.classes", "Classes")}</h2>
        {loading ? (
          <p>{t("menu_experiences.loading", "Loading...")}</p>
        ) : items.length === 0 ? (
          <p style={{ color: "var(--color-text-muted)" }}>{t("menu_experiences.no_classes", "No classes yet.")}</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
            {items.map(item => (
              <div key={item.id} style={{ border: "1px solid var(--color-border-light)", borderRadius: "var(--radius-md)", overflow: "hidden" }}>
                {item.image_url ? (
                  <img src={item.image_url} alt={item.item_name} style={{ width: "100%", height: 140, objectFit: "cover", display: "block" }} />
                ) : (
                  <div style={{ width: "100%", height: 140, background: "var(--color-bg-muted)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--color-text-muted)", fontSize: 12 }}>—</div>
                )}
                <div style={{ padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{item.item_name}</div>
                    <button onClick={() => router.push(`/menu/items/${item.id}`)} className="btn btn-ghost btn-sm" title={t("common.edit", "Edit")}>
                      <Edit2 size={14} />
                    </button>
                  </div>
                  <div className="font-mono" style={{ fontSize: 11, color: "var(--color-text-muted)", marginTop: 2 }}>{item.item_code}</div>
                  <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginTop: 6 }}>{item.description?.slice(0, 100)}{item.description && item.description.length > 100 ? "…" : ""}</div>
                  <div style={{ marginTop: 8, fontSize: 13 }}>
                    {(item.variants && item.variants.length > 0) ? (
                      item.variants.map(v => (
                        <div key={v.id} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                          <span style={{ color: "var(--color-text-muted)" }}>{v.variant_name}</span>
                          <span style={{ fontWeight: 600 }}>{format(Number(item.base_price) + Number(v.price_adjustment))}</span>
                        </div>
                      ))
                    ) : (
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span style={{ color: "var(--color-text-muted)" }}>{t("menu_experiences.per_person", "per person")}</span>
                        <span style={{ fontWeight: 600 }}>{format(item.base_price)}</span>
                      </div>
                    )}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <span className={`badge ${item.is_available ? "badge-success" : "badge-muted"}`}>
                      {item.is_available ? t("menu_experiences.available", "Available") : t("menu_experiences.unavailable", "Unavailable")}
                    </span>
                  </div>

                  {/* Sessions */}
                  <div style={{ marginTop: 12, borderTop: "1px solid var(--color-border-light)", paddingTop: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{t("menu_experiences.sessions", "Sessions")}</div>
                    {(sessions[item.id] || []).length === 0 && (
                      <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 6 }}>{t("menu_experiences.no_sessions", "No sessions yet.")}</div>
                    )}
                    {(sessions[item.id] || []).map(s => {
                      const d = new Date(`${s.session_date}T${s.start_time}`);
                      const full = s.capacity - s.booked_pax <= 0;
                      return (
                        <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, fontSize: 12, padding: "3px 0", opacity: s.is_active ? 1 : 0.5 }}>
                          <span>
                            {d.toLocaleDateString(locale, { month: "short", day: "numeric" })} {s.start_time.slice(0, 5)}
                            {s.location ? ` · ${s.location}` : ""}
                          </span>
                          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span className={`badge ${full ? "badge-muted" : "badge-success"}`}>
                              {s.booked_pax}/{s.capacity}
                            </span>
                            <button className="btn btn-ghost btn-sm" style={{ padding: "1px 6px" }} onClick={() => toggleSession(s)}>
                              {s.is_active ? t("menu_experiences.deactivate", "Off") : t("menu_experiences.activate", "On")}
                            </button>
                            {s.booked_pax === 0 && (
                              <button className="btn btn-ghost btn-sm" style={{ padding: "1px 6px", color: "var(--color-danger)" }} onClick={() => deleteSession(s)}>×</button>
                            )}
                          </span>
                        </div>
                      );
                    })}
                    {/* Add session */}
                    <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
                      <input type="date" value={formFor(item.id).date} onChange={e => setFormFor(item.id, { date: e.target.value })} style={{ fontSize: 12, padding: "3px 6px", border: "1px solid var(--color-border-light)", borderRadius: "var(--radius-sm)" }} />
                      <input type="time" value={formFor(item.id).time} onChange={e => setFormFor(item.id, { time: e.target.value })} style={{ fontSize: 12, padding: "3px 6px", border: "1px solid var(--color-border-light)", borderRadius: "var(--radius-sm)", width: 80 }} />
                      <input type="number" min={1} value={formFor(item.id).capacity} onChange={e => setFormFor(item.id, { capacity: e.target.value })} placeholder={t("menu_experiences.seats", "Seats")} style={{ fontSize: 12, padding: "3px 6px", border: "1px solid var(--color-border-light)", borderRadius: "var(--radius-sm)", width: 60 }} />
                      <button className="btn btn-primary btn-sm" disabled={sessionSaving === item.id || !formFor(item.id).date} onClick={() => addSession(item.id)}>
                        {sessionSaving === item.id ? "..." : t("menu_experiences.add_session", "Add")}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bookings */}
      <div className="card">
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>{t("menu_experiences.recent_bookings", "Recent Class Bookings")}</h2>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t("menu_experiences.order", "Order")}</th>
                <th>{t("menu_experiences.customer", "Customer")}</th>
                <th>{t("menu_experiences.total", "Total")}</th>
                <th>{t("menu_experiences.payment", "Payment")}</th>
                <th>{t("menu_experiences.status", "Status")}</th>
                <th>{t("menu_experiences.date", "Date")}</th>
              </tr>
            </thead>
            <tbody>
              {bookings.length === 0 ? (
                <tr><td colSpan={6} className="data-table-empty">{t("menu_experiences.no_bookings", "No bookings yet.")}</td></tr>
              ) : bookings.map(o => (
                <tr key={o.id} style={{ cursor: "pointer" }} onClick={() => router.push(`/orders/${o.id}`)}>
                  <td className="font-mono" style={{ fontSize: 12 }}>{o.order_number}</td>
                  <td>{o.customer_name || "—"}</td>
                  <td>{format(o.total_amount)}</td>
                  <td><span className="badge badge-muted">{o.payment_status || "—"}</span></td>
                  <td><span className="badge badge-muted">{o.status}</span></td>
                  <td style={{ fontSize: 12 }}>{new Date(o.created_at).toLocaleString(locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
            <button className="btn btn-ghost btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={14} /></button>
            <span style={{ fontSize: 12, alignSelf: "center" }}>{page} / {totalPages}</span>
            <button className="btn btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight size={14} /></button>
          </div>
        )}
      </div>
    </div>
  );
}
