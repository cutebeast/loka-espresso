'use client';

import { ReactNode } from 'react';

interface SafeAreaProps {
  children: ReactNode;
  className?: string;
}

export function SafeArea({ children, className = '' }: SafeAreaProps) {
  return (
    <div
      className={`pt-safe ${className}`}
      style={{
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      {children}
    </div>
  );
}

export function SafeAreaBottom({ children, className = '' }: SafeAreaProps) {
  return (
    <div
      className={`pb-safe ${className}`}
      style={{
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {children}
    </div>
  );
}