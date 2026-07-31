import type { AppData, Muscle, SetEntry, Workout } from './types'
import { EXERCISES, exerciseMap } from './exercises'
import { bellyInMuscles } from './muscles'
import { bestSetE1rm, bodyweightOn, e1rm as liftE1rm, volumeLoad, workingSets } from './calc'

/**
 * Per-exercise and per-muscle strength series, for the Progress tab.
 *
 * Two scopes, because they answer different questions and not every metric works for
 * both. An estimated 1RM is meaningful for *one* movement and meaningless summed
 * across several — you cannot add a bench press max to a cable fly max. Volume, reps
 * and sets do add up. So the metric list changes with the scope rather than offering
 * numbers that look valid and are not.
 */

export type Scope = { kind: 'exercise'; id: string } | { kind: 'muscle'; muscle: Muscle }

export type LiftMetric = 'e1rm' | 'heaviest' | 'volume' | 'reps' | 'sets'

export interface MetricSpec {
  key: LiftMetric
  label: string
  /** Short description of what the number means. */
  sub: string
  /** True when the value is a weight and needs unit conversion. */
  weight: boolean
  /** Scopes this metric is valid for. */
  scopes: Scope['kind'][]
}

export const LIFT_METRICS: MetricSpec[] = [
  {
    key: 'e1rm',
    label: 'Estimated 1RM',
    sub: 'the heaviest single rep your best set implies',
    weight: true,
    // Not aggregatable: a bench max and a fly max do not sum to anything.
    scopes: ['exercise'],
  },
  {
    key: 'heaviest',
    label: 'Heaviest set',
    sub: 'the most weight you actually put on the bar',
    weight: true,
    scopes: ['exercise'],
  },
  { key: 'volume', label: 'Volume', sub: 'total weight moved — sets × reps × load', weight: true, scopes: ['exercise', 'muscle'] },
  { key: 'reps', label: 'Total reps', sub: 'working reps performed', weight: false, scopes: ['exercise', 'muscle'] },
  { key: 'sets', label: 'Working sets', sub: 'warm-ups excluded', weight: false, scopes: ['exercise', 'muscle'] },
]

export function metricsFor(kind: Scope['kind']): MetricSpec[] {
  return LIFT_METRICS.filter((m) => m.scopes.includes(kind))
}

export interface SessionPoint {
  date: string
  e1rm: number
  heaviest: number
  volume: number
  reps: number
  sets: number
  /** The set the 1RM estimate came from, so the number is never unexplained. */
  topSet: string
}

/** The sets in a workout that belong to a scope, with their exercise's load type. */
function setsInScope(w: Workout, scope: Scope, data: AppData) {
  const map = exerciseMap(data.customExercises)
  const out: { sets: SetEntry[]; loadType: ReturnType<typeof map.get> extends undefined ? never : string | undefined }[] = []
  for (const le of w.exercises) {
    const ex = map.get(le.exerciseId)
    if (scope.kind === 'exercise') {
      if (le.exerciseId !== scope.id) continue
    } else {
      // A muscle scope covers anything that trains it directly OR assists, matching
      // how the volume targets count fractional sets.
      if (!ex) continue
      const trains = ex.primary.includes(scope.muscle) || ex.secondary.includes(scope.muscle)
      if (!trains) continue
    }
    out.push({ sets: workingSets(le.sets), loadType: ex?.loadType })
  }
  return out
}

/**
 * One point per session, oldest first.
 *
 * Bodyweight is folded in for movements that carry it, using the weight logged nearest
 * that date — so a weighted pull-up is measured on total load, the same way the rest of
 * the app counts it.
 */
export function sessionSeries(data: AppData, scope: Scope): SessionPoint[] {
  const out: SessionPoint[] = []
  for (const w of [...data.workouts].sort((a, b) => a.date.localeCompare(b.date))) {
    const groups = setsInScope(w, scope, data)
    if (groups.length === 0) continue
    const bw = bodyweightOn(data.body, w.date) ?? 0
    let e1rm = 0
    let heaviest = 0
    let volume = 0
    let reps = 0
    let sets = 0
    let topSet = ''
    for (const g of groups) {
      if (g.sets.length === 0) continue
      const carries = g.loadType === 'bodyweight' || g.loadType === 'weighted_bodyweight'
      const load = (s: SetEntry) => (carries ? bw + (s.weight || 0) : s.weight || 0)
      const best = bestSetE1rm(g.sets, bw, g.loadType as never)
      if (best > e1rm) {
        e1rm = best
        /**
         * The set the estimate actually came from — chosen by estimated 1RM, not by
         * volume. Picking the highest-volume set instead labelled a 242 lb estimate
         * "from 8 × 190" when it came from 5 × 210: the heavier, lower-rep set gives
         * the higher estimate but the lighter, longer set moves more total weight.
         * A number and the set beside it have to be the same set.
         */
        const top = g.sets.reduce((b, s) =>
          liftE1rm(load(s), s.reps) > liftE1rm(load(b), b.reps) ? s : b,
        )
        topSet = `${top.reps} × ${Math.round(load(top) * 10) / 10}`
      }
      for (const s of g.sets) heaviest = Math.max(heaviest, load(s))
      volume += volumeLoad(g.sets, bw, g.loadType as never)
      reps += g.sets.reduce((a, s) => a + (s.reps || 0), 0)
      sets += g.sets.length
    }
    if (sets === 0) continue
    out.push({ date: w.date, e1rm, heaviest, volume, reps, sets, topSet })
  }
  return out
}

/** Exercises with logged history, most-used first — the picker's ordering. */
export function trackedExercises(data: AppData): string[] {
  const counts = new Map<string, number>()
  for (const w of data.workouts) for (const e of w.exercises) counts.set(e.exerciseId, (counts.get(e.exerciseId) ?? 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id)
}

/** Muscles with logged history, so the picker never offers an empty chart. */
export function trackedMuscles(data: AppData): Muscle[] {
  const map = exerciseMap(data.customExercises)
  const seen = new Set<Muscle>()
  for (const w of data.workouts) {
    for (const le of w.exercises) {
      const ex = map.get(le.exerciseId)
      if (!ex || workingSets(le.sets).length === 0) continue
      for (const m of [...ex.primary, ...ex.secondary]) seen.add(m)
    }
  }
  return [...seen]
}

// ---------------------------------------------------------------------------
// Strength summary
// ---------------------------------------------------------------------------

export interface StrengthRow {
  exerciseId: string
  name: string
  /** Best estimate within the range, in pounds. */
  currentLb: number
  /** Change across the range: last estimate minus first. */
  changeLb: number | null
  /** Percent change, for ranking improvement independent of absolute load. */
  changePct: number | null
  sessions: number
  lastDate: string
  /** The set the current estimate came from. */
  topSet: string
}

/**
 * Estimated 1RM for every benchmark lift at once, with its change over the range.
 *
 * The point is a single answer to "is my maximal strength going up". Per-lift charts
 * show one movement at a time, and a lift can stall while the others climb — this puts
 * them side by side so the overall direction is visible.
 *
 * `currentLb` is the best estimate *within the range*, not the all-time best: over the
 * last 90 days you want to know what you can do now, and an all-time figure from two
 * years ago would answer a different question.
 */
export function strengthSummary(data: AppData, inRange: Workout[]): StrengthRow[] {
  const map = exerciseMap(data.customExercises)
  const scoped: AppData = { ...data, workouts: inRange }
  const rows: StrengthRow[] = []
  // Benchmark lifts first, then any other exercise with enough history to be worth a
  // row — a user whose programme is all machines should still get a summary.
  const candidates = [
    ...EXERCISES.filter((e) => e.benchmark).map((e) => e.id),
    ...trackedExercises(scoped).filter((id) => !EXERCISES.find((e) => e.id === id)?.benchmark),
  ]
  for (const id of [...new Set(candidates)]) {
    const series = sessionSeries(scoped, { kind: 'exercise', id }).filter((p) => p.e1rm > 0)
    if (series.length === 0) continue
    const best = series.reduce((b, p) => (p.e1rm > b.e1rm ? p : b))
    const first = series[0]
    const last = series[series.length - 1]
    const change = series.length >= 2 ? last.e1rm - first.e1rm : null
    rows.push({
      exerciseId: id,
      name: map.get(id)?.name ?? id,
      currentLb: best.e1rm,
      changeLb: change,
      changePct: change != null && first.e1rm > 0 ? (change / first.e1rm) * 100 : null,
      sessions: series.length,
      lastDate: last.date,
      topSet: best.topSet,
    })
  }
  return rows.sort((a, b) => b.currentLb - a.currentLb)
}

/**
 * Combined total of the big compounds, which is the number powerlifting calls a
 * total and the simplest single measure of whole-body maximal strength.
 */
export function strengthTotal(rows: StrengthRow[]): { totalLb: number; changeLb: number; lifts: number } {
  const core = rows.filter((r) => EXERCISES.find((e) => e.id === r.exerciseId)?.benchmark)
  return {
    totalLb: core.reduce((a, r) => a + r.currentLb, 0),
    changeLb: core.reduce((a, r) => a + (r.changeLb ?? 0), 0),
    lifts: core.length,
  }
}

/** Whether a belly name belongs to the scoped muscle — re-exported for the diagrams. */
export { bellyInMuscles }
