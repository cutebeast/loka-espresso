'use client';

import { useState } from 'react';
import { THEME } from '@/lib/theme';

export type DatePreset = 'TODAY' | 'MTD' | 'QTD' | 'YTD' | 'CUSTOM';

interface DateFilterProps {
  preset: DatePreset;
  onChange: (preset: DatePreset, from: string, to: string) => void;
  fromDate: string;
  toDate: string;
}

export function calcDateRange(preset: DatePreset): { from: string; to: string } {
  const now = new Date();
  // Use local date components to avoid timezone issues
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-indexed
  const date = now.getDate();

  let from: Date;
  let to: Date;

  switch (preset) {
    case 'TODAY':
      // Today = current date only
      from = new Date(year, month, date);
      to = new Date(year, month, date);
      break;
    case 'MTD':
      // Month to Date = 1st of current month to today
      from = new Date(year, month, 1);
      to = new Date(year, month, date);
      break;
    case 'QTD': {
      // Quarter to Date = start of current quarter to today
      // Q1: Jan-Mar (0-2), Q2: Apr-Jun (3-5), Q3: Jul-Sep (6-8), Q4: Oct-Dec (9-11)
      const quarter = Math.floor(month / 3);
      const startMonth = quarter * 3;
      from = new Date(year, startMonth, 1);
      to = new Date(year, month, date);
      break;
    }
    case 'YTD':
      // Year to Date = Jan 1st to today
      from = new Date(year, 0, 1);
      to = new Date(year, month, date);
      break;
    case 'CUSTOM':
    default:
      // Default to last 30 days
      to = new Date(year, month, date);
      from = new Date(year, month, date - 29);
  }

  // Format as YYYY-MM-DD using local date components
  const formatDate = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  return { from: formatDate(from), to: formatDate(to) };
}

const PRESETS: { label: string; value: DatePreset }[] = [
  { label: 'Today', value: 'TODAY' },
  { label: 'MTD', value: 'MTD' },
  { label: 'QTD', value: 'QTD' },
  { label: 'YTD', value: 'YTD' },
];

export function DateFilter({ preset, onChange, fromDate, toDate }: DateFilterProps) {
  const [showCustom, setShowCustom] = useState(preset === 'CUSTOM');

  function handlePreset(p: DatePreset) {
    if (p === 'CUSTOM') {
      setShowCustom(true);
      onChange('CUSTOM', fromDate, toDate);
    } else {
      setShowCustom(false);
      const range = calcDateRange(p);
      onChange(p, range.from, range.to);
    }
  }

  function handleCustomFrom(value: string) {
    onChange('CUSTOM', value, toDate);
  }

  function handleCustomTo(value: string) {
    onChange('CUSTOM', fromDate, value);
  }

  return (
    <div style={{
      display: 'flex',
      flexWrap: 'nowrap',
      alignItems: 'center',
      gap: 4,
      background: THEME.bgCard,
      padding: '4px',
      borderRadius: THEME.radius.xl,
      boxShadow: THEME.shadow.sm,
      border: `1px solid ${THEME.border}`,
    }}>
      {PRESETS.map(p => (
        <button
          key={p.value}
          onClick={() => handlePreset(p.value)}
          style={{
            padding: '8px 14px',
            borderRadius: THEME.radius.xl,
            border: 'none',
            background: preset === p.value ? THEME.primary : 'transparent',
            color: preset === p.value ? THEME.textLight : THEME.textMuted,
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 0.2s',
            boxShadow: preset === p.value ? THEME.shadow.md : 'none',
            whiteSpace: 'nowrap',
          }}
        >
          {p.label}
        </button>
      ))}

      <div style={{
        width: 1,
        height: 24,
        background: THEME.border,
        margin: '0 4px',
      }} />

      <button
        onClick={() => handlePreset('CUSTOM')}
        style={{
          padding: '8px 14px',
          borderRadius: THEME.radius.xl,
          border: preset === 'CUSTOM' ? `2px solid ${THEME.primary}` : `1px solid ${THEME.border}`,
          background: preset === 'CUSTOM' ? THEME.bgMuted : 'transparent',
          color: preset === 'CUSTOM' ? THEME.textPrimary : THEME.textMuted,
          fontSize: 13,
          fontWeight: 500,
          cursor: 'pointer',
          transition: 'all 0.2s',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <i className="fas fa-calendar" style={{ fontSize: 12 }} />
        Custom
      </button>

      {showCustom && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 8 }}>
          <input
            type="date"
            value={fromDate}
            onChange={e => handleCustomFrom(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: THEME.radius.md,
              border: `1px solid ${THEME.border}`,
              fontSize: 12,
              color: THEME.textPrimary,
              outline: 'none',
            }}
          />
          <span style={{ color: THEME.textMuted, fontSize: 12 }}>to</span>
          <input
            type="date"
            value={toDate}
            onChange={e => handleCustomTo(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: THEME.radius.md,
              border: `1px solid ${THEME.border}`,
              fontSize: 12,
              color: THEME.textPrimary,
              outline: 'none',
            }}
          />
        </div>
      )}
    </div>
  );
}
