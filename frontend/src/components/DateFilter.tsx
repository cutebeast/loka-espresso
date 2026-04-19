'use client';

import { useState, useEffect } from 'react';

export type DatePreset = '7D' | '30D' | 'MTD' | 'LAST_MONTH' | 'MONTHLY' | 'CUSTOM';

interface DateFilterProps {
  preset: DatePreset;
  onPresetChange: (preset: DatePreset, from: string, to: string) => void;
  fromDate: string;
  toDate: string;
  onDateChange: (from: string, to: string) => void;
  showMonthly?: boolean;
}

export function calcRange(preset: DatePreset, monthValue?: string): { from: string; to: string } {
  const now = new Date();
  let from: Date;
  let to: Date;

  switch (preset) {
    case '7D':
      to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      from = new Date(to);
      from.setDate(from.getDate() - 6);
      from.setHours(0, 0, 0, 0);
      break;
    case '30D':
      to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      from = new Date(to);
      from.setDate(from.getDate() - 29);
      from.setHours(0, 0, 0, 0);
      break;
    case 'MTD':
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      break;
    case 'LAST_MONTH': {
      const lastDayOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      from = new Date(lastDayOfLastMonth.getFullYear(), lastDayOfLastMonth.getMonth(), 1);
      to = new Date(lastDayOfLastMonth.getFullYear(), lastDayOfLastMonth.getMonth(), lastDayOfLastMonth.getDate(), 23, 59, 59);
      break;
    }
    case 'MONTHLY': {
      // Specific month selected via monthValue (format: "YYYY-MM")
      if (monthValue) {
        const [y, m] = monthValue.split('-').map(Number);
        from = new Date(y, m - 1, 1);
        const lastDay = new Date(y, m, 0);
        to = new Date(y, m - 1, lastDay.getDate(), 23, 59, 59);
      } else {
        from = new Date(now.getFullYear(), now.getMonth(), 1);
        to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      }
      break;
    }
    default:
      to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
      from = new Date(to);
      from.setDate(from.getDate() - 29);
      from.setHours(0, 0, 0, 0);
  }
  return { from: from.toISOString().split('T')[0], to: to.toISOString().split('T')[0] };
}

export function generateMonthOptions(): { value: string; label: string }[] {
  const now = new Date();
  const months: { value: string; label: string }[] = [];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // Generate last 12 months
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
    months.push({ value: val, label });
  }
  return months;
}

const PRESETS: { label: string; value: DatePreset }[] = [
  { label: '7D', value: '7D' },
  { label: '30D', value: '30D' },
  { label: 'Last Month', value: 'LAST_MONTH' },
  { label: 'MTD', value: 'MTD' },
  { label: 'Monthly', value: 'MONTHLY' },
];

export default function DateFilter({ preset, onPresetChange, fromDate, toDate, onDateChange, showMonthly = true }: DateFilterProps) {
  const [monthValue, setMonthValue] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  const months = generateMonthOptions();

  // Sync monthValue with fromDate when in MONTHLY mode
  useEffect(() => {
    if (preset === 'MONTHLY' && fromDate) {
      const fromDateObj = new Date(fromDate);
      const expectedMonthValue = `${fromDateObj.getFullYear()}-${String(fromDateObj.getMonth() + 1).padStart(2, '0')}`;
      if (expectedMonthValue !== monthValue) {
        setMonthValue(expectedMonthValue);
      }
    }
  }, [fromDate, preset]);

  function handlePreset(p: DatePreset) {
    if (p === 'MONTHLY') {
      const range = calcRange('MONTHLY', monthValue);
      onPresetChange('MONTHLY', range.from, range.to);
    } else {
      const range = calcRange(p);
      onPresetChange(p, range.from, range.to);
    }
  }

  function handleMonthSelect(val: string) {
    setMonthValue(val);
    const range = calcRange('MONTHLY', val);
    onPresetChange('MONTHLY', range.from, range.to);
  }

  function handleCustomDate(field: 'from' | 'to', value: string) {
    if (field === 'from') {
      onDateChange(value, toDate);
    } else {
      onDateChange(fromDate, value);
    }
  }

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'nowrap',
      alignItems: 'center',
      gap: 4,
      background: 'white',
      padding: '4px',
      borderRadius: 40,
      boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
    }}>
      {PRESETS.map(p => (
        <button
          key={p.value}
          onClick={() => handlePreset(p.value)}
          style={{
            padding: '8px 14px',
            borderRadius: 30,
            border: 'none',
            background: preset === p.value ? '#1a3e2f' : 'transparent',
            color: preset === p.value ? '#ffffff' : '#4e5468',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: preset === p.value ? '0 4px 8px rgba(26,62,47,0.1)' : 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {p.label}
        </button>
      ))}

      {preset === 'MONTHLY' && (
        <select
          value={monthValue}
          onChange={e => handleMonthSelect(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: 30,
            border: 'none',
            background: '#f1f5f9',
            fontSize: 13,
            fontWeight: 500,
            color: '#1a3e2f',
            outline: 'none',
            cursor: 'pointer',
            marginLeft: 4,
          }}
        >
          {months.map(m => (
            <option key={m.value} value={m.value}>{m.label}</option>
          ))}
        </select>
      )}
    </div>
  );
}
