'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch, formatRM } from '@/lib/merchant-api';
import { FilterSelect, StoreSelector, DateFilter, DataTable, type DatePreset, Pagination } from '@/components/ui';
import { THEME } from '@/lib/theme';
import type { CustomerItem, MerchantStore } from '@/lib/merchant-types';

interface CustomersPageProps {
  token: string;
  stores: MerchantStore[];
  selectedStore: string;
  onStoreChange?: (storeId: string) => void;
  onEditCustomer: (customerId: number) => void;
}

const PAGE_SIZE = 50;

export default function CustomersPage({ token: _token, stores, selectedStore, onStoreChange, onEditCustomer }: CustomersPageProps) {
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [tier, setTier] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState('desc');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [preset, setPreset] = useState<DatePreset>('MTD');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const fetchCustomers = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(p),
        page_size: String(PAGE_SIZE),
        sort_by: sortBy,
        sort_dir: sortDir,
      });
      if (selectedStore !== 'all') params.set('store_id', selectedStore);
      if (search) params.set('search', search);
      if (tier) params.set('tier', tier);
      if (fromDate) params.set('from_date', fromDate + 'T00:00:00');
      if (toDate) params.set('to_date', toDate + 'T23:59:59');
      const res = await apiFetch(`/admin/customers?${params}`);
      if (res.ok) {
        const data = await res.json();
        setCustomers(data.customers || []);
        setTotal(data.total || 0);
        setTotalPages(data.total_pages || 1);
        setPage(p);
      }
    } catch {} finally { setLoading(false); }
  }, [selectedStore, search, tier, sortBy, sortDir, fromDate, toDate]);

  useEffect(() => { fetchCustomers(1); }, [fetchCustomers]);

  const tierOptions = [
    { value: '', label: 'All Tiers' },
    { value: 'bronze', label: 'Bronze' },
    { value: 'silver', label: 'Silver' },
    { value: 'gold', label: 'Gold' },
    { value: 'platinum', label: 'Platinum' },
  ];

  const sortOptions = [
    { value: 'created_at', label: 'Join Date' },
    { value: 'name', label: 'Name' },
    { value: 'points_balance', label: 'Points' },
    { value: 'total_spent', label: 'Total Spent' },
  ];

  return (
    <div>
      {/* Filter Bar - Store and Date on left, action buttons on right */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {onStoreChange && (
            <StoreSelector
              stores={stores.filter((s) => s.id !== 0).map((s) => ({ id: String(s.id), name: s.name }))}
              selectedStore={selectedStore}
              onChange={onStoreChange}
            />
          )}
          <DateFilter
            preset={preset}
            onChange={(p, from, to) => { setPreset(p); setFromDate(from); setToDate(to); setPage(1); }}
            fromDate={fromDate}
            toDate={toDate}
          />
          <FilterSelect
            value={tier}
            onChange={(val) => { setTier(val); setPage(1); }}
            options={tierOptions}
            icon="fa-crown"
            placeholder="All Tiers"
          />
          <FilterSelect
            value={sortBy}
            onChange={(val) => { setSortBy(val); setPage(1); }}
            options={sortOptions}
            icon="fa-sort"
            placeholder="Sort By"
          />
          <button
            className="btn btn-sm"
            onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
            title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
            style={{
              padding: '8px 12px',
              borderRadius: 40,
              border: `1px solid ${THEME.borderLight}`,
              background: 'white',
              color: THEME.textPrimary,
              cursor: 'pointer',
            }}
          >
            <i className={`fas fa-arrow-${sortDir === 'asc' ? 'up' : 'down'}`}></i>
          </button>
          {(search || tier || fromDate || toDate) && (
            <button
              className="btn btn-sm"
              onClick={() => { setSearch(''); setTier(''); setPage(1); setPreset('MTD'); setFromDate(''); setToDate(''); }}
              title="Clear filters"
              style={{
                padding: '8px 12px',
                borderRadius: 40,
                border: `1px solid ${THEME.borderLight}`,
                background: 'white',
                color: '#A83232',
                cursor: 'pointer',
              }}
            >
              <i className="fas fa-times"></i>
            </button>
          )}
        </div>

        {/* Search on right side */}
        <div style={{
          position: 'relative',
          background: 'white',
          padding: '8px 14px',
          borderRadius: 40,
          border: `1px solid ${THEME.borderLight}`,
          boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
          flex: '1',
          minWidth: 200,
          maxWidth: 280,
        }}>
          <i className="fas fa-search" style={{ color: THEME.textMuted, fontSize: 12, position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }}></i>
          <input
            placeholder="Search name, email, phone..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: 14,
              color: THEME.textPrimary,
              outline: 'none',
              width: '100%',
              paddingLeft: 24,
            }}
          />
        </div>
      </div>

      {/* Stats Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        background: THEME.bgMuted,
        borderRadius: `${THEME.radius.md} ${THEME.radius.md} 0 0`,
        border: `1px solid ${THEME.border}`,
        borderBottom: 'none',
      }}>
        <div style={{ fontSize: 14, color: THEME.textSecondary }}>
          <i className="fas fa-users" style={{ marginRight: 8, color: THEME.primary }}></i>
          Showing <strong style={{ color: THEME.textPrimary }}>{customers.length}</strong> of <strong style={{ color: THEME.textPrimary }}>{total}</strong> customers
        </div>
        <div style={{ fontSize: 13, color: THEME.textMuted }}>
          Page {page} of {totalPages}
        </div>
      </div>

      <DataTable<CustomerItem>
        data={customers}
        columns={[
          { key: 'name', header: 'Name', render: (c) => <span style={{ fontWeight: 500, color: THEME.textPrimary }}>{c.name || '-'}</span> },
          { key: 'phone', header: 'Phone', render: (c) => <span style={{ color: THEME.textPrimary }}>{c.phone || '-'}</span> },
          { key: 'email', header: 'Email', render: (c) => <span style={{ color: THEME.textPrimary }}>{c.email || '-'}</span> },
          { key: 'tier', header: 'Tier', render: (c) => (
            c.tier ? (
              <span className={`badge ${
                c.tier === 'platinum' ? 'badge-purple' :
                c.tier === 'gold' ? 'badge-yellow' :
                c.tier === 'silver' ? 'badge-gray' : 'badge-gray'
              }`}>
                {c.tier.charAt(0).toUpperCase() + c.tier.slice(1)}
              </span>
            ) : (
              <span className="badge badge-yellow">No Tier</span>
            )
          )},
          { key: 'points_balance', header: 'Points', render: (c) => <span style={{ color: THEME.textPrimary }}>{c.points_balance?.toLocaleString() || 0} pts</span> },
          { key: 'total_orders', header: 'Orders', render: (c) => <span style={{ color: THEME.textPrimary }}>{c.total_orders}</span> },
          { key: 'total_spent', header: 'Total Spent', render: (c) => <span style={{ color: THEME.textPrimary }}>{formatRM(c.total_spent || 0)}</span> },
          { key: 'created_at', header: 'Joined', render: (c) => <span style={{ color: THEME.textMuted, fontSize: 12 }}>{c.created_at ? new Date(c.created_at).toLocaleDateString() : '-'}</span> },
          { key: 'actions', header: 'Actions', render: (c) => (
            <button className="btn btn-sm" onClick={() => onEditCustomer(c.id)}>
              <i className="fas fa-eye"></i> View
            </button>
          )},
        ]}
        loading={loading && customers.length === 0}
        emptyMessage={search || tier ? 'No customers match your filters' : 'No customers found'}
      />

      <Pagination page={page} totalPages={totalPages} onPageChange={fetchCustomers} loading={loading} />
    </div>
  );
}
