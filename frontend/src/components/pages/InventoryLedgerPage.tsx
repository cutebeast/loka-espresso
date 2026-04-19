'use client';

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import { DateFilter, type DatePreset } from '@/components/ui/DateFilter';
import { StoreSelector, FilterSelect } from '@/components/ui';
import { THEME } from '@/lib/theme';
import type { MerchantStore, InventoryMovement } from '@/lib/merchant-types';

interface InventoryLedgerPageProps {
  selectedStore: string;
  storeObj: MerchantStore | undefined;
  token: string;
  stores: MerchantStore[];
  onStoreChange: (storeId: string) => void;
  fromDate: string;
  toDate: string;
  onDateChange: (from: string, to: string) => void;
}

const MOVEMENT_COLORS: Record<string, { bg: string; color: string }> = {
  received: { bg: '#ECFDF5', color: '#065F46' },
  waste: { bg: '#FEF2F2', color: '#991B1B' },
  transfer_out: { bg: '#FFFBEB', color: '#92400E' },
  transfer_in: { bg: '#EFF6FF', color: '#1E40AF' },
  cycle_count: { bg: '#F5F3FF', color: '#5B21B6' },
  adjustment: { bg: '#F9FAFB', color: '#374151' },
};

export default function InventoryLedgerPage({ selectedStore, storeObj, token, stores, onStoreChange, fromDate, toDate, onDateChange }: InventoryLedgerPageProps) {
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('');
  const [preset, setPreset] = useState<DatePreset>('MTD');

  useEffect(() => { if (selectedStore !== 'all') fetchLedger(); }, [selectedStore, token, filterType]);

  async function fetchLedger() {
    setLoading(true);
    try {
      const url = filterType
        ? `/stores/${selectedStore}/inventory-ledger?movement_type=${filterType}&limit=200`
        : `/stores/${selectedStore}/inventory-ledger?limit=200`;
      const res = await apiFetch(url, token);
      if (res.ok) {
        const data = await res.json();
        // Handle both array response and object with entries property
        setMovements(Array.isArray(data) ? data : (data.entries || []));
      }
    } catch {} finally { setLoading(false); }
  }

  const physicalStores = (stores || []).filter(s => String(s.id) !== '0');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <StoreSelector
            stores={physicalStores}
            selectedStore={selectedStore === 'all' ? '' : selectedStore}
            onChange={onStoreChange}
            showAllOption={false}
            placeholder="Select a store..."
          />
          {selectedStore !== 'all' && (
            <DateFilter
              preset={preset}
              onChange={(p, from, to) => { setPreset(p); onDateChange(from, to); }}
              fromDate={fromDate}
              toDate={toDate}
            />
          )}
        </div>
        {selectedStore !== 'all' && (
          <FilterSelect
            value={filterType}
            onChange={setFilterType}
            options={[
              { value: '', label: 'All Types' },
              { value: 'received', label: 'Received' },
              { value: 'waste', label: 'Waste' },
              { value: 'transfer_out', label: 'Transfer Out' },
              { value: 'transfer_in', label: 'Transfer In' },
              { value: 'cycle_count', label: 'Cycle Count' },
              { value: 'adjustment', label: 'Adjustment' },
            ]}
            icon="fa-filter"
            placeholder="All Types"
          />
        )}
      </div>

      {selectedStore === 'all' && (
        <div className="card" style={{ textAlign: 'center', padding: 60, color: THEME.textMuted, marginTop: 40 }}>
          <i className="fas fa-clock-rotate-left" style={{ fontSize: 48, marginBottom: 16 }}></i>
          <p style={{ fontSize: 16 }}>Select a store to view its inventory ledger</p>
        </div>
      )}

      {selectedStore !== 'all' && (<>

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
          <i className="fas fa-clock-rotate-left" style={{ marginRight: 8, color: THEME.primary }}></i>
          Showing <strong style={{ color: THEME.textPrimary }}>{movements.length}</strong> of <strong style={{ color: THEME.textPrimary }}>{movements.length}</strong> movements
        </div>
      </div>

      <div style={{
        overflowX: 'auto',
        borderRadius: `0 0 ${THEME.radius.md} ${THEME.radius.md}`,
        background: THEME.bgCard,
        border: `1px solid ${THEME.border}`,
        borderTop: 'none',
      }}>
        <table>
          <thead>
            <tr><th>Date</th><th>Ingredient</th><th>Type</th><th>Quantity</th><th>Balance After</th><th>Note</th><th>By</th><th>Attachment</th></tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 40, color: THEME.textMuted }}>Loading...</td></tr>
            ) : movements.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: THEME.textMuted, padding: 40 }}>
                <i className="fas fa-clock-rotate-left" style={{ fontSize: 40, display: 'block', marginBottom: 12 }}></i>
                No inventory movements recorded yet.
              </td></tr>
            ) : movements.map(m => {
              const style = MOVEMENT_COLORS[m.movement_type] || MOVEMENT_COLORS.adjustment;
              const isDeduction = ['waste', 'transfer_out'].includes(m.movement_type);
              return (
                <tr key={m.id}>
                  <td style={{ fontSize: 13, whiteSpace: 'nowrap', color: THEME.textPrimary }}>{m.created_at ? new Date(m.created_at).toLocaleString() : '—'}</td>
                  <td style={{ fontWeight: 500, color: THEME.textPrimary }}>{m.inventory_item_name || `#${m.inventory_item_id}`}</td>
                  <td>
                    <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600, background: style.bg, color: style.color }}>
                      {m.movement_type.replace('_', ' ')}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600, color: isDeduction ? THEME.error : THEME.accent }}>
                    {isDeduction ? '-' : '+'}{m.quantity}
                  </td>
                  <td style={{ color: THEME.textPrimary }}><strong>{m.balance_after}</strong></td>
                  <td style={{ fontSize: 13, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: THEME.textMuted }}>{m.note}</td>
                  <td style={{ fontSize: 13, color: THEME.textMuted }}>{m.created_by_name || `User #${m.created_by}`}</td>
                  <td>
                    {m.attachment_path ? (
                      <a href={m.attachment_path} target="_blank" rel="noopener noreferrer" style={{ color: '#4A607A', fontSize: 12 }}>
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
      </>)}
    </div>
  );
}
