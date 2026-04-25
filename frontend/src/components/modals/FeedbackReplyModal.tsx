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
      <div className="frf-0">
        <label className="frf-1">Reply</label>
        <textarea value={reply} onChange={e => setReply(e.target.value)} rows={4} required className="frf-2" />
      </div>
      <button type="submit" className="btn btn-primary frf-3"  disabled={saving}>
        {saving ? 'Sending...' : 'Send Reply'}
      </button>
    </form>
  );
}
