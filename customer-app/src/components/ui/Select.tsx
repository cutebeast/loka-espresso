'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
  className?: string;
}

export function Select({ value, options, onChange, placeholder = 'Select...', label, className = '' }: SelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  return (
    <div ref={ref} className={`relative ${className}`}>
      {label && <label className="block text-sm font-medium text-text-secondary mb-1.5">{label}</label>}
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3.5 rounded-xl border-2 border-border-light bg-white text-left focus:border-primary outline-none transition-colors"
      >
        <span className={`text-sm font-medium ${selected ? 'text-text-primary' : 'text-text-muted'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={18} className={`text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1.5 bg-white rounded-xl border border-border-light shadow-lg overflow-hidden">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-medium text-text-primary hover:bg-bg-light transition-colors"
            >
              {opt.label}
              {opt.value === value && <Check size={16} className="text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
