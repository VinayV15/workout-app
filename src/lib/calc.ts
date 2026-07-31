import type {
  AppData,
  BodyEntry,
  Exercise,
  Muscle,
  Profile,
  Run,
  SetEntry,
  Workout,
} from './types'
import { HARD_RUN_TYPES, MUSCLES } from './types'
import { LOWER_PATTERNS, PULL_PATTERNS, PUSH_PATTERNS, exerciseMap } from './exercises'

// ---------------------------------------------------------------------------
// Dates. Everything is a local YYYY-MM-DD string so there is no timezone drift.
// ---------------------------------------------------------------------------

export function todayISO(): string {
  return toISO(new Date())
}

export function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromISO(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function addDays(iso: string, n: number): string {
  const d = fromISO(iso)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  const ms = fromISO(b).getTime() - fromISO(a).getTime()
  return Math.round(ms / 86400000)
}

export function daysAgo(iso: string): number {
  return daysBetween(iso, todayISO())
}

/** Monday-start week key for grouping. */
export function weekStart(iso: string): string {
  const d = fromISO(iso)
  const dow = (d.getDay() + 6) % 7 // Mon = 0
  d.setDate(d.getDate() - dow)
  return toISO(d)
}

export function lastNDays(n: number): { from: string; to: string } {
  const to = todayISO()
  return { from: addDays(to, -(n - 1)), to }
}

export function withinDays<T extends { date: string }>(items: T[], n: number, endISO = todayISO()): T[] {
  const from = addDays(endISO, -(n - 1))
  return items.filter((i) => i.date >= from && i.date <= endISO)
}

export function fmtDate(iso: string): string {
  return fromISO(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function fmtDateFull(iso: string): string {
  return fromISO(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

// ---------------------------------------------------------------------------
// Units
// ---------------------------------------------------------------------------

export const LB_PER_KG = 2.2046226218
export const MI_PER_KM = 0.621371192

export const lbToKg = (lb: number) => lb / LB_PER_KG
export const kgToLb = (kg: number) => kg * LB_PER_KG
export const miToKm = (mi: number) => mi / MI_PER_KM
export const kmToMi = (km: number) => km * MI_PER_KM
export const inToCm = (i: number) => i * 2.54
export const cmToIn = (c: number) => c / 2.54

/** Weight display value from the canonical pound value. */
export function dispWeight(lb: number, units: Profile['units']): number {
  return units === 'metric' ? lbToKg(lb) : lb
}
export function storeWeight(v: number, units: Profile['units']): number {
  return units === 'metric' ? kgToLb(v) : v
}
export function weightUnit(units: Profile['units']): string {
  return units === 'metric' ? 'kg' : 'lb'
}
export function dispDistance(mi: number, units: Profile['units']): number {
  return units === 'metric' ? miToKm(mi) : mi
}
export function storeDistance(v: number, units: Profile['units']): number {
  return units === 'metric' ? kmToMi(v) : v
}
export function distanceUnit(units: Profile['units']): string {
  return units === 'metric' ? 'km' : 'mi'
}
export function dispLength(inches: number, units: Profile['units']): number {
  return units === 'metric' ? inToCm(inches) : inches
}
export function storeLength(v: number, units: Profile['units']): number {
  return units === 'metric' ? cmToIn(v) : v
}
export function lengthUnit(units: Profile['units']): string {
  return units === 'metric' ? 'cm' : 'in'
}

export const FT_PER_M = 3.280839895
export const ftToM = (ft: number) => ft / FT_PER_M
export const mToFt = (m: number) => m * FT_PER_M

/**
 * Elevation is stored in feet like every other length here is stored imperial,
 * so a metric entry has to be converted rather than kept raw — otherwise the
 * same number gets relabelled "ft" the moment units are switched.
 */
export function dispElevation(ft: number, units: Profile['units']): number {
  return units === 'metric' ? ftToM(ft) : ft
}
export function storeElevation(v: number, units: Profile['units']): number {
  return units === 'metric' ? mToFt(v) : v
}
export function elevationUnit(units: Profile['units']): string {
  return units === 'metric' ? 'm' : 'ft'
}

export function round(n: number, places = 1): number {
  const f = 10 ** places
  return Math.round(n * f) / f
}

// ---------------------------------------------------------------------------
// Time formatting
// ---------------------------------------------------------------------------

/** 3725 -> "1:02:05", 305 -> "5:05" */
export function fmtDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

/** Accepts "42:30", "1:05:20", "25", "25m", "1h05" -> seconds. */
export function parseDuration(input: string): number | null {
  const t = input.trim().toLowerCase()
  if (!t) return null
  if (t.includes(':')) {
    const parts = t.split(':').map((p) => Number(p.trim()))
    if (parts.some((p) => Number.isNaN(p))) return null
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
    if (parts.length === 2) return parts[0] * 60 + parts[1]
    return null
  }
  const hm = t.match(/^(\d+(?:\.\d+)?)h\s*(\d+(?:\.\d+)?)?m?$/)
  if (hm) return Number(hm[1]) * 3600 + (hm[2] ? Number(hm[2]) * 60 : 0)
  const n = Number(t.replace(/[ms]/g, ''))
  if (Number.isNaN(n)) return null
  return n * 60 // bare number means minutes
}

/**
 * Escapes one CSV field per RFC 4180. Lives here rather than beside the export so
 * it is reachable from the tests, which cannot import the store's JSX.
 *
 * Quoting only on a comma was not enough: a note containing a quote or a line
 * break silently corrupted every column after it, and notes are exactly where
 * free text ends up.
 */
export function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** Seconds per display distance unit. */
export function paceSecPerUnit(run: Run, units: Profile['units']): number {
  const dist = dispDistance(run.distanceMi, units)
  return dist > 0 ? run.seconds / dist : 0
}

export function fmtPace(secPerUnit: number, units: Profile['units']): string {
  if (!Number.isFinite(secPerUnit) || secPerUnit <= 0) return '—'
  return `${fmtDuration(secPerUnit)}/${distanceUnit(units)}`
}

// ---------------------------------------------------------------------------
// Strength math
// ---------------------------------------------------------------------------

/** Beyond this a set measures endurance, not maximal strength. */
export const E1RM_MAX_REPS = 20

/**
 * Estimated one-rep max: the heaviest single rep your set implies.
 *
 * A blend of three established formulas rather than one, because each is only
 * trustworthy over part of the rep range and their errors run in opposite
 * directions. Epley is reliable in the middle and drifts high as reps climb;
 * Brzycki matches it around 10 and then diverges badly — its denominator runs out,
 * so at 20 reps it claims twice the load; Lombardi is conservative throughout.
 *
 * This used to be Epley alone, capped at 12 reps, which understated anyone training
 * in the 12-20 range and — worse — made their estimate go *flat*, because every set
 * past 12 reps scored identically. Someone who trains at 15 reps could not see
 * strength improve at all.
 *
 * Brzycki's weight fades out smoothly between 6 and 12 reps rather than being
 * switched off at a threshold: a step there would make 11 reps score lower than 10,
 * and "more reps at the same weight is stronger" has to hold everywhere.
 */
export function e1rm(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0
  // A single is not an estimate — it is the measurement.
  if (reps === 1) return weight
  const r = Math.min(reps, E1RM_MAX_REPS)
  const epley = weight * (1 + r / 30)
  const brzycki = weight * (36 / (37 - r))
  const lombardi = weight * r ** 0.1
  const brzyckiWeight = Math.max(0, Math.min(1, (12 - r) / 6))
  return (epley + lombardi + brzyckiWeight * brzycki) / (2 + brzyckiWeight)
}

export function bestSetE1rm(sets: SetEntry[], bodyweightLb = 0, loadType: Exercise['loadType'] = 'weight'): number {
  let best = 0
  for (const s of sets) {
    if (s.warmup) continue
    const load =
      loadType === 'bodyweight' || loadType === 'weighted_bodyweight' ? bodyweightLb + (s.weight || 0) : s.weight
    const v = e1rm(load, s.reps)
    if (v > best) best = v
  }
  return best
}

/** Total tonnage: sum of weight × reps over working sets. */
export function volumeLoad(sets: SetEntry[], bodyweightLb = 0, loadType: Exercise['loadType'] = 'weight'): number {
  let total = 0
  for (const s of sets) {
    if (s.warmup) continue
    const load =
      loadType === 'bodyweight' || loadType === 'weighted_bodyweight' ? bodyweightLb + (s.weight || 0) : s.weight
    total += (load || 0) * (s.reps || 0)
  }
  return total
}

export function workingSets(sets: SetEntry[]): SetEntry[] {
  return sets.filter((s) => !s.warmup)
}

export type MuscleVolume = Record<Muscle, number>

export function emptyMuscleVolume(): MuscleVolume {
  return MUSCLES.reduce((acc, m) => {
    acc[m] = 0
    return acc
  }, {} as MuscleVolume)
}

/**
 * Weekly set count per muscle. Primary muscles get 1.0 per working set,
 * secondary 0.5 — the standard fractional-volume convention.
 */
export function muscleSetVolume(workouts: Workout[], custom: Exercise[] = []): MuscleVolume {
  const map = exerciseMap(custom)
  const out = emptyMuscleVolume()
  for (const w of workouts) {
    for (const le of w.exercises) {
      const ex = map.get(le.exerciseId)
      if (!ex) continue
      const n = workingSets(le.sets).length
      if (!n) continue
      for (const m of ex.primary) out[m] += n
      for (const m of ex.secondary) out[m] += n * 0.5
    }
  }
  return out
}

/** How many distinct days in the window each muscle received direct work. */
export function muscleFrequency(workouts: Workout[], custom: Exercise[] = []): Record<Muscle, number> {
  const map = exerciseMap(custom)
  const days: Record<string, Set<string>> = {}
  for (const w of workouts) {
    for (const le of w.exercises) {
      const ex = map.get(le.exerciseId)
      if (!ex || workingSets(le.sets).length === 0) continue
      for (const m of ex.primary) {
        days[m] ??= new Set()
        days[m].add(w.date)
      }
    }
  }
  return MUSCLES.reduce((acc, m) => {
    acc[m] = days[m]?.size ?? 0
    return acc
  }, {} as Record<Muscle, number>)
}

/** Most recent date each muscle was trained directly, or null. */
export function lastTrained(workouts: Workout[], custom: Exercise[] = []): Record<Muscle, string | null> {
  const map = exerciseMap(custom)
  const out = MUSCLES.reduce((acc, m) => {
    acc[m] = null
    return acc
  }, {} as Record<Muscle, string | null>)
  for (const w of [...workouts].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const le of w.exercises) {
      const ex = map.get(le.exerciseId)
      if (!ex || workingSets(le.sets).length === 0) continue
      for (const m of ex.primary) out[m] = w.date
    }
  }
  return out
}

export interface BalanceSplit {
  push: number
  pull: number
  lower: number
  upper: number
}

export function patternBalance(workouts: Workout[], custom: Exercise[] = []): BalanceSplit {
  const map = exerciseMap(custom)
  const out: BalanceSplit = { push: 0, pull: 0, lower: 0, upper: 0 }
  for (const w of workouts) {
    for (const le of w.exercises) {
      const ex = map.get(le.exerciseId)
      if (!ex) continue
      const n = workingSets(le.sets).length
      if (PUSH_PATTERNS.has(ex.pattern)) {
        out.push += n
        out.upper += n
      } else if (PULL_PATTERNS.has(ex.pattern)) {
        out.pull += n
        out.upper += n
      } else if (LOWER_PATTERNS.has(ex.pattern)) {
        out.lower += n
      }
    }
  }
  return out
}

export interface ExerciseProgressPoint {
  date: string
  e1rm: number
  topSet: string
  volume: number
}

/** Per-session best e1RM history for one exercise, oldest first. */
export function exerciseHistory(
  exerciseId: string,
  data: AppData,
): ExerciseProgressPoint[] {
  const map = exerciseMap(data.customExercises)
  const ex = map.get(exerciseId)
  const out: ExerciseProgressPoint[] = []
  for (const w of [...data.workouts].sort((a, b) => a.date.localeCompare(b.date))) {
    const le = w.exercises.find((e) => e.exerciseId === exerciseId)
    if (!le) continue
    const sets = workingSets(le.sets)
    if (!sets.length) continue
    const bw = bodyweightOn(data.body, w.date) ?? 0
    const value = bestSetE1rm(sets, bw, ex?.loadType)
    let best = sets[0]
    for (const s of sets) if (e1rm(s.weight, s.reps) > e1rm(best.weight, best.reps)) best = s
    out.push({
      date: w.date,
      e1rm: round(value, 1),
      topSet: `${best.reps} × ${round(best.weight, 1)}`,
      volume: round(volumeLoad(sets, bw, ex?.loadType), 0),
    })
  }
  return out
}

/** Personal record (heaviest single working set) and best e1RM for an exercise. */
export function exercisePR(exerciseId: string, data: AppData) {
  let heaviest = 0
  let heaviestReps = 0
  let bestE1rm = 0
  let bestDate = ''
  const ex = exerciseMap(data.customExercises).get(exerciseId)
  const carriesBodyweight = ex?.loadType === 'bodyweight' || ex?.loadType === 'weighted_bodyweight'
  for (const w of data.workouts) {
    const le = w.exercises.find((e) => e.exerciseId === exerciseId)
    if (!le) continue
    const bw = bodyweightOn(data.body, w.date) ?? 0
    for (const s of workingSets(le.sets)) {
      // Total load, so the heaviest set is on the same footing as the estimated
      // 1RM beside it — otherwise a weighted pull-up reports its added plate as
      // the heaviest thing lifted.
      const load = carriesBodyweight ? bw + (s.weight || 0) : s.weight
      if (load > heaviest) {
        heaviest = load
        heaviestReps = s.reps
      }
    }
    const v = bestSetE1rm(le.sets, bw, ex?.loadType)
    if (v > bestE1rm) {
      bestE1rm = v
      bestDate = w.date
    }
  }
  return { heaviest, heaviestReps, bestE1rm: round(bestE1rm, 1), bestDate }
}

/**
 * Trend in estimated 1RM over the trailing window, as percent change per week.
 * Returns null when there aren't at least 3 sessions to fit.
 */
export function strengthTrendFit(history: ExerciseProgressPoint[], days = 42): TrendFit | null {
  const usable = history.filter((h) => h.e1rm > 0)
  const today = todayISO()
  for (const step of WIDEN_STEPS) {
    const window = Math.round(days * step)
    const pts = usable.filter((h) => h.date >= addDays(today, -window))
    if (pts.length < MIN_POINTS) continue
    const x0 = fromISO(pts[0].date).getTime()
    const ys = pts.map((p) => p.e1rm)
    const slope = linRegSlope(
      pts.map((p) => (fromISO(p.date).getTime() - x0) / 86400000),
      ys,
    )
    const mean = ys.reduce((a, b) => a + b, 0) / ys.length
    if (slope === null || mean <= 0) continue
    // Percent of current load per week, so a 300lb squat and a 30lb curl are
    // comparable.
    return { perWeek: (slope * 7 * 100) / mean, days: window, points: pts.length, widened: step > 1 }
  }
  return null
}

export function strengthTrend(history: ExerciseProgressPoint[], days = 42): number | null {
  return strengthTrendFit(history, days)?.perWeek ?? null
}

// ---------------------------------------------------------------------------
// Statistics helpers
// ---------------------------------------------------------------------------

/** Ordinary least-squares slope (units of y per unit of x). */
export function linRegSlope(xs: number[], ys: number[]): number | null {
  const n = xs.length
  if (n < 2) return null
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0
  let den = 0
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my)
    den += (xs[i] - mx) ** 2
  }
  if (den === 0) return null
  return num / den
}

/** Exponential moving average over a dated series, returned aligned to input. */
export function ema<T>(items: T[], value: (t: T) => number, alpha = 0.25): number[] {
  const out: number[] = []
  let prev: number | null = null
  for (const it of items) {
    const v = value(it)
    prev = prev === null ? v : alpha * v + (1 - alpha) * prev
    out.push(prev)
  }
  return out
}

// ---------------------------------------------------------------------------
// Body composition
// ---------------------------------------------------------------------------

export function bmi(weightLb: number, heightIn: number): number | null {
  if (!weightLb || !heightIn) return null
  return (703 * weightLb) / heightIn ** 2
}

export function bmiCategory(v: number): { label: string; tone: 'good' | 'warning' | 'serious' | 'critical' } {
  if (v < 18.5) return { label: 'Underweight', tone: 'warning' }
  if (v < 25) return { label: 'Normal', tone: 'good' }
  if (v < 30) return { label: 'Overweight', tone: 'warning' }
  if (v < 35) return { label: 'Obese I', tone: 'serious' }
  return { label: 'Obese II+', tone: 'critical' }
}

/**
 * US Navy circumference method for body fat. Needs neck + waist (+ hips for
 * female). Useful as a consistency-tracked estimate, not a lab measurement.
 */
export function navyBodyFat(e: BodyEntry, profile: Profile): number | null {
  const h = profile.heightIn
  if (!h || !e.waistIn || !e.neckIn) return null
  if (profile.sex === 'male') {
    const v = 86.01 * Math.log10(e.waistIn - e.neckIn) - 70.041 * Math.log10(h) + 36.76
    return v > 0 && v < 70 ? v : null
  }
  if (!e.hipsIn) return null
  const v = 163.205 * Math.log10(e.waistIn + e.hipsIn - e.neckIn) - 97.684 * Math.log10(h) - 78.387
  return v > 0 && v < 70 ? v : null
}

export function leanMass(weightLb: number, bfPct: number): number {
  return weightLb * (1 - bfPct / 100)
}
export function fatMass(weightLb: number, bfPct: number): number {
  return weightLb * (bfPct / 100)
}

export function bodyFatCategory(
  bf: number,
  sex: Profile['sex'],
): { label: string; tone: 'good' | 'warning' | 'serious' | 'critical' } {
  const bands: [number, string, 'good' | 'warning' | 'serious' | 'critical'][] =
    sex === 'male'
      ? [
          [6, 'Essential', 'warning'],
          [14, 'Athletic', 'good'],
          [18, 'Fit', 'good'],
          [25, 'Average', 'warning'],
          [Infinity, 'High', 'serious'],
        ]
      : [
          [14, 'Essential', 'warning'],
          [21, 'Athletic', 'good'],
          [25, 'Fit', 'good'],
          [32, 'Average', 'warning'],
          [Infinity, 'High', 'serious'],
        ]
  for (const [max, label, tone] of bands) if (bf < max) return { label, tone }
  return { label: 'High', tone: 'serious' }
}

/** Most recent recorded bodyweight at or before a date. */
export function bodyweightOn(body: BodyEntry[], iso: string): number | null {
  const sorted = body
    .filter((b) => b.weightLb && b.date <= iso)
    .sort((a, b) => b.date.localeCompare(a.date))
  return sorted[0]?.weightLb ?? null
}

export function latestBody(body: BodyEntry[]): BodyEntry | null {
  const sorted = [...body].sort((a, b) => b.date.localeCompare(a.date))
  return sorted[0] ?? null
}

export function latestWeight(body: BodyEntry[]): { weightLb: number; date: string } | null {
  const s = body.filter((b) => b.weightLb).sort((a, b) => b.date.localeCompare(a.date))
  return s[0] ? { weightLb: s[0].weightLb!, date: s[0].date } : null
}

export function latestBodyFat(body: BodyEntry[], profile: Profile): { pct: number; date: string } | null {
  const s = [...body].sort((a, b) => b.date.localeCompare(a.date))
  for (const e of s) {
    const v = e.bodyFatPct ?? navyBodyFat(e, profile)
    if (v != null) return { pct: v, date: e.date }
  }
  return null
}

/**
 * A trend fit, and the window it actually came from.
 *
 * The window matters as much as the number. A rate quoted as "your 4-week trend"
 * when it was fitted over eleven weeks is a lie, and the reverse — refusing to
 * report anything because four weeks held two weigh-ins — throws away a perfectly
 * good answer that is sitting in the log.
 */
export interface TrendFit {
  /** Change per week, in the series' own units. */
  perWeek: number
  /** Days actually spanned by the window used. */
  days: number
  /** Data points the fit is based on. */
  points: number
  /** True when the standard window was too sparse and the fit reached further back. */
  widened: boolean
}

/** How far a fit may reach back when the standard window is too sparse. */
const WIDEN_STEPS = [1, 2, 3.5, 6] as const
/** Below this, a regression is noise rather than a trend. */
const MIN_POINTS = 3

/**
 * Fits a trend over the standard window, widening it only if that window cannot
 * support a fit.
 *
 * This is the "keep the diagnostic fixed, but use the history you have" rule: the
 * standard window is always tried first and wins whenever it works, so a
 * well-logged user gets exactly the calibrated figure. Someone who weighs in
 * fortnightly still gets an answer instead of silence, and it is labelled with the
 * window it really used.
 */
function fitTrend<T extends { date: string }>(
  items: T[],
  value: (t: T) => number | null | undefined,
  baseDays: number,
): TrendFit | null {
  const usable = items.filter((i) => value(i) != null).sort((a, b) => a.date.localeCompare(b.date))
  const today = todayISO()
  for (const step of WIDEN_STEPS) {
    const days = Math.round(baseDays * step)
    const cutoff = addDays(today, -days)
    const pts = usable.filter((i) => i.date >= cutoff)
    if (pts.length < MIN_POINTS) continue
    const x0 = fromISO(pts[0].date).getTime()
    const slope = linRegSlope(
      pts.map((p) => (fromISO(p.date).getTime() - x0) / 86400000),
      pts.map((p) => value(p)!),
    )
    if (slope === null) continue
    return { perWeek: slope * 7, days, points: pts.length, widened: step > 1 }
  }
  return null
}

/**
 * Rate of bodyweight change in lb/week, fitted over the trailing window.
 * Regression rather than first-vs-last so daily water swings don't dominate.
 */
export function weightTrend(body: BodyEntry[], days = 28): TrendFit | null {
  return fitTrend(body, (b) => b.weightLb, days)
}

export function weightRateLbPerWeek(body: BodyEntry[], days = 28): number | null {
  return weightTrend(body, days)?.perWeek ?? null
}

/** Same fit, applied to lean mass, to catch muscle loss during a cut. */
export function leanTrend(body: BodyEntry[], profile: Profile, days = 56): TrendFit | null {
  return fitTrend(
    body,
    (b) => {
      const bf = b.bodyFatPct ?? navyBodyFat(b, profile)
      return b.weightLb && bf != null ? leanMass(b.weightLb, bf) : null
    },
    days,
  )
}

export function leanRateLbPerWeek(body: BodyEntry[], profile: Profile, days = 56): number | null {
  return leanTrend(body, profile, days)?.perWeek ?? null
}

/** How to describe a fit's window in a sentence. */
export function describeWindow(fit: TrendFit): string {
  const weeks = Math.round(fit.days / 7)
  return weeks <= 1 ? `${fit.days} days` : `${weeks} weeks`
}

// ---------------------------------------------------------------------------
// Energy & macros
// ---------------------------------------------------------------------------

export function age(profile: Profile): number | null {
  if (!profile.birthDate) return null
  const b = fromISO(profile.birthDate)
  const now = new Date()
  let a = now.getFullYear() - b.getFullYear()
  const m = now.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--
  return a
}

/** Mifflin–St Jeor resting metabolic rate. */
export function bmr(profile: Profile, weightLb: number): number | null {
  const a = age(profile)
  if (!a || !profile.heightIn || !weightLb) return null
  const kg = lbToKg(weightLb)
  const cm = inToCm(profile.heightIn)
  const base = 10 * kg + 6.25 * cm - 5 * a
  return profile.sex === 'male' ? base + 5 : base - 161
}

const ACTIVITY_FACTOR: Record<Profile['activity'], number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
}

/**
 * Maintenance calories. Uses the manual override when present, otherwise
 * Mifflin–St Jeor × a non-exercise activity factor, plus the measured
 * training burn from the last 7 days of logged sessions.
 */
export function tdee(data: AppData, weightLb: number): number | null {
  if (data.profile.tdeeOverride) return data.profile.tdeeOverride
  const base = bmr(data.profile, weightLb)
  if (!base) return null
  const neat = base * ACTIVITY_FACTOR[data.profile.activity]
  const runs = withinDays(data.runs, 7)
  const lifts = withinDays(data.workouts, 7)
  // ~0.63 kcal per lb per mile running; ~5 kcal/min for resistance work.
  const runKcal = runs.reduce((a, r) => a + r.distanceMi * weightLb * 0.63, 0)
  const liftKcal = lifts.reduce((a, w) => a + (w.durationMin ?? 50) * 5, 0)
  return neat + (runKcal + liftKcal) / 7
}

export interface NutritionTargets {
  maintenance: number
  target: number
  deficitSurplus: number
  proteinG: number
  fatG: number
  carbG: number
  rationale: string
}

export function nutritionTargets(data: AppData): NutritionTargets | null {
  const w = latestWeight(data.body)?.weightLb
  if (!w) return null
  const maint = tdee(data, w)
  if (!maint) return null
  const bf = latestBodyFat(data.body, data.profile)?.pct
  const lbm = bf != null ? leanMass(w, bf) : w * 0.78

  let pctAdjust = 0
  let proteinPerKgLbm = 2.2
  let rationale = ''
  switch (data.goals.primary) {
    case 'fat_loss':
      pctAdjust = -0.2
      proteinPerKgLbm = 2.6
      rationale = 'A 20% deficit loses fat at roughly 0.7% of bodyweight per week — fast enough to see progress, slow enough to hold onto muscle. Protein is set high to protect lean mass in a deficit.'
      break
    case 'recomp':
      pctAdjust = -0.1
      proteinPerKgLbm = 2.6
      rationale = 'A small 10% deficit with high protein and hard lifting lets you lose fat and add muscle at the same time. Progress on the scale will be slow — judge it by the mirror, the tape and your lifts.'
      break
    case 'muscle_gain':
      pctAdjust = 0.1
      proteinPerKgLbm = 2.0
      rationale = 'A 10% surplus supplies material for new tissue while keeping fat gain modest. Aim for about 0.25–0.5% bodyweight gained per week.'
      break
    case 'endurance':
      pctAdjust = -0.05
      proteinPerKgLbm = 1.8
      rationale = 'Near maintenance so training quality holds up, with carbohydrate kept high to fuel runs.'
      break
    case 'strength':
      pctAdjust = 0.05
      proteinPerKgLbm = 2.0
      rationale = 'A slight surplus supports recovery between heavy sessions without meaningful fat gain.'
      break
  }

  const target = Math.round(maint * (1 + pctAdjust))
  const proteinG = Math.round(lbToKg(lbm) * proteinPerKgLbm)
  // Fat floor of 0.7 g/kg bodyweight for hormonal health, remainder to carbs.
  const fatG = Math.round(Math.max(lbToKg(w) * 0.8, (target * 0.22) / 9))
  const carbG = Math.max(0, Math.round((target - proteinG * 4 - fatG * 9) / 4))
  return {
    maintenance: Math.round(maint),
    target,
    deficitSurplus: target - Math.round(maint),
    proteinG,
    fatG,
    carbG,
    rationale,
  }
}

/**
 * Target weekly rate of change in lb/week for the current goal, as a range.
 * Fat loss targets 0.5–1.0% of bodyweight per week.
 */
export function targetWeeklyRate(data: AppData): { min: number; max: number } | null {
  const w = latestWeight(data.body)?.weightLb
  if (!w) return null
  switch (data.goals.primary) {
    case 'fat_loss':
      return { min: -w * 0.01, max: -w * 0.005 }
    case 'recomp':
      return { min: -w * 0.005, max: -w * 0.001 }
    case 'muscle_gain':
      return { min: w * 0.0025, max: w * 0.005 }
    default:
      return { min: -w * 0.003, max: w * 0.003 }
  }
}

/** Projected date the weight/body-fat target is hit at the current rate. */
export function projectGoal(data: AppData): { weeks: number; date: string; kind: 'weight' | 'bodyfat' } | null {
  const rate = weightRateLbPerWeek(data.body)
  const cur = latestWeight(data.body)?.weightLb
  if (!rate || !cur || Math.abs(rate) < 0.05) return null

  if (data.goals.targetWeightLb) {
    const delta = data.goals.targetWeightLb - cur
    if (Math.sign(delta) !== Math.sign(rate)) return null
    const weeks = delta / rate
    if (weeks <= 0 || weeks > 260) return null
    return { weeks, date: addDays(todayISO(), Math.round(weeks * 7)), kind: 'weight' }
  }

  const bf = latestBodyFat(data.body, data.profile)?.pct
  if (data.goals.targetBodyFatPct != null && bf != null) {
    // Assume the change comes mostly from fat mass while lifting + eating protein.
    const lbm = leanMass(cur, bf)
    const targetWeight = lbm / (1 - data.goals.targetBodyFatPct / 100)
    const delta = targetWeight - cur
    if (Math.sign(delta) !== Math.sign(rate)) return null
    const weeks = delta / rate
    if (weeks <= 0 || weeks > 260) return null
    return { weeks, date: addDays(todayISO(), Math.round(weeks * 7)), kind: 'bodyfat' }
  }
  return null
}

// ---------------------------------------------------------------------------
// Running math
// ---------------------------------------------------------------------------

export const RACE_DISTANCES: { name: string; mi: number }[] = [
  { name: '1 mile', mi: 1 },
  // 1.5 and 2 miles are fitness-test distances, and 3 miles is what most people
  // actually run when they say "a few miles" — all worth trending even though
  // nobody races them.
  { name: '1.5 mile', mi: 1.5 },
  { name: '2 mile', mi: 2 },
  { name: '5K', mi: 3.10686 },
  { name: '3 mile', mi: 3 },
  { name: '10K', mi: 6.21371 },
  { name: '10 mile', mi: 10 },
  { name: 'Half marathon', mi: 13.1094 },
  { name: 'Marathon', mi: 26.2188 },
].sort((a, b) => a.mi - b.mi)

/** Riegel: predict time at a new distance from a known performance. */
export function riegel(knownSec: number, knownMi: number, targetMi: number, exp = 1.06): number {
  return knownSec * (targetMi / knownMi) ** exp
}

/**
 * Daniels VDOT. Converts a race performance into an aerobic-fitness number
 * that other paces can be derived from.
 */
export function vdot(distanceMi: number, seconds: number): number | null {
  if (distanceMi <= 0 || seconds <= 0) return null
  const meters = distanceMi * 1609.344
  const minutes = seconds / 60
  const v = meters / minutes // m/min
  const pctMax = 0.8 + 0.1894393 * Math.exp(-0.012778 * minutes) + 0.2989558 * Math.exp(-0.1932605 * minutes)
  const vo2 = -4.6 + 0.182258 * v + 0.000104 * v ** 2
  const result = vo2 / pctMax
  return result > 20 && result < 90 ? result : null
}

/** Inverse of the Daniels VO2 curve: velocity (m/min) for a given VO2. */
function velocityForVo2(vo2: number): number {
  const a = 0.000104
  const b = 0.182258
  const c = -4.6 - vo2
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a)
}

export interface TrainingPaces {
  easy: number // seconds per mile
  marathon: number
  threshold: number
  interval: number
  repetition: number
}

/** Training paces (sec/mile) for a VDOT, using Daniels' intensity anchors. */
export function trainingPaces(v: number): TrainingPaces {
  const paceFor = (pct: number) => {
    const vel = velocityForVo2(v * pct)
    return (1609.344 / vel) * 60
  }
  return {
    easy: paceFor(0.68),
    marathon: paceFor(0.8),
    threshold: paceFor(0.875),
    interval: paceFor(0.99),
    repetition: paceFor(1.05),
  }
}

export interface BestEffort {
  name: string
  mi: number
  run: Run | null
  seconds: number | null
  /** Predicted from the best performance at another distance. */
  predictedSec: number | null
}

/**
 * Best actual time at each standard distance (any run within 4% of the
 * distance counts), plus a Riegel prediction from your strongest performance.
 */
export function bestEfforts(runs: Run[]): BestEffort[] {
  let bestVdot = 0
  let anchor: Run | null = null
  for (const r of runs) {
    const v = vdot(r.distanceMi, r.seconds)
    if (v && v > bestVdot) {
      bestVdot = v
      anchor = r
    }
  }
  return RACE_DISTANCES.map(({ name, mi }) => {
    const candidates = runs.filter((r) => Math.abs(r.distanceMi - mi) / mi <= 0.04)
    let best: Run | null = null
    for (const r of candidates) {
      // Normalise to the exact distance so a 3.2mi run doesn't beat a true 5K.
      const norm = riegel(r.seconds, r.distanceMi, mi)
      const bestNorm = best ? riegel(best.seconds, best.distanceMi, mi) : Infinity
      if (norm < bestNorm) best = r
    }
    const predicted = anchor ? riegel(anchor.seconds, anchor.distanceMi, mi) : null
    return {
      name,
      mi,
      run: best,
      seconds: best ? riegel(best.seconds, best.distanceMi, mi) : null,
      predictedSec: predicted,
    }
  })
}

export function bestVdot(runs: Run[]): { value: number; run: Run } | null {
  let best: { value: number; run: Run } | null = null
  for (const r of runs) {
    const v = vdot(r.distanceMi, r.seconds)
    if (v && (!best || v > best.value)) best = { value: v, run: r }
  }
  return best
}

export function weeklyMileage(runs: Run[], weeks = 12): { week: string; miles: number; hard: number }[] {
  const buckets = new Map<string, { miles: number; hard: number }>()
  const start = weekStart(addDays(todayISO(), -(weeks * 7 - 1)))
  for (const r of runs) {
    const wk = weekStart(r.date)
    if (wk < start) continue
    const b = buckets.get(wk) ?? { miles: 0, hard: 0 }
    b.miles += r.distanceMi
    if (HARD_RUN_TYPES.includes(r.type)) b.hard += r.distanceMi
    buckets.set(wk, b)
  }
  const out: { week: string; miles: number; hard: number }[] = []
  for (let i = weeks - 1; i >= 0; i--) {
    const wk = weekStart(addDays(todayISO(), -i * 7))
    const b = buckets.get(wk) ?? { miles: 0, hard: 0 }
    if (out.some((o) => o.week === wk)) continue
    out.push({ week: wk, miles: round(b.miles, 1), hard: round(b.hard, 1) })
  }
  return out
}

/**
 * Acute:chronic workload ratio — last 7 days of mileage over the average
 * 7-day mileage of the last 28. Above ~1.3 is the zone where injury risk
 * climbs; below 0.8 means fitness is being lost.
 */
export function acwr(runs: Run[]): { acute: number; chronic: number; ratio: number | null } {
  const acute = withinDays(runs, 7).reduce((a, r) => a + r.distanceMi, 0)
  const chronic = withinDays(runs, 28).reduce((a, r) => a + r.distanceMi, 0) / 4
  return { acute: round(acute, 1), chronic: round(chronic, 1), ratio: chronic > 0 ? round(acute / chronic, 2) : null }
}

/** Share of weekly mileage that is hard running. Target is about 20%. */
export function intensityDistribution(runs: Run[], days = 28): { easyPct: number; hardPct: number; total: number } {
  const rs = withinDays(runs, days)
  const total = rs.reduce((a, r) => a + r.distanceMi, 0)
  const hard = rs.filter((r) => HARD_RUN_TYPES.includes(r.type)).reduce((a, r) => a + r.distanceMi, 0)
  if (total === 0) return { easyPct: 0, hardPct: 0, total: 0 }
  return { easyPct: round(((total - hard) / total) * 100, 0), hardPct: round((hard / total) * 100, 0), total: round(total, 1) }
}

export function longestRun(runs: Run[], days = 28): Run | null {
  const rs = withinDays(runs, days)
  return rs.reduce<Run | null>((best, r) => (!best || r.distanceMi > best.distanceMi ? r : best), null)
}

// ---------------------------------------------------------------------------
// Consistency
// ---------------------------------------------------------------------------

/** Consecutive days ending today (or yesterday) with any logged session. */
export function currentStreak(data: AppData): number {
  const days = new Set<string>([...data.workouts.map((w) => w.date), ...data.runs.map((r) => r.date)])
  let streak = 0
  let cursor = todayISO()
  if (!days.has(cursor)) cursor = addDays(cursor, -1)
  while (days.has(cursor)) {
    streak++
    cursor = addDays(cursor, -1)
  }
  return streak
}

/**
 * Consecutive training days with no rest day — a fatigue signal.
 *
 * Counts back from yesterday when nothing is logged today, exactly as the streak
 * above does. Anchoring strictly on today meant the run of days only became
 * visible *after* a session had been logged, so "take a rest day" could never
 * reach you at the one moment it is useful: before you train.
 */
export function consecutiveTrainingDays(data: AppData): number {
  const days = new Set<string>([...data.workouts.map((w) => w.date), ...data.runs.map((r) => r.date)])
  let n = 0
  let cursor = todayISO()
  if (!days.has(cursor)) cursor = addDays(cursor, -1)
  while (days.has(cursor)) {
    n++
    cursor = addDays(cursor, -1)
  }
  return n
}

export function sessionsThisWeek(data: AppData): { lifts: number; runs: number } {
  const start = weekStart(todayISO())
  return {
    lifts: new Set(data.workouts.filter((w) => w.date >= start).map((w) => w.date)).size,
    runs: data.runs.filter((r) => r.date >= start).length,
  }
}
