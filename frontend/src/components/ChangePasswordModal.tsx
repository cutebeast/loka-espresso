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
      <div className="cpm-0">
        <span className="cpm-1"><i className="fas fa-check-circle"></i></span>
        <h4>Password changed successfully</h4>
        <button className="btn btn-primary cpm-2"  onClick={onClose}>Done</button>
      </div>
    );
  }

  return (
    <>
      <div className="cpm-3">
        <h3 className="cpm-4">Change Password</h3>
        <button className="btn btn-sm" onClick={onClose}><i className="fas fa-times"></i></button>
      </div>
      {error && (
        <div className="cpm-5">
          <i className="fas fa-exclamation-circle"></i> {error}
        </div>
      )}
      <form onSubmit={handleSubmit}>
        <div className="cpm-6">
          <label className="cpm-7">Current Password *</label>
          <input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required />
        </div>
        <div className="cpm-8">
          <label className="cpm-9">New Password *</label>
          <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} />
          <div className="cpm-10">Minimum 6 characters</div>
        </div>
        <div className="cpm-11">
          <label className="cpm-12">Confirm New Password *</label>
          <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required />
        </div>
        <button type="submit" className="btn btn-primary cpm-13"  disabled={saving}>
          {saving ? 'Changing...' : 'Change Password'}
        </button>
      </form>
    </>
  );
}
