'use client';

import { useEffect, useMemo, useState } from 'react';
import { Calendar } from 'lucide-react';
import api from '@/lib/api';
import { getLocale } from '@/stores/localeStore';
import { useTranslation } from '@/hooks/useTranslation';

interface WorkshopSessionLite {
  id: number;
  session_date: string;
  start_time: string;
}
interface WorkshopLite {
  id: number;
  item_name: string;
  sessions: WorkshopSessionLite[];
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Live countdown to the next workshop/class session (mockup: "Next Coffee
 * Omakase Gathering 07d:12h:45m:18s"). Hidden when no sessions are scheduled. */
export default function EventCountdown() {
  const { t } = useTranslation();
  const [next, setNext] = useState<{ name: string; at: Date } | null>(null);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get('/menu/workshops', { params: { locale: getLocale() } })
      .then((res) => {
        if (cancelled) return;
        const list: WorkshopLite[] = Array.isArray(res.data) ? res.data : [];
        const future = list
          .flatMap((w) => (w.sessions || []).map((s) => ({ name: w.item_name, at: new Date(`${s.session_date}T${s.start_time}`) })))
          .filter((x) => !isNaN(x.at.getTime()) && x.at.getTime() > Date.now())
          .sort((a, b) => a.at.getTime() - b.at.getTime());
        setNext(future[0] || null);
      })
      .catch(() => setNext(null));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!next) return;
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [next]);

  const label = useMemo(() => {
    if (!next || !now) return '';
    const ms = Math.max(0, next.at.getTime() - now.getTime());
    const totalSec = Math.floor(ms / 1000);
    const d = Math.floor(totalSec / 86400);
    const h = Math.floor((totalSec % 86400) / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${pad(d)}d : ${pad(h)}h : ${pad(m)}m : ${pad(s)}s`;
  }, [next, now]);

  if (!next) return null;

  return (
    <div className="home-extra-card">
      <div className="home-extra-title">
        <Calendar size={14} color="var(--color-gold)" /> {t('homeExtras.nextGathering')}
      </div>
      <div className="home-extra-sub">{next.name}</div>
      <div className="home-countdown" aria-live="off">{label}</div>
      <div className="home-extra-hint">{t('homeExtras.rsvpSoon')}</div>
    </div>
  );
}
