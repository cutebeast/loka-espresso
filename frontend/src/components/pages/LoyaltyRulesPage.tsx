'use client';

import { useState, FormEvent } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import type { MerchantLoyaltyTier } from '@/lib/merchant-types';

interface LoyaltyRulesPageProps {
  tiers: MerchantLoyaltyTier[];
  token: string;
  onRefresh: () => void;
}

// Human-readable benefits display
function BenefitsBadges({ benefits }: { benefits: Record<string, unknown> | null }) {
  if (!benefits) return <span style={{ color: '#94A3B8' }}>No benefits</span>;

  const b = benefits as Record<string, any>;
  const chips: string[] = [];
  if (b.discount && Number(b.discount) > 0) chips.push(`${b.discount}% off`);
  if (b.free_delivery_per_month && Number(b.free_delivery_per_month) > 0) chips.push(`${b.free_delivery_per_month} free deliveries/mo`);
  if (b.priority_queue) chips.push('Priority queue');
  if (b.birthday_reward) chips.push(`Birthday: ${b.birthday_reward}`);
  if (b.exclusive_offers) chips.push('Exclusive offers');

  // Catch any custom keys we don't explicitly render
  const knownKeys = new Set(['discount', 'free_delivery_per_month', 'priority_queue', 'birthday_reward', 'exclusive_offers']);
  const extraKeys = Object.keys(b).filter(k => !knownKeys.has(k));
  for (const k of extraKeys) {
    if (b[k] !== null && b[k] !== undefined && b[k] !== false && b[k] !== 0 && b[k] !== '') {
      chips.push(`${k}: ${b[k]}`);
    }
  }

  if (chips.length === 0) return <span style={{ color: '#94A3B8' }}>No benefits</span>;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
      {chips.map((chip, i) => (
        <span key={i} style={{ background: '#EFF6FF', color: '#1E40AF', fontSize: 11, padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap' }}>{chip}</span>
      ))}
    </div>
  );
}

export default function LoyaltyRulesPage({ tiers, token, onRefresh }: LoyaltyRulesPageProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingTier, setEditingTier] = useState<MerchantLoyaltyTier | null>(null);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3>Loyalty Tiers</h3>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}><i className="fas fa-plus"></i> Add Tier</button>
      </div>

      {showAdd && (
        <div className="card" style={{ marginBottom: 20 }}>
          <TierForm
            title="New Tier"
            token={token}
            onClose={() => { setShowAdd(false); onRefresh(); }}
          />
        </div>
      )}

      {editingTier && (
        <div className="modal-overlay" onClick={() => setEditingTier(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3>Edit: {editingTier.name}</h3>
              <button className="btn btn-sm" onClick={() => setEditingTier(null)}><i className="fas fa-times"></i></button>
            </div>
            <TierForm
              token={token}
              existingTier={editingTier}
              onClose={() => { setEditingTier(null); onRefresh(); }}
            />
          </div>
        </div>
      )}

      <div style={{ overflowX: 'auto', borderRadius: 20, background: 'white', border: '1px solid #ECF1F7' }}>
        <table>
          <thead>
            <tr><th>Tier Name</th><th>Min Points</th><th>Points Multiplier</th><th>Benefits</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {tiers.length === 0 ? (
              <tr><td colSpan={5} style={{ textAlign: 'center', color: '#94A3B8', padding: 40 }}>No loyalty tiers configured</td></tr>
            ) : tiers.map(tier => (
              <tr key={tier.id}>
                <td style={{ fontWeight: 600, textTransform: 'capitalize' }}>{tier.name}</td>
                <td>{tier.min_points.toLocaleString()} pts</td>
                <td><span className="badge badge-blue">{tier.points_multiplier}x</span></td>
                <td><BenefitsBadges benefits={tier.benefits} /></td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-sm" onClick={() => setEditingTier(tier)}><i className="fas fa-edit"></i> Edit</button>
                    <button className="btn btn-sm" style={{ color: '#EF4444' }} onClick={async () => {
                      if (confirm(`Delete tier "${tier.name}"? This cannot be undone.`)) {
                        await apiFetch(`/admin/loyalty-tiers/${tier.id}`, token, { method: 'DELETE' });
                        onRefresh();
                      }
                    }}><i className="fas fa-trash"></i></button>
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

// ── Shared Tier Form with structured benefit fields ──────────────────────
interface TierFormProps {
  token: string;
  onClose: () => void;
  existingTier?: MerchantLoyaltyTier;
  title?: string;
}

function TierForm({ token, onClose, existingTier, title }: TierFormProps) {
  const isEdit = !!existingTier;
  const b = existingTier?.benefits as Record<string, any> | null;

  const [name, setName] = useState(existingTier?.name || '');
  const [minPoints, setMinPoints] = useState(String(existingTier?.min_points ?? ''));
  const [multiplier, setMultiplier] = useState(String(existingTier?.points_multiplier ?? '1.0'));
  const [discount, setDiscount] = useState(String(b?.discount ?? '0'));
  const [freeDelivery, setFreeDelivery] = useState(String(b?.free_delivery_per_month ?? '0'));
  const [priorityQueue, setPriorityQueue] = useState(!!b?.priority_queue);
  const [birthdayReward, setBirthdayReward] = useState(String(b?.birthday_reward ?? ''));
  const [exclusiveOffers, setExclusiveOffers] = useState(!!b?.exclusive_offers);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const benefits: Record<string, any> = {};
      benefits.discount = parseFloat(discount) || 0;
      benefits.free_delivery_per_month = parseInt(freeDelivery) || 0;
      benefits.priority_queue = priorityQueue;
      if (birthdayReward.trim()) benefits.birthday_reward = birthdayReward.trim();
      benefits.exclusive_offers = exclusiveOffers;

      const payload = {
        name,
        min_points: parseInt(minPoints) || 0,
        points_multiplier: parseFloat(multiplier) || 1.0,
        benefits,
      };

      const url = isEdit
        ? `/admin/loyalty-tiers/${existingTier!.id}`
        : '/admin/loyalty-tiers';
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
      {title && <h4 style={{ marginBottom: 16 }}>{title}</h4>}
      {error && (
        <div style={{ background: '#FEF2F2', color: '#991B1B', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          <i className="fas fa-exclamation-circle"></i> {error}
        </div>
      )}

      {/* ── Basic Info ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
        <div>
          <label style={labelStyle}>Tier Name *</label>
          <input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Diamond" />
        </div>
        <div>
          <label style={labelStyle}>Min Points *</label>
          <input type="number" value={minPoints} onChange={e => setMinPoints(e.target.value)} required placeholder="e.g. 10000" />
        </div>
        <div>
          <label style={labelStyle}>Points Multiplier</label>
          <input type="number" step="0.1" value={multiplier} onChange={e => setMultiplier(e.target.value)} />
        </div>
      </div>

      {/* ── Benefits ── */}
      <div style={{ border: '1px solid #E9ECF2', borderRadius: 14, padding: 16, marginBottom: 16 }}>
        <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14, color: '#002F6C' }}>
          <i className="fas fa-gift" style={{ marginRight: 6 }}></i> Tier Benefits
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>Discount (%)</label>
            <input type="number" min="0" max="100" value={discount} onChange={e => setDiscount(e.target.value)} placeholder="0" />
            <div style={hintStyle}>Percentage off all orders</div>
          </div>
          <div>
            <label style={labelStyle}>Free Deliveries / Month</label>
            <input type="number" min="0" value={freeDelivery} onChange={e => setFreeDelivery(e.target.value)} placeholder="0" />
            <div style={hintStyle}>Number of free deliveries each month</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={labelStyle}>Birthday Reward</label>
            <input value={birthdayReward} onChange={e => setBirthdayReward(e.target.value)} placeholder="e.g. Free drink" />
            <div style={hintStyle}>Special reward on customer's birthday</div>
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', paddingTop: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
              <input type="checkbox" checked={priorityQueue} onChange={e => setPriorityQueue(e.target.checked)} style={{ width: 16, height: 16 }} />
              Priority Queue
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
              <input type="checkbox" checked={exclusiveOffers} onChange={e => setExclusiveOffers(e.target.checked)} style={{ width: 16, height: 16 }} />
              Exclusive Offers
            </label>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving...' : isEdit ? 'Update Tier' : 'Create Tier'}
        </button>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
}

const labelStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 4, color: '#334155' };
const hintStyle: React.CSSProperties = { fontSize: 11, color: '#94A3B8', marginTop: 2 };
