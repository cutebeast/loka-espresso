'use client';

interface BarChartProps {
  data: { label: string; value: number; target?: number; color?: string }[];
  orientation?: 'vertical' | 'horizontal';
  showTarget?: boolean;
  formatValue?: (v: number) => string;
  height?: number;
}

const BRAND_COLORS = ['#2C1E16', '#B85D19', '#869E66', '#4A7A59', '#D99A29', '#4A607A'];

export function BarChart({ data, orientation = 'vertical', showTarget = false, formatValue, height = 200 }: BarChartProps) {
  if (!data || data.length === 0) {
    return <p className="bc-0">No data</p>;
  }

  const maxVal = Math.max(...data.map(d => Math.max(d.value, d.target || 0)), 1);
  const fmt = formatValue || ((v: number) => v.toFixed(0));

  if (orientation === 'horizontal') {
    return (
      <div className="bc-1">
        {data.map((d, i) => {
          const barWidth = (d.value / maxVal) * 100;
          const targetPos = d.target ? (d.target / maxVal) * 100 : null;
          const color = d.color || BRAND_COLORS[i % BRAND_COLORS.length];
          return (
            <div key={i}>
              <div className="bc-2">
                <span className="bc-3">{d.label}</span>
                <span className="bc-4">{fmt(d.value)}</span>
              </div>
              <div className="bc-5">
                <div className="bc-bar" style={{
                  background: color,
                  width: `${barWidth}%`,
                }} />
                {showTarget && targetPos !== null && (
                  <div className="bc-target" style={{
                    left: `${targetPos}%`,
                  }} />
                )}
              </div>
              {showTarget && d.target && (
                <div className="bc-6">
                  Target: {fmt(d.target)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  const barWidth = Math.max(20, Math.min(48, 600 / data.length - 8));
  const gap = Math.max(4, Math.min(12, (600 - data.length * barWidth) / (data.length + 1)));
  const chartWidth = data.length * (barWidth + gap) + gap;

  return (
    <svg width="100%" viewBox={`0 0 ${chartWidth} ${height + 40}`} className="bc-7">
      {data.map((d, i) => {
        const barHeight = (d.value / maxVal) * (height - 20);
        const x = gap + i * (barWidth + gap);
        const y = height - barHeight;
        const color = d.color || BRAND_COLORS[i % BRAND_COLORS.length];
        return (
          <g key={i}>
            <rect x={x} y={y} width={barWidth} height={barHeight} fill={color} rx={4} opacity={0.85}>
              <animate attributeName="height" from="0" to={barHeight} dur="0.5s" fill="freeze" />
              <animate attributeName="y" from={height} to={y} dur="0.5s" fill="freeze" />
            </rect>
            {showTarget && d.target && (
              <line
                x1={x}
                y1={height - (d.target / maxVal) * (height - 20)}
                x2={x + barWidth}
                y2={height - (d.target / maxVal) * (height - 20)}
                stroke="#A83232"
                strokeWidth={2}
                strokeDasharray="4"
              />
            )}
            <text x={x + barWidth / 2} y={height + 14} textAnchor="middle" fontSize={10} fill="#6B635E">
              {d.label.length > 8 ? d.label.slice(0, 7) + '…' : d.label}
            </text>
            <text x={x + barWidth / 2} y={y - 4} textAnchor="middle" fontSize={10} fontWeight={600} fill="#2C1E16">
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
  centerLabel?: string;
}

export function DonutChart({ data, size = 160, formatValue, centerLabel }: DonutChartProps) {
  if (!data || data.length === 0) {
    return <p className="dc-8">No data</p>;
  }

  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const fmt = formatValue || ((v: number) => v.toFixed(0));
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 12;
  const strokeWidth = 24;
  const circumference = 2 * Math.PI * r;

  const segments = data.reduce<{ value: number; label: string; color?: string; offset: number; dash: number; gap: number; pct: number }[]>((acc, d, i) => {
    const pct = d.value / total;
    const dash = pct * circumference;
    const gap = circumference - dash;
    const color = d.color || BRAND_COLORS[i % BRAND_COLORS.length];
    const currentOffset = acc.length > 0 ? acc[acc.length - 1].offset + acc[acc.length - 1].dash : 0;
    acc.push({ ...d, offset: currentOffset, dash, gap, color, pct });
    return acc;
  }, []);

  return (
    <div className="dc-9">
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
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize={16} fontWeight={700} fill="#2C1E16">
          {fmt(total)}
        </text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize={10} fill="#6B635E">
          {centerLabel || 'Total'}
        </text>
      </svg>
      <div className="dc-10">
        {segments.map((seg, i) => (
          <div key={i} className="dc-11">
            <span className="dc-legend-dot" style={{ background: seg.color }} />
            <span className="dc-12">{seg.label}</span>
            <span className="dc-13">{fmt(seg.value)}</span>
            <span className="dc-14">({(seg.pct * 100).toFixed(0)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

interface LineChartProps {
  data: { label: string; values: number[] }[];
  xAxisLabels: string[];
  formatValue?: (v: number) => string;
  height?: number;
  colors?: string[];
}

export function LineChart({ data, xAxisLabels, formatValue, height = 220, colors = BRAND_COLORS }: LineChartProps) {
  if (!data || data.length === 0 || !xAxisLabels.length) {
    return <p className="lc-15">No data</p>;
  }

  const allValues = data.flatMap(d => d.values);
  const maxVal = Math.max(...allValues, 1);
  const pad = { top: 20, right: 16, bottom: 40, left: 60 };
  const chartW = 800;
  const plotW = chartW - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const fmt = formatValue || ((v: number) => v.toFixed(0));

  const yTicks = 5;
  const yStep = Math.ceil(maxVal / yTicks);
  const yMax = yStep * yTicks;

  const skipInterval = Math.max(1, Math.ceil(xAxisLabels.length / 12));

  return (
    <svg width="100%" viewBox={`0 0 ${chartW} ${height}`} className="lc-16">
      {Array.from({ length: yTicks + 1 }, (_, i) => {
        const val = yStep * i;
        const y = pad.top + plotH - (val / yMax) * plotH;
        return (
          <g key={`y${i}`}>
            <line x1={pad.left} y1={y} x2={pad.left + plotW} y2={y} stroke="#E5E0D8" strokeWidth={1} />
            <text x={pad.left - 8} y={y + 4} textAnchor="end" fontSize={11} fill="#6B635E">{fmt(val)}</text>
          </g>
        );
      })}

      {data.map((series, seriesIdx) => {
        const linePoints = xAxisLabels.map((_, i) => {
          const x = pad.left + (i / Math.max(xAxisLabels.length - 1, 1)) * plotW;
          const y = pad.top + plotH - ((series.values[i] || 0) / yMax) * plotH;
          return { x, y };
        });

        const linePath = linePoints.map(p => `${p.x},${p.y}`).join(' ');
        const areaPath = `M${linePoints[0]?.x},${pad.top + plotH} L${linePoints.map(p => `${p.x},${p.y}`).join(' L')} L${linePoints[linePoints.length - 1]?.x},${pad.top + plotH} Z`;
        const color = colors[seriesIdx % colors.length];

        return (
          <g key={seriesIdx}>
            <path d={areaPath} fill={color} opacity={0.08} />
            <polyline points={linePath} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
          </g>
        );
      })}

      {xAxisLabels.map((label, i) => {
        const x = pad.left + (i / Math.max(xAxisLabels.length - 1, 1)) * plotW;
        const showLabel = i % skipInterval === 0 || i === xAxisLabels.length - 1;
        return (
          <g key={i}>
            {showLabel && (
              <text x={x} y={pad.top + plotH + 18} textAnchor="middle" fontSize={11} fill="#6B635E">
                {label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

interface SparkLineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
}

export function SparkLine({ data, width = 200, height = 40, color = '#2C1E16' }: SparkLineProps) {
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