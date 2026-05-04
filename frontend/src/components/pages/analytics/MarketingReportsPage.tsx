'use client'

import { useEffect, useState, useCallback } from 'react'
import { apiFetch } from '@/lib/merchant-api'
import { DonutChart, StoreSelector, DateFilter, Modal, DataTable, calcDateRange, type DatePreset } from '@/components/ui'
import type { MerchantStore } from '@/lib/merchant-types'

interface MarketingReportsPageProps {
  stores: MerchantStore[]
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

const COLORS = ['#2C1E16', '#4A7A59', '#B85D19', '#7C3AED', '#DB2777', '#0891B2', '#4F46E5', '#DC2626', '#65A30D', '#CA8A04']
const TIER_ORDER = ['platinum', 'gold', 'silver', 'bronze']

const PREVIEW_COUNT = 3

/* ── Sub-components ── */

function BarRow({ label, value, max, color, right }: {
  label: string; value: number; max: number; color: string; right?: React.ReactNode
}) {
  const p = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="br-0">
      <div className="br-1">
        <span className="br-2">{label}</span>
        {right || <span className="br-3">{value}</span>}
      </div>
      <div className="br-4">
        <div className={`br-bar-bg bg-color-${COLORS.indexOf(color) >= 0 ? COLORS.indexOf(color) : 0} w-p-${Math.round(p)}`} />
      </div>
    </div>
  )
}

function RankingList({ items, maxVal, colorOffset, totalLabel, onShowAll }: {
  items: [string, number][]; maxVal: number; colorOffset: number
  totalLabel: string; onShowAll?: () => void
}) {
  if (items.length === 0) {
    return <div className="rl-5">No data in this period</div>
  }
  const preview = items.slice(0, PREVIEW_COUNT)
  return (
    <div>
      {preview.map(([name, count], i) => (
        <BarRow key={name} label={name} value={count} max={maxVal}
          color={COLORS[(i + colorOffset) % COLORS.length]}
          right={<span className="rl-6">{count}</span>}
        />
      ))}
      <div className="rl-7">
        <span className="rl-8">{totalLabel}</span>
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

export default function MarketingReportsPage({ stores }: MarketingReportsPageProps) {
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
  const storeObj = stores.find((s) => String(s.id) === localStore)
  const storeLabel = isAllStores ? 'All Stores' : storeObj?.name || `Store ${localStore}`

  const effectiveRange = fromDate && toDate ? { from: fromDate, to: toDate } : calcDateRange(preset)

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const range = fromDate && toDate ? { from: fromDate, to: toDate } : calcDateRange(preset)
      const { from, to } = range
      let url = `/admin/reports/marketing?from_date=${from}T00:00:00&to_date=${to}T23:59:59`
      if (!isAllStores) url += `&store_id=${localStore}`
      const res = await apiFetch(url)
      if (!res.ok) throw new Error('Failed to fetch marketing data')
      setData(await res.json())
    } catch (err: any) {
      setError(err.message || 'Failed to load data')
    } finally { setLoading(false) }
  }, [preset, fromDate, toDate, localStore, isAllStores])

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
        <div className="mrp-9">
          <span className="mrp-10"><i className="fas fa-spinner fa-spin"></i></span>
          <p className="mrp-11">Loading...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <div className="card mrp-12" >
          <span className="mrp-13"><i className="fas fa-exclamation-circle"></i></span>
          <p>{error}</p>
          <button className="btn btn-primary mrp-14" onClick={fetchData} >Retry</button>
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div>
      {/* Filter Bar - Store and Date on left */}
      <div className="mrp-15">
        <StoreSelector
          stores={stores.filter((s) => s.is_active && s.id !== 0).map((s) => ({ id: String(s.id), name: s.name }))}
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
      <div className="mrp-16">
        <div className="mrp-17">
          <span className="mrp-18"><i className="fas fa-bullhorn"></i></span>
          <strong className="mrp-19">{effectiveRange.from}</strong> — <strong className="mrp-20">{effectiveRange.to}</strong>
          <span className="mrp-21">({storeLabel})</span>
        </div>
        <div className="mrp-22">
          Marketing Report
        </div>
      </div>

      {/* ═══════════════════════════════════════
          ROW 1: KPI + Top Rewards + Top Vouchers
          ═══════════════════════════════════════ */}
      <div className="mrp-23">

        <div className="card mrp-24" >
          <div className="mrp-25">Total Redemptions</div>
          <div className="mrp-26">
            {data.rewards.total_redemptions + data.vouchers.total_usages}
          </div>
          <div className="mrp-27">
            {data.rewards.total_redemptions} reward · {data.vouchers.total_usages} voucher
          </div>
        </div>

        <div className="card mrp-28" >
          <div className="mrp-29">
            <h4 className="mrp-30">Top Rewards Redeemed</h4>
            <span className="badge badge-green mrp-31" >{data.rewards.total_redemptions}</span>
          </div>
          <RankingList
            items={topRedeemed} maxVal={topRedeemedMax} colorOffset={0}
            totalLabel={`${data.rewards.active} of ${data.rewards.total} active`}
            onShowAll={() => setShowRedemptionsModal(true)}
          />
        </div>

        <div className="card mrp-32" >
          <div className="mrp-33">
            <h4 className="mrp-34">Top Vouchers Used</h4>
            <span className="badge badge-blue mrp-35" >{data.vouchers.total_usages}</span>
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
        <div className={`mrp-grid-feedback ${isAllStores ? 'grid-cols-3' : 'grid-cols-2'}`}>

          <div className="card mrp-36" >
            <h4 className="mrp-37">Feedback</h4>
            <div className="mrp-38">
              <span className={`mrp-rating-big ${data.feedback.average_rating >= 4 ? 'rating-high' : data.feedback.average_rating >= 3 ? 'rating-mid' : 'rating-low'}`}>
                {data.feedback.average_rating.toFixed(1)}
              </span>
              <span className="mrp-39">★</span>
            </div>
            <div className="mrp-40">
              <div className="mrp-41">
                <span className="mrp-42">Total</span>
                <span className="mrp-43">{data.feedback.total}</span>
              </div>
              <div className="mrp-44">
                <span className="mrp-45">Resolved</span>
                <span className="mrp-46">{data.feedback.resolved}</span>
              </div>
              <div className="mrp-47">
                <span className="mrp-48">Unreplied</span>
                <span className={`mrp-unreplied-text ${data.feedback.unreplied > 0 ? 'text-error' : 'text-accent'}`}>
                  {data.feedback.unreplied}
                </span>
              </div>
            </div>
          </div>

          <div className="card">
            <h4 className="mrp-49">Rating Distribution</h4>
            <DonutChart
              data={[5, 4, 3, 2, 1]
                .filter(s => (ratingDist[String(s)] ?? 0) > 0)
                .map(s => ({ label: `${s}★`, value: ratingDist[String(s)] ?? 0 }))}
              size={140}
              formatValue={v => `${v}`}
            />
          </div>

          {isAllStores && (
            <div className="card mrp-50" >
              <div className="mrp-51">
                <h4 className="mrp-52">Feedback by Store</h4>
                {feedbackByStore.length > PREVIEW_COUNT && (
                  <button className="btn btn-sm" onClick={() => setShowFeedbackStoreModal(true)}>
                    <i className="fas fa-expand"></i> All ({feedbackByStore.length})
                  </button>
                )}
              </div>
              {feedbackByStore.slice(0, PREVIEW_COUNT).map(([name, info], i) => (
                <div key={name} className={i < Math.min(feedbackByStore.length, PREVIEW_COUNT) - 1 ? 'mrp-feedback-item-border' : 'mrp-feedback-item-noborder'}>
                  <div className="mrp-53">
                    <span className="mrp-54">
                      <span className={`mrp-dot-8 bg-color-${i % COLORS.length}`} />
                      {name}
                    </span>
                    <span className={`mrp-rating-text ${info.avg_rating >= 4 ? 'rating-high' : info.avg_rating >= 3 ? 'rating-mid' : 'rating-low'}`}>
                      {info.avg_rating.toFixed(1)} ★
                    </span>
                  </div>
                  <div className="mrp-55">{info.count} reviews</div>
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
        <div className="mrp-56">

          <div className="card mrp-57" >
            <h4 className="mrp-58">Loyalty Members</h4>
            <div className="mrp-59">{data.loyalty.total_members}</div>
            <div className="mrp-60">total members</div>
            <div className="mrp-61">
              <div className="mrp-62">
                <span className="mrp-63">Avg Points/Member</span>
                <span className="mrp-64">
                  {data.loyalty.total_members > 0
                    ? Math.round(data.loyalty.points_issued / data.loyalty.total_members).toLocaleString()
                    : 0}
                </span>
              </div>
              <div className="mrp-65">
                <span className="mrp-66">Redemption Rate</span>
                <span className="mrp-67">
                  {data.loyalty.points_issued > 0
                    ? ((data.loyalty.points_redeemed / data.loyalty.points_issued) * 100).toFixed(0)
                    : 0}%
                </span>
              </div>
            </div>
          </div>

          <div className="card">
            <h4 className="mrp-68">Tier Distribution</h4>
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
            <div className="mrp-69">
              {TIER_ORDER.map(tier => {
                const count = data.loyalty.tier_distribution[tier] ?? 0
                if (count === 0) return null
                return (
                  <span key={tier} className="mrp-70">
                    <span className={`mrp-tier-dot tier-bg-${tier}`} />
                    {tier}: {count}
                  </span>
                )
              })}
            </div>
          </div>

          <div className="card">
            <h4 className="mrp-71">Points Flow</h4>
            <div className="mrp-72">
              <div>
                <div className="mrp-73">
                  <span className="mrp-74">Issued</span>
                  <span className="mrp-75">{data.loyalty.points_issued.toLocaleString()}</span>
                </div>
                <div className="mrp-76">
                  <div className="mrp-77" />
                </div>
              </div>
              <div>
                <div className="mrp-78">
                  <span className="mrp-79">Redeemed</span>
                  <span className="mrp-80">{data.loyalty.points_redeemed.toLocaleString()}</span>
                </div>
                <div className="mrp-81">
                  <div className={`mrp-loyalty-bar bg-warning w-p-${Math.round(data.loyalty.points_issued > 0 ? (data.loyalty.points_redeemed / data.loyalty.points_issued) * 100 : 0)}`} />
                </div>
              </div>
              <div className="mrp-82">
                <span className="mrp-83">Net Outstanding</span>
                <span className="mrp-84">
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
        <div className="mrp-85">
          {topRedeemed.map(([name, count], i) => {
            const total = data.rewards.total_redemptions || 1
            return (
              <div key={name} className={`mrp-redemption-item ${i < topRedeemed.length - 1 ? 'border-bottom-light' : 'border-bottom-none'}`}>
                <div className="mrp-86">
                  <span className="mrp-87">
                    <span className={`mrp-dot-10 bg-color-${i % COLORS.length}`} />
                    {name}
                  </span>
                  <span className="mrp-88">{count}</span>
                </div>
                <div className="mrp-89">
                  <div className="mrp-90">
                    <div className={`mrp-bar-track bg-color-${i % COLORS.length} w-p-${Math.round((count / total) * 100)}`} />
                  </div>
                  <span className="mrp-91">
                    {((count / total) * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </Modal>

      <Modal isOpen={showVoucherUsageModal} onClose={() => setShowVoucherUsageModal(false)} title="All Voucher Usage" size="lg">
        <div className="mrp-92">
          {topUsed.map(([code, count], i) => {
            const total = data.vouchers.total_usages || 1
            return (
              <div key={code} className={`mrp-redemption-item ${i < topUsed.length - 1 ? 'border-bottom-light' : 'border-bottom-none'}`}>
                <div className="mrp-93">
                  <span className="mrp-94">
                    <span className={`mrp-dot-10 bg-color-${(i + 2) % COLORS.length}`} />
                    {code}
                  </span>
                  <span className="mrp-95">{count}</span>
                </div>
                <div className="mrp-96">
                  <div className="mrp-97">
                    <div className={`mrp-bar-track bg-color-${(i + 2) % COLORS.length} w-p-${Math.round((count / total) * 100)}`} />
                  </div>
                  <span className="mrp-98">
                    {((count / total) * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </Modal>

      <Modal isOpen={showFeedbackStoreModal} onClose={() => setShowFeedbackStoreModal(false)} title="Feedback by Store" size="lg">
        <div className="mrp-99">
          <DataTable<{ label: string; count: number; avg_rating: number }>
            data={feedbackByStore.map(([name, info]) => ({ label: name, count: info.count, avg_rating: info.avg_rating }))}
            columns={[
              { key: 'label', header: 'Store', render: (row) => {
                const idx = feedbackByStore.findIndex(([n]) => n === row.label);
                return (
                <span className="mrp-100">
                  <span className={`mrp-dot-10 bg-color-${idx % COLORS.length}`} />
                  {row.label}
                </span>
              );}},
              { key: 'count', header: 'Reviews', render: (row) => <span className="mrp-101">{row.count}</span> },
              { key: 'avg_rating', header: 'Avg Rating', render: (row) => (
                <span className={`mrp-rating-text ${row.avg_rating >= 4 ? 'rating-high' : row.avg_rating >= 3 ? 'rating-mid' : 'rating-low'}`}>{row.avg_rating.toFixed(1)} ★</span>
              )},
            ]}
            emptyMessage="No feedback data"
          />
        </div>
      </Modal>
    </div>
  )
}
