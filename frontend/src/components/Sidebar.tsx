'use client';

import { useEffect } from 'react';
import { PageId } from '@/lib/merchant-types';
import type { MerchantStore } from '@/lib/merchant-types';
import Image from 'next/image';
import { THEME } from '@/lib/theme';

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
  3: new Set(['orders', 'kitchen', 'walletTopup', 'posterminal']),
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

const tooltipStyles = `
  .sidebar-tooltip:hover::after {
    content: attr(data-tooltip);
    position: absolute;
    left: calc(100% + 12px);
    top: 50%;
    transform: translateY(-50%);
    background: ${THEME.primaryDark};
    color: ${THEME.textLight};
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    white-space: nowrap;
    z-index: 100;
    box-shadow: ${THEME.shadow.lg};
    pointer-events: none;
    animation: tooltipIn 0.2s ease;
  }
  .sidebar-tooltip:hover::before {
    content: '';
    position: absolute;
    left: calc(100% + 6px);
    top: 50%;
    transform: translateY(-50%);
    border: 6px solid transparent;
    border-right-color: ${THEME.primaryDark};
    z-index: 100;
    pointer-events: none;
  }
  @keyframes tooltipIn {
    from { opacity: 0; transform: translateY(-50%) translateX(-4px); }
    to { opacity: 1; transform: translateY(-50%) translateX(0); }
  }
`;

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

  const sidebarWidth = collapsed ? 76 : 260;
  
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
      <style dangerouslySetInnerHTML={{ __html: tooltipStyles }} />
      <aside className={`sidebar${isOpen ? ' mobile-open' : ''}`} style={{
        width: sidebarWidth,
        background: THEME.sidebar.bg,
        color: THEME.sidebar.textMuted,
        display: 'flex',
        flexDirection: 'column',
        position: 'fixed',
        height: '100vh',
        overflowY: 'auto',
        overflowX: 'hidden',
        zIndex: 150,
        transition: 'width 0.35s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s ease',
      }}>
      {/* Brand Header */}
      <div style={{
        padding: '20px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        borderBottom: `1px solid ${THEME.sidebar.border}`,
        position: 'relative',
        height: 73,
        justifyContent: collapsed ? 'center' : 'flex-start',
        transition: 'padding 0.35s ease, justify-content 0.35s ease',
      }}>
        {collapsed ? (
          <div style={{
            width: 44, height: 44,
            position: 'relative',
            borderRadius: 8,
            overflow: 'hidden',
            background: THEME.bgCard,
            flexShrink: 0,
            padding: 6,
          }}>
            <Image
              src="/loka-logo.png"
              alt="Loka Espresso"
              fill
              style={{ objectFit: 'contain' }}
            />
          </div>
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}>
            <div style={{
              width: 48, height: 48,
              position: 'relative',
              borderRadius: 8,
              overflow: 'hidden',
              background: THEME.bgCard,
              flexShrink: 0,
              padding: 8,
            }}>
              <Image
                src="/loka-logo.png"
                alt="Loka Espresso"
                fill
                style={{ objectFit: 'contain' }}
              />
            </div>
            <span style={{
              fontSize: 17,
              fontWeight: 700,
              color: THEME.textLight,
              letterSpacing: -0.3,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              transition: 'opacity 0.2s, width 0.2s',
            }}>Loka Espresso</span>
          </div>
        )}
        
        {/* Toggle Button */}
        <div
          onClick={onToggleCollapse}
          title="Toggle sidebar"
          style={{
            position: 'absolute',
            right: -12,
            top: 24,
            width: 24,
            height: 24,
            background: THEME.bgPage,
            border: `2px solid ${THEME.border}`,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: THEME.primary,
            fontSize: 10,
            zIndex: 160,
            boxShadow: THEME.shadow.md,
            transition: 'all 0.3s ease',
            transform: collapsed ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          <i className="fas fa-chevron-left" style={{ fontSize: 10 }}></i>
        </div>
      </div>
      
      {/* Navigation */}
      <nav style={{ flex: 1, padding: collapsed ? '0 8px' : '0 12px', marginTop: 8 }}>
        {navGroups.map(group => {
          const visibleItems = group.items.filter(item => visiblePages.has(item.id));
          if (visibleItems.length === 0) return null;
          const isCollapsed = collapsedGroups[group.label] || false;
          return (
            <div key={group.label} style={{ marginBottom: 2 }}>
              {/* Section Label */}
              <div
                onClick={() => !collapsed && toggleGroup(group.label)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: collapsed ? 'center' : 'space-between',
                  padding: collapsed ? '16px 0 8px' : '16px 12px 8px',
                  cursor: collapsed ? 'default' : 'pointer',
                  fontSize: 10,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: 1.5,
                  color: THEME.sidebar.textMuted,
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 8 }}>
                  <i className={`fas ${group.icon}`} style={{ fontSize: 13 }}></i>
                  <span style={{
                    opacity: collapsed ? 0 : 1,
                    width: collapsed ? 0 : 'auto',
                    overflow: 'hidden',
                    transition: 'opacity 0.2s, width 0.2s',
                  }}>{group.label}</span>
                </span>
                {!collapsed && (
                  <i className={`fas fa-chevron-${isCollapsed ? 'right' : 'down'}`} style={{ fontSize: 11, transition: 'transform 0.2s' }}></i>
                )}
              </div>
              
              {/* Nav Items */}
              {!isCollapsed && !collapsed && visibleItems.map(n => (
                <div
                  key={n.id}
                  onClick={() => setPage(n.id)}
                  style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    margin: '2px 0',
                    borderRadius: 8,
                    fontWeight: page === n.id ? 600 : 500,
                    fontSize: 14,
                    cursor: 'pointer',
                    textDecoration: 'none',
                    color: page === n.id ? THEME.textLight : THEME.sidebar.textMuted,
                    background: page === n.id
                      ? `linear-gradient(90deg, rgba(154, 186, 122, 0.25) 0%, rgba(154, 186, 122, 0.05) 100%)`
                      : 'transparent',
                    transition: 'all 0.2s',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                  }}
                >
                  {page === n.id && (
                    <div style={{
                      position: 'absolute',
                      left: 0,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: 3,
                      height: 20,
                      background: THEME.sidebar.accent,
                      borderRadius: '0 4px 4px 0',
                      transition: 'left 0.35s ease',
                    }} />
                  )}
                  <i className={`fas ${n.icon}`} style={{ 
                    width: 20, 
                    textAlign: 'center', 
                    fontSize: 15, 
                    minWidth: 20, 
                    color: page === n.id ? THEME.sidebar.accent : THEME.sidebar.textMuted 
                  }}></i>
                  <span style={{
                    opacity: collapsed ? 0 : 1,
                    width: collapsed ? 0 : 'auto',
                    overflow: 'hidden',
                    transition: 'opacity 0.2s, width 0.2s',
                  }}>{n.label}</span>
                </div>
              ))}
              
              {/* Collapsed mode */}
              {collapsed && visibleItems.map(n => (
                <div
                  key={n.id}
                  onClick={() => setPage(n.id)}
                  className="sidebar-tooltip"
                  data-tooltip={n.label}
                  style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '12px',
                    margin: '2px 0',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: page === n.id
                      ? `linear-gradient(90deg, rgba(154, 186, 122, 0.25) 0%, rgba(154, 186, 122, 0.05) 100%)`
                      : 'transparent',
                    color: page === n.id ? THEME.sidebar.accent : THEME.sidebar.textMuted,
                    transition: 'all 0.2s',
                  }}
                >
                  {page === n.id && (
                    <div style={{
                      position: 'absolute',
                      left: 0,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: 3,
                      height: 20,
                      background: THEME.sidebar.accent,
                      borderRadius: '0 4px 4px 0',
                      transition: 'left 0.35s ease',
                    }} />
                  )}
                  <i className={`fas ${n.icon}`} style={{ fontSize: 18, margin: 0 }}></i>
                </div>
              ))}
            </div>
          );
        })}
      </nav>
      
      {/* User Footer */}
      <div style={{
        padding: collapsed ? '24px 0' : '24px 16px',
        borderTop: `1px solid ${THEME.sidebar.border}`,
        marginTop: 16,
        display: 'flex',
        justifyContent: collapsed ? 'center' : 'flex-start',
        transition: 'padding 0.35s ease',
      }}>
        {collapsed ? (
          <div style={{
            width: 36, height: 36,
            background: `linear-gradient(135deg, ${THEME.accentCopper}, ${THEME.accent})`,
            borderRadius: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 600,
            fontSize: 14,
            color: THEME.textLight,
            border: `1.5px solid ${THEME.sidebar.border}`,
            boxShadow: THEME.shadow.md,
          }}>HQ</div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44,
              background: `linear-gradient(135deg, ${THEME.accentCopper}, ${THEME.accent})`,
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 600,
              fontSize: 18,
              color: THEME.textLight,
              border: `1.5px solid ${THEME.sidebar.border}`,
              boxShadow: THEME.shadow.md,
            }}>HQ</div>
            <div>
              <div style={{ fontWeight: 500, fontSize: 15, color: THEME.textLight }}>HQ Admin</div>
              <div style={{ fontSize: 12, color: THEME.sidebar.textMuted }}>Administrator</div>
            </div>
          </div>
        )}
      </div>
    </aside>
    </>
  );
}

export { navGroups };
