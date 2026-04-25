'use client';

import { useState, FormEvent } from 'react';
import { apiFetch } from '@/lib/merchant-api';

export function AddCategoryForm({ storeId: _storeId, token: _token, onClose }: { storeId: number; token: string; onClose: () => void }) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch(`/admin/categories`, undefined, {
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
