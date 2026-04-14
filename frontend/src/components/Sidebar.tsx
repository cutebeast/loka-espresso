'use client';

import { PageId } from '@/lib/merchant-types';
import type { MerchantStore } from '@/lib/merchant-types';

const navGroups = [
  { label: 'Overview', icon: 'fa-compass', items: [
    { id: 'dashboard' as PageId, icon: 'fa-chart-pie', label: 'Dashboard' },
    { id: 'orders' as PageId, icon: 'fa-clipboard-list', label: 'Orders' },
  ]},
  { label: 'Store Ops', icon: 'fa-store', items: [
    { id: 'menu' as PageId, icon: 'fa-mug-hot', label: 'Menu' },
    { id: 'inventory' as PageId, icon: 'fa-boxes-stacked', label: 'Inventory' },
    { id: 'tables' as PageId, icon: 'fa-chair', label: 'Tables' },
    { id: 'staff' as PageId, icon: 'fa-user-tie', label: 'Staff' },
  ]},
  { label: 'Marketing', icon: 'fa-bullhorn', items: [
    { id: 'rewards' as PageId, icon: 'fa-gift', label: 'Rewards' },
    { id: 'vouchers' as PageId, icon: 'fa-ticket', label: 'Vouchers' },
    { id: 'promotions' as PageId, icon: 'fa-bullhorn', label: 'Promotions' },
    { id: 'feedback' as PageId, icon: 'fa-star', label: 'Feedback' },
    { id: 'surveys' as PageId, icon: 'fa-list-check', label: 'Surveys' },
  ]},
  { label: 'Analytics', icon: 'fa-chart-bar', items: [
    { id: 'reports' as PageId, icon: 'fa-chart-line', label: 'Sales Reports' },
    { id: 'marketingreports' as PageId, icon: 'fa-bullseye', label: 'Marketing Reports' },
    { id: 'customers' as PageId, icon: 'fa-users', label: 'Customers' },
  ]},
  { label: 'System', icon: 'fa-cog', items: [
    { id: 'notifications' as PageId, icon: 'fa-bell', label: 'Notifications' },
    { id: 'auditlog' as PageId, icon: 'fa-history', label: 'Audit Log' },
    { id: 'loyaltyrules' as PageId, icon: 'fa-medal', label: 'Loyalty Rules' },
    { id: 'store' as PageId, icon: 'fa-store-alt', label: 'Store Settings' },
  ]},
];

interface SidebarProps {
  page: PageId;
  setPage: (page: PageId) => void;
  collapsedGroups: Record<string, boolean>;
  setCollapsedGroups: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  stores: MerchantStore[];
  selectedStore: string;
  onLogout: () => void;
}

export default function Sidebar({ page, setPage, collapsedGroups, setCollapsedGroups, onLogout }: SidebarProps) {
  function toggleGroup(label: string) {
    setCollapsedGroups(prev => ({ ...prev, [label]: !prev[label] }));
  }

  return (
    <aside style={{ width: 280, background: '#002F6C', color: 'white', display: 'flex', flexDirection: 'column', flexShrink: 0, overflowY: 'auto' }}>
      <div style={{ padding: '24px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
        <i className="fas fa-mug-saucer" style={{ color: '#FFD166', fontSize: 28 }}></i>
        <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5 }}>ZUS Merchant</span>
      </div>
      <nav style={{ flex: 1, padding: '0 12px' }}>
        {navGroups.map(group => {
          const isCollapsed = collapsedGroups[group.label] || false;
          const hasActive = group.items.some(item => item.id === page);
          return (
            <div key={group.label} style={{ marginBottom: 4 }}>
              <div
                onClick={() => toggleGroup(group.label)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 16px', borderRadius: 10, cursor: 'pointer', fontSize: 12,
                  fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8,
                  color: hasActive ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.5)',
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <i className={`fas ${group.icon}`} style={{ fontSize: 13 }}></i>
                  {group.label}
                </span>
                <i className={`fas fa-chevron-${isCollapsed ? 'right' : 'down'}`} style={{ fontSize: 10 }}></i>
              </div>
              {!isCollapsed && group.items.map(n => (
                <div
                  key={n.id}
                  onClick={() => setPage(n.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '10px 16px 10px 28px',
                    borderRadius: 14, fontWeight: page === n.id ? 600 : 500, marginBottom: 2,
                    cursor: 'pointer', fontSize: 14,
                    background: page === n.id ? 'rgba(255,255,255,0.18)' : 'transparent',
                    color: page === n.id ? 'white' : 'rgba(255,255,255,0.85)',
                    transition: 'all 0.15s',
                  }}
                >
                  <i className={`fas ${n.icon}`} style={{ width: 20, fontSize: 15, textAlign: 'center' }}></i>
                  {n.label}
                </div>
              ))}
            </div>
          );
        })}
      </nav>
      <div style={{ padding: '24px 16px 28px', borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, background: '#1E4A7A', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: 18, border: '1.5px solid rgba(255,255,255,0.2)' }}>ZH</div>
          <div>
            <div style={{ fontWeight: 500, fontSize: 15 }}>ZUS HQ</div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Admin</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

export { navGroups };
