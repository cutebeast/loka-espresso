'use client';

import { useState } from 'react';
import { AddTableForm } from '@/components/Modals';
import type { MerchantTableItem, MerchantStore } from '@/lib/merchant-types';

interface TablesPageProps {
  tables: MerchantTableItem[];
  selectedStore: string;
  storeObj: MerchantStore | undefined;
  token: string;
  onRefresh: () => void;
}

export default function TablesPage({ tables, selectedStore, storeObj, token, onRefresh }: TablesPageProps) {
  const [showModal, setShowModal] = useState(false);

  if (selectedStore === 'all') {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 60, color: '#64748B' }}>
        <i className="fas fa-chair" style={{ fontSize: 40, marginBottom: 16 }}></i>
        <p>Select a specific store to manage tables</p>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3>Floor Plan &middot; {storeObj?.name}</h3>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><i className="fas fa-plus"></i> Add Table</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
        {tables.map(t => (
          <div key={t.id} className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>T{t.table_number}</div>
            <div style={{ marginBottom: 8 }}>{t.capacity} seats</div>
            <span className={`badge ${t.is_active ? 'badge-green' : 'badge-gray'}`}>{t.is_active ? 'Active' : 'Inactive'}</span>
          </div>
        ))}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3>Add Table</h3>
              <button className="btn btn-sm" onClick={() => setShowModal(false)}><i className="fas fa-times"></i></button>
            </div>
            <AddTableForm storeId={Number(selectedStore)} token={token} onClose={() => { setShowModal(false); onRefresh(); }} />
          </div>
        </div>
      )}
    </>
  );
}
