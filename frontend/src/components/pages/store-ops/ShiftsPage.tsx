'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import { StoreSelector } from '@/components/ui';
import { useMerchantDataStore } from '@/stores';

export default function ShiftsPage() {
  const selectedStore = useMerchantDataStore((s) => s.selectedStore);
  const setSelectedStore = useMerchantDataStore((s) => s.setSelectedStore);
  const stores = useMerchantDataStore((s) => s.stores);
  const activeStoreId = selectedStore !== 'all' && selectedStore ? selectedStore : '';

  const [shifts, setShifts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchShifts = useCallback(async () => {
    if (!activeStoreId) { setShifts([]); return; }
    setLoading(true);
    try {
      const res = await apiFetch(`/admin/stores/${activeStoreId}/shifts`);
      if (res.ok) setShifts(await res.json());
    } catch { console.error('Failed to fetch shifts'); }
    finally { setLoading(false); }
  }, [activeStoreId]);

  useEffect(() => { fetchShifts(); }, [fetchShifts]);

  return (
    <div>
      <div className="sp-18" style={{ marginBottom: 16 }}>
        <div className="sp-19">
          <StoreSelector
            stores={stores.filter(s => String(s.id) !== '0')}
            selectedStore={selectedStore}
            onChange={setSelectedStore}
            allLabel="All Stores (HQ view)"
          />
        </div>
      </div>

      {!activeStoreId ? (
        <p style={{ textAlign: 'center', color: '#6B7280', padding: 32 }}>Select a store above to view shift history.</p>
      ) : loading ? (
        <p style={{ textAlign: 'center', padding: 32 }}>Loading shifts...</p>
      ) : shifts.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#6B7280', padding: 32 }}>No shifts recorded for this store.</p>
      ) : (
        <table className="dt-table">
          <thead>
            <tr>
              <th>Staff</th>
              <th>Clock In</th>
              <th>Clock Out</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            {shifts.map((s: any) => {
              const clockIn = new Date(s.clock_in);
              const clockOut = s.clock_out ? new Date(s.clock_out) : null;
              const duration = clockOut ? Math.round((clockOut.getTime() - clockIn.getTime()) / 3600000 * 10) / 10 : null;
              return (
                <tr key={s.id} className="dt-row">
                  <td>{s.staff?.name || `Staff #${s.staff_id}`}</td>
                  <td>{clockIn.toLocaleString()}</td>
                  <td>{clockOut ? clockOut.toLocaleString() : <span className="badge badge-green">Active</span>}</td>
                  <td>{duration != null ? `${duration}h` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
