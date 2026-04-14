'use client';

/**
 * Lightweight SVG chart components — no external dependencies.
 */

interface BarChartProps {
  data: { label: string; value: number; color?: string }[];
  height?: number;
  formatValue?: (v: number) => string;
}

export function BarChart({ data, height = 200, formatValue }: BarChartProps) {
  if (!data || data.length === 0) return <p style={{ color: '#94A3B8', fontSize: 14 }}>No data</p>;

  const maxVal = Math.max(...data.map(d => d.value), 1);
  const barWidth = Math.max(20, Math.min(48, 600 / data.length - 8));
  const gap = Math.max(4, Math.min(12, (600 - data.length * barWidth) / (data.length + 1)));
  const chartWidth = data.length * (barWidth + gap) + gap;
  const fmt = formatValue || ((v: number) => v.toFixed(2));
  const colors = ['#002F6C', '#059669', '#EA580C', '#7C3AED', '#DB2777', '#0891B2'];

  return (
    <svg width="100%" viewBox={`0 0 ${chartWidth} ${height + 40}`} style={{ display: 'block' }}>
      {data.map((d, i) => {
        const barHeight = (d.value / maxVal) * (height - 20);
        const x = gap + i * (barWidth + gap);
        const y = height - barHeight;
        const color = d.color || colors[i % colors.length];
        return (
          <g key={i}>
            <rect x={x} y={y} width={barWidth} height={barHeight} fill={color} rx={4} opacity={0.85}>
              <animate attributeName="height" from="0" to={barHeight} dur="0.5s" fill="freeze" />
              <animate attributeName="y" from={height} to={y} dur="0.5s" fill="freeze" />
            </rect>
            <text x={x + barWidth / 2} y={height + 14} textAnchor="middle" fontSize={10} fill="#64748B">
              {d.label.length > 8 ? d.label.slice(0, 7) + '…' : d.label}
            </text>
            <text x={x + barWidth / 2} y={y - 4} textAnchor="middle" fontSize={10} fontWeight={600} fill="#334155">
              {fmt(d.value)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}


interface DonutChartProps {
  data: { label: string; value: number; color?: string }[];
  size?: number;
  formatValue?: (v: number) => string;
}

export function DonutChart({ data, size = 160, formatValue }: DonutChartProps) {
  if (!data || data.length === 0) return <p style={{ color: '#94A3B8', fontSize: 14 }}>No data</p>;

  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const fmt = formatValue || ((v: number) => v.toFixed(2));
  const colors = ['#002F6C', '#059669', '#EA580C', '#7C3AED', '#DB2777', '#0891B2'];
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 12;
  const strokeWidth = 24;
  const circumference = 2 * Math.PI * r;

  let offset = 0;
  const segments = data.map((d, i) => {
    const pct = d.value / total;
    const dash = pct * circumference;
    const gap = circumference - dash;
    const color = d.color || colors[i % colors.length];
    const seg = { ...d, offset, dash, gap, color, pct };
    offset += dash;
    return seg;
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F1F5F9" strokeWidth={strokeWidth} />
        {segments.map((seg, i) => (
          <circle
            key={i}
            cx={cx} cy={cy} r={r} fill="none"
            stroke={seg.color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${seg.dash} ${seg.gap}`}
            strokeDashoffset={-seg.offset}
            transform={`rotate(-90 ${cx} ${cy})`}
            strokeLinecap="round"
          />
        ))}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize={16} fontWeight={700} fill="#0F172A">
          {fmt(total)}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize={10} fill="#64748B">
          Total
        </text>
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {segments.map((seg, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: seg.color, flexShrink: 0 }} />
            <span style={{ color: '#334155', fontWeight: 500, textTransform: 'capitalize' }}>{seg.label.replace('_', ' ')}</span>
            <span style={{ color: '#64748B', marginLeft: 'auto' }}>{fmt(seg.value)}</span>
            <span style={{ color: '#94A3B8', fontSize: 11 }}>({(seg.pct * 100).toFixed(0)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}


interface SparkLineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}

export function SparkLine({ data, width = 200, height = 40, color = '#002F6C' }: SparkLineProps) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline points={points} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <polyline points={`0,${height} ${points} ${width},${height}`} fill={color} opacity={0.08} stroke="none" />
    </svg>
  );
}


// ── Line Chart with Grid ──────────────────────────────────────
interface LineGridChartProps {
  data: { label: string; value: number }[];
  height?: number;
  formatValue?: (v: number) => string;
  color?: string;
}

export function LineGridChart({ data, height = 220, formatValue, color = '#002F6C' }: LineGridChartProps) {
  if (!data || data.length === 0) return <p style={{ color: '#94A3B8', fontSize: 14 }}>No data</p>;

  const pad = { top: 20, right: 16, bottom: 40, left: 60 };
  const chartW = 800;
  const plotW = chartW - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const fmt = formatValue || ((v: number) => v.toFixed(2));

  // Calculate nice Y-axis ticks
  const yTicks = 5;
  const yStep = Math.ceil(maxVal / yTicks);
  const yMax = yStep * yTicks;

  // Auto-skip x labels: show max ~12 labels
  const skipInterval = Math.max(1, Math.ceil(data.length / 12));

  const linePoints = data.map((d, i) => {
    const x = pad.left + (i / Math.max(data.length - 1, 1)) * plotW;
    const y = pad.top + plotH - (d.value / yMax) * plotH;
    return { x, y, ...d };
  });

  const linePath = linePoints.map(p => `${p.x},${p.y}`).join(' ');
  const areaPath = `M${linePoints[0]?.x},${pad.top + plotH} L${linePoints.map(p => `${p.x},${p.y}`).join(' L')} L${linePoints[linePoints.length - 1]?.x},${pad.top + plotH} Z`;

  return (
    <svg width="100%" viewBox={`0 0 ${chartW} ${height}`} style={{ display: 'block' }}>
      {/* Y-axis grid lines + labels */}
      {Array.from({ length: yTicks + 1 }, (_, i) => {
        const val = yStep * i;
        const y = pad.top + plotH - (val / yMax) * plotH;
        return (
          <g key={`y${i}`}>
            <line x1={pad.left} y1={y} x2={pad.left + plotW} y2={y} stroke="#E9ECF2" strokeWidth={1} />
            <text x={pad.left - 8} y={y + 4} textAnchor="end" fontSize={11} fill="#94A3B8">{fmt(val)}</text>
          </g>
        );
      })}

      {/* Area fill */}
      <path d={areaPath} fill={color} opacity={0.06} />

      {/* Line */}
      <polyline points={linePath} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

      {/* Data points + X labels */}
      {linePoints.map((p, i) => {
        const showLabel = i % skipInterval === 0 || i === data.length - 1;
        return (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={3.5} fill="white" stroke={color} strokeWidth={2}>
              <title>{`${p.label}: ${fmt(p.value)}`}</title>
            </circle>
            {showLabel && (
              <text x={p.x} y={pad.top + plotH + 18} textAnchor="middle" fontSize={11} fill="#64748B">
                {p.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
