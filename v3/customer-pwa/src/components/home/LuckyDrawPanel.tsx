'use client';

import { useEffect, useState } from 'react';
import { Gift, Ticket } from 'lucide-react';
import api from '@/lib/api';
import { useTranslation } from '@/hooks/useTranslation';
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';

interface LuckyDrawCampaign {
  id: number;
  title: string;
  description?: string | null;
  draw_type?: string;
  spins_remaining?: number | null;
  tickets_available?: number | null;
}

/** Lucky draw entries panel (mockup: "Your Sept entries: 14 Tickets —
 * every cup is a ticket"). Shows the member's ticket/spin balance when
 * authenticated; a plain banner otherwise. */
export default function LuckyDrawPanel() {
  const { t } = useTranslation();
  const { setPage } = useUIStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [campaign, setCampaign] = useState<LuckyDrawCampaign | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get('/lucky-draw/active')
      .then((res) => { if (!cancelled) setCampaign((res.data as LuckyDrawCampaign) || null); })
      .catch(() => { if (!cancelled) setCampaign(null); });
    return () => { cancelled = true; };
  }, []);

  if (!campaign) return null;
  const tickets = campaign.tickets_available ?? null;
  const spins = campaign.spins_remaining ?? null;
  const entryCount = tickets !== null ? tickets : (spins ?? 0);
  const entryLabel = tickets !== null
    ? t(entryCount === 1 ? 'homeExtras.ticket' : 'homeExtras.tickets')
    : t(entryCount === 1 ? 'homeExtras.spin' : 'homeExtras.spins');

  return (
    <button className="home-extra-card home-lucky" onClick={() => setPage('lucky-draw')}>
      <div className="home-extra-title">
        <Gift size={14} color="var(--color-gold)" /> {t('homeExtras.luckyDraw')}
      </div>
      <div className="home-extra-sub">{campaign.title}</div>
      {isAuthenticated && (tickets !== null || spins !== null) && (
        <div className="home-lucky-entries">
          <Ticket size={14} color="var(--color-gold)" />
          <span>{t('homeExtras.yourEntries', { count: entryCount, label: entryLabel })}</span>
        </div>
      )}
      <div className="home-extra-hint">{t('homeExtras.everyCup')}</div>
    </button>
  );
}
