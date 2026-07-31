import { useState, type ReactNode } from 'react'
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

/**
 * Chart chrome. Every chart gets a title, an optional table view (so no value
 * is gated behind colour perception), and recessive axes/gridlines.
 */
export function ChartFrame({
  title,
  sub,
  children,
  table,
  legend,
  height = 200,
}: {
  title: string
  sub?: string
  children: ReactNode
  table?: { head: string[]; rows: (string | number)[][] }
  legend?: { label: string; color: string; dashed?: boolean }[]
  height?: number
}) {
  const [showTable, setShowTable] = useState(false)
  return (
    <div className="card p-4">
      <div className="mb-1 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-semibold tracking-tight">{title}</h3>
          {sub && <p className="mt-0.5 text-[11px] text-ink-3">{sub}</p>}
        </div>
        {table && (
          <button
            onClick={() => setShowTable((s) => !s)}
            className="shrink-0 rounded-lg border border-line px-2 py-1 text-[11px] text-ink-3 hover:text-ink"
          >
            {showTable ? 'Chart' : 'Table'}
          </button>
        )}
      </div>

      {legend && legend.length > 1 && (
        <div className="mt-2 mb-1 flex flex-wrap gap-x-4 gap-y-1">
          {legend.map((l) => (
            <span key={l.label} className="flex items-center gap-1.5 text-[11px] text-ink-2">
              <span
                aria-hidden
                className="inline-block rounded-full"
                style={{
                  width: 14,
                  height: 2,
                  background: l.dashed
                    ? `repeating-linear-gradient(90deg, ${l.color} 0 4px, transparent 4px 7px)`
                    : l.color,
                }}
              />
              {l.label}
            </span>
          ))}
        </div>
      )}

      {showTable && table ? (
        <div className="mt-2 max-h-64 overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-surface-1">
              <tr className="text-ink-3">
                {table.head.map((h) => (
                  <th key={h} className="border-b border-line py-1.5 pr-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular">
              {table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j} className="border-b border-line py-1.5 pr-3">
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="mt-2 -ml-2" style={{ height }}>
          {children}
        </div>
      )}
    </div>
  )
}

/**
 * A padded domain snapped outward to round numbers, so the y-axis ticks read
 * 200 / 210 / 220 rather than 203.1 / 211.1 / 218.7.
 */
export function niceDomain(values: (number | null | undefined)[], padFraction = 0.08): [number, number] {
  const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))
  if (nums.length === 0) return [0, 1]
  const min = Math.min(...nums)
  const max = Math.max(...nums)
  const span = max - min || Math.abs(max) * 0.1 || 1
  const pad = span * padFraction
  // Snap to a step that is a round fraction of the span.
  const step = Math.pow(10, Math.floor(Math.log10(span))) / 2
  return [Math.floor((min - pad) / step) * step, Math.ceil((max + pad) / step) * step]
}

const AXIS_PROPS = {
  stroke: 'var(--axis)',
  tick: { fill: 'var(--text-muted)', fontSize: 11 },
  tickLine: false,
} as const

export interface SeriesSpec {
  key: string
  label: string
  color: string
  /** Draw a 10% wash under the line. */
  area?: boolean
  dashed?: boolean
  /** Render as bars instead of a line. */
  bar?: boolean
  unit?: string
}

/**
 * Time-series chart. One y-axis only — two measures of different scale get two
 * charts, never a second axis.
 */
export function TimeSeries<T extends Record<string, unknown>>({
  data,
  xKey,
  series,
  yDomain,
  yTickFormatter,
  tooltipFormatter,
  bands,
  refLines,
  xTickFormatter,
}: {
  data: T[]
  xKey: string
  series: SeriesSpec[]
  yDomain?: [number | 'auto' | 'dataMin' | 'dataMax', number | 'auto' | 'dataMin' | 'dataMax']
  yTickFormatter?: (v: number) => string
  tooltipFormatter?: (v: number, name: string) => [string, string]
  /** Shaded target zones, e.g. the healthy ACWR band. */
  bands?: { from: number; to: number; color: string; label?: string }[]
  refLines?: { y: number; color: string; label?: string }[]
  xTickFormatter?: (v: string) => string
}) {
  // Bars encode magnitude by length, so they must grow from zero — a truncated
  // baseline overstates the differences between them.
  const hasBar = series.some((s) => s.bar)
  const domain = yDomain ?? (hasBar ? ([0, 'auto'] as const) : (['auto', 'auto'] as const))
  return (
    // The responsive container has to wrap the chart directly — it injects
    // width/height into its immediate child, so it cannot sit outside a
    // wrapper component.
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
      <CartesianGrid stroke="var(--grid)" strokeWidth={1} vertical={false} />
      <XAxis dataKey={xKey} {...AXIS_PROPS} tickFormatter={xTickFormatter} minTickGap={24} />
      <YAxis {...AXIS_PROPS} domain={domain as never} tickFormatter={yTickFormatter} width={44} />
      {bands?.map((b, i) => (
        <ReferenceArea key={i} y1={b.from} y2={b.to} fill={b.color} fillOpacity={0.1} stroke="none" />
      ))}
      {refLines?.map((r, i) => (
        <ReferenceLine
          key={i}
          y={r.y}
          stroke={r.color}
          strokeWidth={1}
          strokeDasharray="4 3"
          label={
            r.label
              ? { value: r.label, position: 'insideTopRight', fill: 'var(--text-muted)', fontSize: 10 }
              : undefined
          }
        />
      ))}
      <Tooltip
        formatter={tooltipFormatter as never}
        labelFormatter={(l) => (xTickFormatter ? xTickFormatter(String(l)) : String(l))}
        contentStyle={{ background: 'var(--surface-1)', border: '1px solid var(--border-strong)', borderRadius: 10 }}
        itemStyle={{ color: 'var(--text-primary)' }}
        labelStyle={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 4 }}
      />
      {/* Flat, not nested: recharts inspects its direct children to build the
          axes and graphical items. */}
      {series
        .filter((s) => s.area && !s.bar)
        .map((s) => (
          <Area
            key={`${s.key}_area`}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke="none"
            fill={s.color}
            fillOpacity={0.1}
            legendType="none"
            tooltipType="none"
            isAnimationActive={false}
            activeDot={false}
          />
        ))}
      {series
        .filter((s) => s.bar)
        .map((s) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.label}
            fill={s.color}
            radius={[4, 4, 0, 0]}
            maxBarSize={24}
            isAnimationActive={false}
          />
        ))}
      {series
        .filter((s) => !s.bar)
        .map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            strokeDasharray={s.dashed ? '5 4' : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{ r: 4, fill: s.color, stroke: 'var(--surface-1)', strokeWidth: 2 }}
            connectNulls
            isAnimationActive={false}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  )
}

/**
 * Horizontal progress bars — the right form for "actual vs target" across a
 * list of categories, where a bar chart with a target line would be harder to
 * read at a glance.
 */
export function TargetBars({
  rows,
}: {
  rows: { label: string; value: number; target: number; color: string; note?: string }[]
}) {
  const max = Math.max(...rows.map((r) => Math.max(r.value, r.target)), 1)
  return (
    <div className="space-y-2.5">
      {rows.map((r) => {
        const valuePct = (r.value / max) * 100
        const targetPct = (r.target / max) * 100
        return (
          <div key={r.label}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="truncate text-xs">{r.label}</span>
              <span className="tabular shrink-0 text-[11px] text-ink-3">
                <span style={{ color: 'var(--text-primary)' }}>{r.value}</span> / {r.target} sets
                {r.note && <span className="ml-1.5">{r.note}</span>}
              </span>
            </div>
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-300"
                style={{ width: `${valuePct}%`, background: r.color }}
              />
              {/* Target marker: a 2px surface-coloured notch, not a stroke. */}
              <div
                className="absolute inset-y-0 w-[2px]"
                style={{ left: `calc(${targetPct}% - 1px)`, background: 'var(--text-secondary)' }}
                title={`Target ${r.target} sets`}
              />
            </div>
          </div>
        )
      })}
      <p className="pt-1 text-[11px] text-ink-3">
        The vertical notch marks your weekly target for the current goal.
      </p>
    </div>
  )
}

export const SERIES = {
  s1: 'var(--series-1)',
  s2: 'var(--series-2)',
  s3: 'var(--series-3)',
  s4: 'var(--series-4)',
  s5: 'var(--series-5)',
  good: 'var(--good)',
  warning: 'var(--warning)',
  critical: 'var(--critical)',
  muted: 'var(--text-muted)',
}
