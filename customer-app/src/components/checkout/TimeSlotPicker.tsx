'use client';

import { useMemo } from 'react';
import { Clock } from 'lucide-react';
import { LOKA } from '@/lib/tokens';

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
      <div className="flex items-center gap-2 mb-3">
        <Clock size={16} color={LOKA.copper} />
        <span className="font-bold text-text-primary" style={{ fontSize: 13 }}>Pickup Time</span>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {slots.map((slot, idx) => {
          const isSelected = value === slot;
          const isFirst = idx === 0;
          return (
            <button
              key={slot}
              onClick={() => onChange(slot)}
              className="py-2.5 px-4 rounded-xl cursor-pointer whitespace-nowrap shrink-0 transition-all border-none"
              style={{
                fontSize: 13,
                fontWeight: isSelected ? 700 : 600,
                border: isSelected ? '2px solid #384B16' : '1.5px solid #E4EAEF',
                background: isSelected ? '#F2F6EA' : LOKA.white,
                color: isSelected ? LOKA.primary : LOKA.textPrimary,
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
