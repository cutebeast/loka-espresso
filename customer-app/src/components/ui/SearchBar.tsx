'use client';

import { useState } from 'react';
import { Search, X } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}

export function SearchBar({
  value,
  onChange,
  placeholder = 'Search...',
  autoFocus = false,
  className = '',
}: SearchBarProps) {
  const [focused, setFocused] = useState(false);

  return (
    <div
      className={`
        flex items-center gap-2.5
        px-4 py-3 rounded-xl
        bg-white border-2 transition-colors
        ${focused ? 'border-primary' : 'border-border-light'}
        ${className}
      `}
    >
      <Search size={18} className="text-text-muted shrink-0" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="flex-1 bg-transparent text-sm font-medium text-text-primary placeholder:text-text-muted outline-none"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="w-10 h-10 rounded-full bg-border-subtle flex items-center justify-center shrink-0"
        >
          <X size={12} className="text-text-muted" />
        </button>
      )}
    </div>
  );
}
