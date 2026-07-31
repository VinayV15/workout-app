import type {
  AppData,
  Exercise,
  GoalPrimary,
  Muscle,
  ProgramBlock,
  ProgramDay,
  ProgramSlot,
  ProgressionKind,
  Run,
  Workout,
} from './types'
import { MUSCLE_LABEL } from './types'

export type { ProgramBlock, ProgramDay, ProgramSlot, ProgressionKind }
import { exerciseMap } from './exercises'
import { addDays, daysBetween, todayISO, weekStart, workingSets } from './calc'

/**
 * Training blocks: the prescriptive half of the coach.
 *
 * The rest of this app is reactive — it looks at what you have done and tells you
 * what is behind. That is the right way to catch problems, and the wrong way to
 * build strength, because progressive overload needs a decision made *in advance*
 * about what load to attempt next. A block is that decision, written down.
 *
 * Three things make this more than a checklist:
 *
 *  - **Prescriptions are read out of your own log**, not stored. There is no
 *    "current weight" field to go stale, so editing history or logging on another
 *    device changes tomorrow's targets automatically, and a block imported from
 *    another device works immediately.
 *  - **Rotation, not a calendar.** Sessions advance when you train, not when the
 *    week does. Missing Tuesday shifts the plan rather than putting you behind it,
 *    which is the difference between a plan you keep and one you abandon in week 2.
 *  - **Fatigue still wins.** The plan is consulted after the rest-day check, never
 *    before it. A block that overrides your own recovery signals is worse than no
 *    block at all.
 */

/**
 * Load steps, in pounds. Compounds move in bigger jumps than isolation work
 * because the absolute load is larger — 5 lb on a 300 lb squat is under 2%, the
 * same 5 lb on a 30 lb lateral raise is 17% and will not happen twice in a row.
 */
const INCREMENT_LB: Record<Exercise['equipment'], number> = {
  barbell: 5,
  machine: 5,
  cable: 5,
  dumbbell: 5,
  bodyweight: 2.5,
  other: 2.5,
}

function incrementFor(ex: Exercise | undefined): number {
  if (!ex) return 5
  if (ex.pattern === 'isolation' || ex.pattern === 'core') return 2.5
  return INCREMENT_LB[ex.equipment]
}

// ---------------------------------------------------------------------------
// Where you are in a block
// ---------------------------------------------------------------------------

/** The block currently in force, or null when nothing is running. */
export function activeBlock(data: AppData, iso = todayISO()): ProgramBlock | null {
  const live = (data.programs ?? []).filter((b) => !b.archived && blockWeek(b, iso) !== null)
  // Most recently started wins, so beginning a new block supersedes an old one
  // that has not been archived by hand.
  return live.sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? null
}

/** 1-indexed week within the block, or null when the date falls outside it. */
export function blockWeek(block: ProgramBlock, iso = todayISO()): number | null {
  const offset = daysBetween(block.startDate, iso)
  if (offset < 0) return null
  const week = Math.floor(offset / 7) + 1
  return week <= block.weeks ? week : null
}

export function isDeload(block: ProgramBlock, week: number): boolean {
  return block.deloadWeek != null && week === block.deloadWeek
}

export function blockEndDate(block: ProgramBlock): string {
  return addDays(block.startDate, block.weeks * 7 - 1)
}

/** Sessions logged against a block, in the order they happened. */
function completions(data: AppData, blockId: string): { date: string; dayId: string }[] {
  const out: { date: string; dayId: string }[] = []
  for (const w of data.workouts) {
    if (w.programBlockId === blockId && w.programDayId) out.push({ date: w.date, dayId: w.programDayId })
  }
  for (const r of data.runs) {
    if (r.programBlockId === blockId && r.programDayId) out.push({ date: r.date, dayId: r.programDayId })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * The next session in the rotation.
 *
 * Picks the first day of the week's rotation with nothing logged against it yet,
 * so a skipped session is simply still waiting rather than lost. Returns null once
 * the week's rotation is complete — the caller decides whether that means rest.
 */
export function nextDay(data: AppData, block: ProgramBlock, iso = todayISO()): ProgramDay | null {
  const from = weekStart(iso)
  const doneThisWeek = new Set(
    completions(data, block.id)
      .filter((c) => c.date >= from && c.date <= addDays(from, 6))
      .map((c) => c.dayId),
  )
  return block.days.find((d) => !doneThisWeek.has(d.id)) ?? null
}

/** How much of the week's rotation is done, for the progress read-out. */
export function weekProgress(
  data: AppData,
  block: ProgramBlock,
  iso = todayISO(),
): { done: number; total: number; completed: Set<string> } {
  const from = weekStart(iso)
  const completed = new Set(
    completions(data, block.id)
      .filter((c) => c.date >= from && c.date <= addDays(from, 6))
      .map((c) => c.dayId),
  )
  // Only days that are actually in the rotation count, so removing a day from the
  // block does not leave the week permanently unfinishable.
  const inRotation = block.days.filter((d) => completed.has(d.id)).length
  return { done: inRotation, total: block.days.length, completed }
}

/** Completed sessions per block week, for the adherence chart. */
export function adherence(data: AppData, block: ProgramBlock): { week: number; done: number; total: number }[] {
  const done = completions(data, block.id)
  const out: { week: number; done: number; total: number }[] = []
  for (let week = 1; week <= block.weeks; week++) {
    const from = addDays(block.startDate, (week - 1) * 7)
    const to = addDays(from, 6)
    const ids = new Set(done.filter((c) => c.date >= from && c.date <= to).map((c) => c.dayId))
    out.push({ week, done: [...ids].filter((id) => block.days.some((d) => d.id === id)).length, total: block.days.length })
  }
  return out
}

// ---------------------------------------------------------------------------
// Prescription
// ---------------------------------------------------------------------------

export interface Prescription {
  slot: ProgramSlot
  exercise: Exercise | undefined
  /** Target load in pounds, or null when there is no history to progress from. */
  loadLb: number | null
  /** Reps to aim for on every working set. */
  targetReps: number
  sets: number
  /** Why this number — shown so the progression is never a black box. */
  reason: string
  /** The session this was derived from. */
  lastDate?: string
}

/**
 * Double progression, read out of the log: hold the load until every set reaches
 * the top of the rep range, then add the smallest useful increment and drop back
 * to the bottom of the range.
 *
 * This is the progression that works without a coach watching, because it cannot
 * run ahead of you — the load only moves after you have earned it on every set,
 * and a bad day simply repeats the week rather than compounding into a miss.
 */
export function prescribe(
  data: AppData,
  block: ProgramBlock,
  slot: ProgramSlot,
  week: number,
): Prescription {
  const ex = exerciseMap(data.customExercises).get(slot.exerciseId)
  const deload = isDeload(block, week)
  const sets = deload ? Math.max(1, Math.ceil(slot.sets * (2 / 3))) : slot.sets

  const last = lastPerformance(data, slot.exerciseId)
  if (!last) {
    return {
      slot,
      exercise: ex,
      loadLb: null,
      targetReps: slot.repMin,
      sets,
      reason: `First time on this lift in your log — work up to a load you can hold for ${slot.repMin} clean reps, and stop 2 reps short of failure. That becomes the starting point.`,
    }
  }

  const increment = incrementFor(ex)
  // Every set reaching the top of the range is the signal to add load. Judging on
  // the best set instead would move the load off one good rep-out while the rest
  // of the sets were still short.
  const earned = last.setCount >= sets && last.minReps >= slot.repMax

  let loadLb = earned ? last.loadLb + increment : last.loadLb
  let targetReps = earned ? slot.repMin : Math.min(slot.repMax, last.minReps + 1)
  let reason = earned
    ? `You hit ${slot.repMax} reps on every set at ${fmtLb(last.loadLb)} — that earns the next step up. Back to ${slot.repMin} reps at the new load.`
    : `Holding ${fmtLb(last.loadLb)} until all ${sets} sets reach ${slot.repMax}. Last time the hardest set was ${last.minReps}, so today the target is ${targetReps}.`

  if (deload) {
    loadLb = Math.round(loadLb * 0.9 * 2) / 2
    targetReps = slot.repMin
    reason = `Deload week: ${sets} sets instead of ${slot.sets}, 10% off the load, every set stopped well short of failure. This is where the previous weeks turn into adaptation.`
  }

  return { slot, exercise: ex, loadLb, targetReps, sets, reason, lastDate: last.date }
}

/**
 * The heaviest working load in the most recent session of an exercise, and the
 * *lowest* rep count achieved at that load.
 *
 * The minimum rather than the best, because double progression asks whether every
 * set cleared the range, and the last set of the session is the one that decides
 * that.
 */
function lastPerformance(
  data: AppData,
  exerciseId: string,
): { date: string; loadLb: number; minReps: number; setCount: number } | null {
  const sessions = data.workouts
    .filter((w) => w.exercises.some((e) => e.exerciseId === exerciseId && workingSets(e.sets).length > 0))
    .sort((a, b) => b.date.localeCompare(a.date))
  const recent = sessions[0]
  if (!recent) return null
  const sets = workingSets(recent.exercises.find((e) => e.exerciseId === exerciseId)!.sets)
  const loadLb = sets.reduce((m, s) => Math.max(m, s.weight || 0), 0)
  const atLoad = sets.filter((s) => (s.weight || 0) >= loadLb)
  return {
    date: recent.date,
    loadLb,
    minReps: atLoad.reduce((m, s) => Math.min(m, s.reps || 0), Infinity),
    setCount: atLoad.length,
  }
}

function fmtLb(lb: number): string {
  return `${Math.round(lb * 10) / 10} lb`
}

/** Every prescription for a session, in order. */
export function prescribeDay(
  data: AppData,
  block: ProgramBlock,
  day: ProgramDay,
  week: number,
): Prescription[] {
  return (day.slots ?? []).map((slot) => prescribe(data, block, slot, week))
}

/** Muscles a session trains directly, for the session summary line. */
export function dayMuscles(data: AppData, day: ProgramDay): Muscle[] {
  const map = exerciseMap(data.customExercises)
  const seen = new Set<Muscle>()
  for (const slot of day.slots ?? []) {
    for (const m of map.get(slot.exerciseId)?.primary ?? []) seen.add(m)
  }
  return [...seen]
}

export function dayMuscleLabel(data: AppData, day: ProgramDay): string {
  return dayMuscles(data, day)
    .slice(0, 4)
    .map((m) => MUSCLE_LABEL[m].toLowerCase())
    .join(', ')
}

/** Weekly working sets a block prescribes per muscle, so gaps are visible up front. */
export function plannedVolume(data: AppData, block: ProgramBlock): Record<string, number> {
  const map = exerciseMap(data.customExercises)
  const out: Record<string, number> = {}
  for (const day of block.days) {
    for (const slot of day.slots ?? []) {
      const ex = map.get(slot.exerciseId)
      if (!ex) continue
      for (const m of ex.primary) out[m] = (out[m] ?? 0) + slot.sets
      for (const m of ex.secondary) out[m] = (out[m] ?? 0) + slot.sets * 0.5
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Turning a prescription into a loggable session
// ---------------------------------------------------------------------------

/**
 * Seeds a workout from a prescribed session: the exercises, the set count, and
 * the target reps and load already filled in, so a planned session is logged by
 * correcting what actually happened rather than typing it from scratch.
 */
export function draftFromDay(
  data: AppData,
  block: ProgramBlock,
  day: ProgramDay,
  week: number,
  makeId: () => string,
): Workout {
  const pres = prescribeDay(data, block, day, week)
  return {
    id: makeId(),
    date: todayISO(),
    name: day.name,
    programBlockId: block.id,
    programDayId: day.id,
    exercises: pres.map((p) => ({
      exerciseId: p.slot.exerciseId,
      sets: Array.from({ length: p.sets }, () => ({
        reps: p.targetReps,
        weight: p.loadLb ?? 0,
        rpe: p.slot.rpe,
      })),
    })),
  }
}

/** The same, for a prescribed run. */
export function runFromDay(block: ProgramBlock, day: ProgramDay): Partial<Run> {
  return {
    date: todayISO(),
    type: day.run?.type ?? 'easy',
    distanceMi: day.run?.distanceMi,
    programBlockId: block.id,
    programDayId: day.id,
  }
}

// ---------------------------------------------------------------------------
// Starter blocks
// ---------------------------------------------------------------------------

const slot = (exerciseId: string, sets: number, repMin: number, repMax: number, rpe?: number): ProgramSlot => ({
  exerciseId,
  sets,
  repMin,
  repMax,
  rpe,
})

export interface ProgramPreset {
  key: string
  name: string
  /** Sessions per week, for the picker. */
  perWeek: number
  weeks: number
  deloadWeek?: number
  progression: ProgressionKind
  summary: string
  /** Which goals this suits best, for ordering the picker. */
  suits: GoalPrimary[]
  days: Omit<ProgramDay, 'id'>[]
}

/**
 * Presets, so a block is one tap rather than an hour of data entry. Each is a
 * conventional, well-tested structure rather than anything novel — the value here
 * is that the progression and the logging are wired together, not the split.
 */
export const PROGRAM_PRESETS: ProgramPreset[] = [
  {
    key: 'upper_lower_4',
    name: 'Upper / Lower — 4 days',
    perWeek: 4,
    weeks: 6,
    deloadWeek: 6,
    progression: 'double',
    summary:
      'The best general-purpose split at four days: every muscle trained twice a week, which produces more growth than the same sets crammed into one session.',
    suits: ['muscle_gain', 'recomp', 'fat_loss'],
    days: [
      {
        name: 'Upper A — push emphasis',
        kind: 'lift',
        slots: [
          slot('bench_press', 4, 5, 8),
          slot('seated_cable_row', 3, 8, 12),
          slot('db_shoulder_press', 3, 8, 12),
          slot('lat_pulldown', 3, 10, 14),
          slot('lateral_raise', 3, 12, 18),
          slot('tricep_pushdown', 3, 10, 15),
        ],
      },
      {
        name: 'Lower A — squat emphasis',
        kind: 'lift',
        slots: [
          slot('back_squat', 4, 5, 8),
          slot('rdl', 3, 8, 12),
          slot('leg_press', 3, 10, 15),
          slot('leg_curl', 3, 10, 15),
          slot('standing_calf_raise', 4, 10, 15),
          slot('hanging_leg_raise', 3, 8, 15),
        ],
      },
      {
        name: 'Upper B — pull emphasis',
        kind: 'lift',
        slots: [
          slot('pullup', 4, 5, 10),
          slot('incline_db_press', 3, 8, 12),
          slot('chest_supported_row', 3, 8, 12),
          slot('ohp', 3, 6, 10),
          slot('face_pull', 3, 12, 20),
          slot('hammer_curl', 3, 10, 15),
        ],
      },
      {
        name: 'Lower B — hinge emphasis',
        kind: 'lift',
        slots: [
          slot('deadlift', 3, 4, 6),
          slot('split_squat', 3, 8, 12),
          slot('leg_extension', 3, 12, 15),
          slot('hip_thrust', 3, 8, 12),
          slot('seated_calf_raise', 4, 10, 15),
          slot('cable_crunch', 3, 10, 15),
        ],
      },
    ],
  },
  {
    key: 'full_body_3',
    name: 'Full body — 3 days',
    perWeek: 3,
    weeks: 6,
    deloadWeek: 6,
    progression: 'double',
    summary:
      'Three sessions, everything trained each time. The most forgiving structure there is: miss one and you have still hit every muscle group twice that week.',
    suits: ['fat_loss', 'strength', 'endurance'],
    days: [
      {
        name: 'Full body A',
        kind: 'lift',
        slots: [
          slot('back_squat', 3, 5, 8),
          slot('bench_press', 3, 5, 8),
          slot('barbell_row', 3, 8, 12),
          slot('db_shoulder_press', 2, 8, 12),
          slot('leg_curl', 2, 10, 15),
          slot('plank', 3, 30, 60),
        ],
      },
      {
        name: 'Full body B',
        kind: 'lift',
        slots: [
          slot('deadlift', 3, 4, 6),
          slot('incline_db_press', 3, 8, 12),
          slot('lat_pulldown', 3, 8, 12),
          slot('lunge', 2, 10, 12),
          slot('lateral_raise', 3, 12, 18),
          slot('cable_crunch', 3, 10, 15),
        ],
      },
      {
        name: 'Full body C',
        kind: 'lift',
        slots: [
          slot('front_squat', 3, 6, 10),
          slot('dip', 3, 6, 12),
          slot('seated_cable_row', 3, 8, 12),
          slot('rdl', 3, 8, 12),
          slot('barbell_curl', 3, 10, 15),
          slot('standing_calf_raise', 3, 10, 15),
        ],
      },
    ],
  },
  {
    key: 'ppl_6',
    name: 'Push / Pull / Legs — 6 days',
    perWeek: 6,
    weeks: 5,
    deloadWeek: 5,
    progression: 'double',
    summary:
      'Six sessions, each muscle twice a week with high volume. Only worth running if you can genuinely recover from six days — in a deficit that is unlikely.',
    suits: ['muscle_gain'],
    days: [
      {
        name: 'Push A',
        kind: 'lift',
        slots: [
          slot('bench_press', 4, 5, 8),
          slot('db_shoulder_press', 3, 8, 12),
          slot('incline_db_press', 3, 8, 12),
          slot('lateral_raise', 3, 12, 18),
          slot('tricep_pushdown', 3, 10, 15),
        ],
      },
      {
        name: 'Pull A',
        kind: 'lift',
        slots: [
          slot('pullup', 4, 5, 10),
          slot('barbell_row', 3, 8, 12),
          slot('lat_pulldown', 3, 10, 14),
          slot('face_pull', 3, 12, 20),
          slot('barbell_curl', 3, 10, 15),
        ],
      },
      {
        name: 'Legs A',
        kind: 'lift',
        slots: [
          slot('back_squat', 4, 5, 8),
          slot('rdl', 3, 8, 12),
          slot('leg_press', 3, 10, 15),
          slot('leg_curl', 3, 10, 15),
          slot('standing_calf_raise', 4, 10, 15),
        ],
      },
      {
        name: 'Push B',
        kind: 'lift',
        slots: [
          slot('ohp', 4, 5, 8),
          slot('db_bench', 3, 8, 12),
          slot('machine_chest_press', 3, 10, 14),
          slot('cable_lateral_raise', 3, 12, 18),
          slot('overhead_extension', 3, 10, 15),
        ],
      },
      {
        name: 'Pull B',
        kind: 'lift',
        slots: [
          slot('chinup', 4, 5, 10),
          slot('chest_supported_row', 3, 8, 12),
          slot('straight_arm_pulldown', 3, 12, 15),
          slot('rear_delt_fly', 3, 12, 20),
          slot('hammer_curl', 3, 10, 15),
        ],
      },
      {
        name: 'Legs B',
        kind: 'lift',
        slots: [
          slot('deadlift', 3, 4, 6),
          slot('split_squat', 3, 8, 12),
          slot('leg_extension', 3, 12, 15),
          slot('hip_thrust', 3, 8, 12),
          slot('seated_calf_raise', 4, 10, 15),
        ],
      },
    ],
  },
  {
    key: 'hybrid_4',
    name: 'Lift + run hybrid — 2 lifts, 3 runs',
    perWeek: 5,
    weeks: 6,
    deloadWeek: 6,
    progression: 'double',
    summary:
      'Two full-body lifting sessions to hold muscle, three runs to build the aerobic base. Lifting days come first in the rotation so running never eats the session that protects your muscle.',
    suits: ['endurance', 'fat_loss'],
    days: [
      {
        name: 'Full body A',
        kind: 'lift',
        slots: [
          slot('back_squat', 3, 5, 8),
          slot('bench_press', 3, 5, 8),
          slot('barbell_row', 3, 8, 12),
          slot('rdl', 2, 8, 12),
          slot('plank', 3, 30, 60),
        ],
      },
      { name: 'Easy run', kind: 'run', run: { type: 'easy', minutes: 35 } },
      {
        name: 'Full body B',
        kind: 'lift',
        slots: [
          slot('deadlift', 3, 4, 6),
          slot('ohp', 3, 6, 10),
          slot('lat_pulldown', 3, 8, 12),
          slot('split_squat', 2, 10, 12),
          slot('cable_crunch', 3, 10, 15),
        ],
      },
      { name: 'Threshold run', kind: 'run', run: { type: 'tempo', minutes: 40 } },
      { name: 'Long easy run', kind: 'run', run: { type: 'long', minutes: 70 } },
    ],
  },
]

/** Presets ordered so the ones matching the current goal come first. */
export function presetsForGoal(goal: GoalPrimary): ProgramPreset[] {
  return [...PROGRAM_PRESETS].sort((a, b) => Number(b.suits.includes(goal)) - Number(a.suits.includes(goal)))
}

/** Builds a live block from a preset, starting the Monday of the given week. */
export function blockFromPreset(
  preset: ProgramPreset,
  goal: GoalPrimary,
  makeId: () => string,
  startISO = todayISO(),
): ProgramBlock {
  return {
    id: makeId(),
    name: preset.name,
    // Anchored to a Monday so block weeks line up with the weeks used everywhere
    // else in the app, and the rotation resets when the rest of the UI does.
    startDate: weekStart(startISO),
    weeks: preset.weeks,
    deloadWeek: preset.deloadWeek,
    goal,
    progression: preset.progression,
    days: preset.days.map((d) => ({ ...d, id: makeId() })),
  }
}

/** A fresh copy of a finished block, for running it again. */
export function repeatBlock(block: ProgramBlock, makeId: () => string, startISO = todayISO()): ProgramBlock {
  return {
    ...block,
    id: makeId(),
    startDate: weekStart(startISO),
    archived: false,
    days: block.days.map((d) => ({ ...d, id: makeId() })),
  }
}
