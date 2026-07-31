import type { Run } from './types'
import { riegel } from './calc'

/**
 * Trending one distance from every run you have logged.
 *
 * The problem this solves: you have hundreds of runs and almost none of them are
 * exactly 5K, so a chart of "my 5K times" has three points on it. Converting each run
 * to an equivalent effort at the target distance turns all of them into one dense
 * trend line.
 */

export type EquivalentMethod = 'pace' | 'riegel'

export const METHOD_LABEL: Record<EquivalentMethod, string> = {
  pace: 'Same pace',
  riegel: 'Riegel adjusted',
}

/**
 * Equivalent time at `targetMi`, in seconds.
 *
 * **pace** holds your average pace for that run and scales it to the distance: 2 miles
 * in 20:00 is 10:00/mile, so it reports a 10:00 mile and a 30:00 three-miler. It is
 * not a race prediction — nobody runs a marathon at mile pace, and you would run a
 * mile faster than your 2-mile pace. What it *is* good for is exactly what it is used
 * for here: a trend. The distortion for a given distance is constant, so the line
 * moves only when your pace does, and improvement shows up truthfully.
 *
 * **riegel** applies the standard endurance exponent, so longer distances are
 * predicted slower than pure pace scaling. Use it when the number itself matters —
 * "what could I actually run" — rather than the shape of the trend.
 */
export function equivalentSeconds(run: Run, targetMi: number, method: EquivalentMethod): number | null {
  if (run.distanceMi <= 0 || run.seconds <= 0 || targetMi <= 0) return null
  if (method === 'riegel') return riegel(run.seconds, run.distanceMi, targetMi)
  return (run.seconds / run.distanceMi) * targetMi
}

/** Within this fraction of the target, a run counts as an actual effort at it. */
const ACTUAL_TOLERANCE = 0.04

export function isActualAt(run: Run, targetMi: number): boolean {
  return Math.abs(run.distanceMi - targetMi) / targetMi <= ACTUAL_TOLERANCE
}

export interface DistancePoint {
  date: string
  /** Equivalent time at the target distance, in seconds. */
  seconds: number
  /** Seconds per mile, which is the same for every distance and so comparable. */
  paceSecPerMi: number
  /** The run this came from. */
  run: Run
  /** True when the run was actually at this distance rather than converted. */
  actual: boolean
}

/**
 * Every run as a point at the target distance, oldest first.
 *
 * Deliberately includes runs of any length — that was the explicit ask, and with pace
 * scaling there is no exponent to misapply. The caller shows which points are real and
 * which are converted, so a 400m sprint claiming a fast marathon is visible as a
 * converted point from a very short run rather than passing as fact.
 */
export function distanceSeries(
  runs: Run[],
  targetMi: number,
  method: EquivalentMethod,
): DistancePoint[] {
  const out: DistancePoint[] = []
  for (const run of runs) {
    const seconds = equivalentSeconds(run, targetMi, method)
    if (seconds == null || !Number.isFinite(seconds)) continue
    out.push({
      date: run.date,
      seconds,
      paceSecPerMi: run.seconds / run.distanceMi,
      run,
      actual: isActualAt(run, targetMi),
    })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

export interface DistanceSummary {
  /** Fastest equivalent in the series. */
  best: DistancePoint | null
  /** Fastest run actually at this distance. */
  bestActual: DistancePoint | null
  /** Most recent point. */
  latest: DistancePoint | null
  /** Change in equivalent seconds from the first point to the last. Negative is faster. */
  changeSec: number | null
  /** How many points came from a real run at this distance. */
  actualCount: number
  total: number
}

export function summarise(series: DistancePoint[]): DistanceSummary {
  if (series.length === 0) {
    return { best: null, bestActual: null, latest: null, changeSec: null, actualCount: 0, total: 0 }
  }
  const best = series.reduce((b, p) => (p.seconds < b.seconds ? p : b))
  const actuals = series.filter((p) => p.actual)
  return {
    best,
    bestActual: actuals.length ? actuals.reduce((b, p) => (p.seconds < b.seconds ? p : b)) : null,
    latest: series[series.length - 1],
    // First-to-last rather than a regression: for a single distance the question is
    // "am I faster than when I started", and a fit would be dragged around by one
    // very short run converting to an implausible time.
    changeSec: series.length >= 2 ? series[series.length - 1].seconds - series[0].seconds : null,
    actualCount: actuals.length,
    total: series.length,
  }
}

/**
 * Volume per period: distance covered and time spent.
 *
 * Time spent is the honest measure of training load when paces vary — an easy hour and
 * a hard hour cost the same time but very different distance, and only one of those
 * shows up in mileage.
 */
export function volumeByPeriod(
  runs: Run[],
  bucketOf: (iso: string) => string,
): { period: string; miles: number; seconds: number; runs: number }[] {
  const map = new Map<string, { miles: number; seconds: number; runs: number }>()
  for (const r of runs) {
    const k = bucketOf(r.date)
    const b = map.get(k) ?? { miles: 0, seconds: 0, runs: 0 }
    b.miles += r.distanceMi
    b.seconds += r.seconds
    b.runs += 1
    map.set(k, b)
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([period, b]) => ({ period, ...b }))
}
