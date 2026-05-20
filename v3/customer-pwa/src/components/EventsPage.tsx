'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Calendar, MapPin, Users, CheckCircle, Clock, ChevronRight } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import api from '@/lib/api';
import { resolveAssetUrl, LOKA } from '@/lib/tokens';
import { useTranslation } from '@/hooks/useTranslation';

interface EventItem {
  id: number;
  title: string;
  image_url: string | null;
  description: string;
  event_datetime: string;
  location: string;
  slug: string;
  rsvp_enabled: boolean;
  rsvp_max_capacity: number;
  rsvp_count: number;
  is_active: boolean;
}

interface EventsPageProps {
  onBack: () => void;
}

function resolveCardImage(event: EventItem): string | null {
  return resolveAssetUrl(event.image_url) || null;
}

function formatEventDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-MY', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return dateStr; }
}

function formatEventTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' });
  } catch { return ''; }
}

export default function EventsPage({ onBack }: EventsPageProps) {
  const { t } = useTranslation();
  const { showToast } = useUIStore();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const triggerSignIn = useUIStore((s) => s.triggerSignIn);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<EventItem | null>(null);
  const [brokenImages, setBrokenImages] = useState<Set<number>>(new Set());
  const [rsvping, setRsvping] = useState(false);
  const [rsvpStatus, setRsvpStatus] = useState<Record<number, string>>({});

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/content/events?limit=20');
      const data = Array.isArray(res.data) ? res.data : (res.data?.items ?? []);
      setEvents(data);
    } catch { setEvents([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  const handleRsvp = async (eventId: number) => {
    if (!isAuthenticated) {
      triggerSignIn();
      return;
    }
    setRsvping(true);
    try {
      await api.post(`/events/${eventId}/rsvp`);
      setRsvpStatus(prev => ({ ...prev, [eventId]: 'success' }));
      showToast(t('events.rsvpSuccess') || 'RSVP confirmed!', 'success');
      loadEvents();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || '';
      if (msg.toLowerCase().includes('capacity')) {
        setRsvpStatus(prev => ({ ...prev, [eventId]: 'full' }));
        showToast(t('events.capacityFull') || 'Event is at full capacity', 'error');
      } else if (msg.toLowerCase().includes('already')) {
        setRsvpStatus(prev => ({ ...prev, [eventId]: 'already' }));
        showToast(t('events.alreadyRsvpd') || 'You have already RSVP\'d', 'info');
      } else {
        showToast(t('events.rsvpError') || 'Failed to RSVP', 'error');
      }
    }
    finally { setRsvping(false); }
  };

  /* Detail view */
  if (selectedEvent) {
    const img = resolveCardImage(selectedEvent);
    const status = rsvpStatus[selectedEvent.id];
    const isFull = selectedEvent.rsvp_max_capacity > 0 && selectedEvent.rsvp_count >= selectedEvent.rsvp_max_capacity;

    return (
      <div className="info-detail-screen">
        <div className="info-detail-hero">
          {img && !brokenImages.has(selectedEvent.id) ? (
            <img
              src={img}
              alt={selectedEvent.title}
              loading="lazy"
              className="info-detail-hero-img"
              onError={() => { setBrokenImages(prev => new Set(prev).add(selectedEvent.id)); }}
            />
          ) : (
            <div className="info-detail-hero-img info-detail-hero-fallback">
              <div className="info-detail-hero-fallback-icon">
                <Calendar size={64} />
              </div>
            </div>
          )}
          <div className="info-detail-hero-overlay" />
          <button className="info-detail-back-btn" onClick={() => setSelectedEvent(null)} aria-label={t('common.back')}>
            <ArrowLeft size={20} />
          </button>
          {selectedEvent.is_active && (
            <span className="info-detail-tag experience">
              <Calendar size={14} />
              Upcoming
            </span>
          )}
        </div>

        <div className="info-detail-content">
          <h1 className="info-detail-title">{selectedEvent.title}</h1>

          <div className="info-detail-meta">
            <span className="info-detail-meta-item">
              <Calendar size={16} /> {formatEventDate(selectedEvent.event_datetime)}
            </span>
            <span className="info-detail-meta-item">
              <Clock size={16} /> {formatEventTime(selectedEvent.event_datetime)}
            </span>
          </div>
          {selectedEvent.location && (
            <div className="info-detail-meta">
              <span className="info-detail-meta-item">
                <MapPin size={16} /> {selectedEvent.location}
              </span>
            </div>
          )}
          {selectedEvent.rsvp_enabled && (
            <div className="info-detail-meta">
              <span className="info-detail-meta-item">
                <Users size={16} /> {selectedEvent.rsvp_count}{selectedEvent.rsvp_max_capacity > 0 ? ` / ${selectedEvent.rsvp_max_capacity}` : ''} attending
              </span>
            </div>
          )}

          <p className="info-detail-desc">
            {selectedEvent.description || 'No description available.'}
          </p>
        </div>

        {selectedEvent.rsvp_enabled && (
          <div className="info-detail-footer">
            {status === 'success' ? (
              <div className="info-share-btn" style={{ background: 'var(--loka-success)', color: '#fff', justifyContent: 'center', gap: '8px' }}>
                <CheckCircle size={18} />
                <span>{t('events.rsvpd') || 'You\'re going!'}</span>
              </div>
            ) : isFull || status === 'full' ? (
              <button className="info-share-btn" disabled style={{ opacity: 0.5 }}>
                <Users size={18} />
                <span>{t('events.capacityFull') || 'Event full'}</span>
              </button>
            ) : status === 'already' ? (
              <button className="info-share-btn" disabled style={{ opacity: 0.5 }}>
                <CheckCircle size={18} />
                <span>{t('events.alreadyRsvpd') || 'Already RSVP\'d'}</span>
              </button>
            ) : (
              <button className="info-share-btn" onClick={() => handleRsvp(selectedEvent.id)} disabled={rsvping} style={{ justifyContent: 'center', gap: '8px' }}>
                <span>{rsvping ? t('common.loading') : (t('events.rsvp') || 'RSVP')}</span>
                <Calendar size={18} />
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  /* List view */
  return (
    <div className="info-screen">
      <div className="info-header">
        <div className="info-header-left">
          <button className="info-back-btn" onClick={onBack} aria-label={t('common.back')}>
            <ArrowLeft size={20} />
          </button>
          <h1 className="info-page-title">{t('events.title') || 'Events'}</h1>
        </div>
      </div>

      <div className="info-card-list">
        {loading ? (
          <>
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton info-skeleton-card" />
            ))}
          </>
        ) : events.length === 0 ? (
          <div className="info-empty">
            <Calendar size={40} className="info-empty-icon" />
            <p className="info-empty-title">{t('events.noEvents') || 'No upcoming events'}</p>
            <p className="info-empty-desc">{t('events.checkBackSoon') || 'Check back soon for new events'}</p>
          </div>
        ) : (
          events.map((event) => {
            const img = resolveCardImage(event);
            return (
              <div key={event.id} className="info-card" onClick={() => setSelectedEvent(event)}>
                <div className="info-card-thumb">
                  {img && !brokenImages.has(event.id) ? (
                    <img
                      src={img}
                      alt=""
                      loading="lazy"
                      onError={() => { setBrokenImages(prev => new Set(prev).add(event.id)); }}
                    />
                  ) : (
                    <div className="info-card-thumb-fallback">
                      <Calendar size={24} strokeWidth={1.5} color={LOKA.border} />
                    </div>
                  )}
                </div>
                <div className="info-card-body">
                  <div className="info-card-title">{event.title}</div>
                  <div className="info-card-desc">
                    <Calendar size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                    {formatEventDate(event.event_datetime)}
                  </div>
                  {event.location && (
                    <div className="info-card-desc">
                      <MapPin size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                      {event.location}
                    </div>
                  )}
                  {event.rsvp_enabled && (
                    <div className="info-card-tag experience">
                      <Users size={12} /> {event.rsvp_count}{event.rsvp_max_capacity > 0 ? `/${event.rsvp_max_capacity}` : ''} RSVP
                    </div>
                  )}
                </div>
                <div className="info-card-arrow">
                  <ChevronRight color="#8A8078" size={16} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
