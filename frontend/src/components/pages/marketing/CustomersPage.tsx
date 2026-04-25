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
          { key: 'name', header: 'Name', render: (c) => <span className="cp-13">{c.name || '-'}</span> },
          { key: 'phone', header: 'Phone', render: (c) => <span className="cp-14">{c.phone || '-'}</span> },
          { key: 'email', header: 'Email', render: (c) => <span className="cp-15">{c.email || '-'}</span> },
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
          { key: 'points_balance', header: 'Points', render: (c) => <span className="cp-16">{c.points_balance?.toLocaleString() || 0} pts</span> },
          { key: 'total_orders', header: 'Orders', render: (c) => <span className="cp-17">{c.total_orders}</span> },
          { key: 'total_spent', header: 'Total Spent', render: (c) => <span className="cp-18">{formatRM(c.total_spent || 0)}</span> },
          { key: 'created_at', header: 'Joined', render: (c) => <span className="cp-19">{c.created_at ? new Date(c.created_at).toLocaleDateString() : '-'}</span> },
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
