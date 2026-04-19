'use client';

import { useState } from 'react';
import { apiFetch, statusBadge, formatRM } from '@/lib/merchant-api';
import { FilterBar } from '@/components/ui';
import { DateFilter, type DatePreset } from '@/components/ui/DateFilter';
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
      await apiFetch(`/orders/${orderId}/status`, token, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      onUpdate();
    } catch {}
  }

  function openOrderDetail(order: MerchantOrder) {
    setSelectedOrder(order);
    setShowModal(true);
  }

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
          { value: 'completed', label: 'Completed' },
          { value: 'cancelled', label: 'Cancelled' },
        ]}
        selectedStatus={status}
        onStatusChange={(s) => { onStatusChange(s); onPageChange(1); }}
      />

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

      <div className="table-wrapper" style={{
        overflowX: 'auto',
        borderRadius: `0 0 ${THEME.radius.md} ${THEME.radius.md}`,
        background: THEME.bgCard,
        border: `1px solid ${THEME.border}`,
        borderTop: 'none',
      }}>
        <table>
          <thead>
            <tr>
              <th>Order #</th>
              <th>Type</th>
              <th>Total</th>
              <th>Status</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 ? (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: THEME.textMuted, padding: 40 }}>No orders found</td></tr>
            ) : orders.map(o => (
              <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => openOrderDetail(o)}>
                <td style={{ fontWeight: 600, color: THEME.textPrimary }}>{o.order_number}</td>
                <td><span style={{ textTransform: 'capitalize', color: THEME.textSecondary }}>{o.order_type?.replace('_', ' ')}</span></td>
                <td style={{ color: THEME.textPrimary, fontWeight: 500 }}>{formatRM(o.total)}</td>
                <td>{statusBadge(o.status)}</td>
                <td style={{ color: THEME.textMuted }}>{new Date(o.created_at).toLocaleDateString()}</td>
                <td>
                  <button className="btn btn-sm" onClick={e => { e.stopPropagation(); openOrderDetail(o); }}>View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 12,
          marginTop: 20,
          padding: '12px',
          background: THEME.bgCard,
          borderRadius: THEME.radius.md,
          border: `1px solid ${THEME.border}`,
        }}>
          <button
            className="btn btn-sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
            style={{
              padding: '8px 16px',
              borderRadius: THEME.radius.md,
              border: `1px solid ${THEME.border}`,
              background: page <= 1 ? THEME.bgMuted : THEME.bgCard,
              color: page <= 1 ? THEME.textMuted : THEME.textPrimary,
              cursor: page <= 1 ? 'not-allowed' : 'pointer',
              opacity: page <= 1 ? 0.6 : 1,
            }}
          >
            <i className="fas fa-chevron-left"></i> Previous
          </button>

          <div style={{ display: 'flex', gap: 4 }}>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              // Show pages around current page
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (page <= 3) {
                pageNum = i + 1;
              } else if (page >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = page - 2 + i;
              }

              return (
                <button
                  key={pageNum}
                  onClick={() => onPageChange(pageNum)}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: THEME.radius.md,
                    border: `1px solid ${page === pageNum ? THEME.primary : THEME.border}`,
                    background: page === pageNum ? THEME.primary : THEME.bgCard,
                    color: page === pageNum ? THEME.textLight : THEME.textPrimary,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          <button
            className="btn btn-sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
            style={{
              padding: '8px 16px',
              borderRadius: THEME.radius.md,
              border: `1px solid ${THEME.border}`,
              background: page >= totalPages ? THEME.bgMuted : THEME.bgCard,
              color: page >= totalPages ? THEME.textMuted : THEME.textPrimary,
              cursor: page >= totalPages ? 'not-allowed' : 'pointer',
              opacity: page >= totalPages ? 0.6 : 1,
            }}
          >
            Next <i className="fas fa-chevron-right"></i>
          </button>
        </div>
      )}

      {showModal && selectedOrder && (
        <div
          className="modal-overlay"
          onClick={() => setShowModal(false)}
          style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(27, 32, 35, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div
            className="modal"
            onClick={e => e.stopPropagation()}
            style={{
              background: THEME.bgCard,
              borderRadius: THEME.radius.lg,
              padding: 24,
              width: '90%',
              maxWidth: 500,
              boxShadow: THEME.shadow.lg,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ color: THEME.textPrimary, margin: 0 }}>Order {selectedOrder.order_number}</h3>
              <button
                className="btn btn-sm"
                onClick={() => setShowModal(false)}
                style={{
                  padding: '6px 12px',
                  borderRadius: THEME.radius.md,
                  border: 'none',
                  background: THEME.bgMuted,
                  color: THEME.textSecondary,
                  cursor: 'pointer',
                }}
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
            <div>
              <p style={{ color: THEME.textSecondary, margin: '8px 0' }}>
                <strong style={{ color: THEME.textPrimary }}>Type:</strong> {selectedOrder.order_type}
              </p>
              <p style={{ color: THEME.textSecondary, margin: '8px 0' }}>
                <strong style={{ color: THEME.textPrimary }}>Status:</strong> {statusBadge(selectedOrder.status)}
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
              <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${THEME.border}` }}>
                <strong style={{ color: THEME.textPrimary, display: 'block', marginBottom: 12 }}>Update Status:</strong>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {['confirmed', 'preparing', 'ready', 'completed', 'cancelled'].map(s => (
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
          </div>
        </div>
      )}
    </div>
  );
}
