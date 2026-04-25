'use client';

import { useState, FormEvent } from 'react';
import { apiFetch } from '@/lib/merchant-api';

export function AddBannerForm({ token: _token, onClose }: { token: string; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/admin/banners', undefined, {
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
      <div className="abf-0">
        <label className="abf-1">Title</label>
        <input value={title} onChange={e => setTitle(e.target.value)} required />
      </div>
      <div className="abf-2">
        <label className="abf-3">Image URL</label>
        <input value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://..." />
      </div>
      <div className="abf-4">
        <label className="abf-5">Target URL</label>
        <input value={targetUrl} onChange={e => setTargetUrl(e.target.value)} placeholder="https://..." />
      </div>
      <button type="submit" className="btn btn-primary abf-6"  disabled={saving}>
        {saving ? 'Creating...' : 'Create Banner'}
      </button>
    </form>
  );
}
