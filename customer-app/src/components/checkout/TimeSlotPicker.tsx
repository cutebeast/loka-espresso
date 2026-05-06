'use client';

import { useState, useMemo } from 'react';
import { Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { LOKA } from '@/lib/tokens';
import { useUIStore } from '@/stores/uiStore';
import { useTranslation } from '@/hooks/useTranslation';
import { t } from '@/lib/i18n';
import { getLocale } from '@/stores/localeStore';

interface TimeSlotPickerProps {
  value: string | null;
  onChange: (time: string) => void;
  leadMinutes?: number;
  mode?: 'pickup' | 'delivery';
}

function parseStoreHours(openingHours: Record<string, string> | undefined, date: Date): { open: number; close: number } {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayName = days[date.getDay()];
  const hours = openingHours?.[dayName] || openingHours?.['weekday'] || '';
  const match = hours.match(/(\d{1,2})(?::(\d{2}))?\s*(?:-|to)\s*(\d{1,2})(?::(\d{2}))?/i);
  if (match) {
    const openH = parseInt(match[1]);
    const closeH = parseInt(match[3]);
    return { open: openH, close: closeH || 22 };
  }
  return { open: 9, close: 22 }; // default
}

function generateTimeSlots(leadMinutes: number, baseDate: Date, openingHours?: Record<string, string>, count: number = 8): string[] {
  const slots: string[] = [];
  const now = new Date();
  const start = new Date(baseDate.getTime());
  const hours = parseStoreHours(openingHours, baseDate);

  if (isSameDay(baseDate, now)) {
    start.setTime(now.getTime() + leadMinutes * 60 * 1000);
    start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15, 0, 0);
    // Don't start before opening + 30 min
    const minStart = hours.open * 60 + 30;
    if (start.getHours() * 60 + start.getMinutes() < minStart) {
      start.setHours(hours.open, 30, 0, 0);
    }
  } else {
    start.setHours(hours.open, 30, 0, 0); // 30 min after opening
  }

  const endMinutes = hours.close * 60 - 30; // 30 min before closing
  for (let i = 0; i < count * 4; i++) {
    const slot = new Date(start.getTime() + i * 15 * 60 * 1000);
    if (slot.getHours() * 60 + slot.getMinutes() > endMinutes) break;
    slots.push(slot.toISOString());
    if (slots.length >= count) break;
  }

  if (slots.length === 0 && !isSameDay(baseDate, now)) {
    const fallback = new Date(baseDate);
    fallback.setHours(9, 0, 0, 0);
    for (let i = 0; i < count; i++) {
      slots.push(new Date(fallback.getTime() + i * 30 * 60 * 1000).toISOString());
    }
  }

  return slots;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  const locale = getLocale();
  return date.toLocaleTimeString(locale, {
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'Asia/Kuala_Lumpur',
  });
}

function formatDateLabel(date: Date): string {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (isSameDay(date, today)) return t('common.today');
  if (isSameDay(date, tomorrow)) return t('common.tomorrow');
  return date.toLocaleDateString(getLocale(), { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function TimeSlotPicker({ value, onChange, leadMinutes = 15, mode = 'pickup' }: TimeSlotPickerProps) {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const selectedStore = useUIStore(s => s.selectedStore);
  const { t } = useTranslation();

  const slots = useMemo(() => generateTimeSlots(leadMinutes, selectedDate, selectedStore?.opening_hours as Record<string, string> | undefined), [leadMinutes, selectedDate, selectedStore?.opening_hours]);

  const hasSlots = slots.length > 0;

  const goToNextDay = () => {
    const next = new Date(selectedDate);
    next.setDate(next.getDate() + 1);
    setSelectedDate(next);
  };

  const goToPrevDay = () => {
    const prev = new Date(selectedDate);
    prev.setDate(prev.getDate() - 1);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (prev >= today) setSelectedDate(prev);
  };

  const canGoBack = selectedDate > new Date(new Date().setHours(0, 0, 0, 0));

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Clock size={16} color={LOKA.copper} />
          <span className="font-bold text-text-primary tsp-title">{mode === 'pickup' ? t('checkout.pickupTime') : t('checkout.deliveryTime')}</span>
        </div>
        <div className="flex items-center gap-2 tsp-date-nav">
          <button
            onClick={goToPrevDay}
            disabled={!canGoBack}
            className={`tsp-date-btn ${!canGoBack ? 'tsp-date-btn-disabled' : ''}`}
            aria-label={t('checkout.previousDay')}
          >
            <ChevronLeft size={14} />
          </button>
          <span className="tsp-date-label">{formatDateLabel(selectedDate)}</span>
          <button
            onClick={goToNextDay}
            className="tsp-date-btn"
            aria-label={t('checkout.nextDay')}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
      {hasSlots ? (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {slots.map((slot, idx) => {
            const isSelected = value === slot;
            const isFirst = idx === 0;
            return (
              <button
                key={slot}
                onClick={() => onChange(slot)}
                className={`py-2.5 px-4 rounded-xl cursor-pointer whitespace-nowrap shrink-0 transition-all border-none tsp-slot ${isSelected ? 'tsp-slot-selected' : ''}`}
              >
                {isFirst ? t('checkout.asapTime', { time: formatTime(slot) }) : formatTime(slot)}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-text-muted tsp-no-slots">
          {t('checkout.noSlots')}
        </p>
      )}
    </div>
  );
}
