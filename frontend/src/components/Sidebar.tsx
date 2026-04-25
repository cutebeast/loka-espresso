'use client';

import { useEffect } from 'react';
import { PageId } from '@/lib/merchant-types';
import type { MerchantStore } from '@/lib/merchant-types';
import Image from 'next/image';

// Page visibility by user_type_id
const PAGE_VISIBILITY: Record<number, Set<string>> = {
  1: new Set([
    'dashboard', 'orders', 'kitchen',
    'menu', 'inventory', 'tables', 'staff', 'walletTopup', 'posterminal',
    'customers', 'rewards', 'vouchers', 'promotions', 'information', 'notifications', 'feedback',
    'reports', 'marketingreports',
    'store', 'settings', 'pwa', 'loyaltyrules', 'auditlog',
  ]),
  2: new Set([
    'dashboard', 'orders', 'kitchen',
    'menu', 'inventory', 'tables', 'staff', 'walletTopup', 'posterminal',
    'customers', 'rewards', 'vouchers', 'reports', 'marketingreports',
  ]),
  3: new Set(['orders', 'kitchen', 'walletTopup', 'posterminal', 'tables']),
};

const navGroups = [
  { label: 'Overview', icon: 'fa-compass', items: [
    { id: 'dashboard' as PageId, icon: 'fa-chart-pie', label: 'Dashboard' },
  ]},
  { label: 'Counter Operations', icon: 'fa-cash-register', items: [
    { id: 'orders' as PageId, icon: 'fa-clipboard-list', label: 'Orders' },
    { id: 'kitchen' as PageId, icon: 'fa-fire-burner', label: 'Order Station' },
    { id: 'walletTopup' as PageId, icon: 'fa-wallet', label: 'Wallet Top-Up' },
    { id: 'posterminal' as PageId, icon: 'fa-cash-register', label: 'POS Terminal' },
  ]},
  { label: 'Store Management', icon: 'fa-store', items: [
    { id: 'menu' as PageId, icon: 'fa-mug-hot', label: 'Menu Management' },
    { id: 'inventory' as PageId, icon: 'fa-boxes-stacked', label: 'Inventory', hasSubmenu: true },
    { id: 'tables' as PageId, icon: 'fa-chair', label: 'Tables' },
    { id: 'staff' as PageId, icon: 'fa-user-tie', label: 'Staff' },
  ]},
  { label: 'CRM & Marketing', icon: 'fa-bullhorn', items: [
    { id: 'customers' as PageId, icon: 'fa-users', label: 'Customers' },
    { id: 'rewards' as PageId, icon: 'fa-gift', label: 'Rewards' },
    { id: 'vouchers' as PageId, icon: 'fa-ticket', label: 'Vouchers' },
    { id: 'promotions' as PageId, icon: 'fa-bullhorn', label: 'Promotions' },
    { id: 'information' as PageId, icon: 'fa-info-circle', label: 'Information' },
    { id: 'notifications' as PageId, icon: 'fa-bell', label: 'Push Notifications' },
    { id: 'feedback' as PageId, icon: 'fa-star', label: 'Feedback' },
  ]},
  { label: 'Analytics', icon: 'fa-chart-bar', items: [
    { id: 'reports' as PageId, icon: 'fa-chart-line', label: 'Sales Reports' },
    { id: 'marketingreports' as PageId, icon: 'fa-bullseye', label: 'Marketing ROI' },
  ]},
  { label: 'System & Config', icon: 'fa-cog', items: [
    { id: 'store' as PageId, icon: 'fa-store-alt', label: 'Store Settings' },
    { id: 'settings' as PageId, icon: 'fa-cog', label: 'App Settings' },
    { id: 'pwa' as PageId, icon: 'fa-mobile-alt', label: 'PWA Settings' },
    { id: 'loyaltyrules' as PageId, icon: 'fa-medal', label: 'Loyalty Rules' },
    { id: 'auditlog' as PageId, icon: 'fa-history', label: 'Audit Log' },
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
  userType?: number;
  isOpen?: boolean;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function Sidebar({ page, setPage, collapsedGroups, setCollapsedGroups, onLogout: _onLogout, userType = 1, isOpen = true, collapsed = false, onToggleCollapse }: SidebarProps) {
  const visiblePages = PAGE_VISIBILITY[userType ?? 1] || PAGE_VISIBILITY[1];

  function toggleGroup(label: string) {
    setCollapsedGroups(prev => ({ ...prev, [label]: !prev[label] }));
  }

  
  useEffect(() => {
    const saved = localStorage.getItem('sidebarCollapsed');
    if (saved && onToggleCollapse) {
      if (saved === 'true' && !collapsed) {
        onToggleCollapse();
      }
    }
  }, [collapsed, onToggleCollapse]);

  useEffect(() => {
    localStorage.setItem('sidebarCollapsed', String(collapsed));
  }, [collapsed]);

  return (
    <>
      <aside className={`sidebar${isOpen ? ' mobile-open' : ''} sb-aside ${collapsed ? 'sb-w-76' : 'sb-w-260'}`}>
      {/* Brand Header */}
      <div className={`sb-brand ${collapsed ? 'sb-justify-center' : 'sb-justify-start'}`}>
        {collapsed ? (
          <div className="s-0">
            <Image
              src="/loka-logo.png"
              alt="Loka Espresso"
              fill
              className="s-1"
            />
          </div>
        ) : (
          <div className="s-2">
            <div className="s-3">
              <Image
                src="/loka-logo.png"
                alt="Loka Espresso"
                fill
                className="s-4"
              />
            </div>
            <span className="sb-brand-name">Loka Espresso</span>
          </div>
        )}
        
        {/* Toggle Button */}
        <div
          onClick={onToggleCollapse}
          title="Toggle sidebar"
          className={`sb-toggle ${collapsed ? 'sb-toggle-collapsed' : 'sb-toggle-open'}`}
        >
          <span className="s-5"><i className="fas fa-chevron-left"></i></span>
        </div>
      </div>
      
      {/* Navigation */}
      <nav className={`sb-nav ${collapsed ? 'pad-0-8px' : 'pad-0-12px'}`}>
        {navGroups.map(group => {
          const visibleItems = group.items.filter(item => visiblePages.has(item.id));
          if (visibleItems.length === 0) return null;
          const isCollapsed = collapsedGroups[group.label] || false;
          return (
            <div key={group.label} className="s-6">
              {/* Section Label */}
              <div
                onClick={() => !collapsed && toggleGroup(group.label)}
                className={`sb-section-label ${collapsed ? 'sb-justify-center sb-pad-collapsed cursor-default' : 'sb-justify-space-between sb-pad-open cursor-pointer'}`}
              >
                <span className={`sb-section-inner ${collapsed ? 'gap-0' : 'gap-8'}`}>
                  <span className="s-7"><i className={`fas ${group.icon}`}></i></span>
                  <span className={`sb-section-text ${collapsed ? 'opacity-0 sb-width-0' : 'opacity-1 sb-width-auto'}`}>{group.label}</span>
                </span>
                {!collapsed && (
                  <span className="s-8"><i className={`fas fa-chevron-${isCollapsed ? 'right' : 'down'}`}></i></span>
                )}
              </div>
              
              {/* Nav Items */}
              {!isCollapsed && !collapsed && visibleItems.map(n => (
                <div
                  key={n.id}
                  onClick={() => setPage(n.id)}
                  className={`sb-nav-item ${page === n.id ? 'sb-nav-item-active' : 'sb-nav-item-inactive'}`}
                >
                  {page === n.id && (
                    <div className="s-9" />
                  )}
                  <i className={`fas ${n.icon} sb-nav-icon ${page === n.id ? 'sb-nav-icon-active' : 'sb-nav-icon-inactive'}`}></i>
                  <span className={`sb-nav-label ${collapsed ? 'opacity-0 sb-width-0' : 'opacity-1 sb-width-auto'}`}>{n.label}</span>
                </div>
              ))}
              
              {/* Collapsed mode */}
              {collapsed && visibleItems.map(n => (
                <div
                  key={n.id}
                  onClick={() => setPage(n.id)}
                  className={`sidebar-tooltip ${page === n.id ? 'sb-collapsed-active' : 'sb-collapsed-inactive'} sb-collapsed-item`}
                  data-tooltip={n.label}
                >
                  {page === n.id && (
                    <div className="s-10" />
                  )}
                  <span className="s-11"><i className={`fas ${n.icon}`}></i></span>
                </div>
              ))}
            </div>
          );
        })}
      </nav>
      
      {/* User Footer */}
      <div className={`sb-footer ${collapsed ? 'sb-pad-footer-collapsed sb-justify-center' : 'sb-pad-footer-open sb-justify-start'}`}>
        {collapsed ? (
          <div className="s-12">HQ</div>
        ) : (
          <div className="s-13">
            <div className="s-14">HQ</div>
            <div>
              <div className="s-15">HQ Admin</div>
              <div className="s-16">Administrator</div>
            </div>
          </div>
        )}
      </div>
    </aside>
    </>
  );
}

export { navGroups };
