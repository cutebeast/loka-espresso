'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import { useAuthStore } from '@/stores';

interface ProfileUpdateModalProps {
  currentName: string;
  currentPhone: string;
  currentEmail: string;
  onClose: () => void;
  onSaved: (name: string, phone: string) => void;
}

export default function ProfileUpdateModal({ currentName, currentPhone, currentEmail, onClose, onSaved }: ProfileUpdateModalProps) {
  const [name, setName] = useState(currentName);
  const [phone, setPhone] = useState(currentPhone);
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  // Clock in/out state
  const [clockPin, setClockPin] = useState('');
  const [clocking, setClocking] = useState(false);
  const [clockMsg, setClockMsg] = useState<{ok: boolean; text: string} | null>(null);
  const userType = useAuthStore((s) => s.currentUserType);
  const showClock = userType && userType <= 3; // Staff roles only

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pin && pin !== confirmPin) { setError('PINs do not match'); return; }
    if (pin && pin.length < 4) { setError('PIN must be at least 4 digits'); return; }
    setSaving(true);
    setError('');
    try {
      const body: Record<string, string> = { name, phone };
      if (pin) body.pin_code = pin;
      const res = await apiFetch('/users/me', undefined, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || 'Failed to update profile');
        return;
      }
      setSuccess(true);
      onSaved(name, phone);
    } catch (err) { console.error('Profile update failed:', err); setError('Network error'); }
    finally { setSaving(false); }
  }

  async function doClockIn() {
    if (!clockPin) { setClockMsg({ok: false, text: 'Enter your PIN'}); return; }
    setClocking(true); setClockMsg(null);
    try {
      const me = await apiFetch('/users/me');
      if (!me.ok) { setClockMsg({ok: false, text: 'Could not verify identity'}); return; }
      const user = await me.json();
      const res = await apiFetch(`/admin/staff/${user.id}/clock-in`, undefined, {
        method: 'POST', body: JSON.stringify({ pin_code: clockPin }),
      });
      const data = await res.json().catch(() => ({}));
      setClockMsg({ok: res.ok, text: data.message || data.detail || 'Clocked in'});
      if (res.ok) setClockPin('');
    } catch { setClockMsg({ok: false, text: 'Network error'}); }
    finally { setClocking(false); }
  }

  async function doClockOut() {
    setClocking(true); setClockMsg(null);
    try {
      const me = await apiFetch('/users/me');
      if (!me.ok) { setClockMsg({ok: false, text: 'Could not verify identity'}); return; }
      const user = await me.json();
      const res = await apiFetch(`/admin/staff/${user.id}/clock-out`, undefined, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      setClockMsg({ok: res.ok, text: data.message || data.detail || 'Clocked out'});
    } catch { setClockMsg({ok: false, text: 'Network error'}); }
    finally { setClocking(false); }
  }

  if (success) {
    return (
      <div className="cpm-0">
        <span className="cpm-1" style={{ color: '#16A34A' }}><i className="fas fa-check-circle"></i></span>
        <h4>Profile updated successfully</h4>
        <button className="btn btn-primary cpm-2" onClick={onClose}>Done</button>
      </div>
    );
  }

  return (
    <>
      <div className="cpm-3">
        <h3 className="cpm-4">My Profile</h3>
        <button className="btn btn-sm" onClick={onClose}><i className="fas fa-times"></i></button>
      </div>
      {error && (
        <div className="cpm-5">
          <i className="fas fa-exclamation-circle"></i> {error}
        </div>
      )}
      <form onSubmit={handleSubmit}>
        <div className="cpm-6">
          <label className="cpm-7">Email</label>
          <input type="email" value={currentEmail} disabled style={{ opacity: 0.6, cursor: 'not-allowed' }} />
          <div className="cpm-10">Email cannot be changed (used for login)</div>
        </div>
        <div className="cpm-8">
          <label className="cpm-9">Name</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} required />
        </div>
        <div className="cpm-8">
          <label className="cpm-9">Phone</label>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} />
        </div>
        <div className="cpm-8">
          <label className="cpm-9">New PIN (4+ digits)</label>
          <input type="password" value={pin} onChange={e => setPin(e.target.value)} placeholder="Leave blank to keep current" maxLength={6} inputMode="numeric" pattern="[0-9]*" />
        </div>
        {pin && (
          <div className="cpm-8">
            <label className="cpm-9">Confirm PIN</label>
            <input type="password" value={confirmPin} onChange={e => setConfirmPin(e.target.value)} placeholder="Re-enter PIN" maxLength={6} inputMode="numeric" pattern="[0-9]*" />
          </div>
        )}
        <button type="submit" className="btn btn-primary cpm-13" disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </form>

      {showClock && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border, #E5E0D8)' }}>
          <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}><i className="fas fa-clock" style={{ marginRight: 6 }}></i>Clock In / Out</h4>
          {clockMsg && (
            <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6, color: clockMsg.ok ? '#16A34A' : '#DC2626', fontSize: 13 }}>
              <i className={`fas ${clockMsg.ok ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i> {clockMsg.text}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div className="cpm-8" style={{ flex: 1 }}>
              <label className="cpm-9">PIN</label>
              <input type="password" value={clockPin} onChange={e => setClockPin(e.target.value)} placeholder="Enter PIN" maxLength={6} disabled={clocking} />
            </div>
            <button className="btn btn-primary" onClick={doClockIn} disabled={clocking} style={{ height: 36 }}>
              {clocking ? '...' : 'Clock In'}
            </button>
            <button className="btn" onClick={doClockOut} disabled={clocking} style={{ height: 36 }}>
              {clocking ? '...' : 'Clock Out'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}