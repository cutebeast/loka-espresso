'use client';

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, CalendarCheck, Plus, Users, Clock, MapPin, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from '@/hooks/useTranslation';
import api from '@/lib/api';
import type { Reservation, Store } from '@/lib/api';
import { GuestGate } from '@/components/auth/GuestGate';

interface ReservationsPageProps {
  onBack: () => void;
}

export default function ReservationsPage({ onBack }: ReservationsPageProps) {
  const { t } = useTranslation();
  const { isAuthenticated } = useAuthStore();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formStoreId, setFormStoreId] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formTime, setFormTime] = useState('');
  const [formPartySize, setFormPartySize] = useState('2');
  const [formNotes, setFormNotes] = useState('');
  const [formError, setFormError] = useState('');

  const fetchReservations = useCallback(async () => {
    try {
      const res = await api.get('/reservations');
      const data = Array.isArray(res.data) ? res.data : (res.data?.items ?? []);
      setReservations(data);
    } catch {
      setReservations([]);
    }
  }, []);

  const fetchStores = useCallback(async () => {
    try {
      const res = await api.get('/stores');
      const data = Array.isArray(res.data) ? res.data : (res.data?.items ?? []);
      setStores(data);
      if (data.length > 0 && !formStoreId) setFormStoreId(String(data[0].id));
    } catch {
      setStores([]);
    }
  }, [formStoreId]);

  useEffect(() => {
    if (!isAuthenticated) { setLoading(false); return; }
    setLoading(true);
    Promise.all([fetchReservations(), fetchStores()]).finally(() => setLoading(false));
  }, [isAuthenticated, fetchReservations, fetchStores]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!formStoreId || !formDate || !formTime) {
      setFormError(t('reservations.fillRequired') || 'Please fill all required fields');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/reservations', {
        store_id: Number(formStoreId),
        reservation_date: formDate,
        reservation_time: formTime,
        party_size: Number(formPartySize),
        notes: formNotes || undefined,
      });
      setShowForm(false);
      await fetchReservations();
    } catch (err: any) {
      setFormError(err?.response?.data?.detail || (t('reservations.submitFailed') || 'Failed to create reservation'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async (id: number) => {
    try {
      await api.delete(`/reservations/${id}`);
      await fetchReservations();
    } catch {
      // ignore
    }
  };

  const statusLabel = (status: string) => {
    const s = status.toLowerCase();
    if (s === 'confirmed') return 'Confirmed';
    if (s === 'cancelled') return 'Cancelled';
    if (s === 'seated') return 'Seated';
    if (s === 'completed') return 'Completed';
    if (s === 'no_show') return 'No Show';
    return 'Pending';
  };

  const statusClass = (status: string) => {
    const s = status.toLowerCase();
    if (s === 'confirmed' || s === 'seated') return 'status-confirmed';
    if (s === 'cancelled' || s === 'no_show') return 'status-cancelled';
    return 'status-pending';
  };

  if (!isAuthenticated) {
    return (
      <div className="h-full bg-bg flex flex-col">
        <div className="loka-page-header">
          <button className="loka-back-btn" onClick={onBack} aria-label={t('common.back')}><ArrowLeft size={20} /></button>
          <h1 className="text-lg font-bold text-text-primary">{t('reservations.title') || 'Reservations'}</h1>
        </div>
        <GuestGate><div /></GuestGate>
      </div>
    );
  }

  return (
    <div className="h-full bg-bg flex flex-col">
      <div className="loka-page-header">
        <button className="loka-back-btn" onClick={onBack} aria-label={t('common.back')}><ArrowLeft size={20} /></button>
        <h1 className="text-lg font-bold text-text-primary">{t('reservations.title') || 'Reservations'}</h1>
        <button onClick={() => setShowForm(true)} className="ml-auto w-10 h-10 rounded-full bg-primary text-white flex items-center justify-center">
          <Plus size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto scroll-container p-4">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-bg-card rounded-2xl p-4 shadow-card animate-pulse">
                <div className="h-4 bg-border-subtle rounded w-1/3 mb-3" />
                <div className="h-3 bg-border-subtle rounded w-2/3 mb-2" />
                <div className="h-3 bg-border-subtle rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : reservations.length === 0 ? (
          <div className="text-center pt-16">
            <CalendarCheck size={48} className="mx-auto text-text-muted mb-4" />
            <p className="text-text-secondary font-medium">{t('reservations.emptyTitle') || 'No reservations yet'}</p>
            <p className="text-text-muted text-sm mt-1">{t('reservations.emptySubtitle') || 'Book a table at your favourite store'}</p>
            <button onClick={() => setShowForm(true)} className="btn btn-primary mt-6 px-6">
              {t('reservations.bookNow') || 'Book Now'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {reservations.map((r) => (
              <div key={r.id} className="bg-bg-card rounded-2xl p-4 shadow-card border border-border-subtle">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-bold text-text-primary">{r.store_name || stores.find((s) => s.id === r.store_id)?.name || `Store #${r.store_id}`}</p>
                    <p className="text-xs text-text-muted flex items-center gap-1 mt-1">
                      <MapPin size={12} /> {stores.find((s) => s.id === r.store_id)?.address || ''}
                    </p>
                  </div>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statusClass(r.status)}`}>
                    {statusLabel(r.status)}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-text-secondary mt-3">
                  <span className="flex items-center gap-1"><CalendarCheck size={14} /> {r.reservation_date}</span>
                  <span className="flex items-center gap-1"><Clock size={14} /> {r.reservation_time}</span>
                  <span className="flex items-center gap-1"><Users size={14} /> {r.party_size}</span>
                </div>
                {r.notes && <p className="text-xs text-text-muted mt-2 italic">{r.notes}</p>}
                {(r.status === 'requested' || r.status === 'confirmed') && (
                  <button onClick={() => handleCancel(r.id)} className="mt-3 text-xs text-danger flex items-center gap-1">
                    <Trash2 size={12} /> {t('common.cancel') || 'Cancel'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center"
            onClick={() => setShowForm(false)}
          >
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="bg-bg-card w-full max-w-[430px] rounded-t-3xl p-5 max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-10 h-1 bg-border rounded-full mx-auto mb-4" />
              <h2 className="text-lg font-bold text-text-primary mb-4">{t('reservations.newReservation') || 'New Reservation'}</h2>
              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <div>
                  <label className="text-xs font-semibold text-primary uppercase tracking-wider mb-1 block">{t('reservations.store') || 'Store'}</label>
                  <select value={formStoreId} onChange={(e) => setFormStoreId(e.target.value)} className="w-full bg-bg-light rounded-xl px-4 py-3 border border-border-subtle focus:border-primary outline-none text-base text-text-primary">
                    {stores.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-primary uppercase tracking-wider mb-1 block">{t('reservations.date') || 'Date'}</label>
                    <input type="date" value={formDate} onChange={(e) => setFormDate(e.target.value)} min={new Date().toISOString().split('T')[0]} className="w-full bg-bg-light rounded-xl px-4 py-3 border border-border-subtle focus:border-primary outline-none text-base text-text-primary" />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-primary uppercase tracking-wider mb-1 block">{t('reservations.time') || 'Time'}</label>
                    <input type="time" value={formTime} onChange={(e) => setFormTime(e.target.value)} className="w-full bg-bg-light rounded-xl px-4 py-3 border border-border-subtle focus:border-primary outline-none text-base text-text-primary" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold text-primary uppercase tracking-wider mb-1 block">{t('reservations.partySize') || 'Party Size'}</label>
                  <input type="number" min={1} max={20} value={formPartySize} onChange={(e) => setFormPartySize(e.target.value)} className="w-full bg-bg-light rounded-xl px-4 py-3 border border-border-subtle focus:border-primary outline-none text-base text-text-primary" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-primary uppercase tracking-wider mb-1 block">{t('reservations.notes') || 'Notes'}</label>
                  <textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={2} placeholder={t('reservations.notesPlaceholder') || 'Any special requests...'} className="w-full bg-bg-light rounded-xl px-4 py-3 border border-border-subtle focus:border-primary outline-none text-base text-text-primary resize-none" />
                </div>
                {formError && <p className="text-sm text-danger font-bold">{formError}</p>}
                <button type="submit" disabled={submitting} className="btn btn-primary w-full h-12 rounded-xl text-base font-semibold mt-1">
                  {submitting ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" /> : (t('reservations.confirm') || 'Confirm Booking')}
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
