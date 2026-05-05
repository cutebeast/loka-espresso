'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/merchant-api';

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
    </>
  );
}