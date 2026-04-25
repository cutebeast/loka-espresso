'use client';

import { useState, FormEvent } from 'react';
import { apiFetch } from '@/lib/merchant-api';
import type { MerchantLoyaltyTier } from '@/lib/merchant-types';
import { Modal, DataTable, Input } from '@/components/ui';


interface LoyaltyRulesPageProps {
  tiers: MerchantLoyaltyTier[];
  token: string;
  onRefresh: () => void;
}

// Human-readable benefits display
function BenefitsBadges({ benefits }: { benefits: Record<string, unknown> | null }) {
  if (!benefits) return <span className="bb-0">No benefits</span>;

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

  if (chips.length === 0) return <span className="bb-1">No benefits</span>;

  return (
    <div className="bb-2">
      {chips.map((chip, i) => (
        <span key={i} className="bb-3">{chip}</span>
      ))}
    </div>
  );
}

export default function LoyaltyRulesPage({ tiers, token, onRefresh }: LoyaltyRulesPageProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [editingTier, setEditingTier] = useState<MerchantLoyaltyTier | null>(null);

  return (
    <div>
      <div className="lrp-4">
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}><i className="fas fa-plus"></i> Add Tier</button>
      </div>

      {showAdd && (
        <div className="card lrp-5" >
          <TierForm
            title="New Tier"
            token={token}
            onClose={() => { setShowAdd(false); onRefresh(); }}
          />
        </div>
      )}

      {editingTier && (
        <Modal isOpen={!!editingTier} onClose={() => setEditingTier(null)} title={`Edit: ${editingTier.name}`}>
          <TierForm
            token={token}
            existingTier={editingTier}
            onClose={() => { setEditingTier(null); onRefresh(); }}
          />
        </Modal>
      )}

      <div className="lrp-6">
          <div className="lrp-7">
            <span className="lrp-8"><i className="fas fa-layer-group"></i></span>
            Showing <strong className="lrp-9">{tiers.length}</strong> loyalty tiers
          </div>
        </div>

        <div className="lrp-10">
          <DataTable<MerchantLoyaltyTier>
            data={tiers}
            columns={[
              { key: 'name', header: 'Tier Name', render: (t) => <span className="lrp-11">{t.name}</span> },
              { key: 'min_points', header: 'Min Points', render: (t) => `${t.min_points.toLocaleString()} pts` },
              { key: 'points_multiplier', header: 'Points Multiplier', render: (t) => <span className="badge badge-blue">{t.points_multiplier}x</span> },
              { key: 'sort_order', header: 'Sort Order', render: (t) => (
                <input
                  type="number"
                  min="0"
                  value={t.sort_order}
                  className="lrp-12"
                  onChange={async (e) => {
                    const val = parseInt(e.target.value) || 0;
                    await apiFetch(`/admin/loyalty-tiers/${t.id}`, undefined, {
                      method: 'PUT',
                      body: JSON.stringify({ sort_order: val }),
                    });
                    onRefresh();
                  }}
                />
              )},
              { key: 'benefits', header: 'Benefits', render: (t) => <BenefitsBadges benefits={t.benefits} /> },
              { key: 'actions', header: 'Actions', render: (t) => (
                <div className="lrp-13">
                  <button className="btn btn-sm" onClick={() => setEditingTier(t)}><i className="fas fa-edit"></i> Edit</button>
                  <button className="btn btn-sm lrp-14"  onClick={async () => {
                    if (confirm(`Delete tier "${t.name}"? This cannot be undone.`)) {
                      await apiFetch(`/admin/loyalty-tiers/${t.id}`, undefined, { method: 'DELETE' });
                      onRefresh();
                    }
                  }}><i className="fas fa-trash"></i></button>
                </div>
              )},
            ]}
            emptyMessage="No loyalty tiers configured"
          />
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

function TierForm({ token: _token, onClose, existingTier, title }: TierFormProps) {
  const isEdit = !!existingTier;
  const b = existingTier?.benefits as Record<string, any> | null;

  const [name, setName] = useState(existingTier?.name || '');
  const [minPoints, setMinPoints] = useState(String(existingTier?.min_points ?? ''));
  const [multiplier, setMultiplier] = useState(String(existingTier?.points_multiplier ?? '1.0'));
  const [sortOrder, setSortOrder] = useState(String(existingTier?.sort_order ?? '0'));
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
        sort_order: parseInt(sortOrder) || 0,
      };

      const url = isEdit
        ? `/admin/loyalty-tiers/${existingTier!.id}`
        : '/admin/loyalty-tiers';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await apiFetch(url, undefined, {
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
      {title && <h4 className="tf-15">{title}</h4>}
      {error && (
        <div className="tf-16">
          <i className="fas fa-exclamation-circle"></i> {error}
        </div>
      )}

      {/* ── Basic Info ── */}
      <div className="tf-17">
        <Input label="Tier Name *" value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Diamond" />
        <Input label="Min Points *" type="number" value={minPoints} onChange={e => setMinPoints(e.target.value)} required placeholder="e.g. 10000" />
        <Input label="Points Multiplier" type="number" step="0.1" value={multiplier} onChange={e => setMultiplier(e.target.value)} />
        <div>
          <Input label="Sort Order" type="number" min="0" value={sortOrder} onChange={e => setSortOrder(e.target.value)} placeholder="0" />
          <div className="form-hint">Lower values appear first</div>
        </div>
      </div>

      <div className="tf-18">
        <div className="tf-19">
          <span className="tf-20"><i className="fas fa-gift"></i></span> Tier Benefits
        </div>

        <div className="tf-21">
          <div>
            <Input label="Discount (%)" type="number" min="0" max="100" value={discount} onChange={e => setDiscount(e.target.value)} placeholder="0" />
            <div className="form-hint">Percentage off all orders</div>
          </div>
          <div>
            <Input label="Free Deliveries / Month" type="number" min="0" value={freeDelivery} onChange={e => setFreeDelivery(e.target.value)} placeholder="0" />
            <div className="form-hint">Number of free deliveries each month</div>
          </div>
        </div>

        <div className="tf-22">
          <div>
            <Input label="Birthday Reward" value={birthdayReward} onChange={e => setBirthdayReward(e.target.value)} placeholder="e.g. Free drink" />
            <div className="form-hint">Special reward on customer&apos;s birthday</div>
          </div>
          <div className="tf-23">
            <label className="tf-24">
              <input type="checkbox" checked={priorityQueue} onChange={e => setPriorityQueue(e.target.checked)} className="tf-25" />
              Priority Queue
            </label>
            <label className="tf-26">
              <input type="checkbox" checked={exclusiveOffers} onChange={e => setExclusiveOffers(e.target.checked)} className="tf-27" />
              Exclusive Offers
            </label>
          </div>
        </div>
      </div>

      <div className="tf-28">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving...' : isEdit ? 'Update Tier' : 'Create Tier'}
        </button>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
}

