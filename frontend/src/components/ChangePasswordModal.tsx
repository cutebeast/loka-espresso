'use client';

import { useState } from 'react';
import { apiFetch } from '@/lib/merchant-api';

interface ChangePasswordModalProps {
  token: string;
  onClose: () => void;
}

export default function ChangePasswordModal({ token: _token, onClose }: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch('/auth/change-password', undefined, {
        method: 'POST',
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || 'Failed to change password');
        return;
      }
      setSuccess(true);
    } catch (err) { console.error('Password change failed:', err); setError('Network error'); }
    finally { setSaving(false); }
  }

  if (success) {
    return (
      <div style={{ textAlign: 'center', padding: 20 }}>
        <i className="fas fa-check-circle" style={{ fontSize: 40, color: '#059669', marginBottom: 16 }}></i>
        <h4>Password changed successfully</h4>
        <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={onClose}>Done</button>
      </div>
    );
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ margin: 0 }}>Change Password</h3>
        <button className="btn btn-sm" onClick={onClose}><i className="fas fa-times"></i></button>
      </div>
      {error && (
        <div style={{ background: '#FEF2F2', color: '#991B1B', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          <i className="fas fa-exclamation-circle"></i> {error}
        </div>
      )}
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Current Password *</label>
          <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>New Password *</label>
          <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} />
          <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>Minimum 6 characters</div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Confirm New Password *</label>
          <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
        </div>
        <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={saving}>
          {saving ? 'Changing...' : 'Change Password'}
        </button>
      </form>
    </>
  );
}
