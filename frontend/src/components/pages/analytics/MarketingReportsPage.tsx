'use client'

import { useEffect, useState, useCallback } from 'react'
import { apiFetch } from '@/lib/merchant-api'
import { DonutChart, StoreSelector, DateFilter, Modal, DataTable, type ColumnDef, calcDateRange, type DatePreset } from '@/components/ui'
import { THEME } from '@/lib/theme'

interface MarketingReportsPageProps {
  token: string
  stores: any[]
}

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

function ratingColor(r: number): string {
  return r >= 4 ? '#4A7A59' : r >= 3 ? '#D99A29' : '#A83232'
}

const COLORS = ['#2C1E16', '#4A7A59', '#B85D19', '#7C3AED', '#DB2777', '#0891B2', '#4F46E5', '#DC2626', '#65A30D', '#CA8A04']
const TIER_COLORS: Record<string, string> = {
  bronze: '#CD7F32', silver: THEME.textSecondary, gold: '#EAB308', platinum: '#3B82F6', diamond: '#06B6D4',
}
const TIER_ORDER = ['platinum', 'gold', 'silver', 'bronze']

const PREVIEW_COUNT = 3

/* ── Sub-components ── */

function BarRow({ label, value, max, color, right }: {
  label: string; value: number; max: number; color: string; right?: React.ReactNode
}) {
  const p = max > 0 ? (value / max) * 100 : 0
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
        <span style={{ fontWeight: 500, color: THEME.textPrimary }}>{label}</span>
        {right || <span style={{ color: THEME.textSecondary, fontWeight: 600 }}>{value}</span>}
      </div>
      <div style={{ height: 6, background: '#F9F7F3', borderRadius: 10 }}>
        <div style={{ height: 6, background: color, borderRadius: 10, width: `${p}%`, transition: 'width 0.3s' }} />
      </div>
    </div>
  )
}

function RankingList({ items, maxVal, colorOffset, totalLabel, onShowAll }: {
  items: [string, number][]; maxVal: number; colorOffset: number
  totalLabel: string; onShowAll?: () => void
}) {
  if (items.length === 0) {
    return <div style={{ color: THEME.textSecondary, textAlign: 'center', padding: 30, fontSize: 13 }}>No data in this period</div>
  }
  const preview = items.slice(0, PREVIEW_COUNT)
  return (
    <div>
      {preview.map(([name, count], i) => (
        <BarRow key={name} label={name} value={count} max={maxVal}
          color={COLORS[(i + colorOffset) % COLORS.length]}
          right={<span style={{ color: THEME.textSecondary, fontWeight: 600 }}>{count}</span>}
        />
      ))}
      <div style={{
        marginTop: 10, paddingTop: 10, borderTop: '1px solid #F9F7F3',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13,
      }}>
        <span style={{ color: THEME.textSecondary }}>{totalLabel}</span>
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

export default function MarketingReportsPage({ token, stores }: MarketingReportsPageProps) {
  const [preset, setPreset] = useState<DatePreset>('MTD')
  const [localStore, setLocalStore] = useState<string>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [data, setData] = useState<MarketingData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [showRedemptionsModal, setShowRedemptionsModal] = useState(false)
  const [showVoucherUsageModal, setShowVoucherUsageModal] = useState(false)
  const [showFeedbackStoreModal, setShowFeedbackStoreModal] = useState(false)

  const isAllStores = localStore === 'all'
  const storeObj = stores.find((s: any) => String(s.id) === localStore)
  const storeLabel = isAllStores ? 'All Stores' : storeObj?.name || `Store ${localStore}`

  const effectiveRange = fromDate && toDate ? { from: fromDate, to: toDate } : calcDateRange(preset)

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const { from, to } = effectiveRange
      let url = `/admin/reports/marketing?from_date=${from}T00:00:00&to_date=${to}T23:59:59`
      if (!isAllStores) url += `&store_id=${localStore}`
      const res = await apiFetch(url, token)
      if (!res.ok) throw new Error('Failed to fetch marketing data')
      setData(await res.json())
    } catch (err: any) {
      setError(err.message || 'Failed to load data')
    } finally { setLoading(false) }
  }, [token, effectiveRange.from, effectiveRange.to, localStore, isAllStores])

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
        <div style={{ textAlign: 'center', padding: 60, color: THEME.textMuted }}>
          <i className="fas fa-spinner fa-spin" style={{ fontSize: 24 }}></i>
          <p style={{ marginTop: 12 }}>Loading...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <div className="card" style={{ textAlign: 'center', padding: 40, color: THEME.error }}>
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
      {/* Filter Bar - Store and Date on left */}
      <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <StoreSelector
          stores={stores.filter((s: any) => s.is_active && s.id !== 0).map((s: any) => ({ id: String(s.id), name: s.name }))}
          selectedStore={localStore}
          onChange={setLocalStore}
        />
        <DateFilter
          preset={preset}
          onChange={(p, from, to) => { setPreset(p); setFromDate(from); setToDate(to); }}
          fromDate={fromDate}
          toDate={toDate}
        />
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
      }}>
        <div style={{ fontSize: 14, color: THEME.textSecondary }}>
          <i className="fas fa-bullhorn" style={{ marginRight: 8, color: THEME.primary }}></i>
          <strong style={{ color: THEME.textPrimary }}>{effectiveRange.from}</strong> — <strong style={{ color: THEME.textPrimary }}>{effectiveRange.to}</strong>
          <span style={{ marginLeft: 12, color: THEME.textMuted }}>({storeLabel})</span>
        </div>
        <div style={{ fontSize: 13, color: THEME.textMuted }}>
          Marketing Report
        </div>
      </div>

      {/* ═══════════════════════════════════════
          ROW 1: KPI + Top Rewards + Top Vouchers
          ═══════════════════════════════════════ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 24, marginTop: 20 }}>

        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ color: THEME.textMuted, fontSize: 13 }}>Total Redemptions</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: THEME.warning }}>
            {data.rewards.total_redemptions + data.vouchers.total_usages}
          </div>
          <div style={{ fontSize: 12, color: THEME.textMuted, marginTop: 4 }}>
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
              <span style={{ color: THEME.warning, fontSize: 22, marginLeft: 4 }}>★</span>
            </div>
            <div style={{ display: 'grid', gap: 8, textAlign: 'left', fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: THEME.textMuted }}>Total</span>
                <span style={{ fontWeight: 600 }}>{data.feedback.total}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: THEME.textMuted }}>Resolved</span>
                <span style={{ fontWeight: 600, color: THEME.accent }}>{data.feedback.resolved}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: THEME.textMuted }}>Unreplied</span>
                <span style={{ fontWeight: 600, color: data.feedback.unreplied > 0 ? THEME.error : THEME.accent }}>
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
                  borderBottom: i < Math.min(feedbackByStore.length, PREVIEW_COUNT) - 1 ? '1px solid #F9F7F3' : 'none',
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
                  <div style={{ fontSize: 12, color: THEME.textMuted }}>{info.count} reviews</div>
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
            <div style={{ fontSize: 36, fontWeight: 700, color: THEME.textPrimary }}>{data.loyalty.total_members}</div>
            <div style={{ fontSize: 13, color: THEME.textMuted, marginTop: 4 }}>total members</div>
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${THEME.borderLight}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                <span style={{ color: THEME.textMuted }}>Avg Points/Member</span>
                <span style={{ fontWeight: 600 }}>
                  {data.loyalty.total_members > 0
                    ? Math.round(data.loyalty.points_issued / data.loyalty.total_members).toLocaleString()
                    : 0}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                <span style={{ color: THEME.textMuted }}>Redemption Rate</span>
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
                    background: THEME.borderLight, borderRadius: 6, color: THEME.textPrimary,
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
                  <span style={{ color: THEME.textMuted }}>Issued</span>
                  <span style={{ fontWeight: 600, color: THEME.warning }}>{data.loyalty.points_issued.toLocaleString()}</span>
                </div>
                <div style={{ height: 8, background: THEME.borderLight, borderRadius: 10 }}>
                  <div style={{ height: 8, background: THEME.warning, borderRadius: 10, width: '100%' }} />
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
                  <span style={{ color: THEME.textMuted }}>Redeemed</span>
                  <span style={{ fontWeight: 600, color: THEME.warning }}>{data.loyalty.points_redeemed.toLocaleString()}</span>
                </div>
                <div style={{ height: 8, background: THEME.borderLight, borderRadius: 10 }}>
                  <div style={{
                    height: 8, background: THEME.warning, borderRadius: 10,
                    width: `${data.loyalty.points_issued > 0 ? (data.loyalty.points_redeemed / data.loyalty.points_issued) * 100 : 0}%`,
                  }} />
                </div>
              </div>
              <div style={{
                padding: '10px 12px', background: THEME.borderLight, borderRadius: 10,
                fontSize: 13, display: 'flex', justifyContent: 'space-between',
              }}>
                <span style={{ color: THEME.textMuted }}>Net Outstanding</span>
                <span style={{ fontWeight: 700, color: THEME.textPrimary }}>
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

      <Modal isOpen={showRedemptionsModal} onClose={() => setShowRedemptionsModal(false)} title="All Reward Redemptions" size="lg">
        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {topRedeemed.map(([name, count], i) => {
            const total = data.rewards.total_redemptions || 1
            return (
              <div key={name} style={{
                marginBottom: 14, paddingBottom: 14,
                borderBottom: i < topRedeemed.length - 1 ? '1px solid #F9F7F3' : 'none',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: THEME.textPrimary }}>
                    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: COLORS[i % COLORS.length], marginRight: 8 }} />
                    {name}
                  </span>
                  <span style={{ fontWeight: 600, color: THEME.textPrimary }}>{count}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, height: 8, background: THEME.borderLight, borderRadius: 10 }}>
                    <div style={{ height: 8, background: COLORS[i % COLORS.length], borderRadius: 10, width: `${(count / total) * 100}%` }} />
                  </div>
                  <span style={{ fontSize: 12, color: THEME.textMuted, minWidth: 40, textAlign: 'right' }}>
                    {((count / total) * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </Modal>

      <Modal isOpen={showVoucherUsageModal} onClose={() => setShowVoucherUsageModal(false)} title="All Voucher Usage" size="lg">
        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          {topUsed.map(([code, count], i) => {
            const total = data.vouchers.total_usages || 1
            return (
              <div key={code} style={{
                marginBottom: 14, paddingBottom: 14,
                borderBottom: i < topUsed.length - 1 ? '1px solid #F9F7F3' : 'none',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, fontFamily: 'monospace', color: THEME.textPrimary }}>
                    <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: COLORS[(i + 2) % COLORS.length], marginRight: 8 }} />
                    {code}
                  </span>
                  <span style={{ fontWeight: 600, color: THEME.textPrimary }}>{count}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1, height: 8, background: THEME.borderLight, borderRadius: 10 }}>
                    <div style={{ height: 8, background: COLORS[(i + 2) % COLORS.length], borderRadius: 10, width: `${(count / total) * 100}%` }} />
                  </div>
                  <span style={{ fontSize: 12, color: THEME.textMuted, minWidth: 40, textAlign: 'right' }}>
                    {((count / total) * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </Modal>

      <Modal isOpen={showFeedbackStoreModal} onClose={() => setShowFeedbackStoreModal(false)} title="Feedback by Store" size="lg">
        <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
          <DataTable<{ label: string; count: number; avg_rating: number }>
            data={feedbackByStore.map(([name, info]) => ({ label: name, count: info.count, avg_rating: info.avg_rating }))}
            columns={[
              { key: 'label', header: 'Store', render: (row) => {
                const idx = feedbackByStore.findIndex(([n]) => n === row.label);
                return (
                <span style={{ fontWeight: 500, color: THEME.textPrimary }}>
                  <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: COLORS[idx % COLORS.length], marginRight: 8 }} />
                  {row.label}
                </span>
              );}},
              { key: 'count', header: 'Reviews', render: (row) => <span style={{ fontWeight: 500 }}>{row.count}</span> },
              { key: 'avg_rating', header: 'Avg Rating', render: (row) => (
                <span style={{ fontWeight: 600, color: ratingColor(row.avg_rating) }}>{row.avg_rating.toFixed(1)} ★</span>
              )},
            ]}
            emptyMessage="No feedback data"
          />
        </div>
      </Modal>
    </div>
  )
}
