'use client';

import { useState, useEffect, useRef } from 'react';
import { ArrowLeft, CheckCircle, Camera, Crown } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { useWalletStore } from '@/stores/walletStore';
import { useUIStore } from '@/stores/uiStore';
import { resolveAssetUrl } from '@/lib/tokens';
import DatePicker from '@/components/ui/DatePicker';
import api from '@/lib/api';

export default function AccountDetailsPage() {
  const { user, setUser } = useAuthStore();
  const { tier } = useWalletStore();
  const { setPage, showToast } = useUIStore();

  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [dob, setDob] = useState(user?.date_of_birth || '');
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const initials = user?.name?.charAt(0)?.toUpperCase() || 'U';
  const avatarUrl = user?.avatar_url ? resolveAssetUrl(user.avatar_url) : null;
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-MY', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  useEffect(() => {
    api.get('/users/me').then((res) => {
      if (res.data) {
        setUser(res.data);
        setName(res.data.name || '');
        setEmail(res.data.email || '');
        setDob(res.data.date_of_birth || '');
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
      const res = await api.put('/users/me', {
        name: name.trim(),
        email: email.trim() || undefined,
        date_of_birth: dob || undefined,
      });
      setUser(res.data);
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 2000);
    } catch {
      showToast('Failed to update profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await api.put('/users/me/avatar', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUser(res.data);
      showToast('Photo updated!', 'success');
    } catch {
      showToast('Failed to upload photo', 'error');
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
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
        {/* Avatar upload section */}
        <div className="ad-avatar-section" onClick={() => fileInputRef.current?.click()}>
          <div className="ad-avatar-ring">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                style={{ width: 78, height: 78, borderRadius: '50%', objectFit: 'cover' }}
              />
            ) : (
              <div className="ad-avatar-circle">{initials}</div>
            )}
            <div className="ad-avatar-edit-badge">
              <Camera size={12} color="#fff" />
            </div>
          </div>
          <span className="ad-avatar-upload-text">
            {uploadingAvatar ? 'Uploading...' : 'Upload Photo'}
          </span>
          {memberSince && (
            <div className="ad-account-meta">Member since {memberSince}</div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={handleAvatarUpload}
          />
        </div>

        {/* Personal Information */}
        <div className="ad-group-header">Personal Information</div>
        <div className="ad-form-card">
          <div className="ad-form-field">
            <label className="ad-form-label">Full Name</label>
            <input
              type="text"
              className="ad-form-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
            />
          </div>
          <div className="ad-form-field">
            <label className="ad-form-label">Date of Birth</label>
            <DatePicker
              value={dob}
              onChange={setDob}
              placeholder="Select your date of birth"
              label="Date of Birth"
            />
          </div>
        </div>

        {/* Contact Information */}
        <div className="ad-group-header">Contact Information</div>
        <div className="ad-form-card">
          <div className="ad-form-field">
            <label className="ad-form-label">Email</label>
            <input
              type="email"
              className="ad-form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
            />
          </div>
          <div className="ad-form-field">
            <label className="ad-form-label">Phone</label>
            <input
              type="tel"
              className="ad-form-input ad-form-input-muted"
              value={user?.phone || ''}
              readOnly
            />
          </div>
        </div>

        {/* Account Metadata */}
        <div className="ad-group-header">Account</div>
        <div className="ad-form-card">
          <div className="ad-form-field">
            <label className="ad-form-label">Account Created</label>
            <input
              type="text"
              className="ad-form-input ad-form-input-muted"
              value={memberSince || '—'}
              readOnly
            />
          </div>
          <div className="ad-form-field">
            <label className="ad-form-label">Membership Tier</label>
            <div style={{ paddingTop: 4 }}>
              <span className={`ad-tier-badge ${(tier || 'Bronze').toLowerCase()}`}>
                <Crown size={14} /> {tier}
              </span>
            </div>
          </div>
        </div>

        <button className="ad-save-btn" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Changes'}
        </button>

        {showSuccess && (
          <p className="ad-success-msg">
            <CheckCircle size={16} className="ad-success-icon" />
            Profile updated successfully
          </p>
        )}
      </div>
    </div>
  );
}
