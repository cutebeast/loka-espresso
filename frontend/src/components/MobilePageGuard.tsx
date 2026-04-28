'use client';

import { useIsMobile } from '@/hooks/useMediaQuery';
import type { PageId } from '@/lib/merchant-types';

const MOBILE_SUPPORTED: Set<PageId> = new Set([
  'kitchen',
  'posterminal',
  'tables',
  'walletTopup',
]);

interface MobilePageGuardProps {
  page: PageId;
  children: React.ReactNode;
}

export default function MobilePageGuard({ page, children }: MobilePageGuardProps) {
  const isMobile = useIsMobile();

  if (!isMobile || MOBILE_SUPPORTED.has(page)) {
    return <>{children}</>;
  }

  return (
    <div className="mpg-container">
      <div className="mpg-icon"><i className="fas fa-desktop"></i></div>
      <h3 className="mpg-title">Desktop Only</h3>
      <p className="mpg-text">
        This page is not available on mobile. Please use a desktop browser for full access.
      </p>
      <div className="mpg-pages">
        <span className="mpg-label">Available on mobile:</span>
        <div className="mpg-chips">
          {['Order Station', 'POS Terminal', 'Tables', 'Wallet Top-Up'].map(name => (
            <span key={name} className="mpg-chip">{name}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
