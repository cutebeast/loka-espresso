'use client';

import { useState, useEffect, useCallback } from 'react';
import type { PageId } from '@/lib/merchant-types';

const VALID_PAGES: PageId[] = [
  'dashboard','orders','kitchen','menu','inventory','tables','staff',
  'rewards','vouchers','promotions','information','feedback','reports',
  'marketingreports','customers','notifications','auditlog','loyaltyrules',
  'store','settings','pwa','walletTopup','posterminal',
];

function getHashPage(): PageId {
  if (typeof window === 'undefined') return 'dashboard';
  const hash = window.location.hash.replace('#', '');
  if (VALID_PAGES.includes(hash as PageId)) return hash as PageId;
  const qp = new URLSearchParams(window.location.search).get('page');
  if (qp && VALID_PAGES.includes(qp as PageId)) return qp as PageId;
  return 'dashboard';
}

export function useHashRouter() {
  const [page, setPage] = useState<PageId>(getHashPage);

  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const urlCustomerId = searchParams.get('customerId');
  const [customerDetailId, setCustomerDetailId] = useState<number | null>(urlCustomerId ? parseInt(urlCustomerId) : null);

  useEffect(() => {
    const syncPage = () => {
      const stateDetailId = (window.history.state as {customerDetailId?: number} | null)?.customerDetailId;
      if (stateDetailId != null) {
        setCustomerDetailId(stateDetailId);
        setPage('customers');
        return;
      }
      const hash = window.location.hash.replace('#', '');
      if (VALID_PAGES.includes(hash as PageId)) {
        setCustomerDetailId(null);
        setPage(hash as PageId);
        return;
      }
      const qp = new URLSearchParams(window.location.search).get('page');
      if (qp && VALID_PAGES.includes(qp as PageId)) {
        setPage(qp as PageId);
        return;
      }
      if (!hash && !qp) {
        setCustomerDetailId(null);
        setPage('dashboard');
      }
    };
    window.addEventListener('hashchange', syncPage);
    window.addEventListener('popstate', syncPage);
    return () => {
      window.removeEventListener('hashchange', syncPage);
      window.removeEventListener('popstate', syncPage);
    };
  }, []);

  const handlePageChange = useCallback((newPage: PageId) => {
    setCustomerDetailId(null);
    if (typeof window !== 'undefined') {
      window.location.hash = newPage;
    }
    setPage(newPage);
    if (window.innerWidth <= 1024) {
      // Sidebar close is handled by the caller via onMobileNavigate callback
    }
  }, []);

  return {
    page,
    setPage,
    customerDetailId,
    setCustomerDetailId,
    handlePageChange,
  };
}
