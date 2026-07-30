'use client';

import { useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';
import { useUIStore } from '@/stores/uiStore';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function nextTuesdayMs(): number {
  const now = new Date();
  const daysAhead = (2 - now.getDay() + 7) % 7; // Sun=0 … Tue=2
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysAhead, 0, 0, 0, 0);
  return d.getTime();
}

/** "LOKA Tuesday" standing weekly promo card — countdown to the next
 * Tuesday, when every member gets 15% off (granted weekly by cron). */
export default function TuesdayCard() {
  const { t } = useTranslation();
  const { setPage } = useUIStore();
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);

  const { label, isToday } = useMemo(() => {
    const target = nextTuesdayMs();
    const ms = Math.max(0, target - now);
    const isToday = new Date().getDay() === 2;
    const totalMin = Math.floor(ms / 60000);
    const d = Math.floor(totalMin / 1440);
    const h = Math.floor((totalMin % 1440) / 60);
    const m = totalMin % 60;
    return { label: isToday ? t('homeExtras.tuesdayToday') : `${pad(d)}d : ${pad(h)}h : ${pad(m)}m`, isToday };
  }, [now, t]);

  return (
    <div className="home-extra-card" onClick={() => setPage('my-rewards', { initialTab: 'vouchers' })} role="button">
      <div className="home-extra-title">
        <Sparkles size={14} color="var(--color-gold)" /> {t('homeExtras.tuesdayTitle')}
      </div>
      <div className="home-extra-sub">{t('homeExtras.tuesdayBody')}</div>
      <div className="home-countdown" style={isToday ? { color: 'var(--color-gold)' } : undefined}>{label}</div>
      <div className="home-extra-hint">{t('homeExtras.tuesdayHint')}</div>
    </div>
  );
}
