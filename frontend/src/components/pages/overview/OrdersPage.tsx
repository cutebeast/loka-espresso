'use client';

import { useState } from 'react';
import { apiFetch, statusBadge, formatRM } from '@/lib/merchant-api';
import { FilterBar, DataTable, type ColumnDef, Pagination, Modal } from '@/components/ui';
import type { DatePreset } from '@/components/ui/DateFilter';
import { THEME } from '@/lib/theme';
import type { MerchantOrder } from '@/lib/merchant-types';

interface OrdersPageProps {
  orders: MerchantOrder[];
  loading: boolean;
  token: string;
  selectedStore: string;
  stores: { id: number; name: string }[];
  total: number;
  page: number;
  pageSize: number;
  status: string;
  fromDate: string;
  toDate: string;
  onUpdate: () => void;
  onPageChange: (page: number) => void;
  onStatusChange: (status: string) => void;
  onStoreChange: (storeId: string) => void;
  onDateChange: (from: string, to: string) => void;
}

export default function OrdersPage({ orders, loading, token, selectedStore, stores, total, page, pageSize, status, fromDate, toDate, onUpdate, onPageChange, onStatusChange, onStoreChange, onDateChange }: OrdersPageProps) {
  const [showModal, setShowModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<MerchantOrder | null>(null);
  const [preset, setPreset] = useState<DatePreset>('MTD');

  const totalPages = Math.ceil(total / pageSize);
  const physicalStores = stores.filter(s => String(s.id) !== '0');

  async function updateOrderStatus(orderId: number, newStatus: string) {
    try {
      const res = await apiFetch(`/orders/${orderId}/status`, token, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) return;
      onUpdate();
    } catch {}
  }

  function openOrderDetail(order: MerchantOrder) {
    setSelectedOrder(order);
    setShowModal(true);
  }

  const columns: ColumnDef<MerchantOrder>[] = [
    { key: 'order_number', header: 'Order #', render: (o) => <span style={{ fontWeight: 600, color: THEME.textPrimary }}>{o.order_number}</span> },
    { key: 'order_type', header: 'Type', render: (o) => <span style={{ textTransform: 'capitalize', color: THEME.textSecondary }}>{o.order_type?.replace('_', ' ')}</span> },
    { key: 'total', header: 'Total', render: (o) => <span style={{ color: THEME.textPrimary, fontWeight: 500 }}>{formatRM(o.total)}</span> },
    { key: 'status', header: 'Status', render: (o) => statusBadge(o.delivery_status || o.status) },
    { key: 'created_at', header: 'Created', render: (o) => <span style={{ color: THEME.textMuted }}>{new Date(o.created_at).toLocaleDateString()}</span> },
    { key: 'actions', header: 'Actions', render: (o) => (
      <button className="btn btn-sm" onClick={e => { e.stopPropagation(); openOrderDetail(o); }}>View</button>
    )},
  ];

  return (
    <div>
      <FilterBar
        stores={physicalStores.map(s => ({ id: String(s.id), name: s.name }))}
        selectedStore={selectedStore}
        onStoreChange={(id) => { onStoreChange(id); onPageChange(1); }}
        datePreset={preset}
        onDateChange={(p, from, to) => { setPreset(p); onDateChange(from, to); onPageChange(1); }}
        fromDate={fromDate}
        toDate={toDate}
        statusOptions={[
          { value: 'pending', label: 'Pending' },
          { value: 'paid', label: 'Paid' },
          { value: 'confirmed', label: 'Confirmed' },
          { value: 'preparing', label: 'Preparing' },
          { value: 'ready', label: 'Ready' },
          { value: 'out_for_delivery', label: 'Out for delivery' },
          { value: 'completed', label: 'Completed' },
          { value: 'cancelled', label: 'Cancelled' },
        ]}
        selectedStatus={status}
        onStatusChange={(s) => { onStatusChange(s); onPageChange(1); }}
      />

      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        background: THEME.bgMuted,
        borderRadius: `${THEME.radius.md} ${THEME.radius.md} 0 0`,
        border: `1px solid ${THEME.border}`,
        borderBottom: 'none',
        marginTop: 20,
      }}>
        <div style={{ fontSize: 14, color: THEME.textSecondary }}>
          <i className="fas fa-shopping-bag" style={{ marginRight: 8, color: THEME.primary }}></i>
          Showing <strong style={{ color: THEME.textPrimary }}>{orders.length}</strong> of <strong style={{ color: THEME.textPrimary }}>{total}</strong> orders
        </div>
        <div style={{ fontSize: 13, color: THEME.textMuted }}>
          Page {page} of {totalPages}
        </div>
      </div>

      <DataTable
        data={orders}
        columns={columns}
        loading={loading}
        emptyMessage="No orders found"
        onRowClick={openOrderDetail}
      />

      <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} loading={loading} />

      {selectedOrder && (
        <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={`Order ${selectedOrder.order_number}`}>
          <div>
            <p style={{ color: THEME.textSecondary, margin: '8px 0' }}>
              <strong style={{ color: THEME.textPrimary }}>Type:</strong> {selectedOrder.order_type}
            </p>
            <p style={{ color: THEME.textSecondary, margin: '8px 0' }}>
              <strong style={{ color: THEME.textPrimary }}>Status:</strong> {statusBadge(selectedOrder.delivery_status || selectedOrder.status)}
            </p>
            <p style={{ color: THEME.textSecondary, margin: '8px 0' }}>
              <strong style={{ color: THEME.textPrimary }}>Total:</strong>
              <span style={{ color: THEME.accentCopper, fontWeight: 600 }}> {formatRM(selectedOrder.total)}</span>
            </p>
            <p style={{ color: THEME.textSecondary, margin: '8px 0' }}>
              <strong style={{ color: THEME.textPrimary }}>Created:</strong> {new Date(selectedOrder.created_at).toLocaleString()}
            </p>
            {selectedOrder.table_id && <p style={{ color: THEME.textSecondary, margin: '8px 0' }}><strong style={{ color: THEME.textPrimary }}>Table:</strong> {selectedOrder.table_id}</p>}
            {selectedOrder.pickup_time && <p style={{ color: THEME.textSecondary, margin: '8px 0' }}><strong style={{ color: THEME.textPrimary }}>Pickup:</strong> {new Date(selectedOrder.pickup_time).toLocaleString()}</p>}
            {selectedOrder.delivery_address && <p style={{ color: THEME.textSecondary, margin: '8px 0' }}><strong style={{ color: THEME.textPrimary }}>Delivery:</strong> {(selectedOrder.delivery_address as { address?: string })?.address || 'Address provided'}</p>}
            {selectedOrder.delivery_courier_name && <p style={{ color: THEME.textSecondary, margin: '8px 0' }}><strong style={{ color: THEME.textPrimary }}>Courier:</strong> {selectedOrder.delivery_courier_name}</p>}
            {selectedOrder.delivery_eta_minutes != null && <p style={{ color: THEME.textSecondary, margin: '8px 0' }}><strong style={{ color: THEME.textPrimary }}>ETA:</strong> {selectedOrder.delivery_eta_minutes} min</p>}
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${THEME.border}` }}>
              <strong style={{ color: THEME.textPrimary, display: 'block', marginBottom: 12 }}>Update Status:</strong>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {['confirmed', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled'].map(s => (
                  <button
                    key={s}
                    onClick={() => { updateOrderStatus(selectedOrder.id, s); setShowModal(false); }}
                    style={{
                      padding: '8px 16px',
                      borderRadius: THEME.radius.md,
                      border: `1px solid ${THEME.border}`,
                      background: THEME.bgMuted,
                      color: THEME.textSecondary,
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
