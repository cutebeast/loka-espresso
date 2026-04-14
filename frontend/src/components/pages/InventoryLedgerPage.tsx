'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import type { MerchantStore, InventoryMovement } from '@/lib/merchant-types';

interface InventoryLedgerPageProps {
  selectedStore: string;
  storeObj: MerchantStore | undefined;
  token: string;
}

const MOVEMENT_COLORS: Record<string, { bg: string; color: string }> = {
  received: { bg: '#ECFDF5', color: '#065F46' },
  waste: { bg: '#FEF2F2', color: '#991B1B' },
  transfer_out: { bg: '#FFFBEB', color: '#92400E' },
  transfer_in: { bg: '#EFF6FF', color: '#1E40AF' },
  cycle_count: { bg: '#F5F3FF', color: '#5B21B6' },
  adjustment: { bg: '#F9FAFB', color: '#374151' },
};

export default function InventoryLedgerPage({ selectedStore, storeObj, token }: InventoryLedgerPageProps) {
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('');

  useEffect(() => { if (selectedStore !== 'all') fetchLedger(); }, [selectedStore, token, filterType]);

  async function fetchLedger() {
    setLoading(true);
    try {
      const url = filterType
        ? `/stores/${selectedStore}/inventory-ledger?movement_type=${filterType}&limit=200`
        : `/stores/${selectedStore}/inventory-ledger?limit=200`;
      const res = await apiFetch(url, token);
      if (res.ok) setMovements(await res.json());
    } catch {} finally { setLoading(false); }
  }

  if (selectedStore === 'all') {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 60, color: '#64748B' }}>
        <i className="fas fa-clock-rotate-left" style={{ fontSize: 40, marginBottom: 16 }}></i>
        <p>Select a specific store to view inventory ledger</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ margin: 0 }}>Inventory Ledger &middot; {storeObj?.name}</h3>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 13 }}>
          <option value="">All Types</option>
          <option value="received">Received</option>
          <option value="waste">Waste</option>
          <option value="transfer_out">Transfer Out</option>
          <option value="transfer_in">Transfer In</option>
          <option value="cycle_count">Cycle Count</option>
          <option value="adjustment">Adjustment</option>
        </select>
      </div>

      <div style={{ overflowX: 'auto', borderRadius: 20, background: 'white', border: '1px solid #ECF1F7' }}>
        <table>
          <thead>
            <tr><th>Date</th><th>Ingredient</th><th>Type</th><th>Quantity</th><th>Balance After</th><th>Note</th><th>By</th><th>Attachment</th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: '#94A3B8' }}>Loading...</td></tr>
            ) : movements.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: '#94A3B8', padding: 40 }}>
                <i className="fas fa-clock-rotate-left" style={{ fontSize: 40, display: 'block', marginBottom: 12 }}></i>
                No inventory movements recorded yet.
              </td></tr>
            ) : movements.map(m => {
              const style = MOVEMENT_COLORS[m.movement_type] || MOVEMENT_COLORS.adjustment;
              const isDeduction = ['waste', 'transfer_out'].includes(m.movement_type);
              return (
                <tr key={m.id}>
                  <td style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{m.created_at ? new Date(m.created_at).toLocaleString() : '—'}</td>
                  <td style={{ fontWeight: 500 }}>{m.inventory_item_name || `#${m.inventory_item_id}`}</td>
                  <td>
                    <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: style.bg, color: style.color }}>
                      {m.movement_type.replace('_', ' ')}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600, color: isDeduction ? '#EF4444' : '#059669' }}>
                    {isDeduction ? '-' : '+'}{m.quantity}
                  </td>
                  <td><strong>{m.balance_after}</strong></td>
                  <td style={{ fontSize: 13, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.note}</td>
                  <td style={{ fontSize: 13 }}>{m.created_by_name || `User #${m.created_by}`}</td>
                  <td>
                    {m.attachment_path ? (
                      <a href={m.attachment_path} target="_blank" rel="noopener noreferrer" style={{ color: '#3B82F6', fontSize: 12 }}>
                        <i className="fas fa-paperclip"></i> View
                      </a>
                    ) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
