'use client';

import { useApp } from '../lib/app-context';

export default function OrdersPage() {
  const { orders, setModalTitle, setModalContent, setShowModal } = useApp();

  return (
    <div className="page-enter">
      <h2 style={{ fontWeight: 700, margin: '12px 0' }}>Recent orders</h2>
      {orders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40 }}><i className="fas fa-receipt" style={{ fontSize: 48, opacity: 0.3 }}></i><p style={{ marginTop: 12, color: '#94A3B8' }}>No orders yet</p></div>
      ) : orders.map(o => {
        const statusColors: Record<string, string> = { pending: '#FEF9C3', preparing: '#FEF9C3', confirmed: '#DBEAFE', ready: '#DCFCE7', completed: '#DCFCE7', cancelled: '#FEE2E2' };
        const statusTextColors: Record<string, string> = { pending: '#854D0E', preparing: '#854D0E', confirmed: '#1E3A8A', ready: '#166534', completed: '#166534', cancelled: '#991B1B' };
        return (
          <div key={o.id} style={{ background: 'white', borderRadius: 20, padding: 16, marginTop: 12, cursor: 'pointer' }} onClick={() => {
            setModalTitle(`Order ${o.order_number}`);
            const steps = ['pending', 'confirmed', 'preparing', 'ready', 'completed'];
            const currentIdx = steps.indexOf(o.status);
            setModalContent(
              <div>
                <p style={{ marginBottom: 8 }}><strong>Type:</strong> {o.order_type}</p>
                <p style={{ marginBottom: 8 }}><strong>Total:</strong> RM {Number(o.total).toFixed(2)}</p>
                <p style={{ marginBottom: 16 }}><strong>Created:</strong> {new Date(o.created_at).toLocaleString()}</p>
                {steps.map((s, idx) => (
                  <div key={s} style={{ display: 'flex', gap: 12, margin: '12px 0', alignItems: 'center' }}>
                    <div style={{ width: 40, height: 40, borderRadius: 40, background: idx <= currentIdx ? '#384B16' : '#EFF3F8', color: idx <= currentIdx ? 'white' : '#94A3B8', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i className={`fas ${idx <= currentIdx ? 'fa-check' : 'fa-circle'}`} style={{ fontSize: 14 }}></i>
                    </div>
                    <span style={{ textTransform: 'capitalize', fontWeight: idx <= currentIdx ? 600 : 400 }}>{s}</span>
                  </div>
                ))}
              </div>
            );
            setShowModal(true);
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}><span><strong>#{o.order_number}</strong></span><span>{new Date(o.created_at).toLocaleDateString()}</span></div>
            <p style={{ color: '#64748B', marginTop: 4 }}>{Array.isArray(o.items) ? o.items.map((it: Record<string, unknown>) => it.name).join(', ') : ''}</p>
            <span style={{ background: statusColors[o.status] || '#F1F5F9', color: statusTextColors[o.status] || '#334155', padding: '4px 12px', borderRadius: 30, fontSize: 13, fontWeight: 600, display: 'inline-block', marginTop: 8 }}>{o.status}</span>
          </div>
        );
      })}
    </div>
  );
}
