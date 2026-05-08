'use client';

import { ReactNode } from 'react';

interface SurfaceCardProps {
  children: ReactNode;
  variant?: 'default' | 'elevated' | 'pressed' | 'gradient';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  className?: string;
  onClick?: () => void;
}

export function SurfaceCard({
  children,
  variant = 'default',
  padding = 'md',
  className = '',
  onClick,
}: SurfaceCardProps) {
  const variants = {
    default:  'bg-white rounded-2xl shadow-card',
    elevated: 'bg-white rounded-xl shadow-md',
    pressed:  'bg-bg-light rounded-lg',
    gradient: 'gradient-primary rounded-2xl text-white',
  };

  const paddings = {
    none: '',
    sm:   'p-3',
    md:   'p-4',
    lg:   'p-5',
  };

  return (
    <div
      onClick={onClick}
      className={`
        ${variants[variant]}
        ${paddings[padding]}
        ${onClick ? 'cursor-pointer active:scale-[0.98] transition-transform' : ''}
        ${className}
      `}
    >
      {children}
    </div>
  );
}
