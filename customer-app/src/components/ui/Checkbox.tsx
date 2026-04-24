'use client';

import { Check } from 'lucide-react';

interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export function Checkbox({ checked, onChange, label, disabled, className = '' }: CheckboxProps) {
  return (
    <label className={`flex items-center gap-3 cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}>
      <button
        type="button"
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors ${
          checked ? 'bg-primary border-primary' : 'bg-white border-border hover:border-primary/50'
        }`}
        aria-checked={checked}
        role="checkbox"
      >
        {checked && <Check size={13} className="text-white" strokeWidth={3} />}
      </button>
      {label && <span className="text-sm font-medium text-text-primary">{label}</span>}
    </label>
  );
}
