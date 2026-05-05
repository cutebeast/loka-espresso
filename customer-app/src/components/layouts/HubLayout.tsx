'use client';

import { ReactNode, useCallback } from 'react';
import type { PageId } from '@/lib/api';
import BottomNav from '@/components/BottomNav';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';

interface HubLayoutProps {
  children: ReactNode;
  page: PageId;
  onNavigate: (id: PageId) => void;
  header?: ReactNode;
  className?: string;
  onRefresh?: () => void;
}

export function HubLayout({
  children,
  page,
  onNavigate,
  header,
  className = '',
  onRefresh,
}: HubLayoutProps) {
  const handleRefresh = useCallback(() => {
    window.location.reload();
  }, []);

  const { containerRef, pulling, pullDistance } = usePullToRefresh({
    onRefresh: onRefresh || handleRefresh,
    enabled: !!onRefresh || true,
  });

  return (
    <div className={`flex flex-col h-full bg-bg ${className}`}>
      {header && (
        <div className="shrink-0">{header}</div>
      )}

      <main ref={containerRef} className="flex-1 overflow-y-auto scroll-container relative">
        {pulling && (
          <div
            className="absolute left-0 right-0 flex items-center justify-center z-10 pointer-events-none"
            style={{ top: pullDistance - 40 }}
          >
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {children}
      </main>

      <div className="shrink-0 safe-area-bottom">
        <BottomNav page={page} onNavigate={onNavigate} />
      </div>
    </div>
  );
}
