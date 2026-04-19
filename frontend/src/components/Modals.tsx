'use client';

import { useState, FormEvent } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import type { MerchantCategory } from '@/lib/merchant-types';

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
  const [minSpend, setMinSpend] = useState('0');
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
          min_order: parseFloat(minSpend),
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
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Min Spend (RM)</label>
        <input type="number" step="0.01" value={minSpend} onChange={e => setMinSpend(e.target.value)} />
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
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload: Record<string, string> = { title, body: message, audience: targetAudience };
      if (scheduledDate && scheduledTime) {
        payload.scheduled_at = `${scheduledDate}T${scheduledTime}:00`;
      }
      await apiFetch('/admin/broadcasts', token, {
        method: 'POST',
        body: JSON.stringify(payload),
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
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>
          Schedule (optional)
        </label>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            type="date"
            value={scheduledDate}
            onChange={e => setScheduledDate(e.target.value)}
            min={new Date().toISOString().slice(0, 10)}
            style={{ width: 150, padding: '6px 10px', borderRadius: 8, border: '1px solid #DDE3E9', fontSize: 13 }}
          />
          <input
            type="time"
            value={scheduledTime}
            onChange={e => setScheduledTime(e.target.value)}
            style={{ width: 110, padding: '6px 10px', borderRadius: 8, border: '1px solid #DDE3E9', fontSize: 13 }}
          />
          {(scheduledDate || scheduledTime) && (
            <button type="button" className="btn btn-sm" onClick={() => { setScheduledDate(''); setScheduledTime(''); }} title="Clear schedule">
              <i className="fas fa-times"></i>
            </button>
          )}
        </div>
        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
          Leave empty to save as draft (no schedule)
        </div>
      </div>
      <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={saving}>
        {saving ? 'Saving...' : 'Save Broadcast'}
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
        body: JSON.stringify({ admin_reply: reply }),
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

// --- Add Category Form ---
export function AddCategoryForm({ storeId, token, onClose }: { storeId: number; token: string; onClose: () => void }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch(`/admin/stores/${storeId}/categories`, token, {
        method: 'POST',
        body: JSON.stringify({ name, slug: slug || name.toLowerCase().replace(/\s+/g, '-'), display_order: 0, is_active: true }),
      });
      onClose();
    } catch {} finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Category Name</label>
        <input value={name} onChange={e => { setName(e.target.value); if (!slug) setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-')); }} required placeholder="e.g. Smoothies" />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Slug (auto-generated)</label>
        <input value={slug} onChange={e => setSlug(e.target.value)} placeholder="e.g. smoothies" />
      </div>
      <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={saving}>
        {saving ? 'Saving...' : 'Create Category'}
      </button>
    </form>
  );
}

// --- Add Customization Option Form ---
export function AddCustomizationForm({ storeId, itemId, token, onClose }: { storeId: number; itemId: number; token: string; onClose: () => void }) {
  const [name, setName] = useState('');
  const [priceAdj, setPriceAdj] = useState('0');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch(`/admin/stores/${storeId}/items/${itemId}/customizations`, token, {
        method: 'POST',
        body: JSON.stringify({ name, price_adjustment: parseFloat(priceAdj), is_active: true, display_order: 0 }),
      });
      onClose();
    } catch {} finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Option Name</label>
        <input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Less Ice, Extra Sugar, Oat Milk" />
      </div>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Price Adjustment (RM)</label>
        <input type="number" step="0.01" value={priceAdj} onChange={e => setPriceAdj(e.target.value)} />
      </div>
      <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={saving}>
        {saving ? 'Saving...' : 'Add Option'}
      </button>
    </form>
  );
}

// --- Add Inventory Item Form ---
export function AddInventoryItemForm({ storeId, token, onClose }: { storeId: number; token: string; onClose: () => void }) {
  const [name, setName] = useState('');
  const [stock, setStock] = useState('');
  const [unit, setUnit] = useState('pcs');
  const [reorderLevel, setReorderLevel] = useState('');
  const [costPerUnit, setCostPerUnit] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch(`/stores/${storeId}/inventory`, token, {
        method: 'POST',
        body: JSON.stringify({
          name, current_stock: parseFloat(stock) || 0, unit,
          reorder_level: parseFloat(reorderLevel) || 0,
          cost_per_unit: costPerUnit ? parseFloat(costPerUnit) : null,
        }),
      });
      onClose();
    } catch {} finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ marginBottom: 12 }}>
        <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Ingredient Name</label>
        <input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Arabica Coffee Beans" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Current Stock</label>
          <input type="number" step="0.01" value={stock} onChange={e => setStock(e.target.value)} required />
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Unit</label>
          <select value={unit} onChange={e => setUnit(e.target.value)}>
            <option value="kg">kg</option>
            <option value="litre">litre</option>
            <option value="pcs">pcs</option>
            <option value="g">g</option>
            <option value="ml">ml</option>
          </select>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Reorder Level</label>
          <input type="number" step="0.01" value={reorderLevel} onChange={e => setReorderLevel(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4 }}>Cost per Unit (RM)</label>
          <input type="number" step="0.01" value={costPerUnit} onChange={e => setCostPerUnit(e.target.value)} />
        </div>
      </div>
      <button type="submit" className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} disabled={saving}>
        {saving ? 'Saving...' : 'Add Ingredient'}
      </button>
    </form>
  );
}


