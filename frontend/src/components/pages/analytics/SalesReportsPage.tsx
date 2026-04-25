'use client'

import { useEffect, useState, useCallback } from 'react'
import { apiFetch, formatRM } from '@/lib/merchant-api'
import { DonutChart, StoreSelector, DateFilter, calcDateRange, type DatePreset } from '@/components/ui'
import { THEME } from '@/lib/theme'
import type { MerchantStore } from '@/lib/merchant-types'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import { Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

interface SalesReportsPageProps {
  token: string
  stores: MerchantStore[]
}

interface RevenueData {
  total: number
  by_type: { [key: string]: number }
  by_store: { [key: string]: number }
  by_day: { [key: string]: number }
}

export default function SalesReportsPage({ token: _token, stores }: SalesReportsPageProps) {
  const [preset, setPreset] = useState<DatePreset>('MTD')
  const [localStore, setLocalStore] = useState<string>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [report, setReport] = useState<RevenueData | null>(null)
  const [orderCount, setOrderCount] = useState<number>(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isAllStores = localStore === 'all'
  const effectiveRange = fromDate && toDate ? { from: fromDate, to: toDate } : calcDateRange(preset)

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const range = fromDate && toDate ? { from: fromDate, to: toDate } : calcDateRange(preset)
      const { from, to } = range
      let url = `/admin/reports/revenue?from_date=${from}T00:00:00&to_date=${to}T23:59:59`
      if (!isAllStores) url += `&store_id=${localStore}`
      const ordParams = new URLSearchParams({ page: '1', page_size: '1', from_date: `${from}T00:00:00`, to_date: `${to}T23:59:59` })
      if (!isAllStores) ordParams.append('store_id', localStore)
      const [revRes, ordRes] = await Promise.all([
        apiFetch(url),
        apiFetch(`/admin/orders?${ordParams.toString()}`),
      ])
      if (!revRes.ok) throw new Error('Failed to fetch revenue report')
      setReport(await revRes.json())
      if (ordRes.ok) {
        const ordData = await ordRes.json()
        setOrderCount(ordData.total ?? (Array.isArray(ordData) ? ordData.length : 0))
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load data')
    } finally { setLoading(false) }
  }, [preset, fromDate, toDate, localStore, isAllStores])

  useEffect(() => { fetchData() }, [fetchData])

  const byStoreEntries = report
    ? Object.entries(report.by_store || {})
        .map(([sid, rev]) => {
          const s = stores.find((st) => st.id === Number(sid))
          return { name: s?.name || `Store ${sid}`, value: Number(rev) }
        })
        .sort((a, b) => b.value - a.value)
    : []

  const topStore = byStoreEntries.length > 0 ? byStoreEntries[0] : null
  const totalOrders = orderCount || 0
  const avgOrderValue = totalOrders > 0 && report ? report.total / totalOrders : 0

  const byTypeEntries = report
    ? Object.entries(report.by_type || {}).map(([type, rev]) => ({
        label: type.replace(/_/g, ' '),
        value: Number(rev),
      }))
    : []

  const byDayEntries = report ? (() => {
    const raw = report.by_day || {}
    const { from, to } = effectiveRange
    const result: { label: string; value: number }[] = []
    const fromDate = new Date(from)
    const toDate = new Date(to)
    for (let d = new Date(fromDate); d <= toDate; d.setDate(d.getDate() + 1)) {
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      result.push({ label: key.slice(5), value: Number(raw[key] || 0) })
    }
    return result
  })() : []

  if (loading && !report) {
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
        <div className="card" style={{ textAlign: 'center', padding: 40, color: '#EF4444' }}>
          <i className="fas fa-exclamation-circle" style={{ fontSize: 24 }}></i>
          <p>{error}</p>
          <button className="btn btn-primary" onClick={fetchData} style={{ marginTop: 8 }}>Retry</button>
        </div>
      </div>
    )
  }

  if (!report) return null

  return (
    <div>
      {/* Filter Bar - Store and Date on left */}
      <div style={{ display: 'flex', justifyContent: 'flex-start', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <StoreSelector
          stores={stores.filter((s) => s.id !== 0).map((s) => ({ id: String(s.id), name: s.name }))}
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
          <i className="fas fa-chart-line" style={{ marginRight: 8, color: THEME.primary }}></i>
          <strong style={{ color: THEME.textPrimary }}>{effectiveRange.from}</strong> — <strong style={{ color: THEME.textPrimary }}>{effectiveRange.to}</strong>
        </div>
        <div style={{ fontSize: 13, color: THEME.textMuted }}>
          Revenue Report
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16, marginBottom: 24, marginTop: 20 }}>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ color: THEME.textMuted, fontSize: 13 }}>Total Revenue</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: THEME.accent }}>{formatRM(report.total || 0)}</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ color: THEME.textMuted, fontSize: 13 }}>Total Orders</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: THEME.textPrimary }}>{totalOrders.toLocaleString()}</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ color: THEME.textMuted, fontSize: 13 }}>Avg Order Value</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: THEME.warning }}>{formatRM(avgOrderValue)}</div>
        </div>
        <div className="card" style={{ textAlign: 'center' }}>
          <div style={{ color: THEME.textMuted, fontSize: 13 }}>Top Store by Revenue</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: THEME.accent }}>{topStore ? topStore.name : '-'}</div>
          {topStore && <div style={{ fontSize: 13, color: THEME.textMuted, marginTop: 2 }}>{formatRM(topStore.value)}</div>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isAllStores ? '1fr 1fr' : '1fr', gap: 16, marginBottom: 24 }}>
        {isAllStores && (
          <div className="card">
            <h4 style={{ fontSize: 14, marginBottom: 12, color: THEME.textPrimary }}>Revenue by Store</h4>
            {byStoreEntries.length === 0 ? (
              <div style={{ color: THEME.textMuted, textAlign: 'center', padding: 30, fontSize: 13 }}>No data</div>
            ) : (
              <div>
                {byStoreEntries.slice(0, 8).map((s, i) => {
                  const total = report.total || 1
                  const colors = ['#2C1E16', '#B85D19', '#869E66', '#4A7A59', '#D99A29', '#4A607A', '#A83232', '#6B635E']
                  return (
                    <div key={i} style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                        <span style={{ fontWeight: 500, color: THEME.textPrimary }}>{s.name}</span>
                        <span style={{ color: THEME.textMuted }}>{formatRM(s.value)} <span style={{ fontSize: 11, color: THEME.textMuted }}>({((s.value / total) * 100).toFixed(0)}%)</span></span>
                      </div>
                      <div style={{ height: 6, background: '#F9F7F3', borderRadius: 10 }}>
                        <div style={{ height: 6, background: colors[i % colors.length], borderRadius: 10, width: `${(s.value / total) * 100}%`, transition: 'width 0.3s' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
          <div className="card">
            <h4 style={{ fontSize: 14, marginBottom: 12, color: THEME.textPrimary }}>Revenue by Order Type</h4>
          {byTypeEntries.length === 0 ? (
            <div style={{ color: THEME.textMuted, textAlign: 'center', padding: 30, fontSize: 13 }}>No data</div>
          ) : (
            <DonutChart
              data={byTypeEntries}
              size={140}
              formatValue={(v) => formatRM(v)}
            />
          )}
        </div>
      </div>

      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, color: THEME.textPrimary }}>
            <i className="fas fa-chart-line" style={{ color: THEME.warning }}></i>
            Daily Revenue
          </h4>
          <div style={{ display: 'flex', gap: 16, fontSize: 13, color: THEME.textMuted }}>
            <span><strong style={{ color: THEME.textPrimary }}>{formatRM(report.total || 0)}</strong> total</span>
            {(() => {
              const vals = byDayEntries.map(d => d.value)
              const days = vals.length || 1
              return <span><strong style={{ color: THEME.textPrimary }}>{formatRM(vals.reduce((a, b) => a + b, 0) / days)}</strong> avg/day</span>
            })()}
          </div>
        </div>
        {byDayEntries.length > 0 ? (
          <div style={{ height: 240, position: 'relative' }}>
            <Line
              data={{
                labels: byDayEntries.map(d => d.label),
                datasets: [{
                  label: 'Revenue',
                  data: byDayEntries.map(d => d.value),
                  borderColor: THEME.warning,
                  backgroundColor: 'rgba(184, 93, 25, 0.08)',
                  borderWidth: 2.5,
                  pointBackgroundColor: '#ffffff',
                  pointBorderColor: THEME.textPrimary,
                  pointBorderWidth: 1.5,
                  pointRadius: 3,
                  pointHoverRadius: 5,
                  tension: 0.2,
                  fill: true,
                }],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    mode: 'index',
                    intersect: false,
                    callbacks: {
                      label: (ctx) => `RM ${Number(ctx.raw).toFixed(2)}`,
                    },
                  },
                },
                scales: {
                  y: {
                    beginAtZero: true,
                    grid: { color: THEME.borderLight },
                    ticks: {
                      callback: (val) => 'RM ' + (Number(val) >= 1000 ? (Number(val)/1000).toFixed(1) + 'k' : val),
                    },
                  },
                  x: {
                    grid: { display: false },
                    ticks: {
                      maxRotation: 35,
                      autoSkip: true,
                      maxTicksLimit: 15,
                    },
                  },
                },
                interaction: {
                  mode: 'nearest',
                  axis: 'x',
                  intersect: false,
                },
              }}
            />
          </div>
        ) : (
          <div style={{ color: THEME.textMuted, textAlign: 'center', padding: 30, fontSize: 13 }}>No data</div>
        )}
      </div>
    </div>
  )
}
