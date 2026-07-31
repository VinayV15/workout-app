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
import type { TimeSeriesProps } from './charts'

/**
 * The one component that touches recharts, in its own module so the library lands in
 * its own chunk.
 *
 * recharts and its d3 dependencies are around 200KB of the bundle, and every screen
 * that does not draw a chart was paying for them. `charts.tsx` wraps this in a lazy
 * boundary, so the import above only resolves when a chart actually renders.
 */
const AXIS_PROPS = {
  stroke: 'var(--axis)',
  tick: { fill: 'var(--text-muted)', fontSize: 11 },
  tickLine: false,
} as const


/**
 * Time-series chart. One y-axis only — two measures of different scale get two
 * charts, never a second axis.
 */
export default function TimeSeries<T extends Record<string, unknown>>({
  data,
  xKey,
  series,
  yDomain,
  yTickFormatter,
  tooltipFormatter,
  bands,
  refLines,
  xTickFormatter,
}: TimeSeriesProps<T>) {
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

