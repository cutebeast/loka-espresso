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

  // Manual clock form
  const [showForm, setShowForm] = useState(false);
  const [staffList, setStaffList] = useState<any[]>([]);
  const [selStaffId, setSelStaffId] = useState('');
  const [clockPin, setClockPin] = useState('');
  const [action, setAction] = useState<'in' | 'out'>('in');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ok: boolean; text: string} | null>(null);

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

  // Load staff list when form opens
  const loadStaff = async () => {
    if (!activeStoreId) return;
    try {
      const res = await apiFetch(`/admin/stores/${activeStoreId}/staff?page=1&page_size=200`);
      if (res.ok) {
        const data = await res.json();
        setStaffList(Array.isArray(data) ? data : (data.items || []));
      }
    } catch { console.error('Failed to load staff'); }
  };

  const openForm = () => { setShowForm(true); loadStaff(); setMsg(null); };
  const closeForm = () => { setShowForm(false); setSelStaffId(''); setClockPin(''); setMsg(null); };

  const handleClock = async () => {
    const sid = parseInt(selStaffId);
    if (!sid) { setMsg({ok: false, text: 'Select a staff member'}); return; }
    if (action === 'in' && !clockPin) { setMsg({ok: false, text: 'PIN required for clock in'}); return; }
    setSaving(true); setMsg(null);
    try {
      const endpoint = action === 'in' ? `/admin/staff/${sid}/clock-in` : `/admin/staff/${sid}/clock-out`;
      const body = action === 'in' ? { pin_code: clockPin } : undefined;
      const res = await apiFetch(endpoint, undefined, { method: 'POST', body: body ? JSON.stringify(body) : undefined });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setMsg({ok: true, text: data.message || `Clock ${action} successful`});
        fetchShifts();
        closeForm();
      } else {
        setMsg({ok: false, text: data.detail || 'Failed'});
      }
    } catch { setMsg({ok: false, text: 'Network error'}); }
    finally { setSaving(false); }
  };

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
        {activeStoreId && (
          <button className="btn btn-primary" onClick={openForm}>
            <i className="fas fa-plus" style={{ marginRight: 6 }}></i>Record Clock
          </button>
        )}
      </div>

      {/* Manual clock form */}
      {showForm && (
        <div className="card" style={{ marginBottom: 20, padding: 16 }}>
          <h4 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 600 }}>
            <i className="fas fa-clock" style={{ marginRight: 6 }}></i>Manual Clock In/Out
          </h4>
          {msg && (
            <div style={{ marginBottom: 10, padding: '6px 10px', borderRadius: 6, fontSize: 13, background: msg.ok ? '#F0FDF4' : '#FEF2F2', color: msg.ok ? '#16A34A' : '#DC2626' }}>
              <i className={`fas ${msg.ok ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i> {msg.text}
            </div>
          )}
          <div className="df-grid" style={{ marginBottom: 12 }}>
            <div className="df-field">
              <label className="df-label">Staff Member</label>
              <select value={selStaffId} onChange={e => setSelStaffId(e.target.value)}>
                <option value="">Select staff...</option>
                {staffList.map((s: any) => (
                  <option key={s.id} value={s.id}>{s.name} (ID: {s.id})</option>
                ))}
              </select>
            </div>
            <div className="df-field">
              <label className="df-label">Action</label>
              <select value={action} onChange={e => setAction(e.target.value as 'in' | 'out')}>
                <option value="in">Clock In</option>
                <option value="out">Clock Out</option>
              </select>
            </div>
          </div>
          {action === 'in' && (
            <div className="df-field" style={{ marginBottom: 12 }}>
              <label className="df-label">Staff PIN</label>
              <input type="password" value={clockPin} onChange={e => setClockPin(e.target.value)} placeholder="Enter staff PIN" maxLength={6} />
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={handleClock} disabled={saving}>
              {saving ? 'Processing...' : action === 'in' ? 'Clock In' : 'Clock Out'}
            </button>
            <button className="btn" onClick={closeForm}>Cancel</button>
          </div>
        </div>
      )}

      {/* Shifts table */}
      {!activeStoreId ? (
        <p style={{ textAlign: 'center', color: '#6B7280', padding: 32 }}>Select a store above to view shift history.</p>
      ) : loading ? (
        <p style={{ textAlign: 'center', padding: 32 }}>Loading shifts...</p>
      ) : shifts.length === 0 ? (
        <p style={{ textAlign: 'center', color: '#6B7280', padding: 32 }}>No shifts recorded for this store. Click "Record Clock" to manually clock a staff member in or out.</p>
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
