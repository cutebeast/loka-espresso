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
