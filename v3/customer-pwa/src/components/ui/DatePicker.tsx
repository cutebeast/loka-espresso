'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const DAYS_PER_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 100 }, (_, i) => currentYear - i);

function daysInMonth(monthIndex: number): number {
  return DAYS_PER_MONTH[monthIndex] || 31;
}

interface DatePickerProps {
  value: string;        // YYYY-MM-DD
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}

export default function DatePicker({ value, onChange, placeholder = 'Select date', label }: DatePickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const parsed = value ? value.split('-').map(Number) : null;
  const [month, setMonth] = useState(parsed ? parsed[1] - 1 : 0);
  const [day, setDay] = useState(parsed ? parsed[2] : 1);
  const [year, setYear] = useState(parsed ? parsed[0] : currentYear - 25);

  const monthRef = useRef<HTMLDivElement>(null);
  const dayRef = useRef<HTMLDivElement>(null);
  const yearRef = useRef<HTMLDivElement>(null);

  const displayText = parsed
    ? `${parsed[2]} ${MONTHS[parsed[1] - 1].slice(0, 3)} ${parsed[0]}`
    : null;

  const safeDay = Math.min(day, daysInMonth(month));

  const apply = useCallback(() => {
    const m = String(month + 1).padStart(2, '0');
    const d = String(safeDay).padStart(2, '0');
    onChange(`${year}-${m}-${d}`);
    setOpen(false);
  }, [month, safeDay, year, onChange]);

  // Scroll selected item into view when picker opens
  useEffect(() => {
    if (!open) return;
    const timeout = setTimeout(() => {
      monthRef.current?.children[month]?.scrollIntoView({ block: 'center', behavior: 'auto' });
      dayRef.current?.children[safeDay - 1]?.scrollIntoView({ block: 'center', behavior: 'auto' });
      const yearIdx = YEARS.indexOf(year);
      if (yearIdx >= 0) {
        yearRef.current?.children[yearIdx]?.scrollIntoView({ block: 'center', behavior: 'auto' });
      }
    }, 50);
    return () => clearTimeout(timeout);
  }, [open, month, safeDay, year]);

  const handleWheelMonth = (e: React.WheelEvent) => {
    e.preventDefault();
    setMonth(m => Math.max(0, Math.min(11, m + (e.deltaY > 0 ? 1 : -1))));
  };

  const handleWheelDay = (e: React.WheelEvent) => {
    e.preventDefault();
    const max = daysInMonth(month);
    setDay(d => Math.max(1, Math.min(max, d + (e.deltaY > 0 ? 1 : -1))));
  };

  const handleWheelYear = (e: React.WheelEvent) => {
    e.preventDefault();
    const idx = YEARS.indexOf(year);
    const newIdx = Math.max(0, Math.min(YEARS.length - 1, idx + (e.deltaY > 0 ? 1 : -1)));
    setYear(YEARS[newIdx]);
  };

  return (
    <>
      <button
        type="button"
        className="datepicker-field"
        onClick={() => setOpen(true)}
      >
        <span className={displayText ? 'datepicker-value' : 'datepicker-placeholder'}>
          {displayText || placeholder}
        </span>
        <ChevronDown size={16} className="datepicker-chevron" />
      </button>

      {open && (
        <div className="datepicker-overlay" onClick={(e) => { if (e.target === e.currentTarget) apply(); }}>
          <div className="datepicker-sheet">
            <div className="datepicker-sheet-header">
              <button className="datepicker-sheet-btn datepicker-cancel" onClick={() => setOpen(false)}>
                {t('common.cancel')}
              </button>
              {label && <span className="datepicker-sheet-label">{label}</span>}
              <button className="datepicker-sheet-btn datepicker-done" onClick={apply}>
                {t('common.done')}
              </button>
            </div>

            <div className="datepicker-columns">
              {/* Month */}
              <div className="datepicker-column">
                <div className="datepicker-column-label">{t('common.month')}</div>
                <div
                  ref={monthRef}
                  className="datepicker-scroll"
                  onWheel={handleWheelMonth}
                >
                  {MONTHS.map((m, i) => (
                    <div
                      key={m}
                      className={`datepicker-item ${i === month ? 'active' : ''}`}
                      onClick={() => setMonth(i)}
                    >
                      {m.slice(0, 3)}
                    </div>
                  ))}
                </div>
              </div>

              {/* Day */}
              <div className="datepicker-column">
                <div className="datepicker-column-label">{t('common.day')}</div>
                <div
                  ref={dayRef}
                  className="datepicker-scroll"
                  onWheel={handleWheelDay}
                >
                  {Array.from({ length: daysInMonth(month) }, (_, i) => i + 1).map(d => (
                    <div
                      key={d}
                      className={`datepicker-item ${d === safeDay ? 'active' : ''}`}
                      onClick={() => setDay(d)}
                    >
                      {d}
                    </div>
                  ))}
                </div>
              </div>

              {/* Year */}
              <div className="datepicker-column">
                <div className="datepicker-column-label">{t('common.year')}</div>
                <div
                  ref={yearRef}
                  className="datepicker-scroll"
                  onWheel={handleWheelYear}
                >
                  {YEARS.map(y => (
                    <div
                      key={y}
                      className={`datepicker-item ${y === year ? 'active' : ''}`}
                      onClick={() => setYear(y)}
                    >
                      {y}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
