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
        <div className="srp-0">
          <span className="srp-1"><i className="fas fa-spinner fa-spin"></i></span>
          <p className="srp-2">Loading...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div>
        <div className="card srp-3" >
          <span className="srp-4"><i className="fas fa-exclamation-circle"></i></span>
          <p>{error}</p>
          <button className="btn btn-primary srp-5" onClick={fetchData} >Retry</button>
        </div>
      </div>
    )
  }

  if (!report) return null

  return (
    <div>
      {/* Filter Bar - Store and Date on left */}
      <div className="srp-6">
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
      <div className="srp-7">
        <div className="srp-8">
          <span className="srp-9"><i className="fas fa-chart-line"></i></span>
          <strong className="srp-10">{effectiveRange.from}</strong> — <strong className="srp-11">{effectiveRange.to}</strong>
        </div>
        <div className="srp-12">
          Revenue Report
        </div>
      </div>

      <div className="srp-13">
        <div className="card srp-14" >
          <div className="srp-15">Total Revenue</div>
          <div className="srp-16">{formatRM(report.total || 0)}</div>
        </div>
        <div className="card srp-17" >
          <div className="srp-18">Total Orders</div>
          <div className="srp-19">{totalOrders.toLocaleString()}</div>
        </div>
        <div className="card srp-20" >
          <div className="srp-21">Avg Order Value</div>
          <div className="srp-22">{formatRM(avgOrderValue)}</div>
        </div>
        <div className="card srp-23" >
          <div className="srp-24">Top Store by Revenue</div>
          <div className="srp-25">{topStore ? topStore.name : '-'}</div>
          {topStore && <div className="srp-26">{formatRM(topStore.value)}</div>}
        </div>
      </div>

      <div className="srp-grid" style={{ gridTemplateColumns: isAllStores ? '1fr 1fr' : '1fr' }}>
        {isAllStores && (
          <div className="card">
            <h4 className="srp-27">Revenue by Store</h4>
            {byStoreEntries.length === 0 ? (
              <div className="srp-28">No data</div>
            ) : (
              <div>
                {byStoreEntries.slice(0, 8).map((s, i) => {
                  const total = report.total || 1
                  const colors = ['#2C1E16', '#B85D19', '#869E66', '#4A7A59', '#D99A29', '#4A607A', '#A83232', '#6B635E']
                  return (
                    <div key={i} className="srp-29">
                      <div className="srp-30">
                        <span className="srp-31">{s.name}</span>
                        <span className="srp-32">{formatRM(s.value)} <span className="srp-33">({((s.value / total) * 100).toFixed(0)}%)</span></span>
                      </div>
                      <div className="srp-34">
                        <div className="srp-progress-bar" style={{ background: colors[i % colors.length], width: `${(s.value / total) * 100}%` }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
          <div className="card">
            <h4 className="srp-35">Revenue by Order Type</h4>
          {byTypeEntries.length === 0 ? (
            <div className="srp-36">No data</div>
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
        <div className="srp-37">
          <h4 className="srp-38">
            <span className="srp-39"><i className="fas fa-chart-line"></i></span>
            Daily Revenue
          </h4>
          <div className="srp-40">
            <span><strong className="srp-41">{formatRM(report.total || 0)}</strong> total</span>
            {(() => {
              const vals = byDayEntries.map(d => d.value)
              const days = vals.length || 1
              return <span><strong className="srp-42">{formatRM(vals.reduce((a, b) => a + b, 0) / days)}</strong> avg/day</span>
            })()}
          </div>
        </div>
        {byDayEntries.length > 0 ? (
          <div className="srp-43">
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
          <div className="srp-44">No data</div>
        )}
      </div>
    </div>
  )
}
