'use client';

import React, { useState, useEffect, useCallback, FormEvent, useRef } from 'react';
import { apiFetch, apiUpload, cacheBust } from '@/lib/merchant-api';
import { Select, Pagination, Drawer } from '@/components/ui';
import { THEME } from '@/lib/theme';

interface RewardsPageProps {
  token: string;
}

const PAGE_SIZE = 20;

export default function RewardsPage({ token }: RewardsPageProps) {
  // List state
  const [rewards, setRewards] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  // View mode: 'list' or 'form'
  const [viewMode, setViewMode] = useState<'list' | 'form'>('list');
  const [editingReward, setEditingReward] = useState<any | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchRewards = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), page_size: String(PAGE_SIZE) });
      const res = await apiFetch(`/admin/rewards?${params}`, token);
      if (res.ok) {
        const data = await res.json();
        setRewards(data.rewards || []);
        setTotal(data.total || 0);
        setTotalPages(data.total_pages || 1);
        setPage(p);
      }
    } catch {} finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchRewards(1); }, [fetchRewards]);

  function openCreate() {
    setEditingReward(null);
    setViewMode('form');
    setDrawerOpen(true);
  }

  function openEdit(reward: any) {
    setEditingReward(reward);
    setViewMode('form');
    setDrawerOpen(true);
  }

  function closeForm() {
    setDrawerOpen(false);
    setViewMode('list');
    setEditingReward(null);
    fetchRewards(page);
  }

  async function toggleActive(reward: any) {
    try {
      await apiFetch(`/admin/rewards/${reward.id}`, token, {
        method: 'PUT',
        body: JSON.stringify({ is_active: !reward.is_active }),
      });
      fetchRewards(page);
    } catch {}
  }

  async function handleDelete(id: number) {
    try {
      await apiFetch(`/admin/rewards/${id}`, token, { method: 'DELETE' });
      setConfirmDelete(null);
      fetchRewards(page);
    } catch {}
  }

  const drawerTitle = editingReward ? 'Edit Reward' : 'New Reward';

  return (
    <div>
      <Drawer isOpen={drawerOpen} onClose={closeForm} title={drawerTitle} width={560}>
        {viewMode === 'form' && (
          <RewardFormPage token={token} existingReward={editingReward} onBack={closeForm} />
        )}
      </Drawer>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 20 }}>
        <button className="btn btn-primary" onClick={openCreate}>
          <i className="fas fa-plus"></i> New Reward
        </button>
      </div>

      {/* Stats Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 16px',
        background: THEME.bgMuted,
        borderRadius: `${THEME.radius.md} ${THEME.radius.md} 0 0`,
        border: `1px solid ${THEME.border}`,
        borderBottom: 'none',
        marginTop: 20,
      }}>
        <div style={{ fontSize: 14, color: THEME.textSecondary }}>
          <i className="fas fa-gift" style={{ marginRight: 8, color: THEME.primary }}></i>
          Showing <strong style={{ color: THEME.textPrimary }}>{rewards.length}</strong> of <strong style={{ color: THEME.textPrimary }}>{total}</strong> rewards
        </div>
        <div style={{ fontSize: 13, color: THEME.textMuted }}>
          Page {page} of {totalPages}
        </div>
      </div>

      {loading && rewards.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, color: THEME.textMuted }}><i className="fas fa-spinner fa-spin"></i> Loading...</div>
      ) : rewards.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: 60, color: THEME.textMuted }}>
          <i className="fas fa-gift" style={{ fontSize: 40, marginBottom: 16 }}></i>
          <p>No rewards configured</p>
        </div>
      ) : (
        <div style={{
          overflowX: 'auto',
          borderRadius: `0 0 ${THEME.radius.md} ${THEME.radius.md}`,
          background: THEME.bgCard,
          border: `1px solid ${THEME.border}`,
          borderTop: 'none',
        }}>
          <table>
            <thead>
              <tr><th>Image</th><th>Code</th><th>Name</th><th>Type</th><th>Points</th><th>Redeemed</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {rewards.map(reward => (
                <tr key={reward.id}>
                  <td>
                    {reward.image_url ? (
                      <img src={cacheBust(reward.image_url)} alt="" style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 8 }} />
                    ) : (
                      <div style={{ width: 50, height: 50, background: THEME.bgMuted, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: THEME.success, fontSize: 18 }}>
                        <i className="fas fa-gift"></i>
                      </div>
                    )}
                  </td>
                  <td><span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: 13 }}>{reward.code || '-'}</span></td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{reward.name}</div>
                    {reward.short_description && (
                      <div style={{ fontSize: 12, color: THEME.success, marginTop: 2 }}>{reward.short_description}</div>
                    )}
                  </td>
                  <td style={{ textTransform: 'capitalize' }}>{(reward.reward_type || 'free_item').replace('_', ' ')}</td>
                  <td><span className="badge badge-blue">{(reward.points_cost ?? 0).toLocaleString()} pts</span></td>
                  <td>{reward.total_redeemed ?? 0}</td>
                  <td>
                    <button className="btn btn-sm" onClick={() => toggleActive(reward)} style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}>
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
                          <button className="btn btn-sm" style={{ background: '#EF4444', color: 'white' }} onClick={() => handleDelete(reward.id)}>Confirm</button>
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
      )}

      <Pagination page={page} totalPages={totalPages} onPageChange={fetchRewards} loading={loading} />
    </div>
  );
}

// ── Separate Form Page ────────────────────────────────────────────────────────

function RewardFormPage({ token, existingReward, onBack }: { token: string; existingReward: any | null; onBack: () => void }) {
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
  const [minSpend, setMinOrder] = useState(existingReward?.min_spend != null ? String(existingReward.min_spend) : '0');
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
      const res = await apiUpload('/upload/marketing-image', token, fd);
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
        name, code: finalCode,
        short_description: shortDescription.trim(),
        long_description: longDescription.trim(),
        points_cost: parseInt(pointsCost) || 0,
        reward_type: rewardType,
        stock_limit: stockLimit.trim() !== '' ? parseInt(stockLimit) : null,
        validity_days: validityDays.trim() !== '' ? parseInt(validityDays) : 30,
        min_spend: parseFloat(minSpend) || 0,
        is_active: isActive,
      };
      if (imageUrl.trim()) payload.image_url = imageUrl.trim();
      const parsedTerms = terms.split('\n').map((t: string) => t.trim()).filter(Boolean);
      payload.terms = parsedTerms.length > 0 ? parsedTerms : [];
      payload.how_to_redeem = howToRedeem.trim();

      const url = isEdit ? `/admin/rewards/${existingReward!.id}` : '/admin/rewards';
      const method = isEdit ? 'PUT' : 'POST';
      const res = await apiFetch(url, token, { method, body: JSON.stringify(payload) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || `Failed (${res.status})`);
        return;
      }
      onBack();
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally { setSaving(false); }
  }

  return (
    <div>
      <div className="card">
        {error && (
          <div style={{ background: '#FEE2E2', color: '#A83232', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
            <i className="fas fa-exclamation-circle"></i> {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Free Coffee" />
            </div>
            <div>
              <label style={labelStyle}>Code <span style={{ color: THEME.success, fontWeight: 400 }}>(blank = auto)</span></label>
              <input value={code} onChange={e => setCode(e.target.value)} placeholder="RWD-{auto}" style={{ textTransform: 'uppercase' }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Points Cost *</label>
              <input type="number" min="0" value={pointsCost} onChange={e => setPointsCost(e.target.value)} required placeholder="e.g. 500" />
              <div style={hintStyle}>Loyalty points customer spends to redeem this reward</div>
            </div>
            <div>
              <label style={labelStyle}>Reward Type *</label>
              <Select
                value={rewardType}
                onChange={(val) => setRewardType(val)}
                options={[
                  { value: 'free_item', label: 'Free Item' },
                  { value: 'discount_voucher', label: 'Discount Voucher' },
                  { value: 'custom', label: 'Custom' },
                ]}
              />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Short Description</label>
            <textarea value={shortDescription} onChange={e => setShortDescription(e.target.value)} placeholder="Brief summary..." rows={2} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${THEME.accentLight}`, fontSize: 14, resize: 'vertical' }} />
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Detail Description</label>
            <textarea value={longDescription} onChange={e => setLongDescription(e.target.value)} placeholder="Full content shown when customer taps to view details..." rows={4} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${THEME.accentLight}`, fontSize: 14, resize: 'vertical' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Stock Limit</label>
              <input type="number" min="0" value={stockLimit} onChange={e => setStockLimit(e.target.value)} placeholder="Blank = unlimited" />
              <div style={hintStyle}>Leave blank for unlimited stock</div>
            </div>
            <div>
              <label style={labelStyle}>Validity Days <span style={{ color: THEME.success, fontWeight: 400 }}>(after redemption)</span></label>
              <input type="number" min="1" value={validityDays} onChange={e => setValidityDays(e.target.value)} placeholder="30" />
            </div>
            <div>
              <label style={labelStyle}>Min Spend (RM) <span style={{ color: THEME.success, fontWeight: 400 }}>(optional)</span></label>
              <input type="number" min="0" step="0.01" value={minSpend} onChange={e => setMinOrder(e.target.value)} placeholder="0" />
              <div style={hintStyle}>Minimum spend to use this reward. 0 = no minimum.</div>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Terms &amp; Conditions</label>
            <textarea value={terms} onChange={e => setTerms(e.target.value)} placeholder="One per line" rows={3} style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${THEME.accentLight}`, fontSize: 14, resize: 'vertical' }} />
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
            <div style={hintStyle}><i className="fas fa-info-circle" style={{ marginRight: 4 }}></i>Recommended: <strong>720 × 405 px (16:9)</strong> · WebP/PNG · Max 200 KB</div>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 16 }}>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
            </button>
            <button type="button" className="btn" onClick={onBack}>Cancel</button>
            <div style={{ flex: 1 }} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
              <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} style={{ width: 16, height: 16 }} />
              Active
            </label>
          </div>
        </form>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4, color: THEME.primary };
const hintStyle: React.CSSProperties = { fontSize: 11, color: THEME.success, marginTop: 2 };
