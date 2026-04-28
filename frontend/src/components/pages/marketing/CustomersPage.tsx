'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch, formatRM } from '@/lib/merchant-api';
import { FilterSelect, StoreSelector, DateFilter, DataTable, type DatePreset, Pagination } from '@/components/ui';
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
        setCustomers(data.items || []);
        setTotal(data.total || 0);
        setTotalPages(data.total_pages || 1);
        setPage(p);
      }
    } catch { console.error('Failed to fetch customers'); } finally { setLoading(false); }
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
      <div className="cp-0">
        <div className="cp-1">
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
            className="btn btn-sm cp-2"
            onClick={() => setSortDir(sortDir === 'asc' ? 'desc' : 'asc')}
            title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
            
          >
            <i className={`fas fa-arrow-${sortDir === 'asc' ? 'up' : 'down'}`}></i>
          </button>
          {(search || tier || fromDate || toDate) && (
            <button
              className="btn btn-sm cp-3"
              onClick={() => { setSearch(''); setTier(''); setPage(1); setPreset('MTD'); setFromDate(''); setToDate(''); }}
              title="Clear filters"
              
            >
              <i className="fas fa-times"></i>
            </button>
          )}
        </div>

        {/* Search on right side */}
        <div className="cp-4">
          <span className="cp-5"><i className="fas fa-search"></i></span>
          <input
            placeholder="Search name, email, phone..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="cp-6"
          />
        </div>
      </div>

      {/* Stats Bar */}
      <div className="cp-7">
        <div className="cp-8">
          <span className="cp-9"><i className="fas fa-users"></i></span>
          Showing <strong className="cp-10">{customers.length}</strong> of <strong className="cp-11">{total}</strong> customers
        </div>
        <div className="cp-12">
          Page {page} of {totalPages}
        </div>
      </div>

      <DataTable<CustomerItem>
        data={customers}
        columns={[
          { key: 'name', header: 'Customer', render: (c) => (
            <div>
              <div style={{ fontWeight: 600 }}>{c.name || '—'}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{c.phone || '—'}</div>
            </div>
          )},
          { key: 'email', header: 'Contact', render: (c) => (
            <div>
              <div>{c.email || '—'}</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>
                Joined {c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}
              </div>
            </div>
          )},
          { key: 'tier', header: 'Tier & Points', render: (c) => (
            <div>
              {c.tier ? (
                <span className={`badge ${
                  c.tier === 'platinum' ? 'badge-purple' :
                  c.tier === 'gold' ? 'badge-yellow' :
                  c.tier === 'silver' ? 'badge-gray' : 'badge-gray'
                }`}>
                  {c.tier.charAt(0).toUpperCase() + c.tier.slice(1)}
                </span>
              ) : (
                <span className="badge badge-yellow">No Tier</span>
              )}
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{c.points_balance?.toLocaleString() || 0} pts</div>
            </div>
          )},
          { key: 'total_spent', header: 'Activity', render: (c) => (
            <div>
              <div><strong>{formatRM(c.total_spent || 0)}</strong></div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)', marginTop: 2 }}>{c.total_orders} orders</div>
            </div>
          )},
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
