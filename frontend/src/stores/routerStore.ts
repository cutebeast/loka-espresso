import { create } from 'zustand';
import type { PageId } from '@/lib/merchant-types';

const VALID_PAGES: PageId[] = [
  'dashboard', 'orders', 'kitchen', 'menu', 'inventory', 'tables', 'staff',
  'rewards', 'vouchers', 'promotions', 'information', 'feedback', 'reports',
  'marketingreports', 'customers', 'notifications', 'auditlog', 'loyaltyrules',
  'store', 'settings', 'pwa', 'walletTopup', 'posterminal',
];

function getHashPage(): PageId {
  if (typeof window === 'undefined') return 'dashboard';
  const hash = window.location.hash.replace('#', '');
  if (VALID_PAGES.includes(hash as PageId)) return hash as PageId;
  const qp = new URLSearchParams(window.location.search).get('page');
  if (qp && VALID_PAGES.includes(qp as PageId)) return qp as PageId;
  return 'dashboard';
}

function getUrlCustomerId(): number | null {
  if (typeof window === 'undefined') return null;
  const qp = new URLSearchParams(window.location.search).get('customerId');
  return qp ? parseInt(qp, 10) : null;
}

interface RouterState {
  page: PageId;
  customerDetailId: number | null;
  setPage: (page: PageId) => void;
  setCustomerDetailId: (id: number | null) => void;
  handlePageChange: (newPage: PageId) => void;
}

const initialPage = getHashPage();
const initialCustomerId = getUrlCustomerId();

export const useRouterStore = create<RouterState>()((set) => ({
  page: initialPage,
  customerDetailId: initialCustomerId,

  setPage: (page) => set({ page }),
  setCustomerDetailId: (customerDetailId) => set({ customerDetailId }),

  handlePageChange: (newPage) => {
    set({ customerDetailId: null });
    if (typeof window !== 'undefined') {
      window.location.hash = newPage;
    }
    set({ page: newPage });
  },
}));

// Sync store with browser back/forward and hash changes (outside React lifecycle)
if (typeof window !== 'undefined') {
  const syncPage = () => {
    const stateDetailId = (window.history.state as { customerDetailId?: number } | null)?.customerDetailId;
    if (stateDetailId != null) {
      useRouterStore.setState({ customerDetailId: stateDetailId, page: 'customers' });
      return;
    }
    const hash = window.location.hash.replace('#', '');
    if (VALID_PAGES.includes(hash as PageId)) {
      useRouterStore.setState({ customerDetailId: null, page: hash as PageId });
      return;
    }
    const qp = new URLSearchParams(window.location.search).get('page');
    if (qp && VALID_PAGES.includes(qp as PageId)) {
      useRouterStore.setState({ page: qp as PageId });
      return;
    }
    if (!hash && !qp) {
      useRouterStore.setState({ customerDetailId: null, page: 'dashboard' });
    }
  };

  window.addEventListener('hashchange', syncPage);
  window.addEventListener('popstate', syncPage);
}
