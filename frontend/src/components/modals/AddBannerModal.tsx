'use client';

import { useState, FormEvent } from 'react';
import { apiFetch, apiUpload } from '@/lib/merchant-api';

export function AddBannerForm({ token: _token, onClose }: { token: string; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [targetUrl, setTargetUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!imageFile) { setError('Please select an image'); return; }
    setSaving(true); setError('');
    try {
      const fd = new FormData();
      fd.append('file', imageFile);
      const uploadRes = await apiUpload('/upload/banner-image', fd);
      if (!uploadRes.ok) { setError('Image upload failed'); return; }
      const uploadData = await uploadRes.json();
      const imageUrl = uploadData.url || '';
      await apiFetch('/admin/banners', undefined, {
        method: 'POST',
        body: JSON.stringify({ title, image_url: imageUrl, target_url: targetUrl, is_active: true }),
      });
      onClose();
    } catch { console.error('Banner creation failed'); }
    finally { setSaving(false); }
  }

  return (
    <>
      {error && <div className="cdp-error"><i className="fas fa-exclamation-circle"></i> {error}</div>}
      <div className="df-section">
        <div className="df-field" style={{ marginBottom: 16 }}>
          <label className="df-label">Title *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} required placeholder="Banner title" />
        </div>
        <div className="df-field" style={{ marginBottom: 16 }}>
          <label className="df-label">Banner Image *</label>
          <input type="file" accept="image/*" onChange={e => setImageFile(e.target.files?.[0] || null)} />
          <div className="df-hint">Recommended: 720 x 405 px (16:9)</div>
        </div>
        <div className="df-field">
          <label className="df-label">Target URL <span>(optional)</span></label>
          <input value={targetUrl} onChange={e => setTargetUrl(e.target.value)} placeholder="https://..." />
          <div className="df-hint">Where the banner links to when clicked</div>
        </div>
      </div>
      <div className="df-actions">
        <button className="btn" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
          {saving ? 'Creating...' : 'Create Banner'}
        </button>
      </div>
    </>
  );
}
