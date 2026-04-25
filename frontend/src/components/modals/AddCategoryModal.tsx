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
      <div className="acf-0">
        <label className="acf-1">Category Name</label>
        <input value={name} onChange={e => { setName(e.target.value); if (!slug) setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-')); }} required placeholder="e.g. Smoothies" />
      </div>
      <div className="acf-2">
        <label className="acf-3">Slug (auto-generated)</label>
        <input value={slug} onChange={e => setSlug(e.target.value)} placeholder="e.g. smoothies" />
      </div>
      <button type="submit" className="btn btn-primary acf-4"  disabled={saving}>
        {saving ? 'Saving...' : 'Create Category'}
      </button>
    </form>
  );
}
