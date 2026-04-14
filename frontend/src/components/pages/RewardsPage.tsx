'use client';

import { useState, FormEvent, useRef } from 'react';
import { apiFetch } from '@/lib/merchant-api';

interface RewardsPageProps {
  rewards: any[];
  token: string;
  onRefresh: () => void;
}

export default function RewardsPage({ rewards, token, onRefresh }: RewardsPageProps) {
  const [showForm, setShowForm] = useState(false);
  const [editingReward, setEditingReward] = useState<any | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [error, setError] = useState('');

  function resetAndOpenCreate() {
    setEditingReward(null);
    setError('');
    setShowForm(true);
  }

  function openEdit(reward: any) {
    setEditingReward(reward);
    setError('');
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingReward(null);
    onRefresh();
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ margin: 0 }}>Rewards</h3>
        <button className="btn btn-primary" onClick={resetAndOpenCreate}>
          <i className="fas fa-plus"></i> New Reward
        </button>
      </div>

      {error && !showForm && (
        <div style={{ background: '#FEF2F2', color: '#991B1B', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          <i className="fas fa-exclamation-circle"></i> {error}
        </div>
      )}

      {showForm && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h4 style={{ margin: 0 }}>{editingReward ? 'Edit Reward' : 'New Reward'}</h4>
            <button className="btn btn-sm" onClick={() => { setShowForm(false); setEditingReward(null); setError(''); }}><i className="fas fa-times"></i></button>
          </div>
          <RewardForm
            token={token}
            existingReward={editingReward}
            onClose={closeForm}
          />
        </div>
      )}

      <div style={{ overflowX: 'auto', borderRadius: 20, background: 'white', border: '1px solid #ECF1F7' }}>
        <table>
          <thead>
            <tr><th>Image</th><th>Code</th><th>Name</th><th>Type</th><th>Points</th><th>Redeemed</th><th>Status</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {rewards.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', color: '#94A3B8', padding: 40 }}>
                <i className="fas fa-gift" style={{ fontSize: 40, display: 'block', marginBottom: 12 }}></i>
                No rewards configured
              </td></tr>
            ) : rewards.map(reward => (
              <tr key={reward.id}>
                <td>
                  {reward.image_url ? (
                    <img src={reward.image_url} alt="" style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 8 }} />
                  ) : (
                    <div style={{ width: 50, height: 50, background: '#F1F5F9', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: 18 }}>
                      <i className="fas fa-gift"></i>
                    </div>
                  )}
                </td>
                <td><span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 13 }}>{reward.code || '-'}</span></td>
                <td>
                  <div style={{ fontWeight: 600 }}>{reward.name}</div>
                  {reward.short_description && (
                    <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{reward.short_description}</div>
                  )}
                </td>
                <td style={{ textTransform: 'capitalize' }}>{(reward.reward_type || 'free_item').replace('_', ' ')}</td>
                <td><span className="badge badge-blue">{(reward.points_cost ?? 0).toLocaleString()} pts</span></td>
                <td>{reward.total_redeemed ?? 0}</td>
                <td>
                  <button className="btn btn-sm" onClick={async () => {
                    try {
                      await apiFetch(`/admin/rewards/${reward.id}`, token, {
                        method: 'PUT',
                        body: JSON.stringify({ is_active: !reward.is_active }),
                      });
                      onRefresh();
                    } catch (err: any) {
                      setError(err.message || 'Failed to toggle');
                    }
                  }} style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}>
                    <span className={`badge ${reward.is_active ? 'badge-green' : 'badge-gray'}`}>
                      {reward.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </button>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-sm" onClick={() => openEdit(reward)}><i className="fas fa-edit"></i></button>
                    {confirmDelete === reward.id ? (
                      <>
                        <button className="btn btn-sm" style={{ background: '#EF4444', color: 'white' }} onClick={async () => {
                          try {
                            await apiFetch(`/admin/rewards/${reward.id}`, token, { method: 'DELETE' });
                            setConfirmDelete(null);
                            onRefresh();
                          } catch (err: any) {
                            setError(err.message || 'Failed to delete');
                          }
                        }}>Confirm</button>
                        <button className="btn btn-sm" onClick={() => setConfirmDelete(null)}>Cancel</button>
                      </>
                    ) : (
                      <button className="btn btn-sm" style={{ color: '#EF4444' }} onClick={() => setConfirmDelete(reward.id)}>
                        <i className="fas fa-trash"></i>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface RewardFormProps {
  token: string;
  onClose: () => void;
  existingReward?: any | null;
}

function RewardForm({ token, onClose, existingReward }: RewardFormProps) {
  const isEdit = !!existingReward;
  const fileRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(existingReward?.name || '');
  const [code, setCode] = useState(existingReward?.code || '');
  const [shortDescription, setShortDescription] = useState(existingReward?.short_description || '');
  const [longDescription, setLongDescription] = useState(existingReward?.long_description || '');
  const [pointsCost, setPointsCost] = useState(String(existingReward?.points_cost ?? ''));
  const [rewardType, setRewardType] = useState(existingReward?.reward_type || 'free_item');
  const [stockLimit, setStockLimit] = useState(existingReward?.stock_limit != null ? String(existingReward.stock_limit) : '');
  const [imageUrl, setImageUrl] = useState(existingReward?.image_url || '');
  const [terms, setTerms] = useState(Array.isArray(existingReward?.terms) ? existingReward.terms.join('\n') : '');
  const [howToRedeem, setHowToRedeem] = useState(existingReward?.how_to_redeem || '');
  const [isActive, setIsActive] = useState(existingReward?.is_active ?? true);
  const [validityDays, setValidityDays] = useState(existingReward?.validity_days != null ? String(existingReward.validity_days) : '30');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/v1/upload/marketing-image', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      if (res.ok) {
        const data = await res.json();
        setImageUrl(data.url);
      }
    } catch {} finally { setUploading(false); }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const finalCode = code.trim() || `RWD-${Date.now()}`;

      const payload: Record<string, unknown> = {
        name,
        code: finalCode,
        short_description: shortDescription.trim(),
        long_description: longDescription.trim(),
        points_cost: parseInt(pointsCost) || 0,
        reward_type: rewardType,
        stock_limit: stockLimit.trim() !== '' ? parseInt(stockLimit) : null,
        validity_days: validityDays.trim() !== '' ? parseInt(validityDays) : 30,
        is_active: isActive,
      };

      if (imageUrl.trim()) {
        payload.image_url = imageUrl.trim();
      }

      const parsedTerms = terms.split('\n').map((t: string) => t.trim()).filter(Boolean);
      if (parsedTerms.length > 0) {
        payload.terms = parsedTerms;
      } else {
        payload.terms = [];
      }
      payload.how_to_redeem = howToRedeem.trim();

      const url = isEdit
        ? `/admin/rewards/${existingReward!.id}`
        : '/admin/rewards';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await apiFetch(url, token, {
        method,
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || `Failed (${res.status})`);
        return;
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && (
        <div style={{ background: '#FEF2F2', color: '#991B1B', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          <i className="fas fa-exclamation-circle"></i> {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div>
          <label style={labelStyle}>Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Free Coffee" />
        </div>
        <div>
          <label style={labelStyle}>Code <span style={{ color: '#94A3B8', fontWeight: 400 }}>(blank = auto)</span></label>
          <input value={code} onChange={e => setCode(e.target.value)} placeholder="RWD-{auto}" style={{ textTransform: 'uppercase' }} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div>
          <label style={labelStyle}>Points Cost *</label>
          <input type="number" min="0" value={pointsCost} onChange={e => setPointsCost(e.target.value)} required placeholder="e.g. 500" />
        </div>
        <div>
          <label style={labelStyle}>Reward Type *</label>
          <select value={rewardType} onChange={e => setRewardType(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 14 }}>
            <option value="free_item">Free Item</option>
            <option value="discount_voucher">Discount Voucher</option>
            <option value="custom">Custom</option>
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Short Description <span style={{ color: '#94A3B8', fontWeight: 400 }}>(shown on listing card, max ~80 chars)</span></label>
        <textarea value={shortDescription} onChange={e => setShortDescription(e.target.value)} placeholder="Brief summary shown on listing card..." rows={2} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 14, resize: 'vertical' }} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Detail Description <span style={{ color: '#94A3B8', fontWeight: 400 }}>(full content shown when customer taps to view details)</span></label>
        <textarea value={longDescription} onChange={e => setLongDescription(e.target.value)} placeholder="Full content shown when customer taps to view details..." rows={4} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 14, resize: 'vertical' }} />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Stock Limit</label>
        <input type="number" min="0" value={stockLimit} onChange={e => setStockLimit(e.target.value)} placeholder="Blank = unlimited" />
        <div style={hintStyle}>Leave blank for unlimited stock</div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Validity Days <span style={{ color: '#94A3B8', fontWeight: 400 }}>(after redemption)</span></label>
        <input type="number" min="1" value={validityDays} onChange={e => setValidityDays(e.target.value)} placeholder="30" />
        <div style={hintStyle}>How many days the reward is usable after customer redeems it</div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Terms &amp; Conditions</label>
        <textarea
          value={terms}
          onChange={e => setTerms(e.target.value)}
          placeholder="One per line. e.g. One per customer per day"
          rows={3}
          style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 14, resize: 'vertical' }}
        />
        <div style={hintStyle}>One term per line</div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>How to Redeem</label>
        <input value={howToRedeem} onChange={e => setHowToRedeem(e.target.value)} placeholder="e.g. Show this screen at checkout" />
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Image</label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <input type="file" ref={fileRef} accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
          <button type="button" className="btn btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
            {uploading ? 'Uploading...' : 'Upload Image'}
          </button>
          {imageUrl && (
            <>
              <img src={imageUrl} alt="" style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 6 }} />
              <button type="button" className="btn btn-sm" onClick={() => setImageUrl('')} style={{ color: '#EF4444' }}><i className="fas fa-times"></i></button>
            </>
          )}
        </div>
        <div style={hintStyle}>
          <i className="fas fa-info-circle" style={{ marginRight: 4 }}></i>
          Recommended: <strong>720 × 405 px (16:9)</strong> · WebP/PNG · Max 200 KB
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16 }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
        </button>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <div style={{ flex: 1 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
          <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} style={{ width: 16, height: 16 }} />
          Active
        </label>
      </div>
    </form>
  );
}

const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4, color: '#334155' };
const hintStyle: React.CSSProperties = { fontSize: 11, color: '#94A3B8', marginTop: 2 };
