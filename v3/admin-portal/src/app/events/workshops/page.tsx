"use client";

import { useEffect, useState, useCallback, Fragment } from "react";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { useTranslation } from "@/lib/i18n";
import { useCurrency } from "@/hooks/useCurrency";
import { Edit2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from "lucide-react";

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
  event_category_id?: number | null;
  variants?: Variant[];
}
interface Category {
  id: number;
  category_name: string;
  slug: string;
}
interface EventCategory {
  id: number;
  name: string;
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
const CLASS_PAGE_SIZE = 12;

export default function ExperiencesPage() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const { format } = useCurrency();
  const [items, setItems] = useState<ExperienceItem[]>([]);
  const [eventCategories, setEventCategories] = useState<EventCategory[]>([]);
  const [classesTotal, setClassesTotal] = useState(0);
  const [classPage, setClassPage] = useState(1);
  const [expandedId, setExpandedId] = useState<number | null>(null);
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
      const [cats, evCats] = await Promise.all([
        api.getRaw<{ items: Category[] }>("/admin/menu/categories?per_page=50&include_system=true"),
        api.getRaw<{ items: EventCategory[] }>("/admin/event-categories?per_page=100"),
      ]);
      setEventCategories(evCats.items || []);
      const expCat = (cats.items || []).find(c => c.slug === "experiences");
      if (!expCat) {
        setItems([]);
        setClassesTotal(0);
        setBookings([]);
        setBookingsTotal(0);
        return;
      }
      const [itemsRes, ordersRes] = await Promise.all([
        api.getRaw<{ items: ExperienceItem[]; total: number }>(`/admin/menu/items?category_id=${expCat.id}&per_page=${CLASS_PAGE_SIZE}&page=${classPage}`),
        api.getRaw<{ items: BookingOrder[]; total: number }>(`/admin/orders?category_slug=experiences&per_page=${PAGE_SIZE}&page=${page}`),
      ]);
      setItems(itemsRes.items || []);
      setClassesTotal(itemsRes.total || 0);
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
  }, [page, classPage, t]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(bookingsTotal / PAGE_SIZE));
  const classTotalPages = Math.max(1, Math.ceil(classesTotal / CLASS_PAGE_SIZE));

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

  const saveEventCategory = async (item: ExperienceItem, value: string) => {
    const event_category_id = value ? Number(value) : null;
    try {
      await api.patch(`/admin/menu/items/${item.id}`, { event_category_id });
      setItems(prev => prev.map(i => (i.id === item.id ? { ...i, event_category_id } : i)));
    } catch (e: any) {
      setError(e.message || t("admin.errors.saveFailed", "Failed to save"));
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

  const renderSessionManager = (item: ExperienceItem) => (
    <div>
      {(sessions[item.id] || []).length === 0 && (
        <div style={{ fontSize: 12, color: "var(--color-text-muted)", marginBottom: 6 }}>{t("menu_experiences.no_sessions", "No sessions yet.")}</div>
      )}
      {(sessions[item.id] || []).map(s => {
        const d = new Date(`${s.session_date}T${s.start_time}`);
        const full = s.capacity - s.booked_pax <= 0;
        return (
          <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, fontSize: 12, padding: "3px 0", opacity: s.is_active ? 1 : 0.5, maxWidth: 560 }}>
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
      <div style={{ display: "flex", gap: 4, marginTop: 6, flexWrap: "wrap" }}>
        <input type="date" value={formFor(item.id).date} onChange={e => setFormFor(item.id, { date: e.target.value })} style={{ fontSize: 12, padding: "3px 6px", border: "1px solid var(--color-border-light)", borderRadius: "var(--radius-sm)" }} />
        <input type="time" value={formFor(item.id).time} onChange={e => setFormFor(item.id, { time: e.target.value })} style={{ fontSize: 12, padding: "3px 6px", border: "1px solid var(--color-border-light)", borderRadius: "var(--radius-sm)", width: 80 }} />
        <input type="number" min={1} value={formFor(item.id).capacity} onChange={e => setFormFor(item.id, { capacity: e.target.value })} placeholder={t("menu_experiences.seats", "Seats")} style={{ fontSize: 12, padding: "3px 6px", border: "1px solid var(--color-border-light)", borderRadius: "var(--radius-sm)", width: 60 }} />
        <button className="btn btn-primary btn-sm" disabled={sessionSaving === item.id || !formFor(item.id).date} onClick={() => addSession(item.id)}>
          {sessionSaving === item.id ? "..." : t("menu_experiences.add_session", "Add")}
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ padding: 32 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t("menu_experiences.experiences_workshops", "Experiences & Workshops")}</h1>
          <p className="page-subtitle">
            {classesTotal} {t("menu_experiences.classes", "classes")} · {bookingsTotal} {t("menu_experiences.bookings", "bookings")}
          </p>
        </div>
        <button onClick={() => router.push("/menu/items/new?cat=experiences")} className="btn btn-primary btn-sm">
          {t("menu_experiences.add_class", "Add Class")}
        </button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

      {/* Classes — compact list with expandable session manager */}
      <div className="card" style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>{t("menu_experiences.classes", "Classes")}</h2>
        {loading ? (
          <p>{t("menu_experiences.loading", "Loading...")}</p>
        ) : items.length === 0 ? (
          <p style={{ color: "var(--color-text-muted)" }}>{t("menu_experiences.no_classes", "No classes yet.")}</p>
        ) : (
          <>
          <div className="table-container"><table className="data-table">
            <thead><tr>
              <th>{t("menu_experiences.class_col", "Class")}</th>
              <th>{t("menu_experiences.price_col", "Price")}</th>
              <th>{t("menu_experiences.status", "Status")}</th>
              <th>{t("menu_experiences.category", "Category")}</th>
              <th>{t("menu_experiences.sessions", "Sessions")}</th>
              <th style={{ width: 150 }}>{t("menu_experiences.actions", "Actions")}</th>
            </tr></thead>
            <tbody>
              {items.map(item => {
                const sess = sessions[item.id] || [];
                const upcoming = sess.filter(s => s.is_active).sort((a, b) => `${a.session_date}T${a.start_time}`.localeCompare(`${b.session_date}T${b.start_time}`))[0];
                const prices = (item.variants && item.variants.length > 0)
                  ? item.variants.map(v => Number(item.base_price) + Number(v.price_adjustment))
                  : [Number(item.base_price)];
                const minP = Math.min(...prices), maxP = Math.max(...prices);
                const expanded = expandedId === item.id;
                return (
                  <Fragment key={item.id}>
                    <tr>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          {item.image_url ? (
                            <img src={item.image_url} alt="" style={{ width: 44, height: 44, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                          ) : (
                            <div style={{ width: 44, height: 44, borderRadius: 6, background: "var(--color-bg-muted)", flexShrink: 0 }} />
                          )}
                          <div>
                            <div style={{ fontWeight: 600 }}>{item.item_name}</div>
                            <div className="font-mono" style={{ fontSize: 11, color: "var(--color-text-muted)" }}>{item.item_code}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{minP === maxP ? format(minP) : `${format(minP)} – ${format(maxP)}`}</td>
                      <td><span className={`badge ${item.is_available ? "badge-success" : "badge-muted"}`}>{item.is_available ? t("menu_experiences.available", "Available") : t("menu_experiences.unavailable", "Unavailable")}</span></td>
                      <td>
                        <select value={item.event_category_id ?? ""} onChange={e => saveEventCategory(item, e.target.value)} style={{ fontSize: 12, padding: "4px 8px", border: "1px solid var(--color-border-light)", borderRadius: "var(--radius-sm)", maxWidth: 160 }}>
                          <option value="">{t("menu_experiences.no_category", "— None —")}</option>
                          {eventCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {upcoming ? (
                          <span>{new Date(`${upcoming.session_date}T${upcoming.start_time}`).toLocaleDateString(locale, { month: "short", day: "numeric" })} {upcoming.start_time.slice(0, 5)} · <span className={`badge ${upcoming.capacity - upcoming.booked_pax <= 0 ? "badge-muted" : "badge-success"}`}>{upcoming.booked_pax}/{upcoming.capacity}</span>{sess.length > 1 ? ` +${sess.length - 1} ${t("menu_experiences.more", "more")}` : ""}</span>
                        ) : <span style={{ color: "var(--color-text-muted)" }}>{t("menu_experiences.no_sessions", "No sessions yet.")}</span>}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => setExpandedId(expanded ? null : item.id)} title={t("menu_experiences.sessions", "Sessions")}>
                            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                          <button onClick={() => router.push(`/menu/items/${item.id}`)} className="btn btn-ghost btn-sm" title={t("common.edit", "Edit")} style={{ color: "var(--color-info)" }}>
                            <Edit2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expanded && (
                      <tr>
                        <td colSpan={6} style={{ background: "var(--color-bg-muted)", padding: "12px 16px" }}>
                          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{t("menu_experiences.sessions", "Sessions")}</div>
                          {renderSessionManager(item)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table></div>
          {classTotalPages > 1 && (
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
              <button className="btn btn-ghost btn-sm" disabled={classPage <= 1} onClick={() => setClassPage(p => p - 1)}><ChevronLeft size={14} /></button>
              <span style={{ fontSize: 12, alignSelf: "center" }}>{classPage} / {classTotalPages}</span>
              <button className="btn btn-ghost btn-sm" disabled={classPage >= classTotalPages} onClick={() => setClassPage(p => p + 1)}><ChevronRight size={14} /></button>
            </div>
          )}
          </>
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
