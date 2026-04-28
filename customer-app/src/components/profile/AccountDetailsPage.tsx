'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import api from '@/lib/api';

export default function AccountDetailsPage() {
  const { user, setUser } = useAuthStore();
  const { setPage, showToast } = useUIStore();

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [dob, setDob] = useState(user?.date_of_birth || '');
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  useEffect(() => {
    api.get('/users/me').then((res) => {
      if (res.data) {
        setUser(res.data);
        setName(res.data.name || '');
        setEmail(res.data.email || '');
      }
    }).catch(() => {});
  }, [setUser]);

  const handleSave = async () => {
    if (!name.trim()) {
      showToast('Name is required', 'error');
      return;
    }
    setSaving(true);
    try {
      const res = await       api.put('/users/me', { name: name.trim(), email: email.trim() || undefined, date_of_birth: dob || undefined });
      setUser(res.data);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
    } catch {
      console.error('Failed to update profile');
      showToast('Failed to update profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="edit-profile-screen">
      <div className="sub-page-header">
        <div className="sub-header-left">
          <button className="sub-back-btn" onClick={() => setPage('profile')} aria-label="Back">
            <ArrowLeft size={20} />
          </button>
          <h1 className="sub-page-title">Edit Profile</h1>
        </div>
        <div className="ad-spacer" />
      </div>

      <div className="edit-form-scroll">
        <div className="edit-input-group">
          <label className="edit-input-label">Full Name</label>
          <input
            type="text"
            className="edit-input-field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
          />
        </div>

        <div className="edit-input-group">
          <label className="edit-input-label">Email</label>
          <input
            type="email"
            className="edit-input-field"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
          />
        </div>

        <div className="edit-input-group">
          <label className="edit-input-label">Date of Birth</label>
          <input
            type="date"
            className="edit-input-field"
            value={dob}
            onChange={(e) => setDob(e.target.value)}
          />
        </div>

        <button className="edit-save-btn" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>

        {showSuccess && (
          <p className="edit-success-msg">
            <CheckCircle size={16} className="ad-success-icon" />
            Profile updated successfully
          </p>
        )}
      </div>
    </div>
  );
}
