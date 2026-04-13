'use client';

import { useState, FormEvent } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import type { MerchantCategory, MerchantStore, MerchantLoyaltyTier } from '@/lib/merchant-types';

export function StatCard({ icon, color, label, value }: { icon: string; color: string; label: string; value: string }) {
  return (
    <div style={{ background: 'white', borderRadius: 24, padding: '22px 20px', border: '1px solid #EDF2F7', boxShadow: '0 6px 12px -6px rgba(0,47,108,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div>
        <div style={{ fontSize: 13, color: '#64748B', marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 28, fontWeight: 700 }}>{value}</div>
      </div>
      <i className={`fas ${icon}`} style={{ fontSize: 28, color }}></i>
    </div>
  );
}

export function AddItemForm({ storeId, categories, token, onClose }: { storeId: number; categories: MerchantCategory[]; token: string; onClose: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [categoryId, setCategoryId] = useState(categories[0]?.id || 0);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch(`/admin/stores/${storeId}/items`, token, {
        method: 'POST',
        body: JSON.stringify({
          name, description, base_price: parseFloat(price),
          category_id: categoryId, is_available: true, display_order: 0,
        }),
      });
      onClose();
    } catch {} finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Name</label>
        <input value={name} onChange={e => setName(e.target.value)} required />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Description</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)} rows={3} style={{ outline: 'none', border: '1px solid #DDE3E9', borderRadius: 12, padding: '8px 14px', fontSize: 14, width: '100%' }} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Price (RM)</label>
        <input type="number" step="0.01" value={price} onChange={e => setPrice(e.target.value)} required />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Category</label>
        <select value={categoryId} onChange={e => setCategoryId(Number(e.target.value))}>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={saving}>
        {saving ? 'Saving...' : 'Create Item'}
      </button>
    </form>
  );
}

export function AddTableForm({ storeId, token, onClose }: { storeId: number; token: string; onClose: () => void }) {
  const [number, setNumber] = useState('');
  const [capacity, setCapacity] = useState('4');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch(`/admin/stores/${storeId}/tables`, token, {
        method: 'POST',
        body: JSON.stringify({ table_number: number, capacity: parseInt(capacity) }),
      });
      onClose();
    } catch {} finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Table Number</label>
        <input value={number} onChange={e => setNumber(e.target.value)} required placeholder="e.g. 11" />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Capacity</label>
        <input type="number" value={capacity} onChange={e => setCapacity(e.target.value)} required />
      </div>
      <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={saving}>
        {saving ? 'Saving...' : 'Add Table'}
      </button>
    </form>
  );
}

export function AddRewardForm({ token, onClose }: { token: string; onClose: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [pointsCost, setPointsCost] = useState('');
  const [rewardType, setRewardType] = useState('free_item');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/admin/rewards', token, {
        method: 'POST',
        body: JSON.stringify({
          name, description, points_cost: parseInt(pointsCost),
          reward_type: rewardType, is_active: true,
        }),
      });
      onClose();
    } catch {} finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Name</label>
        <input value={name} onChange={e => setName(e.target.value)} required />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Description</label>
        <input value={description} onChange={e => setDescription(e.target.value)} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Points Cost</label>
        <input type="number" value={pointsCost} onChange={e => setPointsCost(e.target.value)} required />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Type</label>
        <select value={rewardType} onChange={e => setRewardType(e.target.value)}>
          <option value="free_item">Free Item</option>
          <option value="discount_voucher">Discount Voucher</option>
          <option value="custom">Custom</option>
        </select>
      </div>
      <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={saving}>
        {saving ? 'Creating...' : 'Create Reward'}
      </button>
    </form>
  );
}

export function AddVoucherForm({ token, onClose }: { token: string; onClose: () => void }) {
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [discountType, setDiscountType] = useState('fixed');
  const [discountValue, setDiscountValue] = useState('');
  const [minOrder, setMinOrder] = useState('0');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/admin/vouchers', token, {
        method: 'POST',
        body: JSON.stringify({
          code: code.toUpperCase(), description,
          discount_type: discountType,
          discount_value: parseFloat(discountValue),
          min_order: parseFloat(minOrder),
          is_active: true,
        }),
      });
      onClose();
    } catch {} finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Code</label>
        <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} required placeholder="e.g. SUMMER20" />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Description</label>
        <input value={description} onChange={e => setDescription(e.target.value)} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Type</label>
          <select value={discountType} onChange={e => setDiscountType(e.target.value)}>
            <option value="fixed">Fixed (RM)</option>
            <option value="percent">Percent (%)</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Value</label>
          <input type="number" step="0.01" value={discountValue} onChange={e => setDiscountValue(e.target.value)} required />
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Min Order (RM)</label>
        <input type="number" step="0.01" value={minOrder} onChange={e => setMinOrder(e.target.value)} />
      </div>
      <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={saving}>
        {saving ? 'Creating...' : 'Create Voucher'}
      </button>
    </form>
  );
}

export function AddStaffForm({ storeId, token, onClose }: { storeId: number; token: string; onClose: () => void }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('staff');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch(`/admin/stores/${storeId}/staff`, token, {
        method: 'POST',
        body: JSON.stringify({ name, role, phone, is_active: true }),
      });
      onClose();
    } catch {} finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Name</label>
        <input value={name} onChange={e => setName(e.target.value)} required />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Role</label>
        <select value={role} onChange={e => setRole(e.target.value)}>
          <option value="staff">Staff</option>
          <option value="manager">Manager</option>
          <option value="cashier">Cashier</option>
          <option value="kitchen">Kitchen</option>
        </select>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Phone</label>
        <input value={phone} onChange={e => setPhone(e.target.value)} required placeholder="e.g. +60 12-345 6789" />
      </div>
      <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={saving}>
        {saving ? 'Adding...' : 'Add Staff'}
      </button>
    </form>
  );
}

export function AddBannerForm({ token, onClose }: { token: string; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/admin/banners', token, {
        method: 'POST',
        body: JSON.stringify({
          title, image_url: imageUrl, target_url: targetUrl, is_active: true,
        }),
      });
      onClose();
    } catch {} finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Title</label>
        <input value={title} onChange={e => setTitle(e.target.value)} required />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Image URL</label>
        <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..." />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Target URL</label>
        <input value={targetUrl} onChange={e => setTargetUrl(e.target.value)} placeholder="https://..." />
      </div>
      <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={saving}>
        {saving ? 'Creating...' : 'Create Banner'}
      </button>
    </form>
  );
}

export function AddBroadcastForm({ token, onClose }: { token: string; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetAudience, setTargetAudience] = useState('all');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/admin/broadcasts', token, {
        method: 'POST',
        body: JSON.stringify({ title, message, target_audience: targetAudience }),
      });
      onClose();
    } catch {} finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Title</label>
        <input value={title} onChange={e => setTitle(e.target.value)} required />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Message</label>
        <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} required style={{ outline: 'none', border: '1px solid #DDE3E9', borderRadius: 12, padding: '8px 14px', fontSize: 14, width: '100%' }} />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Target Audience</label>
        <select value={targetAudience} onChange={e => setTargetAudience(e.target.value)}>
          <option value="all">All Users</option>
          <option value="new">New Users</option>
          <option value="loyal">Loyal Customers</option>
          <option value="inactive">Inactive Users</option>
        </select>
      </div>
      <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={saving}>
        {saving ? 'Sending...' : 'Send Broadcast'}
      </button>
    </form>
  );
}

export function FeedbackReplyForm({ feedbackId, token, onClose }: { feedbackId: number; token: string; onClose: () => void }) {
  const [reply, setReply] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch(`/admin/feedback/${feedbackId}/reply`, token, {
        method: 'POST',
        body: JSON.stringify({ reply }),
      });
      onClose();
    } catch {} finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Reply</label>
        <textarea value={reply} onChange={e => setReply(e.target.value)} rows={4} required style={{ outline: 'none', border: '1px solid #DDE3E9', borderRadius: 12, padding: '8px 14px', fontSize: 14, width: '100%' }} />
      </div>
      <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={saving}>
        {saving ? 'Sending...' : 'Send Reply'}
      </button>
    </form>
  );
}

export function EditTierForm({ tier, token, onClose }: { tier: MerchantLoyaltyTier; token: string; onClose: () => void }) {
  const [name, setName] = useState(tier.name);
  const [minPoints, setMinPoints] = useState(String(tier.min_points));
  const [multiplier, setMultiplier] = useState(String(tier.multiplier));
  const [benefits, setBenefits] = useState(tier.benefits || '');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch(`/admin/loyalty-tiers/${tier.id}`, token, {
        method: 'PUT',
        body: JSON.stringify({
          name,
          min_points: parseInt(minPoints),
          multiplier: parseFloat(multiplier),
          benefits,
        }),
      });
      onClose();
    } catch {} finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Tier Name</label>
        <input value={name} onChange={e => setName(e.target.value)} required />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Min Points</label>
          <input type="number" value={minPoints} onChange={e => setMinPoints(e.target.value)} required />
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Multiplier</label>
          <input type="number" step="0.1" value={multiplier} onChange={e => setMultiplier(e.target.value)} required />
        </div>
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Benefits</label>
        <textarea value={benefits} onChange={e => setBenefits(e.target.value)} rows={3} style={{ outline: 'none', border: '1px solid #DDE3E9', borderRadius: 12, padding: '8px 14px', fontSize: 14, width: '100%' }} />
      </div>
      <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={saving}>
        {saving ? 'Saving...' : 'Update Tier'}
      </button>
    </form>
  );
}

export function StoreSettingsForm({ store, token }: { store: MerchantStore; token: string }) {
  const [name, setName] = useState(store.name);
  const [address, setAddress] = useState(store.address);
  const [phone, setPhone] = useState(store.phone);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const res = await apiFetch(`/stores/${store.id}`, token, {
        method: 'PUT',
        body: JSON.stringify({ name, address, phone }),
      });
      if (res.ok) setSaved(true);
    } catch {} finally { setSaving(false); }
  }

  return (
    <div className="card">
      <h3 style={{ marginBottom: 20 }}>Store Configuration</h3>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Store Name</label>
          <input value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Address</label>
          <input value={address} onChange={e => setAddress(e.target.value)} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Phone</label>
          <input value={phone} onChange={e => setPhone(e.target.value)} />
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Slug</label>
          <input value={store.slug} disabled style={{ background: '#F1F5F9' }} />
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          {saved && <span style={{ color: '#059669', fontWeight: 500 }}><i className="fas fa-check"></i> Saved!</span>}
        </div>
      </form>
    </div>
  );
}
