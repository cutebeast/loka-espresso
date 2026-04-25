'use client';

import { ReactNode } from 'react';
import type { PageId } from '@/lib/api';
import BottomNav from '@/components/BottomNav';

interface HubLayoutProps {
  children: ReactNode;
  page: PageId;
  onNavigate: (id: PageId) => void;
  header?: ReactNode;
  className?: string;
  isGuest?: boolean;
}

export function HubLayout({
  children,
  page,
  onNavigate,
  header,
  className = '',
  isGuest,
}: HubLayoutProps) {
  return (
    <div className={`flex flex-col h-full bg-bg ${className}`}>
      {header && (
        <div className="shrink-0">{header}</div>
      )}

      <main className="flex-1 overflow-y-auto scroll-container">
        {children}
      </main>

      <div className="shrink-0 safe-area-bottom">
        <BottomNav page={page} onNavigate={onNavigate} isGuest={isGuest} />
      </div>
    </div>
  );
}
