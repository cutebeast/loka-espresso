'use client';

import { useState } from 'react';
import { apiFetch, statusBadge, formatRM } from '@/lib/merchant-api';
import type { MerchantOrder } from '@/lib/merchant-types';

interface OrdersPageProps {
  orders: MerchantOrder[];
  loading: boolean;
  token: string;
  selectedStore: string;
  onUpdate: () => void;
}

export default function OrdersPage({ orders, loading, token, selectedStore, onUpdate }: OrdersPageProps) {
  const [showModal, setShowModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<MerchantOrder | null>(null);

  async function updateOrderStatus(orderId: number, newStatus: string) {
    try {
      await apiFetch(`/orders/${orderId}/status`, token, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus }),
      });
      if (selectedStore === 'all') onUpdate();
      else onUpdate();
    } catch {}
  }

  function openOrderDetail(order: MerchantOrder) {
    setSelectedOrder(order);
    setShowModal(true);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3>Order Management</h3>
      </div>
      <div className="table-wrapper" style={{ overflowX: 'auto', borderRadius: 20, background: 'white', border: '1px solid #ECF1F7' }}>
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
              <tr><td colSpan={6} style={{ textAlign: 'center', color: '#94A3B8', padding: 40 }}>No orders yet</td></tr>
            ) : orders.map(o => (
              <tr key={o.id} style={{ cursor: 'pointer' }} onClick={() => openOrderDetail(o)}>
                <td style={{ fontWeight: 600 }}>{o.order_number}</td>
                <td><span style={{ textTransform: 'capitalize' }}>{o.order_type?.replace('_', ' ')}</span></td>
                <td>{formatRM(o.total)}</td>
                <td>{statusBadge(o.status)}</td>
                <td>{new Date(o.created_at).toLocaleDateString()}</td>
                <td>
                  <button className="btn btn-sm" onClick={e => { e.stopPropagation(); openOrderDetail(o); }}>View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && selectedOrder && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3>Order {selectedOrder.order_number}</h3>
              <button className="btn btn-sm" onClick={() => setShowModal(false)}><i className="fas fa-times"></i></button>
            </div>
            <div>
              <p><strong>Type:</strong> {selectedOrder.order_type}</p>
              <p><strong>Status:</strong> {statusBadge(selectedOrder.status)}</p>
              <p><strong>Total:</strong> {formatRM(selectedOrder.total)}</p>
              <p><strong>Created:</strong> {new Date(selectedOrder.created_at).toLocaleString()}</p>
              {selectedOrder.table_id && <p><strong>Table:</strong> {selectedOrder.table_id}</p>}
              {selectedOrder.pickup_time && <p><strong>Pickup:</strong> {new Date(selectedOrder.pickup_time).toLocaleString()}</p>}
              <div style={{ marginTop: 16 }}>
                <strong>Update Status:</strong>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                  {['confirmed', 'preparing', 'ready', 'completed', 'cancelled'].map(s => (
                    <button key={s} className="btn btn-sm" onClick={() => { updateOrderStatus(selectedOrder.id, s); setShowModal(false); }}>{s}</button>
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
