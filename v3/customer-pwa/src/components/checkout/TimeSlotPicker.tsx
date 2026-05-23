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

interface OperatingHour {
  day_of_week: number;
  open_time?: string;
  close_time?: string;
  is_closed?: boolean;
  is_24_hours?: boolean;
  last_order_time?: string;
}

function parseTimeString(timeStr: string | undefined): { hour: number; minute: number } | null {
  if (!timeStr) return null;
  const m = timeStr.match(/(\d{1,2}):(\d{2})/);
  if (!m || !m[1] || !m[2]) return null;
  return { hour: parseInt(m[1]), minute: parseInt(m[2]) };
}

function getDayOperatingHours(
  operatingHours: OperatingHour[] | undefined,
  date: Date
): { is24Hours: boolean; isClosed: boolean; openMinutes: number; closeMinutes: number; lastOrderMinutes: number | null } {
  const dayOfWeek = date.getDay();
  const h = operatingHours?.find(o => o.day_of_week === dayOfWeek);

  if (!h) {
    return { is24Hours: false, isClosed: false, openMinutes: 9 * 60, closeMinutes: 22 * 60, lastOrderMinutes: null };
  }

  if (h.is_closed) {
    return { is24Hours: false, isClosed: true, openMinutes: 0, closeMinutes: 0, lastOrderMinutes: null };
  }

  if (h.is_24_hours) {
    const lot = parseTimeString(h.last_order_time);
    return {
      is24Hours: true,
      isClosed: false,
      openMinutes: 0,
      closeMinutes: 24 * 60,
      lastOrderMinutes: lot ? lot.hour * 60 + lot.minute : null,
    };
  }

  const open = parseTimeString(h.open_time);
  const close = parseTimeString(h.close_time);
  const lot = parseTimeString(h.last_order_time);

  const openMinutes = open ? open.hour * 60 + open.minute : 9 * 60;
  let closeMinutes = close ? close.hour * 60 + close.minute : 22 * 60;
  // Handle overnight (e.g., 22:00 to 02:00)
  if (closeMinutes <= openMinutes) {
    closeMinutes += 24 * 60;
  }

  return {
    is24Hours: false,
    isClosed: false,
    openMinutes,
    closeMinutes,
    lastOrderMinutes: lot ? lot.hour * 60 + lot.minute : null,
  };
}

function generateTimeSlots(
  leadMinutes: number,
  baseDate: Date,
  operatingHours?: OperatingHour[],
  firstOrderMinutesAfterOpen: number = 30,
  lastOrderMinutesBeforeClose: number = 45,
  count: number = 8
): string[] {
  const slots: string[] = [];
  const now = new Date();
  const start = new Date(baseDate.getTime());
  const hours = getDayOperatingHours(operatingHours, baseDate);

  if (hours.isClosed) {
    return [];
  }

  const firstOrderMinutes = hours.openMinutes + firstOrderMinutesAfterOpen;
  const endMinutes = hours.lastOrderMinutes !== null
    ? hours.lastOrderMinutes
    : hours.closeMinutes - lastOrderMinutesBeforeClose;

  if (isSameDay(baseDate, now)) {
    start.setTime(now.getTime() + leadMinutes * 60 * 1000);
    start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15, 0, 0);
    // Don't start before opening + buffer
    if (start.getHours() * 60 + start.getMinutes() < firstOrderMinutes) {
      start.setHours(Math.floor(firstOrderMinutes / 60), firstOrderMinutes % 60, 0, 0);
    }
  } else {
    start.setHours(Math.floor(firstOrderMinutes / 60), firstOrderMinutes % 60, 0, 0);
  }

  for (let i = 0; i < count * 4; i++) {
    const slot = new Date(start.getTime() + i * 15 * 60 * 1000);
    const slotMinutes = slot.getHours() * 60 + slot.getMinutes();
    // For overnight, slotMinutes might wrap; compare using actual time
    if (slotMinutes > endMinutes && endMinutes >= 0) break;
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

  const slots = useMemo(() => generateTimeSlots(
    leadMinutes,
    selectedDate,
    selectedStore?.operating_hours as OperatingHour[] | undefined,
    selectedStore?.first_order_minutes_after_open ?? 30,
    selectedStore?.last_order_minutes_before_close ?? 45
  ), [leadMinutes, selectedDate, selectedStore?.operating_hours, selectedStore?.first_order_minutes_after_open, selectedStore?.last_order_minutes_before_close]);

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
