'use client';

import { useState, FormEvent } from 'react';
import { apiFetch, apiUpload } from '@/lib/merchant-api';

export function AddRewardForm({ token: _token, onClose }: { token: string; onClose: () => void }) {
  const [name, setName] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [longDescription, setLongDescription] = useState('');
  const [pointsCost, setPointsCost] = useState('');
  const [rewardType, setRewardType] = useState('free_item');
  const [validityDays, setValidityDays] = useState('30');
  const [terms, setTerms] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      let imageUrl = '';
      if (imageFile) {
        const formData = new FormData();
        formData.append('file', imageFile);
        const uploadRes = await apiUpload('/upload/marketing-image', formData);
        imageUrl = (uploadRes as any)?.image_url || (uploadRes as any)?.url || '';
      }
      const termsList = terms ? terms.split(',').map(t => t.trim()).filter(Boolean) : [];
      await apiFetch('/admin/rewards', undefined, {
        method: 'POST',
        body: JSON.stringify({
          name, description: longDescription, points_cost: parseInt(pointsCost),
          reward_type: rewardType, is_active: true,
          short_description: shortDescription || undefined,
          long_description: longDescription || undefined,
          validity_days: parseInt(validityDays) || 30,
          terms: termsList.length > 0 ? termsList : undefined,
          image_url: imageUrl || undefined,
        }),
      });
      onClose();
    } catch { console.error('Failed to create reward'); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="arf-0">
        <label className="arf-1">Name</label>
        <input value={name} onChange={e => setName(e.target.value)} required />
      </div>
      <div className="arf-2">
        <label className="arf-3">Short Description</label>
        <input value={shortDescription} onChange={e => setShortDescription(e.target.value)} placeholder="Card summary text (shown on list)" />
      </div>
      <div className="arf-2">
        <label className="arf-3">Full Description</label>
        <textarea value={longDescription} onChange={e => setLongDescription(e.target.value)} placeholder="Detailed description for the detail page" rows={4} />
        <small style={{ color: '#6A7A8A', fontSize: 11, marginTop: 4, display: 'block' }}>Keep under ~100 words for best readability</small>
      </div>
      <div className="arf-4">
        <label className="arf-5">Points Cost</label>
        <input type="number" value={pointsCost} onChange={e => setPointsCost(e.target.value)} required />
      </div>
      <div className="arf-4">
        <label className="arf-5">Validity (days)</label>
        <input type="number" value={validityDays} onChange={e => setValidityDays(e.target.value)} />
      </div>
      <div className="arf-6">
        <label className="arf-7">Type</label>
        <select value={rewardType} onChange={e => setRewardType(e.target.value)}>
          <option value="free_item">Free Item</option>
          <option value="discount_voucher">Discount Voucher</option>
          <option value="custom">Custom</option>
        </select>
      </div>
      <div className="arf-2">
        <label className="arf-3">Terms &amp; Conditions</label>
        <input value={terms} onChange={e => setTerms(e.target.value)} placeholder="Comma-separated terms" />
        <small style={{ color: '#6A7A8A', fontSize: 11, marginTop: 4, display: 'block' }}>Separate each term with a comma. Each will be displayed as a bullet point.</small>
      </div>
      <div className="arf-2">
        <label className="arf-3">Image</label>
        <input type="file" accept="image/*" onChange={e => setImageFile(e.target.files?.[0] || null)} />
      </div>
      <button type="submit" className="btn btn-primary arf-8" disabled={saving}>
        {saving ? 'Creating...' : 'Create Reward'}
      </button>
    </form>
  );
}
