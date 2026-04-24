'use client';

interface DividerProps {
  variant?: 'full' | 'inset' | 'middle';
  className?: string;
}

export function Divider({ variant = 'full', className = '' }: DividerProps) {
  const margins = {
    full:   'mx-0',
    inset:  'ml-4',
    middle: 'mx-4',
  };

  return (
    <div className={`h-px bg-border-subtle ${margins[variant]} ${className}`} />
  );
}
