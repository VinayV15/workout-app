import { useCallback, useEffect, useState } from 'react'
import {
  CALENDAR_PRESETS,
  DEFAULT_RANGE,
  PRESET_LABEL,
  ROLLING_PRESETS,
  loadRange,
  resolveRange,
  saveRange,
  type DateRange,
  type RangePreset,
  type RangeScope,
  type ResolvedRange,
} from '../lib/dateRange'
import { todayISO } from '../lib/calc'
import { Field } from './ui'

/**
 * The date range for one screen, remembered on the device.
 *
 * Returns the resolved range as well as the raw one, because every caller needs the
 * concrete dates and none of them should be resolving presets themselves.
 */
export function useDateRange(scope: RangeScope): {
  range: DateRange
  resolved: ResolvedRange
  setRange: (r: DateRange) => void
} {
  const [range, setRangeState] = useState<DateRange>(() => loadRange(scope))
  // Switching screens changes the scope, so the remembered range has to be re-read.
  useEffect(() => setRangeState(loadRange(scope)), [scope])
  const setRange = useCallback(
    (r: DateRange) => {
      setRangeState(r)
      saveRange(scope, r)
    },
    [scope],
  )
  return { range, resolved: resolveRange(range), setRange }
}

/**
 * Preset chips with a custom range behind a disclosure.
 *
 * A horizontal chip row rather than a dropdown: on a phone the whole point is being
 * able to flick between windows and watch the chart change, and a select box costs
 * two taps and a modal for every look.
 */
export default function RangePicker({
  range,
  resolved,
  onChange,
  /** Earliest date with any data, so 'All time' can say what it covers. */
  earliest,
}: {
  range: DateRange
  resolved: ResolvedRange
  onChange: (r: DateRange) => void
  earliest?: string | null
}) {
  const [customOpen, setCustomOpen] = useState(range.preset === 'custom')

  const chip = (p: RangePreset) => (
    <button
      key={p}
      onClick={() => {
        onChange(p === 'custom' ? { preset: 'custom', from: range.from, to: range.to ?? todayISO() } : { preset: p })
        setCustomOpen(p === 'custom')
      }}
      className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
        range.preset === p
          ? 'border-transparent bg-s1 text-white'
          : 'border-line bg-surface-2 text-ink-2 hover:text-ink'
      }`}
    >
      {PRESET_LABEL[p]}
    </button>
  )

  return (
    <div className="space-y-2">
      <div className="no-scrollbar -mx-4 flex items-center gap-1.5 overflow-x-auto px-4">
        {ROLLING_PRESETS.map(chip)}
        {/* A divider, because rolling and calendar presets answer different
            questions and "30 days" sitting next to "This month" is confusing
            without one. */}
        <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-line" />
        {CALENDAR_PRESETS.map(chip)}
        <span aria-hidden className="mx-0.5 h-4 w-px shrink-0 bg-line" />
        {chip('all')}
        {chip('custom')}
      </div>

      {customOpen && (
        <div className="flex flex-wrap items-end gap-2">
          <Field
            label="From"
            type="date"
            className="w-40"
            max={range.to ?? todayISO()}
            value={range.from ?? resolved.from ?? ''}
            onChange={(e) => onChange({ preset: 'custom', from: e.target.value, to: range.to ?? todayISO() })}
          />
          <Field
            label="To"
            type="date"
            className="w-40"
            min={range.from ?? undefined}
            value={range.to ?? todayISO()}
            onChange={(e) => onChange({ preset: 'custom', from: range.from, to: e.target.value })}
          />
          {range.preset === 'custom' && (
            <button
              onClick={() => {
                onChange(DEFAULT_RANGE)
                setCustomOpen(false)
              }}
              className="mb-1 rounded-lg px-2 py-1 text-[11px] text-ink-3 hover:text-ink"
            >
              Reset
            </button>
          )}
        </div>
      )}

      <p className="text-[11px] text-ink-3">
        {resolved.preset === 'all'
          ? earliest
            ? `Everything you have logged, from ${fmtLong(earliest)}.`
            : 'Everything you have logged.'
          : `${resolved.label} · ${fmtLong(resolved.from!)} to ${fmtLong(resolved.to)}`}
      </p>
    </div>
  )
}

function fmtLong(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
