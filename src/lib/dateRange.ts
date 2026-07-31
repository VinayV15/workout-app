import { addDays, daysBetween, fromISO, todayISO, toISO, weekStart } from './calc'

/**
 * Date ranges for the charts, tables and trend read-outs.
 *
 * Two kinds of preset, because they answer different questions. **Rolling** windows
 * end today and always contain a full period — the right default, because a trend
 * line should run up to now and never be nearly empty just because a calendar month
 * started two days ago. **Calendar** periods are for reviewing a defined block:
 * "how did July go".
 *
 * This governs what you *look at*. It deliberately does not govern the coach's
 * diagnostic windows: the acute-to-chronic ratio is *defined* as 7 days over a 4-week
 * average, weekly set targets are a 14-day average, and the fat-loss band is
 * calibrated per week. Those are methods, not display preferences, and re-scoping them
 * to a year would leave their labels claiming something untrue. See `adaptiveWindow`
 * in calc.ts for how the coach widens its own windows when data is sparse.
 */

export type RangePreset =
  | 'week'
  | 'month'
  | 'quarter'
  | 'year'
  | 'thisMonth'
  | 'lastMonth'
  | 'thisYear'
  | 'all'
  | 'custom'

export interface DateRange {
  preset: RangePreset
  /** Only meaningful when preset is 'custom'. ISO dates, inclusive. */
  from?: string
  to?: string
}

/** Rolling window lengths, in days. */
const ROLLING_DAYS: Partial<Record<RangePreset, number>> = {
  week: 7,
  month: 30,
  quarter: 90,
  year: 365,
}

export const DEFAULT_RANGE: DateRange = { preset: 'quarter' }

export const PRESET_LABEL: Record<RangePreset, string> = {
  week: '7 days',
  month: '30 days',
  quarter: '90 days',
  year: '1 year',
  thisMonth: 'This month',
  lastMonth: 'Last month',
  thisYear: 'This year',
  all: 'All time',
  custom: 'Custom',
}

/** The presets offered in the picker, in order. Rolling first — they are the default. */
export const ROLLING_PRESETS: RangePreset[] = ['week', 'month', 'quarter', 'year']
export const CALENDAR_PRESETS: RangePreset[] = ['thisMonth', 'lastMonth', 'thisYear']

export interface ResolvedRange {
  /** Inclusive ISO start, or null for an unbounded start ('all time'). */
  from: string | null
  /** Inclusive ISO end. */
  to: string
  /** Length in days, or null when unbounded. */
  days: number | null
  label: string
  preset: RangePreset
}

function monthStart(iso: string, offsetMonths = 0): string {
  const d = fromISO(iso)
  return toISO(new Date(d.getFullYear(), d.getMonth() + offsetMonths, 1))
}

function monthEnd(iso: string, offsetMonths = 0): string {
  const d = fromISO(iso)
  // Day 0 of the next month is the last day of this one, which sidesteps having to
  // know month lengths or leap years.
  return toISO(new Date(d.getFullYear(), d.getMonth() + offsetMonths + 1, 0))
}

/**
 * Turns a range into concrete dates.
 *
 * `today` is a parameter rather than read from the clock so this is testable and so a
 * caller can resolve a range as of some other day.
 */
export function resolveRange(range: DateRange, today = todayISO()): ResolvedRange {
  const p = range.preset

  if (p === 'all') {
    return { from: null, to: today, days: null, label: 'All time', preset: p }
  }

  if (p === 'custom') {
    // A half-filled custom range is normal while it is being typed, so fall back
    // rather than showing nothing.
    const from = range.from ?? addDays(today, -(ROLLING_DAYS.quarter! - 1))
    const to = range.to ?? today
    // Reversed dates are a slip, not an empty range — swap instead of showing
    // nothing and leaving the user to work out why.
    const [a, b] = from <= to ? [from, to] : [to, from]
    return { from: a, to: b, days: daysBetween(a, b) + 1, label: `${fmtShort(a)} – ${fmtShort(b)}`, preset: p }
  }

  if (p === 'thisMonth') {
    const from = monthStart(today)
    return { from, to: today, days: daysBetween(from, today) + 1, label: monthName(today), preset: p }
  }
  if (p === 'lastMonth') {
    const from = monthStart(today, -1)
    const to = monthEnd(today, -1)
    return { from, to, days: daysBetween(from, to) + 1, label: monthName(from), preset: p }
  }
  if (p === 'thisYear') {
    const from = toISO(new Date(fromISO(today).getFullYear(), 0, 1))
    return { from, to: today, days: daysBetween(from, today) + 1, label: String(fromISO(today).getFullYear()), preset: p }
  }

  const days = ROLLING_DAYS[p] ?? ROLLING_DAYS.quarter!
  const from = addDays(today, -(days - 1))
  return { from, to: today, days, label: `Last ${PRESET_LABEL[p]}`, preset: p }
}

function fmtShort(iso: string): string {
  return fromISO(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function monthName(iso: string): string {
  return fromISO(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

/** Filters any dated list to a resolved range. */
export function withinRange<T extends { date: string }>(items: T[], r: ResolvedRange): T[] {
  return items.filter((i) => (r.from === null || i.date >= r.from) && i.date <= r.to)
}

/**
 * Whether a range is long enough that per-week figures make more sense than
 * per-day ones — used to pick chart bucketing.
 */
export function bucketFor(r: ResolvedRange, spanDays: number): 'day' | 'week' | 'month' {
  const days = r.days ?? spanDays
  if (days <= 35) return 'day'
  if (days <= 400) return 'week'
  return 'month'
}

/** Start of the bucket a date falls in, so a series can be grouped consistently. */
export function bucketStart(iso: string, bucket: 'day' | 'week' | 'month'): string {
  if (bucket === 'day') return iso
  if (bucket === 'week') return weekStart(iso)
  return monthStart(iso)
}

export function bucketLabel(bucket: 'day' | 'week' | 'month'): string {
  return bucket === 'day' ? 'Day' : bucket === 'week' ? 'Week of' : 'Month'
}

// ---------------------------------------------------------------------------
// Per-screen persistence
// ---------------------------------------------------------------------------

/**
 * Ranges are remembered per screen, on the device.
 *
 * Per screen because body composition moves over months and lifts move weekly, so a
 * single global window would be wrong for one of them. On the device rather than in
 * the synced document because it is a viewing preference, not training data — and
 * syncing it would mean opening the app on your phone could change what your laptop
 * was looking at.
 */
export type RangeScope = 'body' | 'lift' | 'run' | 'progress' | 'volume'

const KEY = (scope: RangeScope) => `forge.range.${scope}`

export function loadRange(scope: RangeScope): DateRange {
  try {
    const raw = localStorage.getItem(KEY(scope))
    if (!raw) return DEFAULT_RANGE
    const parsed = JSON.parse(raw) as DateRange
    return parsed?.preset ? parsed : DEFAULT_RANGE
  } catch {
    return DEFAULT_RANGE
  }
}

export function saveRange(scope: RangeScope, range: DateRange) {
  try {
    localStorage.setItem(KEY(scope), JSON.stringify(range))
  } catch {
    /* storage denied — the range just resets next launch */
  }
}

/** Every persisted range key, so erasing the device can clear them. */
export function rangeKeys(): string[] {
  return (['body', 'lift', 'run', 'progress', 'volume'] as RangeScope[]).map(KEY)
}
