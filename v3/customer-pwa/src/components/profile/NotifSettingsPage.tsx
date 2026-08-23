'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Bell, Smartphone, MessageSquare, MessageCircle, Moon } from 'lucide-react';
import api from '@/lib/api';
import { useUIStore } from '@/stores/uiStore';
import { useTranslation } from '@/hooks/useTranslation';
import { GuestGate } from '@/components/auth/GuestGate';

interface Pref {
  id?: number;
  channel: string;
  message_category: string;
  is_enabled: boolean;
  quiet_hours_start?: string | null;
  quiet_hours_end?: string | null;
  timezone?: string | null;
}

const CHANNELS: { key: string; icon: typeof Bell; labelKey: string }[] = [
  { key: 'push_notification', icon: Smartphone, labelKey: 'notifSettings.push' },
  { key: 'sms', icon: MessageSquare, labelKey: 'notifSettings.sms' },
  { key: 'whatsapp', icon: MessageCircle, labelKey: 'notifSettings.whatsapp' },
];

const CATEGORIES = [
  { key: 'order_updates', labelKey: 'notifSettings.catOrders' },
  { key: 'promotions', labelKey: 'notifSettings.catPromos' },
  { key: 'loyalty', labelKey: 'notifSettings.catLoyalty' },
  { key: 'system', labelKey: 'notifSettings.catSystem' },
];

/** Customer notification preferences (opt-outs per channel + category,
 *  quiet hours). Backend default = enabled for everything. */
export default function NotifSettingsPage() {
  const { t } = useTranslation();
  const { setPage } = useUIStore();
  const [prefs, setPrefs] = useState<Pref[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    api.get<Pref[]>('/notifications/preferences/me')
      .then((res: { data?: Pref[] } | Pref[]) => setPrefs((Array.isArray(res) ? res : (res.data ?? [])) as Pref[]))
      .catch(() => setPrefs([]))
      .finally(() => setLoading(false));
  }, []);

  const enabled = (channel: string, category: string): boolean => {
    const row = prefs.find((p) => p.channel === channel && p.message_category === category);
    return row ? row.is_enabled : true;
  };

  const quiet = prefs.find((p) => p.channel === 'push_notification') || null;

  const toggle = async (channel: string, category: string, value: boolean) => {
    setPrefs((prev) => {
      const idx = prev.findIndex((p) => p.channel === channel && p.message_category === category);
      if (idx >= 0) {
        const next = [...prev];
        const row = next[idx];
        if (row) next[idx] = { ...row, is_enabled: value };
        return next;
      }
      return [...prev, { channel, message_category: category, is_enabled: value }];
    });
    await persist(prefs, channel, category, value, quiet?.quiet_hours_start ?? null, quiet?.quiet_hours_end ?? null);
  };

  const setQuiet = async (start: string | null, end: string | null) => {
    await persist(prefs, 'push_notification', 'all', true, start, end);
  };

  const persist = async (base: Pref[], channel: string, category: string, enabled: boolean, qs: string | null, qe: string | null) => {
    setSaving(true);
    setSaved(false);
    try {
      const payload = base
        .filter((p) => p.channel === channel && p.message_category === category)
        .map((p) => ({
          channel: p.channel,
          message_category: p.message_category,
          is_enabled: enabled,
          quiet_hours_start: p.channel === 'push_notification' ? (qs || null) : null,
          quiet_hours_end: p.channel === 'push_notification' ? (qe || null) : null,
          timezone: 'Asia/Kuala_Lumpur',
        }));
      const updated = await api.put<Pref[]>('/notifications/preferences/me', payload);
      setPrefs((prev) => {
        const merged = [...prev.filter((p) => !(p.channel === channel && p.message_category === category))];
        const ups = Array.isArray(updated?.data) ? updated.data : Array.isArray(updated) ? updated : [];
        for (const u of ups) merged.push(u as Pref);
        return merged;
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // never block the settings page on a save error — show nothing intrusive
    } finally {
      setSaving(false);
    }
  };

  const qs = quiet?.quiet_hours_start?.slice(0, 5) || '';
  const qe = quiet?.quiet_hours_end?.slice(0, 5) || '';

  return (
    <div className="notif-settings-screen">
      <div className="notif-settings-header">
        <button className="sub-back-btn" onClick={() => setPage('notifications')} aria-label={t('common.back')}>
          <ArrowLeft size={20} />
        </button>
        <h1 className="notif-settings-title">{t('notifSettings.title')}</h1>
      </div>

      <GuestGate message={t('profile.guestMessage')}>
        <div className="notif-settings-body">
          {loading ? (
            <div className="notif-settings-skeleton" />
          ) : (
            <>
              <div className="notif-settings-card">
                <div className="notif-settings-card-title">{t('notifSettings.channelsTitle')}</div>
                <p className="notif-settings-card-desc">{t('notifSettings.channelsDesc')}</p>
                {CHANNELS.map(({ key, icon: Icon, labelKey }) => (
                  <div className="notif-settings-row" key={key}>
                    <div className="notif-settings-row-label">
                      <Icon size={18} />
                      <span>{t(labelKey)}</span>
                    </div>
                    <Toggle checked={enabled(key, 'all')} onChange={(v) => toggle(key, 'all', v)} />
                  </div>
                ))}
              </div>

              <div className="notif-settings-card">
                <div className="notif-settings-card-title">{t('notifSettings.categoriesTitle')}</div>
                <p className="notif-settings-card-desc">{t('notifSettings.categoriesDesc')}</p>
                {CATEGORIES.map(({ key, labelKey }) => (
                  <div className="notif-settings-row" key={key}>
                    <span>{t(labelKey)}</span>
                    <Toggle checked={enabled('push_notification', key)} onChange={(v) => toggle('push_notification', key, v)} />
                  </div>
                ))}
              </div>

              <div className="notif-settings-card">
                <div className="notif-settings-card-title">
                  <Moon size={16} />
                  {t('notifSettings.quietTitle')}
                </div>
                <p className="notif-settings-card-desc">{t('notifSettings.quietDesc')}</p>
                <div className="notif-settings-quiet">
                  <input
                    type="time"
                    value={qs}
                    onChange={(e) => setQuiet(e.target.value || null, qe || null)}
                    aria-label={t('notifSettings.quietStart')}
                  />
                  <span>—</span>
                  <input
                    type="time"
                    value={qe}
                    onChange={(e) => setQuiet(qs || null, e.target.value || null)}
                    aria-label={t('notifSettings.quietEnd')}
                  />
                  <button className="notif-settings-clear" onClick={() => setQuiet(null, null)}>
                    {t('notifSettings.clear')}
                  </button>
                </div>
              </div>

              {saved && <div className="notif-settings-saved">{t('notifSettings.saved')}</div>}
              {saving && <div className="notif-settings-saving">{t('notifSettings.saving')}</div>}
            </>
          )}
        </div>
      </GuestGate>
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`notif-settings-toggle ${checked ? 'on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="notif-settings-knob" />
    </button>
  );
}
