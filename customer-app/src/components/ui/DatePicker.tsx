'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface DatePickerProps {
  value?: Date;
  onChange: (date: Date) => void;
  minDate?: Date;
  maxDate?: Date;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

export function DatePicker({ value, onChange, minDate, maxDate }: DatePickerProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [viewDate, setViewDate] = useState(
    value ? new Date(value.getFullYear(), value.getMonth(), 1) : new Date(today.getFullYear(), today.getMonth(), 1)
  );

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const isDisabled = (day: number) => {
    const d = new Date(year, month, day);
    if (minDate && d < minDate) return true;
    if (maxDate && d > maxDate) return true;
    return false;
  };

  const isSelected = (day: number) => {
    if (!value) return false;
    return value.getDate() === day && value.getMonth() === month && value.getFullYear() === year;
  };

  const isToday = (day: number) => {
    return today.getDate() === day && today.getMonth() === month && today.getFullYear() === year;
  };

  return (
    <div className="bg-white rounded-2xl p-4 shadow-card">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setViewDate(new Date(year, month - 1, 1))}
          className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-bg-light transition-colors"
        >
          <ChevronLeft size={18} className="text-text-secondary" />
        </button>
        <span className="text-sm font-bold text-text-primary">{MONTHS[month]} {year}</span>
        <button
          onClick={() => setViewDate(new Date(year, month + 1, 1))}
          className="w-10 h-10 flex items-center justify-center rounded-lg hover:bg-bg-light transition-colors"
        >
          <ChevronRight size={18} className="text-text-secondary" />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-2">
        {DAYS.map((d) => (
          <div key={d} className="text-center text-[11px] font-semibold text-text-muted py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`e${i}`} />
        ))}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const disabled = isDisabled(day);
          const selected = isSelected(day);
          const todayMark = isToday(day);
          let cls = 'aspect-square rounded-lg text-sm font-semibold flex items-center justify-center transition-colors ';
          if (selected) cls += 'bg-primary text-white ';
          else if (todayMark) cls += 'bg-copper-soft text-copper ';
          else if (disabled) cls += 'text-border cursor-not-allowed ';
          else cls += 'text-text-primary hover:bg-bg-light ';

          return (
            <button
              key={day}
              onClick={() => !disabled && onChange(new Date(year, month, day))}
              disabled={disabled}
              className={cls}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
