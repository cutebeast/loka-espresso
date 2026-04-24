'use client';

import { ChevronRight } from 'lucide-react';

interface SectionHeaderProps {
  title: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function SectionHeader({ title, action, className = '' }: SectionHeaderProps) {
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <h2 className="text-lg font-extrabold text-text-primary tracking-tight">
        {title}
      </h2>
      {action && (
        <button
          onClick={action.onClick}
          className="flex items-center gap-0.5 text-sm font-semibold text-text-muted hover:text-primary transition-colors"
        >
          {action.label}
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  );
}
