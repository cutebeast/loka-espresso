'use client';

import React, { useState } from 'react';
import { apiFetch, statusBadge, formatRM } from '@/lib/merchant-api';
import { FilterBar, DataTable, type ColumnDef, Pagination, Modal } from '@/components/ui';
import type { DatePreset } from '@/components/ui/DateFilter';

import type { MerchantOrder } from '@/lib/merchant-types';

interface OrdersPageProps {
  orders: MerchantOrder[];
  loading: boolean;
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

export default function OrdersPage({ orders, loading, selectedStore, stores, total, page, pageSize, status, orderType, fromDate, toDate, onUpdate, onPageChange, onStatusChange, onOrderTypeChange, onStoreChange, onDateChange }: OrdersPageProps) {
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
        console.error(data.detail || `Failed to update status to ${newStatus}`);
        return;
      }
      onUpdate();
    } catch {
      console.error('Network error updating status');
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
        console.error(data.detail || 'Failed to mark as paid');
        return;
      }
      onUpdate();
      setSelectedOrder(prev => prev ? { ...prev, payment_status: 'paid' } : prev);
    } catch {
      console.error('Network error');
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
        console.error(data.detail || 'Failed to update tracking');
        return;
      }
      setShowTrackingForm(false);
      onUpdate();
    } catch {
      console.error('Network error');
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
      if (!res.ok) { const data = await res.json().catch(() => ({})); console.error(data.detail || 'Failed'); return; }
      onUpdate();
      setSelectedOrder(prev => prev ? { ...prev, pos_synced_at: new Date().toISOString() } : prev);
    } catch { console.error('Network error'); } finally { setMarkingPosSynced(false); }
  }

  async function markDeliveryDispatched(order: MerchantOrder) {
    setMarkingDispatched(true);
    try {
      const res = await apiFetch(`/orders/${order.id}/delivery-dispatched`, undefined, { method: 'POST' });
      if (!res.ok) { const data = await res.json().catch(() => ({})); console.error(data.detail || 'Failed'); return; }
      onUpdate();
      setSelectedOrder(prev => prev ? { ...prev, delivery_dispatched_at: new Date().toISOString() } : prev);
    } catch { console.error('Network error'); } finally { setMarkingDispatched(false); }
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
    { key: 'order_number', header: 'Order #', render: (o) => <span className="op-0">{o.order_number}</span> },
    { key: 'order_type', header: 'Type', render: (o) => <span className="op-1">{o.order_type?.replace('_', ' ')}</span> },
    { key: 'total', header: 'Total', render: (o) => <span className="op-2">{formatRM(o.total)}</span> },
    { key: 'status', header: 'Status', render: (o) => (
      <div className="op-3">
        {statusBadge(o.status)}
        {o.payment_status !== 'paid' && o.status !== 'completed' && o.status !== 'cancelled' && (
          <span className="op-4">UNPAID</span>
        )}
        {needsPosSync(o) && (
          <span className="op-5">POS SYNC REQUIRED</span>
        )}
        {needsDispatch(o) && (
          <span className="op-6">DISPATCH REQUIRED</span>
        )}
      </div>
    )},
    { key: 'created_at', header: 'Created', render: (o) => (
      <span className="op-7">
        {new Date(o.created_at).toLocaleDateString()} <span className="op-8">({timeSince(o.created_at)})</span>
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
      <div  className="orders-type-filter op-9">
        {['', 'dine_in', 'pickup', 'delivery'].map(type => (
          <button
            key={type}
            className={`btn btn-sm ${orderType === type ? 'btn-primary' : ''} op-10`}
            onClick={() => { onOrderTypeChange(type); onPageChange(1); }}
            
          >
            {type === '' ? 'All Types' : type === 'dine_in' ? <><i className="fas fa-utensils"></i> Dine In</> : type === 'pickup' ? <><i className="fas fa-shopping-bag"></i> Pickup</> : <><i className="fas fa-truck"></i> Delivery</>}
          </button>
        ))}
      </div>

      <div className="op-11">
        <div className="op-12">
          <span className="op-13"><i className="fas fa-shopping-bag"></i></span>
          Showing <strong className="op-14">{orders.length}</strong> of <strong className="op-15">{total}</strong> orders
        </div>
        <div className="op-16">
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
          <div className="op-17">
            {/* Order Info */}
            <div  className="orders-detail-grid op-18">
              <div><span className="op-19">Type</span><p className="op-20">{selectedOrder.order_type?.replace('_', ' ')}</p></div>
              <div><span className="op-21">Status</span><p className="op-22">{statusBadge(selectedOrder.status)}</p></div>
              <div><span className="op-23">Total</span><p className="op-24">{formatRM(selectedOrder.total)}</p></div>
              <div><span className="op-25">Payment</span><p className="op-26">
                <span className={`op-payment-text ${selectedOrder.payment_status === 'paid' ? 'op-payment-paid' : 'op-payment-unpaid'}`}>{formatPaymentInfo(selectedOrder)}</span>
              </p></div>
              <div><span className="op-27">Created</span><p className="op-28">{new Date(selectedOrder.created_at).toLocaleString()}</p></div>
              {selectedOrder.pickup_time && <div><span className="op-29">Pickup Time</span><p className="op-30">{new Date(selectedOrder.pickup_time).toLocaleString()}</p></div>}
              {selectedOrder.table_id && <div><span className="op-31">Table</span><p className="op-32">{selectedOrder.table_id}</p></div>}
            </div>

            {/* Items */}
            {selectedOrder.items && selectedOrder.items.length > 0 && (
              <div className="op-33">
                <span className="op-34">Items</span>
                {selectedOrder.items.map((item, idx) => (
                  <div key={idx} className="op-35">
                    <span>{item.quantity as React.ReactNode}× {item.name as React.ReactNode}</span>
                    <span className="op-36">{formatRM(item.line_total as number)}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Delivery Address */}
            {selectedOrder.delivery_address && (
              <div className="op-37">
                <span className="op-38">Delivery Address</span>
                <p className="op-39">
                  {(selectedOrder.delivery_address as Record<string, string>)?.address || JSON.stringify(selectedOrder.delivery_address)}
                </p>
              </div>
            )}

            {/* Notes */}
            {selectedOrder.notes && (
              <div className="op-40">
                <span className="op-41">Notes</span>
                <p className="op-42">{selectedOrder.notes}</p>
              </div>
            )}

            {/* ── ACTIONS SECTION ── */}
            <div className="op-43">

              {/* Flow Description */}
              <div className="op-44">
                <strong className="op-45">Flow for {(selectedOrder.order_type || '').replace('_', ' ')}:</strong>{' '}
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
                  className={`op-btn-paid ${markingPaid ? 'cursor-wait' : 'cursor-pointer'}`}
                  >
                  {markingPaid ? 'Processing...' : `Mark as Paid — ${formatRM(selectedOrder.total)}`}
                </button>
              )}

              {/* Status Transition Buttons */}
              <div  className="orders-status-buttons op-47">
                {getStatusButtons(selectedOrder).map(s => (
                  <button
                    key={s}
                    onClick={() => { updateOrderStatus(selectedOrder.id, s); setShowModal(false); }}
                    className="op-status-btn"
                  >
                    {s === 'out_for_delivery' ? '🚗 Out for Delivery' : s.replace(/_/g, ' ')}
                  </button>
                ))}
                <button
                  onClick={() => { if (confirm('Cancel this order?')) { updateOrderStatus(selectedOrder.id, 'cancelled'); setShowModal(false); } }}
                  className="op-48"
                >
                  Cancel Order
                </button>
              </div>

              {/* Manual Action Buttons */}
              {selectedOrder && needsPosSync(selectedOrder) && (
                <button
                  onClick={() => markPosSynced(selectedOrder)}
                  disabled={markingPosSynced}
                  className={`op-btn-warn ${markingPosSynced ? 'cursor-wait' : 'cursor-pointer'}`}
                  >
                  {markingPosSynced ? 'Saving...' : 'Mark POS Synced — Order re-keyed into POS'}
                </button>
              )}
              {selectedOrder && needsDispatch(selectedOrder) && (
                <button
                  onClick={() => markDeliveryDispatched(selectedOrder)}
                  disabled={markingDispatched}
                  className={`op-btn-warn ${markingDispatched ? 'cursor-wait' : 'cursor-pointer'}`}
                  >
                  {markingDispatched ? 'Saving...' : 'Mark Delivery Dispatched — Driver booked externally'}
                </button>
              )}

              {/* Audit trail */}
              {selectedOrder.pos_synced_at && (
                <div className="op-51">
                  <span className="op-52"><i className="fas fa-check-circle"></i></span>
                  POS synced at {new Date(selectedOrder.pos_synced_at).toLocaleString()}
                </div>
              )}
              {selectedOrder.delivery_dispatched_at && (
                <div className="op-53">
                  <span className="op-54"><i className="fas fa-check-circle"></i></span>
                  Delivery dispatched at {new Date(selectedOrder.delivery_dispatched_at).toLocaleString()}
                </div>
              )}

              {/* Delivery Tracking — for delivery orders at ready or beyond */}
              {selectedOrder.order_type === 'delivery' && ['ready', 'out_for_delivery'].includes(selectedOrder.status) && (
                <div className="op-55">
                  {!showTrackingForm ? (
                    <button
                      onClick={() => setShowTrackingForm(true)}
                      className="op-56"
                    >
                      <span className="op-57"><i className="fas fa-truck"></i></span>
                      {selectedOrder.delivery_courier_name ? 'Edit Delivery Tracking' : 'Add Delivery Tracking'}
                    </button>
                  ) : (
                    <div className="op-58">
                      <strong className="op-59">Delivery Tracking Info</strong>
                      <div  className="orders-tracking-grid op-60">
                        <input placeholder="Courier Name" value={trackingFields.courier_name} onChange={e => setTrackingFields(p => ({ ...p, courier_name: e.target.value }))} className="input-field" />
                        <input placeholder="Courier Phone" value={trackingFields.courier_phone} onChange={e => setTrackingFields(p => ({ ...p, courier_phone: e.target.value }))} className="input-field" />
                        <input placeholder="Provider (Grab/Lalamove)" value={trackingFields.provider} onChange={e => setTrackingFields(p => ({ ...p, provider: e.target.value }))} className="input-field" />
                        <input placeholder="ETA (minutes)" type="number" value={trackingFields.eta_minutes} onChange={e => setTrackingFields(p => ({ ...p, eta_minutes: e.target.value }))} className="input-field" />
                        <input placeholder="Tracking URL" value={trackingFields.tracking_url} onChange={e => setTrackingFields(p => ({ ...p, tracking_url: e.target.value }))} className="op-61" />
                      </div>
                      <div className="op-62">
                        <button onClick={() => saveDeliveryTracking(selectedOrder.id)} disabled={savingTracking} className="btn btn-primary btn-sm op-63" >{savingTracking ? 'Saving...' : 'Save'}</button>
                        <button onClick={() => setShowTrackingForm(false)} className="btn btn-sm op-64" >Cancel</button>
                      </div>
                    </div>
                  )}
                  {/* Show current tracking info */}
                  {selectedOrder.delivery_courier_name && !showTrackingForm && (
                    <div className="op-65">
                      <strong>Courier:</strong> {selectedOrder.delivery_courier_name}
                      {selectedOrder.delivery_courier_phone && <> · {selectedOrder.delivery_courier_phone}</>}
                      {selectedOrder.delivery_eta_minutes && <> · ETA: {selectedOrder.delivery_eta_minutes}m</>}
                      {selectedOrder.delivery_tracking_url && <><br /><a href={selectedOrder.delivery_tracking_url} target="_blank" rel="noreferrer" className="op-66">Track →</a></>}
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

