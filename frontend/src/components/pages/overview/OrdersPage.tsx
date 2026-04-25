'use client';

import React, { useState } from 'react';
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
  orderType: string;
  fromDate: string;
  toDate: string;
  onUpdate: () => void;
  onPageChange: (page: number) => void;
  onStatusChange: (status: string) => void;
  onOrderTypeChange: (orderType: string) => void;
  onStoreChange: (storeId: string) => void;
  onDateChange: (from: string, to: string) => void;
}

const PAYMENT_LABELS: Record<string, string> = {
  wallet: 'E-Wallet',
  cash: 'Cash',
  card: 'Card',
  pay_at_store: 'Pay at Store',
  cod: 'Cash on Delivery',
};

export default function OrdersPage({ orders, loading, token: _token, selectedStore, stores, total, page, pageSize, status, orderType, fromDate, toDate, onUpdate, onPageChange, onStatusChange, onOrderTypeChange, onStoreChange, onDateChange }: OrdersPageProps) {
  const [showModal, setShowModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<MerchantOrder | null>(null);
  const [preset, setPreset] = useState<DatePreset>('MTD');

  // Delivery tracking form state
  const [showTrackingForm, setShowTrackingForm] = useState(false);
  const [trackingFields, setTrackingFields] = useState({ courier_name: '', courier_phone: '', tracking_url: '', provider: '', eta_minutes: '' });
  const [savingTracking, setSavingTracking] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [markingPosSynced, setMarkingPosSynced] = useState(false);
  const [markingDispatched, setMarkingDispatched] = useState(false);

  const totalPages = Math.ceil(total / pageSize);
  const physicalStores = stores.filter(s => String(s.id) !== '0');

  async function updateOrderStatus(orderId: number, newStatus: string) {
    try {
      const res = await apiFetch(`/orders/${orderId}/status`, undefined, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.detail || `Failed to update status to ${newStatus}`);
        return;
      }
      onUpdate();
    } catch {
      alert('Network error updating status');
    }
  }

  async function markAsPaid(order: MerchantOrder) {
    setMarkingPaid(true);
    try {
      const res = await apiFetch(`/orders/${order.id}/payment-status`, undefined, {
        method: 'PATCH',
        body: JSON.stringify({ payment_status: 'paid' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.detail || 'Failed to mark as paid');
        return;
      }
      onUpdate();
      // Refresh the selected order in the modal
      setSelectedOrder(prev => prev ? { ...prev, payment_status: 'paid' } : prev);
    } catch {
      alert('Network error');
    } finally {
      setMarkingPaid(false);
    }
  }

  async function saveDeliveryTracking(orderId: number) {
    setSavingTracking(true);
    try {
      const payload: Record<string, string | number> = {};
      if (trackingFields.courier_name) payload.delivery_courier_name = trackingFields.courier_name;
      if (trackingFields.courier_phone) payload.delivery_courier_phone = trackingFields.courier_phone;
      if (trackingFields.tracking_url) payload.delivery_tracking_url = trackingFields.tracking_url;
      if (trackingFields.provider) payload.delivery_provider = trackingFields.provider;
      if (trackingFields.eta_minutes) payload.delivery_eta_minutes = parseInt(trackingFields.eta_minutes);
      payload.delivery_status = 'driver_assigned';

      const res = await apiFetch(`/admin/orders/${orderId}/delivery-tracking`, undefined, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.detail || 'Failed to update tracking');
        return;
      }
      setShowTrackingForm(false);
      onUpdate();
    } catch {
      alert('Network error');
    } finally {
      setSavingTracking(false);
    }
  }

  function openOrderDetail(order: MerchantOrder) {
    setSelectedOrder(order);
    setShowTrackingForm(false);
    setTrackingFields({
      courier_name: order.delivery_courier_name || '',
      courier_phone: order.delivery_courier_phone || '',
      tracking_url: order.delivery_tracking_url || '',
      provider: order.delivery_provider || '',
      eta_minutes: order.delivery_eta_minutes?.toString() || '',
    });
    setShowModal(true);
  }

  /** Get valid next-status buttons based on current status + payment state */
  function getStatusButtons(order: MerchantOrder): string[] {
    const current = order.status;
    const type = order.order_type;
    const isPaid = order.payment_status === 'paid';

    const transitions: Record<string, string[]> = {
      pending: type === 'dine_in' ? ['confirmed'] : isPaid ? ['paid', 'confirmed'] : ['confirmed'],
      paid: ['confirmed'],
      confirmed: ['preparing'],
      preparing: ['ready'],
      ready: type === 'delivery' ? ['out_for_delivery'] : ['completed'],
      out_for_delivery: ['completed'],
      completed: [],
      cancelled: [],
    };

    return transitions[current] || [];
  }

  function formatPaymentInfo(order: MerchantOrder): string {
    const method = PAYMENT_LABELS[order.payment_method || ''] || order.payment_method || 'N/A';
    const pStatus = order.payment_status || 'pending';
    return `${method} (${pStatus})`;
  }

  function needsPosSync(order: MerchantOrder): boolean {
    // Dine-in and pickup orders need POS sync when not yet synced and at confirmed or later
    if (order.order_type === 'delivery') return false;
    if (['pending', 'cancelled', 'completed'].includes(order.status)) return false;
    return !order.pos_synced_at;
  }

  function needsDispatch(order: MerchantOrder): boolean {
    // Delivery orders need dispatch when not yet dispatched and at ready or later
    if (order.order_type !== 'delivery') return false;
    if (['pending', 'confirmed', 'preparing', 'cancelled', 'completed'].includes(order.status)) return false;
    return !order.delivery_dispatched_at;
  }

  async function markPosSynced(order: MerchantOrder) {
    setMarkingPosSynced(true);
    try {
      const res = await apiFetch(`/orders/${order.id}/pos-synced`, undefined, { method: 'POST' });
      if (!res.ok) { const data = await res.json().catch(() => ({})); alert(data.detail || 'Failed'); return; }
      onUpdate();
      setSelectedOrder(prev => prev ? { ...prev, pos_synced_at: new Date().toISOString() } : prev);
    } catch { alert('Network error'); } finally { setMarkingPosSynced(false); }
  }

  async function markDeliveryDispatched(order: MerchantOrder) {
    setMarkingDispatched(true);
    try {
      const res = await apiFetch(`/orders/${order.id}/delivery-dispatched`, undefined, { method: 'POST' });
      if (!res.ok) { const data = await res.json().catch(() => ({})); alert(data.detail || 'Failed'); return; }
      onUpdate();
      setSelectedOrder(prev => prev ? { ...prev, delivery_dispatched_at: new Date().toISOString() } : prev);
    } catch { alert('Network error'); } finally { setMarkingDispatched(false); }
  }

  function timeSince(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ${mins % 60}m ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  }

  const columns: ColumnDef<MerchantOrder>[] = [
    { key: 'order_number', header: 'Order #', render: (o) => <span style={{ fontWeight: 600, color: THEME.textPrimary }}>{o.order_number}</span> },
    { key: 'order_type', header: 'Type', render: (o) => <span style={{ textTransform: 'capitalize', color: THEME.textSecondary }}>{o.order_type?.replace('_', ' ')}</span> },
    { key: 'total', header: 'Total', render: (o) => <span style={{ color: THEME.textPrimary, fontWeight: 500 }}>{formatRM(o.total)}</span> },
    { key: 'status', header: 'Status', render: (o) => (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {statusBadge(o.status)}
        {o.payment_status !== 'paid' && o.status !== 'completed' && o.status !== 'cancelled' && (
          <span style={{ fontSize: 10, background: '#FEF3C7', color: '#92400E', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>UNPAID</span>
        )}
        {needsPosSync(o) && (
          <span style={{ fontSize: 10, background: '#FEE2E2', color: '#B91C1C', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>POS SYNC REQUIRED</span>
        )}
        {needsDispatch(o) && (
          <span style={{ fontSize: 10, background: '#FEE2E2', color: '#B91C1C', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>DISPATCH REQUIRED</span>
        )}
      </div>
    )},
    { key: 'created_at', header: 'Created', render: (o) => (
      <span style={{ color: THEME.textMuted }}>
        {new Date(o.created_at).toLocaleDateString()} <span style={{ fontSize: 11 }}>({timeSince(o.created_at)})</span>
      </span>
    )},
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

      {/* Order Type Filter Row */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }} className="orders-type-filter">
        {['', 'dine_in', 'pickup', 'delivery'].map(type => (
          <button
            key={type}
            className={`btn btn-sm ${orderType === type ? 'btn-primary' : ''}`}
            onClick={() => { onOrderTypeChange(type); onPageChange(1); }}
            style={{ borderRadius: 20, fontSize: 13, whiteSpace: 'nowrap' }}
          >
            {type === '' ? 'All Types' : type === 'dine_in' ? <><i className="fas fa-utensils"></i> Dine In</> : type === 'pickup' ? <><i className="fas fa-shopping-bag"></i> Pickup</> : <><i className="fas fa-truck"></i> Delivery</>}
          </button>
        ))}
      </div>

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
        flexWrap: 'wrap',
        gap: 8,
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
          <div style={{ maxHeight: '75vh', overflowY: 'auto', paddingRight: 4 }}>
            {/* Order Info */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px 16px' }} className="orders-detail-grid">
              <div><span style={{ fontSize: 12, color: THEME.textMuted }}>Type</span><p style={{ margin: 0, fontWeight: 600, textTransform: 'capitalize', color: THEME.textPrimary }}>{selectedOrder.order_type?.replace('_', ' ')}</p></div>
              <div><span style={{ fontSize: 12, color: THEME.textMuted }}>Status</span><p style={{ margin: 0 }}>{statusBadge(selectedOrder.status)}</p></div>
              <div><span style={{ fontSize: 12, color: THEME.textMuted }}>Total</span><p style={{ margin: 0, fontWeight: 700, color: THEME.accentCopper, fontSize: 18 }}>{formatRM(selectedOrder.total)}</p></div>
              <div><span style={{ fontSize: 12, color: THEME.textMuted }}>Payment</span><p style={{ margin: 0 }}>
                <span style={{ fontWeight: 500, color: selectedOrder.payment_status === 'paid' ? '#16A34A' : '#D97706' }}>{formatPaymentInfo(selectedOrder)}</span>
              </p></div>
              <div><span style={{ fontSize: 12, color: THEME.textMuted }}>Created</span><p style={{ margin: 0, color: THEME.textSecondary }}>{new Date(selectedOrder.created_at).toLocaleString()}</p></div>
              {selectedOrder.pickup_time && <div><span style={{ fontSize: 12, color: THEME.textMuted }}>Pickup Time</span><p style={{ margin: 0, color: THEME.textSecondary }}>{new Date(selectedOrder.pickup_time).toLocaleString()}</p></div>}
              {selectedOrder.table_id && <div><span style={{ fontSize: 12, color: THEME.textMuted }}>Table</span><p style={{ margin: 0, color: THEME.textSecondary }}>{selectedOrder.table_id}</p></div>}
            </div>

            {/* Items */}
            {selectedOrder.items && selectedOrder.items.length > 0 && (
              <div style={{ marginTop: 12, padding: '10px 12px', background: THEME.bgMuted, borderRadius: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: THEME.textSecondary }}>Items</span>
                {selectedOrder.items.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13, color: THEME.textPrimary }}>
                    <span>{item.quantity as React.ReactNode}× {item.name as React.ReactNode}</span>
                    <span style={{ fontWeight: 500 }}>{formatRM(item.line_total as number)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Delivery Address */}
            {selectedOrder.delivery_address && (
              <div style={{ marginTop: 12, padding: '10px 12px', background: '#EFF6FF', borderRadius: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#1E40AF' }}>Delivery Address</span>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: THEME.textPrimary }}>
                  {(selectedOrder.delivery_address as Record<string, string>)?.address || JSON.stringify(selectedOrder.delivery_address)}
                </p>
              </div>
            )}

            {/* Notes */}
            {selectedOrder.notes && (
              <div style={{ marginTop: 12, padding: '10px 12px', background: '#FFFBEB', borderRadius: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#92400E' }}>Notes</span>
                <p style={{ margin: '4px 0 0', fontSize: 13, color: THEME.textPrimary }}>{selectedOrder.notes}</p>
              </div>
            )}

            {/* ── ACTIONS SECTION ── */}
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${THEME.border}` }}>

              {/* Flow Description */}
              <div style={{ fontSize: 12, color: THEME.textMuted, marginBottom: 12, padding: '8px 12px', background: THEME.bgMuted, borderRadius: 8 }}>
                <strong style={{ color: THEME.textSecondary }}>Flow for {(selectedOrder.order_type || '').replace('_', ' ')}:</strong>{' '}
                {selectedOrder.order_type === 'dine_in' && (
                  <span>Pending → Confirmed → Preparing → Ready → <strong>Pay</strong> → Completed</span>
                )}
                {selectedOrder.order_type === 'pickup' && (
                  <span>Pending → [Pay or Confirm] → Confirmed → Preparing → Ready → Completed</span>
                )}
                {selectedOrder.order_type === 'delivery' && (
                  <span>Pending → [Pay or Confirm] → Confirmed → Preparing → Ready → Out for Delivery → Completed</span>
                )}
              </div>

              {/* Mark as Paid — shown when unpaid and not completed/cancelled */}
              {selectedOrder.payment_status !== 'paid' && selectedOrder.status !== 'completed' && selectedOrder.status !== 'cancelled' && (
                <button
                  onClick={() => markAsPaid(selectedOrder)}
                  disabled={markingPaid}
                  style={{
                    display: 'block', width: '100%', marginBottom: 12,
                    padding: '10px 16px', borderRadius: THEME.radius.md,
                    border: '2px solid #16A34A', background: '#F0FDF4',
                    color: '#16A34A', fontWeight: 700, fontSize: 14, cursor: markingPaid ? 'wait' : 'pointer',
                  }}
                >
                  <i className="fas fa-money-bill-wave" style={{ marginRight: 8 }}></i>
                  {markingPaid ? 'Processing...' : `Mark as Paid — ${formatRM(selectedOrder.total)}`}
                </button>
              )}

              {/* Status Transition Buttons */}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }} className="orders-status-buttons">
                {getStatusButtons(selectedOrder).map(s => (
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
                      textTransform: 'capitalize' as const,
                      fontWeight: 500,
                    }}
                  >
                    {s === 'out_for_delivery' ? '🚗 Out for Delivery' : s.replace(/_/g, ' ')}
                  </button>
                ))}
                <button
                  onClick={() => { if (confirm('Cancel this order?')) { updateOrderStatus(selectedOrder.id, 'cancelled'); setShowModal(false); } }}
                  style={{
                    padding: '8px 16px',
                    borderRadius: THEME.radius.md,
                    border: '1px solid #FCA5A5',
                    background: '#FEF2F2',
                    color: '#DC2626',
                    cursor: 'pointer',
                    fontWeight: 500,
                  }}
                >
                  Cancel Order
                </button>
              </div>

              {/* Manual Action Buttons */}
              {selectedOrder && needsPosSync(selectedOrder) && (
                <button
                  onClick={() => markPosSynced(selectedOrder)}
                  disabled={markingPosSynced}
                  style={{
                    display: 'block', width: '100%', marginBottom: 12,
                    padding: '10px 16px', borderRadius: 8,
                    border: '2px solid #D97706', background: '#FFFBEB',
                    color: '#B45309', fontWeight: 700, fontSize: 14, cursor: markingPosSynced ? 'wait' : 'pointer',
                  }}
                >
                  <i className="fas fa-cash-register" style={{ marginRight: 8 }}></i>
                  {markingPosSynced ? 'Saving...' : 'Mark POS Synced — Order re-keyed into POS'}
                </button>
              )}
              {selectedOrder && needsDispatch(selectedOrder) && (
                <button
                  onClick={() => markDeliveryDispatched(selectedOrder)}
                  disabled={markingDispatched}
                  style={{
                    display: 'block', width: '100%', marginBottom: 12,
                    padding: '10px 16px', borderRadius: 8,
                    border: '2px solid #D97706', background: '#FFFBEB',
                    color: '#B45309', fontWeight: 700, fontSize: 14, cursor: markingDispatched ? 'wait' : 'pointer',
                  }}
                >
                  <i className="fas fa-truck" style={{ marginRight: 8 }}></i>
                  {markingDispatched ? 'Saving...' : 'Mark Delivery Dispatched — Driver booked externally'}
                </button>
              )}

              {/* Audit trail */}
              {selectedOrder.pos_synced_at && (
                <div style={{ marginBottom: 12, padding: '8px 12px', background: '#ECFDF5', borderRadius: 8, fontSize: 12, color: '#065F46' }}>
                  <i className="fas fa-check-circle" style={{ marginRight: 6 }}></i>
                  POS synced at {new Date(selectedOrder.pos_synced_at).toLocaleString()}
                </div>
              )}
              {selectedOrder.delivery_dispatched_at && (
                <div style={{ marginBottom: 12, padding: '8px 12px', background: '#ECFDF5', borderRadius: 8, fontSize: 12, color: '#065F46' }}>
                  <i className="fas fa-check-circle" style={{ marginRight: 6 }}></i>
                  Delivery dispatched at {new Date(selectedOrder.delivery_dispatched_at).toLocaleString()}
                </div>
              )}

              {/* Delivery Tracking — for delivery orders at ready or beyond */}
              {selectedOrder.order_type === 'delivery' && ['ready', 'out_for_delivery'].includes(selectedOrder.status) && (
                <div style={{ marginTop: 8 }}>
                  {!showTrackingForm ? (
                    <button
                      onClick={() => setShowTrackingForm(true)}
                      style={{ padding: '8px 16px', borderRadius: THEME.radius.md, border: `1px solid ${THEME.border}`, background: '#EFF6FF', color: '#1E40AF', cursor: 'pointer', fontWeight: 500, fontSize: 13 }}
                    >
                      <i className="fas fa-truck" style={{ marginRight: 6 }}></i>
                      {selectedOrder.delivery_courier_name ? 'Edit Delivery Tracking' : 'Add Delivery Tracking'}
                    </button>
                  ) : (
                    <div style={{ padding: 12, border: `1px solid ${THEME.border}`, borderRadius: THEME.radius.md, background: '#FAFAFF' }}>
                      <strong style={{ fontSize: 13, color: THEME.textPrimary, display: 'block', marginBottom: 8 }}>Delivery Tracking Info</strong>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8 }} className="orders-tracking-grid">
                        <input placeholder="Courier Name" value={trackingFields.courier_name} onChange={e => setTrackingFields(p => ({ ...p, courier_name: e.target.value }))} style={inputStyle} />
                        <input placeholder="Courier Phone" value={trackingFields.courier_phone} onChange={e => setTrackingFields(p => ({ ...p, courier_phone: e.target.value }))} style={inputStyle} />
                        <input placeholder="Provider (Grab/Lalamove)" value={trackingFields.provider} onChange={e => setTrackingFields(p => ({ ...p, provider: e.target.value }))} style={inputStyle} />
                        <input placeholder="ETA (minutes)" type="number" value={trackingFields.eta_minutes} onChange={e => setTrackingFields(p => ({ ...p, eta_minutes: e.target.value }))} style={inputStyle} />
                        <input placeholder="Tracking URL" value={trackingFields.tracking_url} onChange={e => setTrackingFields(p => ({ ...p, tracking_url: e.target.value }))} style={{ ...inputStyle, gridColumn: '1 / -1' }} />
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <button onClick={() => saveDeliveryTracking(selectedOrder.id)} disabled={savingTracking} className="btn btn-primary btn-sm" style={{ flex: 1 }}>{savingTracking ? 'Saving...' : 'Save'}</button>
                        <button onClick={() => setShowTrackingForm(false)} className="btn btn-sm" style={{ flex: 1 }}>Cancel</button>
                      </div>
                    </div>
                  )}
                  {/* Show current tracking info */}
                  {selectedOrder.delivery_courier_name && !showTrackingForm && (
                    <div style={{ marginTop: 8, padding: '8px 12px', background: THEME.bgMuted, borderRadius: 8, fontSize: 13, color: THEME.textSecondary }}>
                      <strong>Courier:</strong> {selectedOrder.delivery_courier_name}
                      {selectedOrder.delivery_courier_phone && <> · {selectedOrder.delivery_courier_phone}</>}
                      {selectedOrder.delivery_eta_minutes && <> · ETA: {selectedOrder.delivery_eta_minutes}m</>}
                      {selectedOrder.delivery_tracking_url && <><br /><a href={selectedOrder.delivery_tracking_url} target="_blank" rel="noreferrer" style={{ color: THEME.primary, fontSize: 12 }}>Track →</a></>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px',
  borderRadius: 8,
  border: `1px solid ${THEME.border}`,
  fontSize: 13,
  color: THEME.textPrimary,
  background: '#FFF',
};

/* Mobile responsive styles */
const ordersMobileStyles = `
@media (max-width: 767px) {
  .orders-type-filter {
    justify-content: flex-start;
  }
  .orders-detail-grid {
    grid-template-columns: 1fr !important;
  }
  .orders-status-buttons {
    flex-direction: column;
  }
  .orders-status-buttons button {
    width: 100%;
  }
  .orders-tracking-grid {
    grid-template-columns: 1fr !important;
  }
}
`;

if (typeof document !== 'undefined') {
  const styleId = 'orders-mobile-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = ordersMobileStyles;
    document.head.appendChild(style);
  }
}
