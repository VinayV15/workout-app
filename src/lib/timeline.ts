import type { AppData, BodyEntry } from './types'
import {
  addDays,
  bodyFatCategory,
  daysBetween,
  fatMass,
  latestBodyFat,
  latestWeight,
  leanMass,
  leanRateLbPerWeek,
  navyBodyFat,
  targetWeeklyRate,
  todayISO,
  weightRateLbPerWeek,
} from './calc'
import { computePhysique, physiqueAtComposition, physiqueFromEntry, type Physique } from './physique'

/**
 * Body composition at an arbitrary date — a logged one, a gap between logs, or a
 * projected future one — so the physique view can be scrubbed through time.
 */

export type SnapshotKind = 'logged' | 'between' | 'projected'

export interface Snapshot {
  date: string
  kind: SnapshotKind
  weightLb: number
  bodyFatPct: number
  leanLb: number
  fatLb: number
  physique: Physique
  /** Set on projections: what assumption produced them. */
  basis?: string
}

/** The entry that best describes the person's actual proportions. */
function bestMeasuredEntry(data: AppData): BodyEntry | null {
  const withTape = data.body
    .filter((b) => b.weightLb && (b.waistIn || b.chestIn || b.shouldersIn))
    .sort((a, b) => b.date.localeCompare(a.date))
  if (withTape[0]) return withTape[0]
  const withWeight = data.body.filter((b) => b.weightLb).sort((a, b) => b.date.localeCompare(a.date))
  return withWeight[0] ?? null
}

/**
 * The reference physique, built from the most recent entry that actually has
 * tape measurements. Everything else is derived from this by changing
 * composition, which keeps the person's proportions rather than reverting to a
 * generic body.
 */
export function basePhysique(data: AppData): Physique | null {
  const entry = bestMeasuredEntry(data)
  if (!entry) return null
  const input = physiqueFromEntry(entry, data.profile)
  if (!input) return null
  return computePhysique(input)
}

/** Linear interpolation of a field between the surrounding logged entries. */
function interpolate(entries: BodyEntry[], iso: string, pick: (b: BodyEntry) => number | undefined): number | null {
  const known = entries.filter((b) => pick(b) != null).sort((a, b) => a.date.localeCompare(b.date))
  if (known.length === 0) return null
  if (iso <= known[0].date) return pick(known[0])!
  if (iso >= known[known.length - 1].date) return pick(known[known.length - 1])!
  for (let i = 0; i < known.length - 1; i++) {
    const a = known[i]
    const b = known[i + 1]
    if (iso >= a.date && iso <= b.date) {
      const span = daysBetween(a.date, b.date) || 1
      const f = daysBetween(a.date, iso) / span
      return pick(a)! + (pick(b)! - pick(a)!) * f
    }
  }
  return pick(known[known.length - 1])!
}

/**
 * Composition on a future date, from the observed trends. Lean mass uses its own
 * measured trend when there is one — that is the honest projection, because a cut
 * that has been costing muscle will keep costing muscle unless something changes.
 * Weight stops at the goal, since that is where the person would stop.
 */
function projectComposition(data: AppData, iso: string) {
  const current = latestWeight(data.body)
  const currentBf = latestBodyFat(data.body, data.profile)
  if (!current || !currentBf) return null

  const weeks = daysBetween(current.date, iso) / 7
  const observedRate = weightRateLbPerWeek(data.body)
  const targetBand = targetWeeklyRate(data)
  // With no measured trend yet, fall back to the goal's intended rate so the
  // projection reflects the plan rather than showing nothing.
  const rate = observedRate ?? (targetBand ? (targetBand.min + targetBand.max) / 2 : 0)
  const leanRate = leanRateLbPerWeek(data.body, data.profile)

  let weightLb = current.weightLb + rate * weeks
  const goal = data.goals.targetWeightLb
  if (goal) {
    // Do not project past the goal in the direction of travel.
    if (rate < 0) weightLb = Math.max(goal, weightLb)
    else if (rate > 0) weightLb = Math.min(goal, weightLb)
  }

  const startLean = leanMass(current.weightLb, currentBf.pct)
  // Lean follows its own trend when measured; otherwise it is held, which is the
  // assumption the coaching is trying to make true.
  const projectedLean = Math.max(startLean * 0.75, startLean + (leanRate ?? 0) * weeks)
  const projectedFat = Math.max(weightLb * 0.03, weightLb - projectedLean)
  const total = projectedLean + projectedFat
  const bodyFatPct = (projectedFat / total) * 100

  const basis =
    observedRate != null
      ? `at your measured trend of ${observedRate > 0 ? '+' : ''}${observedRate.toFixed(2)} lb/week${
          leanRate != null ? `, lean mass ${leanRate > 0 ? '+' : ''}${leanRate.toFixed(2)} lb/week` : ', lean mass held'
        }`
      : 'at the target rate for your goal, lean mass held'

  return { weightLb: total, bodyFatPct, leanLb: projectedLean, fatLb: projectedFat, basis }
}

export function snapshotAt(data: AppData, iso: string, base?: Physique | null): Snapshot | null {
  const reference = base ?? basePhysique(data)
  if (!reference) return null
  const today = todayISO()

  // A future date is a projection.
  if (iso > today) {
    const p = projectComposition(data, iso)
    if (!p) return null
    return {
      date: iso,
      kind: 'projected',
      weightLb: p.weightLb,
      bodyFatPct: p.bodyFatPct,
      leanLb: p.leanLb,
      fatLb: p.fatLb,
      physique: physiqueAtComposition(reference, p.weightLb, p.bodyFatPct),
      basis: p.basis,
    }
  }

  // An exactly-logged date with real tape measurements is used as measured.
  const logged = data.body.find((b) => b.date === iso && b.weightLb)
  if (logged && (logged.waistIn || logged.chestIn || logged.shouldersIn)) {
    const input = physiqueFromEntry(logged, data.profile)
    if (input) {
      const physique = computePhysique(input)
      return {
        date: iso,
        kind: 'logged',
        weightLb: physique.weightLb,
        bodyFatPct: physique.bodyFatPct,
        leanLb: physique.leanLb,
        fatLb: physique.fatLb,
        physique,
      }
    }
  }

  // Otherwise interpolate weight and body fat between logs and reshape.
  const weightLb = interpolate(data.body, iso, (b) => b.weightLb)
  const bodyFatPct = interpolate(data.body, iso, (b) => b.bodyFatPct ?? navyBodyFat(b, data.profile) ?? undefined)
  if (weightLb == null) return null
  const bf = bodyFatPct ?? reference.bodyFatPct
  return {
    date: iso,
    kind: logged ? 'logged' : 'between',
    weightLb,
    bodyFatPct: bf,
    leanLb: leanMass(weightLb, bf),
    fatLb: fatMass(weightLb, bf),
    physique: physiqueAtComposition(reference, weightLb, bf),
  }
}

/** The scrubbable range: first log through a horizon past today. */
export function timelineRange(data: AppData, projectionWeeks = 26): { from: string; to: string; today: string } | null {
  const dated = data.body.filter((b) => b.weightLb).map((b) => b.date).sort()
  if (dated.length === 0) return null
  const today = todayISO()
  return {
    from: dated[0] < today ? dated[0] : addDays(today, -1),
    to: addDays(today, projectionWeeks * 7),
    today,
  }
}

export function describeComposition(snapshot: Snapshot, sex: 'male' | 'female') {
  return bodyFatCategory(snapshot.bodyFatPct, sex)
}
