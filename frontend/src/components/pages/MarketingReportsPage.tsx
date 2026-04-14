'use client'

import { useEffect, useState, useCallback } from 'react'
import { apiFetch } from '@/lib/merchant-api'
import { DonutChart } from '@/components/charts'

interface MarketingReportsPageProps {
  token: string
  stores: any[]
  selectedStore: string
}

type DatePreset = '7D' | '30D' | 'MTD' | 'LAST_MONTH'

interface TopItems { [key: string]: number }
interface StoreFeedback { count: number; avg_rating: number }

interface MarketingData {
  period: { from: string; to: string }
  rewards: {
    total: number; active: number; total_redemptions: number; top_redeemed: TopItems
  }
  vouchers: {
    total: number; active: number; total_usages: number; top_used: TopItems
  }
  feedback: {
    total: number; average_rating: number; resolved: number; unreplied: number
    rating_distribution: { [rating: string]: number }
    by_store: { [storeName: string]: StoreFeedback }
  }
  loyalty: {
    total_members: number; tier_distribution: { [tier: string]: number }
    points_issued: number; points_redeemed: number
  }
}

/* ── Helpers ── */

function calcRange(preset: DatePreset): { from: string; to: string } {
  const now = new Date()
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59)
  let from: Date
  switch (preset) {
    case '7D':
      from = new Date(to); from.setDate(from.getDate() - 6); from.setHours(0, 0, 0, 0); break
    case '30D':
      from = new Date(to); from.setDate(from.getDate() - 29); from.setHours(0, 0, 0, 0); break
    case 'MTD':
      from = new Date(now.getFullYear(), now.getMonth(), 1); break
    case 'LAST_MONTH': {
      const lm = new Date(now.getFullYear(), now.getMonth(), 0)
      from = new Date(lm.getFullYear(), lm.getMonth(), 1)
      to.setTime(lm.getTime()); to.setHours(23, 59, 59, 0); break
    }
    default:
      from = new Date(to); from.setDate(from.getDate() - 29); from.setHours(0, 0, 0, 0)
  }
  return { from: from.toISOString().split('T')[0], to: to.toISOString().split('T')[0] }
}

function ratingColor(r: number): string {
  return r >= 4 ? '#22C55E' : r >= 3 ? '#F59E0B' : '#EF4444'
}

const COLORS = ['#002F6C', '#059669', '#EA580C', '#7C3AED', '#DB2777', '#0891B2', '#4F46E5', '#DC2626', '#65A30D', '#CA8A04']
const TIER_COLORS: Record<string, string> = {
  bronze: '#CD7F32', silver: '#94A3B8', gold: '#EAB308', platinum: '#3B82F6', diamond: '#06B6D4',
}
const TIER_ORDER = ['platinum', 'gold', 'silver', 'bronze']

const PRESETS: { label: string; value: DatePreset }[] = [
  { label: '7D', value: '7D' },
  { label: '30D', value: '30D' },
  { label: 'MTD', value: 'MTD' },
  { label: 'Last Month', value: 'LAST_MONTH' },
]

const PREVIEW_COUNT = 3

/* ── Sub-components ── */

function BarRow({ label, value, max, color, right }: {
  label: string; value: number; max: number; color: string; right?: React.ReactNode
}) {
  const p = max > 0 ? (value / max) * 100 : 0
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
        <span style={{ fontWeight: 500, color: '#334155' }}>{label}</span>
        {right || <span style={{ color: '#64748B', fontWeight: 600 }}>{value}</span>}
      </div>
      <div style={{ height: 6, background: '#F1F5F9', borderRadius: 10 }}>
        <div style={{ height: 6, background: color, borderRadius: 10, width: `${p}%`, transition: 'width 0.3s' }} />
      </div>
    </div>
  )
}

function Modal({ title, onClose, children }: {
  title: string; onClose: () => void; children: React.ReactNode
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 640 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h3 style={{ margin: 0 }}>{title}</h3>
          <button className="btn btn-sm" onClick={onClose}><i className="fas fa-times"></i></button>
        </div>
        {children}
      </div>
    </div>
  )
}

function RankingList({ items, maxVal, colorOffset, totalLabel, onShowAll }: {
  items: [string, number][]; maxVal: number; colorOffset: number
  totalLabel: string; onShowAll?: () => void
}) {
  if (items.length === 0) {
    return <div style={{ color: '#94A3B8', textAlign: 'center', padding: 30, fontSize: 13 }}>No data in this period</div>
  }
  const preview = items.slice(0, PREVIEW_COUNT)
  return (
    <div>
      {preview.map(([name, count], i) => (
        <BarRow key={name} label={name} value={count} max={maxVal}
          color={COLORS[(i + colorOffset) % COLORS.length]}
          right={<span style={{ color: '#64748B', fontWeight: 600 }}>{count}</span>}
        />
      ))}
      <div style={{
        marginTop: 10, paddingTop: 10, borderTop: '1px solid #F1F5F9',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13,
      }}>
        <span style={{ color: '#64748B' }}>{totalLabel}</span>
        {items.length > PREVIEW_COUNT && onShowAll && (
          <button className="btn btn-sm" onClick={onShowAll}>
            <i className="fas fa-expand"></i> View All ({items.length})
          </button>
        )}
      </div>
    </div>
  )
}

/* ── Main Component ── */

export default function MarketingReportsPage({ token, stores, selectedStore }: MarketingReportsPageProps) {
  const [preset, setPreset] = useState<DatePreset>('30D')
  const [data, setData] = useState<MarketingData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [showRedemptionsModal, setShowRedemptionsModal] = useState(false)
  const [showVoucherUsageModal, setShowVoucherUsageModal] = useState(false)
  const [showFeedbackStoreModal, setShowFeedbackStoreModal] = useState(false)

  const isAllStores = selectedStore === 'all'
  const storeObj = stores.find((s: any) => String(s.id) === selectedStore)
  const storeLabel = isAllStores ? 'All Stores' : storeObj?.name || `Store ${selectedStore}`

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { from, to } = calcRange(preset)
      let url = `/admin/reports/marketing?from_date=${from}&to_date=${to}`
      if (!isAllStores) url += `&store_id=${selectedStore}`
      const res = await apiFetch(url, token)
      if (!res.ok) throw new Error('Failed to fetch marketing data')
      setData(await res.json())
    } catch (err: any) {
      setError(err.message || 'Failed to load data')
    } finally { setLoading(false) }
  }, [token, preset, selectedStore, isAllStores])

  useEffect(() => { fetchData() }, [fetchData])

  const topRedeemed = data ? Object.entries(data.rewards.top_redeemed).sort(([, a], [, b]) => b - a) : []
  const topUsed = data ? Object.entries(data.vouchers.top_used).sort(([, a], [, b]) => b - a) : []
  const topRedeemedMax = topRedeemed.length > 0 ? topRedeemed[0][1] : 1
  const topUsedMax = topUsed.length > 0 ? topUsed[0][1] : 1
  const ratingDist = data?.feedback.rating_distribution ?? {}
  const feedbackByStore = data ? Object.entries(data.feedback.by_store).sort(([, a], [, b]) => b.count - a.count) : []

  if (loading && !data) {
    return (
      <div>
        <h3 style={{ margin: '0 0 20px' }}>Marketing Reports</h3>
        <div style={{ textAlign: 'center', padding: 60, color: '#64748B' }}>
          <i className="fas fa-spinner fa-spin" style={{ fontSize: 24 }}></i>
          <p style={{ marginTop: 12 }}>Loading...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <h3 style={{ margin: '0 0 16px' }}>Marketing Reports</h3>
        <div className="card" style={{ textAlign: 'center', padding: 40, color: '#EF4444' }}>
          <i className="fas fa-exclamation-circle" style={{ fontSize: 24 }}></i>
          <p>{error}</p>
          <button className="btn btn-primary" onClick={fetchData} style={{ marginTop: 8 }}>Retry</button>
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h3 style={{ margin: 0 }}>Marketing Reports</h3>
          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>
            {data.period.from} — {data.period.to}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {PRESETS.map(p => (
            <button key={p.value} onClick={() => setPreset(p.value)}
              className={`btn btn-sm ${preset === p.value ? 'btn-primary' : ''}`}
            >{p.label}</button>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════════════
          ROW 1: KPI + Top Rewards + Top Vouchers
          ═══════════════════════════════════════ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24 }}>

        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ color: '#64748B', fontSize: 13 }}>Total Redemptions</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#6366F1' }}>
            {data.rewards.total_redemptions + data.vouchers.total_usages}
          </div>
          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 4 }}>
            {data.rewards.total_redemptions} reward · {data.vouchers.total_usages} voucher
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h4 style={{ margin: 0, fontSize: 14 }}>Top Rewards Redeemed</h4>
            <span className="badge badge-green" style={{ fontSize: 11 }}>{data.rewards.total_redemptions}</span>
          </div>
          <RankingList
            items={topRedeemed} maxVal={topRedeemedMax} colorOffset={0}
            totalLabel={`${data.rewards.active} of ${data.rewards.total} active`}
            onShowAll={() => setShowRedemptionsModal(true)}
          />
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h4 style={{ margin: 0, fontSize: 14 }}>Top Vouchers Used</h4>
            <span className="badge badge-blue" style={{ fontSize: 11 }}>{data.vouchers.total_usages}</span>
          </div>
          <RankingList
            items={topUsed} maxVal={topUsedMax} colorOffset={2}
            totalLabel={`${data.vouchers.active} of ${data.vouchers.total} active`}
            onShowAll={() => setShowVoucherUsageModal(true)}
          />
        </div>
      </div>

      {/* ═══════════════════════════════════════
          ROW 2: Feedback
          ═══════════════════════════════════════ */}
      {data.feedback.total > 0 && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isAllStores ? '1fr 1fr 1fr' : '1fr 1fr',
          gap: 16, marginBottom: 24,
        }}>

          <div className="card" style={{ textAlign: 'center' }}>
            <h4 style={{ fontSize: 14, marginBottom: 16 }}>Feedback</h4>
            <div style={{ marginBottom: 12 }}>
              <span style={{ fontSize: 40, fontWeight: 700, color: ratingColor(data.feedback.average_rating) }}>
                {data.feedback.average_rating.toFixed(1)}
              </span>
              <span style={{ color: '#F59E0B', fontSize: 22, marginLeft: 4 }}>★</span>
            </div>
            <div style={{ display: 'grid', gap: 8, textAlign: 'left', fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Total</span>
                <span style={{ fontWeight: 600 }}>{data.feedback.total}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Resolved</span>
                <span style={{ fontWeight: 600, color: '#22C55E' }}>{data.feedback.resolved}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Unreplied</span>
                <span style={{ fontWeight: 600, color: data.feedback.unreplied > 0 ? '#EF4444' : '#22C55E' }}>
                  {data.feedback.unreplied}
                </span>
              </div>
            </div>
          </div>

          <div className="card">
            <h4 style={{ fontSize: 14, marginBottom: 12 }}>Rating Distribution</h4>
            <DonutChart
              data={[5, 4, 3, 2, 1]
                .filter(s => (ratingDist[String(s)] ?? 0) > 0)
                .map(s => ({ label: `${s}★`, value: ratingDist[String(s)] ?? 0 }))}
              size={140}
              formatValue={v => `${v}`}
            />
          </div>

          {isAllStores && (
            <div className="card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h4 style={{ margin: 0, fontSize: 14 }}>Feedback by Store</h4>
                {feedbackByStore.length > PREVIEW_COUNT && (
                  <button className="btn btn-sm" onClick={() => setShowFeedbackStoreModal(true)}>
                    <i className="fas fa-expand"></i> All ({feedbackByStore.length})
                  </button>
                )}
              </div>
              {feedbackByStore.slice(0, PREVIEW_COUNT).map(([name, info], i) => (
                <div key={name} style={{
                  marginBottom: i < Math.min(feedbackByStore.length, PREVIEW_COUNT) - 1 ? 12 : 0,
                  paddingBottom: i < Math.min(feedbackByStore.length, PREVIEW_COUNT) - 1 ? 12 : 0,
                  borderBottom: i < Math.min(feedbackByStore.length, PREVIEW_COUNT) - 1 ? '1px solid #F1F5F9' : 'none',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 2 }}>
                    <span style={{ fontWeight: 500 }}>
                      <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: COLORS[i % COLORS.length], marginRight: 6 }} />
                      {name}
                    </span>
                    <span style={{ fontWeight: 600, color: ratingColor(info.avg_rating) }}>
                      {info.avg_rating.toFixed(1)} ★
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#94A3B8' }}>{info.count} reviews</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════
          ROW 3: Loyalty (All Stores only)
          ═══════════════════════════════════════ */}
      {isAllStores && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>

          <div className="card" style={{ textAlign: 'center' }}>
            <h4 style={{ fontSize: 14, marginBottom: 16 }}>Loyalty Members</h4>
            <div style={{ fontSize: 36, fontWeight: 700, color: '#002F6C' }}>{data.loyalty.total_members}</div>
            <div style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>total members</div>
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #F1F5F9' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span style={{ color: '#64748B' }}>Avg Points/Member</span>
                <span style={{ fontWeight: 600 }}>
                  {data.loyalty.total_members > 0
                    ? Math.round(data.loyalty.points_issued / data.loyalty.total_members).toLocaleString()
                    : 0}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: '#64748B' }}>Redemption Rate</span>
                <span style={{ fontWeight: 600 }}>
                  {data.loyalty.points_issued > 0
                    ? ((data.loyalty.points_redeemed / data.loyalty.points_issued) * 100).toFixed(0)
                    : 0}%
                </span>
              </div>
            </div>
          </div>

          <div className="card">
            <h4 style={{ fontSize: 14, marginBottom: 12 }}>Tier Distribution</h4>
            <DonutChart
              data={TIER_ORDER
                .filter(t => (data.loyalty.tier_distribution[t] ?? 0) > 0)
                .map(t => ({
                  label: t.charAt(0).toUpperCase() + t.slice(1),
                  value: data.loyalty.tier_distribution[t] ?? 0,
                }))}
              size={140}
              formatValue={v => `${v}`}
            />
            <div style={{ marginTop: 12, display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
              {TIER_ORDER.map(tier => {
                const count = data.loyalty.tier_distribution[tier] ?? 0
                if (count === 0) return null
                return (
                  <span key={tier} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '3px 8px',
                    background: '#F8FAFC', borderRadius: 6, color: '#334155',
                  }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: TIER_COLORS[tier], display: 'inline-block' }} />
                    {tier}: {count}
                  </span>
                )
              })}
            </div>
          </div>

          <div className="card">
            <h4 style={{ fontSize: 14, marginBottom: 16 }}>Points Flow</h4>
            <div style={{ display: 'grid', gap: 16 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span style={{ color: '#64748B' }}>Issued</span>
                  <span style={{ fontWeight: 600, color: '#6366F1' }}>{data.loyalty.points_issued.toLocaleString()}</span>
                </div>
                <div style={{ height: 8, background: '#F1F5F9', borderRadius: 10 }}>
                  <div style={{ height: 8, background: '#6366F1', borderRadius: 10, width: '100%' }} />
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span style={{ color: '#64748B' }}>Redeemed</span>
                  <span style={{ fontWeight: 600, color: '#F59E0B' }}>{data.loyalty.points_redeemed.toLocaleString()}</span>
                </div>
                <div style={{ height: 8, background: '#F1F5F9', borderRadius: 10 }}>
                  <div style={{
                    height: 8, background: '#F59E0B', borderRadius: 10,
                    width: `${data.loyalty.points_issued > 0 ? (data.loyalty.points_redeemed / data.loyalty.points_issued) * 100 : 0}%`,
                  }} />
                </div>
              </div>
              <div style={{
                padding: '10px 12px', background: '#F0F9FF', borderRadius: 10,
                fontSize: 13, display: 'flex', justifyContent: 'space-between',
              }}>
                <span style={{ color: '#0369A1' }}>Net Outstanding</span>
                <span style={{ fontWeight: 700, color: '#002F6C' }}>
                  {(data.loyalty.points_issued - data.loyalty.points_redeemed).toLocaleString()} pts
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════
          MODALS
          ═══════════════════════════════════════ */}

      {showRedemptionsModal && (
        <Modal title="All Reward Redemptions" onClose={() => setShowRedemptionsModal(false)}>
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {topRedeemed.map(([name, count], i) => {
              const total = data.rewards.total_redemptions || 1
              return (
                <div key={name} style={{
                  marginBottom: 14, paddingBottom: 14,
                  borderBottom: i < topRedeemed.length - 1 ? '1px solid #F1F5F9' : 'none',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, color: '#334155' }}>
                      <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: COLORS[i % COLORS.length], marginRight: 8 }} />
                      {name}
                    </span>
                    <span style={{ fontWeight: 600, color: '#0F172A' }}>{count}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, height: 8, background: '#F1F5F9', borderRadius: 10 }}>
                      <div style={{ height: 8, background: COLORS[i % COLORS.length], borderRadius: 10, width: `${(count / total) * 100}%` }} />
                    </div>
                    <span style={{ fontSize: 12, color: '#64748B', minWidth: 40, textAlign: 'right' }}>
                      {((count / total) * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </Modal>
      )}

      {showVoucherUsageModal && (
        <Modal title="All Voucher Usage" onClose={() => setShowVoucherUsageModal(false)}>
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            {topUsed.map(([code, count], i) => {
              const total = data.vouchers.total_usages || 1
              return (
                <div key={code} style={{
                  marginBottom: 14, paddingBottom: 14,
                  borderBottom: i < topUsed.length - 1 ? '1px solid #F1F5F9' : 'none',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontFamily: 'monospace', color: '#334155' }}>
                      <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: COLORS[(i + 2) % COLORS.length], marginRight: 8 }} />
                      {code}
                    </span>
                    <span style={{ fontWeight: 600, color: '#0F172A' }}>{count}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, height: 8, background: '#F1F5F9', borderRadius: 10 }}>
                      <div style={{ height: 8, background: COLORS[(i + 2) % COLORS.length], borderRadius: 10, width: `${(count / total) * 100}%` }} />
                    </div>
                    <span style={{ fontSize: 12, color: '#64748B', minWidth: 40, textAlign: 'right' }}>
                      {((count / total) * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </Modal>
      )}

      {showFeedbackStoreModal && (
        <Modal title="Feedback by Store" onClose={() => setShowFeedbackStoreModal(false)}>
          <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #E2E8F0' }}>
                  <th style={{ textAlign: 'left', padding: '8px 4px', color: '#64748B', fontWeight: 600 }}>Store</th>
                  <th style={{ textAlign: 'right', padding: '8px 4px', color: '#64748B', fontWeight: 600 }}>Reviews</th>
                  <th style={{ textAlign: 'right', padding: '8px 4px', color: '#64748B', fontWeight: 600 }}>Avg Rating</th>
                </tr>
              </thead>
              <tbody>
                {feedbackByStore.map(([name, info], i) => (
                  <tr key={name} style={{ borderBottom: '1px solid #F1F5F9' }}>
                    <td style={{ padding: '10px 4px' }}>
                      <span style={{ fontWeight: 500, color: '#334155' }}>
                        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: COLORS[i % COLORS.length], marginRight: 8 }} />
                        {name}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right', padding: '10px 4px', fontWeight: 500 }}>{info.count}</td>
                    <td style={{ textAlign: 'right', padding: '10px 4px', fontWeight: 600, color: ratingColor(info.avg_rating) }}>
                      {info.avg_rating.toFixed(1)} ★
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </div>
  )
}
