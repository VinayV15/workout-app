import type { Exercise, Profile, SetEntry, Workout } from './types'
import { bestSetE1rm, bodyweightOn, e1rm, lbToKg, kgToLb, round, workingSets } from './calc'
import type { AppData } from './types'
import { exerciseMap } from './exercises'

/**
 * The things you need while standing at the rack rather than reviewing a chart:
 * what to hang on the bar, how to work up to it, how long to rest, and whether
 * what you just did was a best.
 */

// ---------------------------------------------------------------------------
// Rest between sets
// ---------------------------------------------------------------------------

export const DEFAULT_REST_SEC = 90
export const DEFAULT_REST_COMPOUND_SEC = 180
export const DEFAULT_REST_ISOLATION_SEC = 60

/** Isolation and core work needs far less recovery than a heavy compound. */
function isIsolation(ex: Exercise | undefined): boolean {
  return ex?.pattern === 'isolation' || ex?.pattern === 'core'
}

/**
 * Rest for the next set, in seconds, or null when the timer is switched off.
 *
 * Null rather than 0 so the caller shows nothing at all rather than a countdown
 * that is already finished.
 */
export function restSecondsFor(profile: Profile, ex: Exercise | undefined): number | null {
  const mode = profile.restMode ?? 'uniform'
  if (mode === 'off') return null
  if (mode === 'byPattern') {
    const sec = isIsolation(ex)
      ? (profile.restIsolationSec ?? DEFAULT_REST_ISOLATION_SEC)
      : (profile.restCompoundSec ?? DEFAULT_REST_COMPOUND_SEC)
    return sec > 0 ? sec : null
  }
  const sec = profile.restSec ?? DEFAULT_REST_SEC
  return sec > 0 ? sec : null
}

// ---------------------------------------------------------------------------
// Plates
// ---------------------------------------------------------------------------

export const DEFAULT_BAR_LB = 45

/** Plate denominations, in pounds. The kg set is converted so the math stays in one unit. */
const PLATES_LB = [45, 35, 25, 10, 5, 2.5]
const PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25]

export function plateSetFor(units: Profile['units']): number[] {
  return units === 'metric' ? PLATES_KG.map(kgToLb) : PLATES_LB
}

/** Exercises where a per-side plate breakdown makes sense. */
export function isBarLoaded(ex: Exercise | undefined): boolean {
  return ex?.equipment === 'barbell' && ex.loadType === 'weight'
}

export interface PlateBreakdown {
  /** Plate weights for ONE side, heaviest first, in display units. */
  perSide: number[]
  /** Weight that could not be made from the available plates, in display units. */
  leftover: number
  /** Bar weight used, in display units. */
  bar: number
  /** True when the target is below the bar itself. */
  belowBar: boolean
}

/**
 * What to load on each side to reach a total.
 *
 * Greedy from the heaviest plate, which is optimal for the real denominations
 * because each is a multiple of the next where it matters. Any remainder is
 * reported rather than rounded away — silently showing a loadable number that is
 * not the one you asked for would be worse than admitting the gap.
 */
export function platesFor(
  totalLb: number,
  barLb: number,
  platesLb: number[],
  units: Profile['units'],
): PlateBreakdown {
  const toDisplay = (lb: number) => (units === 'metric' ? lbToKg(lb) : lb)
  const bar = toDisplay(barLb)
  if (totalLb < barLb - 0.01) {
    return { perSide: [], leftover: 0, bar, belowBar: true }
  }
  // Per side, so half the load above the bar.
  let remaining = (totalLb - barLb) / 2
  const perSide: number[] = []
  for (const plate of platesLb) {
    // Guard against a runaway loop on a malformed plate set.
    if (plate <= 0) continue
    while (remaining >= plate - 0.01) {
      perSide.push(toDisplay(plate))
      remaining -= plate
    }
  }
  return {
    perSide,
    // Doubled back to a whole-bar figure, which is the unit the user entered.
    leftover: toDisplay(Math.max(0, remaining) * 2),
    bar,
    belowBar: false,
  }
}

/** "45 + 25 + 5" — or a count when a plate repeats, which is how people read a bar. */
export function formatPlates(perSide: number[]): string {
  if (perSide.length === 0) return 'empty bar'
  const groups: { weight: number; count: number }[] = []
  for (const p of perSide) {
    const last = groups[groups.length - 1]
    if (last && Math.abs(last.weight - p) < 0.01) last.count++
    else groups.push({ weight: p, count: 1 })
  }
  return groups.map((g) => (g.count > 1 ? `${g.count}×${round(g.weight, 2)}` : `${round(g.weight, 2)}`)).join(' + ')
}

/** The smallest total change the available plates can make (both sides). */
export function smallestIncrementLb(platesLb: number[]): number {
  return Math.min(...platesLb) * 2
}

/** Rounds a load to something the plates can actually make. */
export function roundToLoadable(totalLb: number, barLb: number, platesLb: number[]): number {
  const step = smallestIncrementLb(platesLb)
  if (totalLb <= barLb) return barLb
  return barLb + Math.round((totalLb - barLb) / step) * step
}

// ---------------------------------------------------------------------------
// Warm-up ramp
// ---------------------------------------------------------------------------

/**
 * Warm-up sets leading to a working load.
 *
 * Percentages descend in reps as they climb in load: the point is to rehearse the
 * movement and prime the nervous system without spending the working sets. Loads
 * are snapped to what the plates can make, and duplicates are dropped so a light
 * top set does not produce three identical warm-ups.
 */
export function warmupRamp(
  topSetLb: number,
  barLb: number,
  platesLb: number[],
  loadable: boolean,
): SetEntry[] {
  if (topSetLb <= 0) return []
  const steps: { pct: number; reps: number }[] = [
    { pct: 0.4, reps: 8 },
    { pct: 0.6, reps: 5 },
    { pct: 0.8, reps: 3 },
  ]
  const out: SetEntry[] = []
  let previous = loadable ? barLb : 0
  for (const { pct, reps } of steps) {
    const raw = topSetLb * pct
    const weight = loadable ? roundToLoadable(raw, barLb, platesLb) : round(raw, 1)
    // Skip a step that is not actually heavier than the last, and never warm up
    // at or above the working load.
    if (weight <= previous || weight >= topSetLb) continue
    out.push({ reps, weight, warmup: true })
    previous = weight
  }
  return out
}

// ---------------------------------------------------------------------------
// Personal records
// ---------------------------------------------------------------------------

export interface PRHit {
  exerciseId: string
  name: string
  /** A heavier single set, a better estimated 1RM, or both. */
  kinds: ('weight' | 'e1rm')[]
  heaviestLb: number
  e1rmLb: number
  /** What it beat, so the result is a comparison rather than a claim. */
  previousHeaviestLb: number
  previousE1rmLb: number
}

/**
 * Records set by a session, judged against every *other* session in the log.
 *
 * Excludes the session itself by id so this works both for a new workout and for
 * one being re-saved after an edit — otherwise editing a PR session would always
 * report it as beating itself.
 */
export function detectPRs(workout: Workout, data: AppData): PRHit[] {
  const map = exerciseMap(data.customExercises)
  const bw = bodyweightOn(data.body, workout.date) ?? 0
  const out: PRHit[] = []

  for (const le of workout.exercises) {
    const sets = workingSets(le.sets)
    if (sets.length === 0) continue
    const ex = map.get(le.exerciseId)
    const carries = ex?.loadType === 'bodyweight' || ex?.loadType === 'weighted_bodyweight'
    // Time-based work has no load to compare, so a "PR" would be meaningless.
    if (ex?.loadType === 'time') continue
    const load = (s: SetEntry) => (carries ? bw + (s.weight || 0) : s.weight || 0)

    const heaviest = sets.reduce((m, s) => Math.max(m, load(s)), 0)
    const best = bestSetE1rm(sets, bw, ex?.loadType)
    if (heaviest <= 0 && best <= 0) continue

    let priorHeaviest = 0
    let priorE1rm = 0
    for (const w of data.workouts) {
      if (w.id === workout.id) continue
      const prev = w.exercises.find((e) => e.exerciseId === le.exerciseId)
      if (!prev) continue
      const prevSets = workingSets(prev.sets)
      if (prevSets.length === 0) continue
      const prevBw = bodyweightOn(data.body, w.date) ?? 0
      const prevLoad = (s: SetEntry) => (carries ? prevBw + (s.weight || 0) : s.weight || 0)
      priorHeaviest = Math.max(priorHeaviest, ...prevSets.map(prevLoad))
      priorE1rm = Math.max(priorE1rm, bestSetE1rm(prevSets, prevBw, ex?.loadType))
    }

    // A first-ever session is not a record — there was nothing to beat.
    if (priorHeaviest <= 0 && priorE1rm <= 0) continue

    const kinds: ('weight' | 'e1rm')[] = []
    // A hair over is measurement noise, not a record.
    if (heaviest > priorHeaviest + 0.01) kinds.push('weight')
    if (best > priorE1rm + 0.5) kinds.push('e1rm')
    if (kinds.length === 0) continue

    out.push({
      exerciseId: le.exerciseId,
      name: ex?.name ?? le.exerciseId,
      kinds,
      heaviestLb: heaviest,
      e1rmLb: best,
      previousHeaviestLb: priorHeaviest,
      previousE1rmLb: priorE1rm,
    })
  }

  // Heaviest lifts first, so the headline PR is the one that matters most.
  return out.sort((a, b) => b.e1rmLb - a.e1rmLb)
}

// ---------------------------------------------------------------------------
// Repeating a session
// ---------------------------------------------------------------------------

/**
 * The most recent session, as a fresh draft for today.
 *
 * Loads and reps come across so the session opens as "last time's numbers, beat
 * them" rather than an empty grid. Warm-ups come too — they are part of the
 * session you are repeating. The plan link deliberately does not, because
 * repeating a session by hand is not the same as completing the next one the
 * block prescribed.
 */
export function repeatLastSession(data: AppData, todayIso: string, makeId: () => string): Workout | null {
  const last = [...data.workouts].sort((a, b) => b.date.localeCompare(a.date))[0]
  if (!last) return null
  return {
    id: makeId(),
    date: todayIso,
    name: last.name,
    exercises: last.exercises.map((e) => ({
      exerciseId: e.exerciseId,
      sets: e.sets.map((s) => ({ ...s })),
      note: e.note,
    })),
  }
}

/** Re-exported so callers can size a set row's estimate without importing calc too. */
export { e1rm }
