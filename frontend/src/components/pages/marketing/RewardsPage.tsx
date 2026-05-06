'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { apiFetch, apiUpload, cacheBust } from '@/lib/merchant-api';
import { Select, Drawer, DataTable, type ColumnDef } from '@/components/ui';
import { useToastStore } from '@/stores/toastStore';

interface RewardItem {
  id: number;
  code: string | null;
  name: string;
  short_description: string | null;
  long_description: string | null;
  image_url: string | null;
  reward_type: string;
  points_cost: number;
  total_redeemed: number;
  is_active: boolean;
  stock_limit: number | null;
  validity_days: number | null;
  min_spend: number | null;
  terms: string[] | null;
  how_to_redeem: string | null;
  created_at?: string;
  updated_at?: string;
}

const PAGE_SIZE = 20;

export default function RewardsPage() {
  const [rewards, setRewards] = useState<RewardItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [error, setError] = useState('');

  const [viewMode, setViewMode] = useState<'list' | 'form'>('list');
  const [editingReward, setEditingReward] = useState<RewardItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchRewards = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), page_size: String(PAGE_SIZE) });
      const res = await apiFetch(`/admin/rewards?${params}`);
      if (res.ok) {
        const data = await res.json();
        setRewards(data.items || []);
        setTotal(data.total || 0);
        setTotalPages(data.total_pages || 1);
        setPage(p);
      }
    } catch { console.error('Failed to load rewards'); setError('Failed to load rewards'); setRewards([]); setTotal(0); setTotalPages(1); } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchRewards(1); }, [fetchRewards]);

  function openCreate() {
    setEditingReward(null);
    setViewMode('form');
    setDrawerOpen(true);
  }

  function openEdit(reward: RewardItem) {
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

  async function toggleActive(reward: RewardItem) {
    try {
      await apiFetch(`/admin/rewards/${reward.id}`, undefined, {
        method: 'PUT',
        body: JSON.stringify({ is_active: !reward.is_active }),
      });
      fetchRewards(page);
    } catch { console.error('Failed to toggle reward status'); setError('Failed to toggle reward status'); }
  }

  async function handleDelete(id: number) {
    try {
      await apiFetch(`/admin/rewards/${id}`, undefined, { method: 'DELETE' });
      setConfirmDelete(null);
      fetchRewards(page);
    } catch { console.error('Failed to delete reward'); setError('Failed to delete reward'); setConfirmDelete(null); }
  }

  const columns: ColumnDef<RewardItem>[] = [
    {
      key: 'image',
      header: 'Image',
      width: '70px',
      render: (row) => (
        row.image_url ? (
          <img src={cacheBust(row.image_url)} alt="" style={{ width: 48, height: 48, borderRadius: 6, objectFit: 'cover' }} onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
        ) : (
          <div style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f0f0', borderRadius: 6 }}>
            <i className="fas fa-gift" style={{ color: '#999' }}></i>
          </div>
        )
      ),
    },
    {
      key: 'name',
      header: 'Name',
      render: (row) => (
        <div>
          <div className="rp-16">{row.name}</div>
          {row.short_description && (
            <div className="rp-17">{row.short_description}</div>
          )}
        </div>
      ),
    },
    {
      key: 'points',
      header: 'Points',
      render: (row) => (
        <span className="badge badge-blue">{(row.points_cost ?? 0).toLocaleString()} pts</span>
      ),
    },
    {
      key: 'type',
      header: 'Type',
      render: (row) => (
        <span className="rp-18">{(row.reward_type || 'free_item').replace('_', ' ')}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (row) => (
        <div className="rp-20">
          <button className="btn btn-sm" onClick={() => toggleActive(row)} title={row.is_active ? 'Active — click to deactivate' : 'Inactive — click to activate'}>
            <i className={`fas ${row.is_active ? 'fa-toggle-on' : 'fa-toggle-off'}`} style={{ fontSize: 20, color: row.is_active ? '#16A34A' : '#9CA3AF' }}></i>
          </button>
          <button className="btn btn-sm" onClick={() => openEdit(row)}><i className="fas fa-edit"></i></button>
          {confirmDelete === row.id ? (
            <>
              <button className="btn btn-sm rp-21" onClick={() => handleDelete(row.id)}>Confirm</button>
              <button className="btn btn-sm" onClick={() => setConfirmDelete(null)}>Cancel</button>
            </>
          ) : (
            <button className="btn btn-sm rp-22" onClick={() => setConfirmDelete(row.id)}>
              <i className="fas fa-trash"></i>
            </button>
          )}
        </div>
      ),
    },
  ];

  const drawerTitle = editingReward ? 'Edit Reward' : 'New Reward';

  return (
    <div>
      <Drawer isOpen={drawerOpen} onClose={closeForm} title={drawerTitle} >
        {viewMode === 'form' && (
          <RewardFormPage existingReward={editingReward} onBack={closeForm} />
        )}
      </Drawer>

      {error && (
        <div className="badge badge-red rp-0" >
          <span className="rp-1"><i className="fas fa-exclamation-circle"></i></span> {error}
        </div>
      )}
      <div className="rp-2">
        <button className="btn btn-primary" onClick={openCreate}>
          <i className="fas fa-plus"></i> New Reward
        </button>
      </div>

      <div className="rp-3">
        <div className="rp-4">
          <span className="rp-5"><i className="fas fa-gift"></i></span>
          Showing <strong className="rp-6">{rewards.length}</strong> of <strong className="rp-7">{total}</strong> rewards
        </div>
        <div className="rp-8">
          Page {page} of {totalPages}
        </div>
      </div>

      <DataTable
        data={rewards}
        columns={columns}
        loading={loading}
        emptyMessage="No rewards configured"
        pagination={{ page, pageSize: PAGE_SIZE, total, onPageChange: fetchRewards }}
      />
    </div>
  );
}

// ── Separate Form Page ────────────────────────────────────────────────────────

function RewardFormPage({ existingReward, onBack }: { existingReward: RewardItem | null; onBack: () => void }) {
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
      const res = await apiUpload('/upload/reward-image', fd);
      if (res.ok) {
        const data = await res.json();
        setImageUrl(data.url);
      }
    } catch { console.error('Image upload failed'); setError('Image upload failed'); } finally { setUploading(false); }
  }

  async function handleSubmit() {
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
      const res = await apiFetch(url, undefined, { method, body: JSON.stringify(payload) });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || `Failed (${res.status})`);
        return;
      }
      useToastStore.getState().showToast('Reward saved');
      onBack();
    } catch (err: unknown) {
      console.error('Failed to save reward', err);
      setError(err instanceof Error ? err.message : 'Network error');
    } finally { setSaving(false); }
  }

  return (
    <div>
      <div className="card">
        {error && (
          <div className="rfp-23">
            <i className="fas fa-exclamation-circle"></i> {error}
          </div>
        )}

        <div>
          <div className="rfp-24">
            <div>
              <label className="rp-label">Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Free Coffee" />
            </div>
            <div>
              <label className="rp-label">Code <span className="rfp-25">(blank = auto)</span></label>
              <input value={code} onChange={e => setCode(e.target.value)} placeholder="RWD-{auto}" className="rfp-26" />
            </div>
          </div>

          <div className="rfp-27">
            <div>
              <label className="rp-label">Points Cost *</label>
              <input type="number" min="0" value={pointsCost} onChange={e => setPointsCost(e.target.value)} required placeholder="e.g. 500" />
              <div className="rp-hint">Loyalty points customer spends to redeem this reward</div>
            </div>
            <div>
              <label className="rp-label">Reward Type *</label>
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

          <div className="rfp-28">
            <label className="rp-label">Short Description</label>
            <textarea value={shortDescription} onChange={e => setShortDescription(e.target.value)} placeholder="Brief summary..." rows={2} className="rfp-29" />
          </div>

          <div className="rfp-30">
            <label className="rp-label">Detail Description</label>
            <textarea value={longDescription} onChange={e => setLongDescription(e.target.value)} placeholder="Full content shown when customer taps to view details..." rows={4} className="rfp-31" />
          </div>

          <div className="rfp-32">
            <div>
              <label className="rp-label">Stock Limit</label>
              <input type="number" min="0" value={stockLimit} onChange={e => setStockLimit(e.target.value)} placeholder="Blank = unlimited" />
              <div className="rp-hint">Leave blank for unlimited stock</div>
            </div>
            <div>
              <label className="rp-label">Validity Days <span className="rfp-33">(after redemption)</span></label>
              <input type="number" min="1" value={validityDays} onChange={e => setValidityDays(e.target.value)} placeholder="30" />
            </div>
            <div>
              <label className="rp-label">Min Spend (RM) <span className="rfp-34">(optional)</span></label>
              <input type="number" min="0" step="0.01" value={minSpend} onChange={e => setMinOrder(e.target.value)} placeholder="0" />
              <div className="rp-hint">Minimum spend to use this reward. 0 = no minimum.</div>
            </div>
          </div>

          <div className="rfp-35">
            <label className="rp-label">Terms &amp; Conditions</label>
            <textarea value={terms} onChange={e => setTerms(e.target.value)} placeholder="One per line" rows={3} className="rfp-36" />
          </div>

          <div className="rfp-37">
            <label className="rp-label">How to Redeem</label>
            <input value={howToRedeem} onChange={e => setHowToRedeem(e.target.value)} placeholder="e.g. Show this screen at checkout" />
          </div>

          <div className="rfp-38">
            <label className="rp-label">Image</label>
            <div className="rfp-39">
              <input type="file" ref={fileRef} accept="image/*" onChange={handleImageUpload} className="rfp-40" />
              <button className="btn btn-sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? 'Uploading...' : 'Upload Image'}
              </button>
              {imageUrl && (
                <>
                  <img src={imageUrl} alt="" width={40} height={40} className="rfp-41" style={{ borderRadius: 4, objectFit: 'cover' }} />
                  <button className="btn btn-sm rfp-42" onClick={() => setImageUrl('')} ><i className="fas fa-times"></i></button>
                </>
              )}
            </div>
            <div className="rp-hint"><span className="rfp-43"><i className="fas fa-info-circle"></i></span>Recommended: <strong>720 × 405 px (16:9)</strong> · WebP/PNG · Max 200 KB</div>
          </div>

          <div className="df-actions">
            <label className="rfp-46" style={{ marginRight: 'auto' }}>
              <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} className="rfp-47" />
              Active
            </label>
            <button className="btn" onClick={onBack}>Cancel</button>
            <button onClick={handleSubmit} className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : isEdit ? 'Update' : 'Create'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
