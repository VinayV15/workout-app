import type { BodyEntry, Profile } from './types'
import { fromISO, leanMass, linRegSlope, navyBodyFat } from './calc'
import type { ResolvedRange } from './dateRange'

/**
 * Trend fits over a user-chosen range, for the charts and read-outs.
 *
 * Separate from the fits in calc.ts on purpose. Those exist for the coach and are
 * pinned to calibrated windows — a fat-loss rate compared against a 0.5–1%/week band
 * has to be measured per week over about a month, or the comparison is meaningless.
 * These are for looking: fitted over exactly whatever window you picked, no widening,
 * no assumptions.
 */

/** Below this a regression is noise rather than a trend. */
const MIN_POINTS = 3

function slopePerWeek<T extends { date: string }>(items: T[], value: (t: T) => number | null | undefined): number | null {
  const pts = items
    .filter((i) => value(i) != null)
    .sort((a, b) => a.date.localeCompare(b.date))
  if (pts.length < MIN_POINTS) return null
  const x0 = fromISO(pts[0].date).getTime()
  const slope = linRegSlope(
    pts.map((p) => (fromISO(p.date).getTime() - x0) / 86400000),
    pts.map((p) => value(p)!),
  )
  return slope === null ? null : slope * 7
}

/**
 * Bodyweight change per week across the range.
 *
 * The entries are expected to be pre-filtered to the range; it is passed as well so
 * the intent is readable at the call site and so a future caller cannot accidentally
 * hand in the whole history.
 */
export function rateOverRange(body: BodyEntry[], _range: ResolvedRange): number | null {
  return slopePerWeek(body, (b) => b.weightLb)
}

/** Lean-mass change per week across the range, to catch muscle loss on a cut. */
export function leanRateOverRange(body: BodyEntry[], profile: Profile, _range: ResolvedRange): number | null {
  return slopePerWeek(body, (b) => {
    const bf = b.bodyFatPct ?? navyBodyFat(b, profile)
    return b.weightLb && bf != null ? leanMass(b.weightLb, bf) : null
  })
}

/** Percent change per week in a value series, for e1RM and similar. */
export function pctPerWeekOverRange<T extends { date: string }>(
  items: T[],
  value: (t: T) => number,
): number | null {
  const pts = items.filter((i) => value(i) > 0).sort((a, b) => a.date.localeCompare(b.date))
  if (pts.length < MIN_POINTS) return null
  const ys = pts.map(value)
  const x0 = fromISO(pts[0].date).getTime()
  const slope = linRegSlope(
    pts.map((p) => (fromISO(p.date).getTime() - x0) / 86400000),
    ys,
  )
  const mean = ys.reduce((a, b) => a + b, 0) / ys.length
  if (slope === null || mean <= 0) return null
  return (slope * 7 * 100) / mean
}
