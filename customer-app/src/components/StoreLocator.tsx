'use client';

import { useApp } from '../lib/app-context';

interface StoreLocatorProps {
  visible: boolean;
  onClose: () => void;
}

export default function StoreLocator({ visible, onClose }: StoreLocatorProps) {
  const { stores, selectedStore, setSelectedStore } = useApp();

  if (!visible) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <h3 style={{ marginBottom: 16 }}>Nearby stores</h3>
        <div style={{ background: '#E2E8F0', height: 120, borderRadius: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 0 16px' }}>
          <i className="fas fa-map-marked-alt" style={{ fontSize: 28, color: '#64748B' }}></i>
        </div>
        {stores.map(s => (
          <div key={s.id} style={{ background: s.id === selectedStore?.id ? '#EFF6FF' : '#F4F7FB', borderRadius: 18, padding: 14, marginBottom: 8, cursor: 'pointer', border: s.id === selectedStore?.id ? '2px solid #002F6C' : 'none' }} onClick={() => { setSelectedStore(s); onClose(); }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span><strong>📍 {s.name}</strong></span>
              <span style={{ fontSize: 13, color: '#059669' }}>Open</span>
            </div>
            <p style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>{s.address}</p>
          </div>
        ))}
        <button className="btn-primary" style={{ marginTop: 12 }} onClick={onClose}>Select</button>
      </div>
    </div>
  );
}
