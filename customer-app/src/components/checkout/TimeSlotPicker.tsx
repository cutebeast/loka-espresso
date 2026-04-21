'use client';

import { useMemo } from 'react';
import { Clock } from 'lucide-react';

const LOKA = {
  primary: '#384B16',
  copper: '#D18E38',
  copperSoft: 'rgba(209,142,56,0.12)',
  textPrimary: '#1B2023',
  textMuted: '#6A7A8A',
  borderSubtle: '#E4EAEF',
  surface: '#F5F7FA',
  white: '#FFFFFF',
};

interface TimeSlotPickerProps {
  value: string | null;
  onChange: (time: string) => void;
  leadMinutes?: number;
}

function generateTimeSlots(leadMinutes: number, count: number = 8): string[] {
  const slots: string[] = [];
  const now = new Date();
  const start = new Date(now.getTime() + leadMinutes * 60 * 1000);
  start.setMinutes(Math.ceil(start.getMinutes() / 15) * 15, 0, 0);
  
  for (let i = 0; i < count; i++) {
    const slot = new Date(start.getTime() + i * 15 * 60 * 1000);
    slots.push(slot.toISOString());
  }
  return slots;
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export default function TimeSlotPicker({ value, onChange, leadMinutes = 15 }: TimeSlotPickerProps) {
  const slots = useMemo(() => generateTimeSlots(leadMinutes), [leadMinutes]);
  
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Clock size={16} color={LOKA.copper} />
        <span style={{ fontSize: 13, fontWeight: 700, color: LOKA.textPrimary }}>Pickup Time</span>
      </div>
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
        {slots.map((slot, idx) => {
          const isSelected = value === slot;
          const isFirst = idx === 0;
          return (
            <button
              key={slot}
              onClick={() => onChange(slot)}
              style={{
                padding: '10px 16px',
                borderRadius: 12,
                fontSize: 13,
                fontWeight: isSelected ? 700 : 600,
                border: isSelected ? '2px solid #384B16' : '1.5px solid #E4EAEF',
                background: isSelected ? '#F2F6EA' : LOKA.white,
                color: isSelected ? LOKA.primary : LOKA.textPrimary,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                flexShrink: 0,
                transition: 'all 0.15s ease',
              }}
            >
              {isFirst ? `ASAP · ~${formatTime(slot)}` : formatTime(slot)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
