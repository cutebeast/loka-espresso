'use client';

import type { FormEvent } from 'react';
import { formatRM } from '@/lib/merchant-api';
import type { CustomerDetail } from '@/lib/merchant-types';

interface CustomerInfoProps {
  detail: CustomerDetail;
  editingCustomer: boolean;
  editName: string;
  editPhone: string;
  editEmail: string;
  editDob: string;
  editSaving: boolean;
  editError: string;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onEditSubmit: (e: FormEvent) => void;
  setEditName: (v: string) => void;
  setEditPhone: (v: string) => void;
  setEditEmail: (v: string) => void;
  setEditDob: (v: string) => void;
}

export default function CustomerInfo({
  detail,
  editingCustomer,
  editName,
  editPhone,
  editEmail,
  editDob,
  editSaving,
  editError,
  onStartEdit,
  onCancelEdit,
  onEditSubmit,
  setEditName,
  setEditPhone,
  setEditEmail,
  setEditDob,
}: CustomerInfoProps) {
  if (editingCustomer) {
    return (
      <form onSubmit={onEditSubmit}>
        <h4 className="cdp-section-title">Edit Profile</h4>
        {editError && <div className="cdp-error"><i className="fas fa-exclamation-circle"></i> {editError}</div>}
        <div className="df-grid">
          <div className="df-field">
            <label className="df-label">Name</label>
            <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Customer name" />
            <div className="df-hint">Customer's full name</div>
          </div>
          <div className="df-field">
            <label className="df-label">Date of Birth</label>
            <input type="date" value={editDob} onChange={e => setEditDob(e.target.value)} />
            <div className="df-hint">Used for birthday gifts/vouchers</div>
          </div>
        </div>
        <div className="df-grid">
          <div className="df-field">
            <label className="df-label">Phone</label>
            <input value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="+60 12-345 6789" />
            <div className="df-hint">Used for passwordless login</div>
          </div>
          <div className="df-field">
            <label className="df-label">Email</label>
            <input type="email" value={editEmail} onChange={e => setEditEmail(e.target.value)} placeholder="customer@email.com" />
            <div className="df-hint">Recovery channel</div>
          </div>
        </div>
        <div className="df-actions">
          <button type="button" className="btn" onClick={onCancelEdit}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={editSaving}>{editSaving ? 'Saving...' : 'Save Changes'}</button>
        </div>
      </form>
    );
  }

  return (
    <div className="cdp-profile-grid">
      <div>
        <h4 className="cdp-section-title">Profile</h4>
        <div className="cdp-field-list">
          <div className="cdp-field-row"><span className="cdp-field-label">Name</span><span>{detail.name || '-'}</span></div>
          <div className="cdp-field-row"><span className="cdp-field-label">Phone</span><span>{detail.phone || '-'}</span></div>
          <div className="cdp-field-row"><span className="cdp-field-label">Email</span><span>{detail.email || <span className="cdp-text-muted">Not set</span>}</span></div>
          <div className="cdp-field-row"><span className="cdp-field-label">Phone Verified</span><span>{detail.phone_verified ? <span className="cdp-text-success">Yes</span> : <span className="cdp-text-error">No</span>}</span></div>
          <div className="cdp-field-row"><span className="cdp-field-label">Profile Complete</span><span>{detail.is_profile_complete ? <span className="cdp-text-success">Yes</span> : <span className="cdp-text-error">No ({detail.phone_verified ? 'name still required' : 'phone not verified'})</span>}</span></div>
          <div className="cdp-field-row"><span className="cdp-field-label">Joined</span><span>{detail.created_at ? new Date(detail.created_at).toLocaleDateString() : '-'}</span></div>
          <div className="cdp-field-row"><span className="cdp-field-label">Date of Birth</span><span>{detail.date_of_birth ? new Date(detail.date_of_birth).toLocaleDateString() : <span className="cdp-text-muted">Not set</span>}</span></div>
        </div>
        <button className="btn btn-sm" onClick={onStartEdit} style={{ marginTop: 12 }}>
          <i className="fas fa-edit"></i> Edit Profile
        </button>
      </div>
      <div>
        <h4 className="cdp-section-title">Balances</h4>
        <div className="cdp-field-list">
          <div className="cdp-field-row"><span className="cdp-field-label">Loyalty Points</span><span>{detail.points_balance?.toLocaleString() || 0} pts</span></div>
          <div className="cdp-field-row"><span className="cdp-field-label">Total Earned</span><span>{detail.total_points_earned?.toLocaleString() || '-'} pts</span></div>
          <div className="cdp-field-row"><span className="cdp-field-label">Wallet Balance</span><span>{formatRM(detail.wallet_balance || 0)}</span></div>
          <div className="cdp-field-row"><span className="cdp-field-label">Total Orders</span><span>{detail.total_orders}</span></div>
          <div className="cdp-field-row"><span className="cdp-field-label">Total Spent</span><span>{formatRM(detail.total_spent || 0)}</span></div>
        </div>
      </div>
    </div>
  );
}
