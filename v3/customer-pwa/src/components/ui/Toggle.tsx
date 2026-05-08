'use client';

import { motion } from 'framer-motion';

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function Toggle({ checked, onChange, disabled, className = '' }: ToggleProps) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`
        relative w-11 h-6 rounded-full transition-colors
        ${checked ? 'bg-primary' : 'bg-border'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
        ${className}
      `}
      aria-checked={checked}
      role="switch"
    >
      <motion.div
        className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm"
        animate={{ x: checked ? 20 : 0 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </button>
  );
}
