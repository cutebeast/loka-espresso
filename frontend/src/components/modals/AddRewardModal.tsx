'use client';

import { useState, FormEvent } from 'react';
import { apiFetch } from '@/lib/merchant-api';

export function AddRewardForm({ token: _token, onClose }: { token: string; onClose: () => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [pointsCost, setPointsCost] = useState('');
  const [rewardType, setRewardType] = useState('free_item');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/admin/rewards', undefined, {
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
      <div className="arf-0">
        <label className="arf-1">Name</label>
        <input value={name} onChange={e => setName(e.target.value)} required />
      </div>
      <div className="arf-2">
        <label className="arf-3">Description</label>
        <input value={description} onChange={e => setDescription(e.target.value)} />
      </div>
      <div className="arf-4">
        <label className="arf-5">Points Cost</label>
        <input type="number" value={pointsCost} onChange={e => setPointsCost(e.target.value)} required />
      </div>
      <div className="arf-6">
        <label className="arf-7">Type</label>
        <select value={rewardType} onChange={e => setRewardType(e.target.value)}>
          <option value="free_item">Free Item</option>
          <option value="discount_voucher">Discount Voucher</option>
          <option value="custom">Custom</option>
        </select>
      </div>
      <button type="submit" className="btn btn-primary arf-8"  disabled={saving}>
        {saving ? 'Creating...' : 'Create Reward'}
      </button>
    </form>
  );
}
