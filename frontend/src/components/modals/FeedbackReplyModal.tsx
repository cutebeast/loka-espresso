'use client';

import { useState, FormEvent } from 'react';
import { apiFetch } from '@/lib/merchant-api';

export function FeedbackReplyForm({ feedbackId, token: _token, onClose }: { feedbackId: number; token: string; onClose: () => void }) {
  const [reply, setReply] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch(`/admin/feedback/${feedbackId}/reply`, undefined, {
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
