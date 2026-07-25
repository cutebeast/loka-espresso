"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "@/hooks/useTranslation";
import Drawer from "@/components/Drawer";
import { getClassSessions, type ClassSession, type MenuItem } from "@/lib/api";
import { Calendar, MapPin, Users } from "lucide-react";

interface PosSessionDrawerProps {
  item: MenuItem | null;
  onSelect: (item: MenuItem, session: { id: number; label: string }) => void;
  onCancel: () => void;
}

/** Session picker for workshop/class items — staff must pick a session
 * before the item enters the cart (capacity is tracked per session). */
export default function PosSessionDrawer({ item, onSelect, onCancel }: PosSessionDrawerProps) {
  const { t } = useTranslation();
  const [sessions, setSessions] = useState<ClassSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!item) return;
    setLoading(true);
    setError("");
    setSessions([]);
    getClassSessions(item.id)
      .then((d) => setSessions(Array.isArray(d) ? d : []))
      .catch((e: unknown) => setError((e as Error).message || t("common.failed")))
      .finally(() => setLoading(false));
  }, [item, t]);

  if (!item) return null;

  const labelFor = (s: ClassSession) =>
    `${new Date(`${s.session_date}T${s.start_time}`).toLocaleDateString(undefined, { month: "short", day: "numeric" })} ${s.start_time.slice(0, 5)}`;

  return (
    <Drawer open={!!item} onClose={onCancel} title={item.item_name} position="bottom">
      <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{t("pos.select_session")}</h4>
      {error && <p style={{ color: "var(--color-error)", fontSize: 13 }}>{error}</p>}
      {loading ? (
        <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>{t("common.loading")}</p>
      ) : sessions.length === 0 ? (
        <p style={{ color: "var(--color-text-muted)", fontSize: 13 }}>{t("pos.no_sessions")}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sessions.map((s) => {
            const remaining = s.remaining ?? s.capacity - s.booked_pax;
            const full = remaining <= 0;
            return (
              <button
                key={s.id}
                className={`btn ${full ? "btn-ghost" : "btn-primary"}`}
                disabled={full}
                style={{ justifyContent: "space-between", opacity: full ? 0.5 : 1 }}
                onClick={() => onSelect(item, { id: s.id, label: labelFor(s) })}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Calendar size={14} />
                  {labelFor(s)}
                  {s.location && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, opacity: 0.85 }}>
                      <MapPin size={12} />{s.location}
                    </span>
                  )}
                </span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12 }}>
                  <Users size={12} />
                  {full ? t("pos.session_full") : t("pos.seats_left", { count: remaining })}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </Drawer>
  );
}
