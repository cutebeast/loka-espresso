'use client';

interface RadioProps {
  checked: boolean;
  onChange: () => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export function Radio({ checked, onChange, label, disabled, className = '' }: RadioProps) {
  return (
    <label className={`flex items-center gap-3 cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}>
      <button
        type="button"
        onClick={() => !disabled && onChange()}
        disabled={disabled}
        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
          checked ? 'border-primary' : 'border-border hover:border-primary/50 bg-white'
        }`}
        aria-checked={checked}
        role="radio"
      >
        {checked && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
      </button>
      {label && <span className="text-sm font-medium text-text-primary">{label}</span>}
    </label>
  );
}
