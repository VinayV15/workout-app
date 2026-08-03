/** Core data model. Everything is stored on-device as one JSON document. */

export type Muscle =
  | 'chest'
  | 'lats'
  | 'upper_back'
  | 'shoulders'
  | 'rear_delts'
  | 'biceps'
  | 'triceps'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'core'

export const MUSCLES: Muscle[] = [
  'chest',
  'lats',
  'upper_back',
  'shoulders',
  'rear_delts',
  'biceps',
  'triceps',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'core',
]

export const MUSCLE_LABEL: Record<Muscle, string> = {
  chest: 'Chest',
  lats: 'Lats',
  upper_back: 'Upper back',
  shoulders: 'Shoulders',
  rear_delts: 'Rear delts',
  biceps: 'Biceps',
  triceps: 'Triceps',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  calves: 'Calves',
  core: 'Core',
}

/** Movement pattern — used for push/pull and upper/lower balance checks. */
export type Pattern =
  | 'horizontal_push'
  | 'vertical_push'
  | 'horizontal_pull'
  | 'vertical_pull'
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'carry'
  | 'isolation'
  | 'core'

/** How an exercise's load is entered. */
export type LoadType = 'weight' | 'bodyweight' | 'weighted_bodyweight' | 'time'

export interface Exercise {
  id: string
  name: string
  pattern: Pattern
  loadType: LoadType
  /** Muscles that receive direct, primary stimulus (counted as 1.0 sets). */
  primary: Muscle[]
  /** Muscles that assist (counted as 0.5 sets). */
  secondary: Muscle[]
  equipment: 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'other'
  /** True for the big compounds worth tracking as strength benchmarks. */
  benchmark?: boolean
  custom?: boolean
}

export interface SetEntry {
  reps: number
  /** Load in the user's unit (lb or kg). For bodyweight moves, added weight. */
  weight: number
  /** 1–10 reps-in-reserve style effort. Optional. */
  rpe?: number
  /** Seconds, for time-based work (planks, carries). */
  seconds?: number
  warmup?: boolean
}

export interface LoggedExercise {
  exerciseId: string
  sets: SetEntry[]
  note?: string
}

export interface Workout {
  id: string
  /** ISO date, YYYY-MM-DD (local). */
  date: string
  name?: string
  exercises: LoggedExercise[]
  /** Overall session RPE 1–10. */
  rpe?: number
  durationMin?: number
  note?: string
  /**
   * Set when the session was logged against a training block, which is what lets
   * the rotation know this slot is done. Optional, so free-form sessions and
   * everything logged before blocks existed stay valid.
   */
  programBlockId?: string
  programDayId?: string
}

export type RunType = 'easy' | 'long' | 'tempo' | 'interval' | 'race' | 'recovery'

export const RUN_TYPE_LABEL: Record<RunType, string> = {
  easy: 'Easy',
  long: 'Long',
  tempo: 'Tempo / threshold',
  interval: 'Intervals',
  race: 'Race / time trial',
  recovery: 'Recovery',
}

/** Run types that count as quality (hard) work for intensity distribution. */
export const HARD_RUN_TYPES: RunType[] = ['tempo', 'interval', 'race']

export interface Run {
  id: string
  date: string
  /** Always stored in miles; converted for display. */
  distanceMi: number
  /** Total moving time in seconds. */
  seconds: number
  type: RunType
  avgHr?: number
  /** Always stored in feet; converted for display. */
  elevationFt?: number
  rpe?: number
  note?: string
  /** As on Workout: the block rotation slot this run satisfied. */
  programBlockId?: string
  programDayId?: string
}

export interface BodyEntry {
  id: string
  date: string
  /** Always stored in pounds. */
  weightLb?: number
  bodyFatPct?: number
  /** Optional tape measurements, always in inches. */
  waistIn?: number
  neckIn?: number
  hipsIn?: number
  chestIn?: number
  armIn?: number
  thighIn?: number
  /** Shoulder width (acromion to acromion), not a girth. Drives the physique model most. */
  shouldersIn?: number
  calfIn?: number
  forearmIn?: number
  restingHr?: number
  note?: string
}

export type GoalPrimary = 'fat_loss' | 'recomp' | 'muscle_gain' | 'endurance' | 'strength'

export const GOAL_LABEL: Record<GoalPrimary, string> = {
  fat_loss: 'Lose body fat',
  recomp: 'Recomposition (lose fat + gain muscle)',
  muscle_gain: 'Build muscle',
  endurance: 'Running performance',
  strength: 'Maximal strength',
}

export interface Goals {
  primary: GoalPrimary
  /** Secondary emphasis, weighted lower in recommendations. */
  secondary?: GoalPrimary
  targetWeightLb?: number
  targetBodyFatPct?: number
  /** ISO date the targets are aimed at. */
  targetDate?: string
  liftDaysPerWeek: number
  runDaysPerWeek: number
  weeklyMileageTarget?: number
  /** Muscle groups the user wants extra attention on. */
  focusMuscles: Muscle[]
  raceDistanceMi?: number
  /** Goal time for raceDistanceMi, in seconds. */
  raceTimeSec?: number
}

export type Units = 'imperial' | 'metric'
export type Sex = 'male' | 'female'

/**
 * How long the rest timer runs between sets.
 *
 * `off` is a first-class option, not a zero duration — plenty of people pace
 * themselves by feel and a countdown they did not ask for is just noise.
 * `byPattern` exists because one number cannot serve both ends of a session:
 * three minutes is right after a heavy squat and absurd after a lateral raise.
 */
export type RestMode = 'off' | 'uniform' | 'byPattern'

export interface Profile {
  name?: string
  sex: Sex
  birthDate?: string
  heightIn?: number
  units: Units
  /** Non-exercise activity level, for the TDEE estimate. */
  activity: 'sedentary' | 'light' | 'moderate' | 'high'
  /** Hand-entered maintenance calories, overrides the estimate when set. */
  tdeeOverride?: number
  /** Rest timer behaviour. Undefined is treated as `uniform`. */
  restMode?: RestMode
  /** Seconds, for `uniform`. */
  restSec?: number
  /** Seconds after a compound lift, for `byPattern`. */
  restCompoundSec?: number
  /** Seconds after isolation or core work, for `byPattern`. */
  restIsolationSec?: number
  /**
   * Weight of an empty bar, in pounds, for the plate calculator. Varies by gym
   * and by bar — a women's Olympic bar is 35 lb, a trap bar can be 60.
   */
  barWeightLb?: number
  /**
   * The accent colour, as a hex string. Undefined means the default.
   *
   * Lives in the profile so it syncs: the app should look like yours on every
   * device you open it on, not just the one you picked the colour on.
   */
  accentHex?: string
}

/**
 * Change tracking for cross-device sync. Keys are `${table}:${id}`, values are
 * ISO timestamps of the last local change — enough to merge two devices
 * record-by-record instead of overwriting one with the other.
 */
export interface SyncMeta {
  rev: Record<string, string>
  /** Tombstones, so a deletion on one device propagates instead of resurrecting. */
  deleted: Record<string, string>
  lastSyncedAt?: string
}

export interface AppData {
  version: number
  profile: Profile
  goals: Goals
  workouts: Workout[]
  runs: Run[]
  body: BodyEntry[]
  customExercises: Exercise[]
  templates: WorkoutTemplate[]
  /** Training blocks, current and past. See lib/program.ts. */
  programs: ProgramBlock[]
  /** Recommendation ids the user has dismissed, with the week they were hidden. */
  dismissed: Record<string, string>
  sync: SyncMeta
}

export interface WorkoutTemplate {
  id: string
  name: string
  exerciseIds: string[]
  custom?: boolean
}

// ---------------------------------------------------------------------------
// Training blocks. The logic that reads these lives in lib/program.ts; the
// shapes live here with the rest of the stored document.
// ---------------------------------------------------------------------------

/** One prescribed exercise inside a session. */
export interface ProgramSlot {
  exerciseId: string
  sets: number
  repMin: number
  repMax: number
  /** Target effort, so autoregulated blocks can prescribe by RPE. */
  rpe?: number
}

/** One session in the weekly rotation. */
export interface ProgramDay {
  id: string
  name: string
  kind: 'lift' | 'run'
  /** Lifting prescription. */
  slots?: ProgramSlot[]
  /** Running prescription. */
  run?: { type: RunType; minutes?: number; distanceMi?: number }
}

export type ProgressionKind = 'double' | 'linear' | 'rpe'

export interface ProgramBlock {
  id: string
  name: string
  /** ISO date the block starts — always a Monday. */
  startDate: string
  /** Length in weeks, deload included. */
  weeks: number
  /** 1-indexed deload week, or undefined for none. Conventionally the last. */
  deloadWeek?: number
  /** What the block is built for, so the intent stays visible. */
  goal: GoalPrimary
  progression: ProgressionKind
  days: ProgramDay[]
  /** Set when the block is retired, so history survives without cluttering. */
  archived?: boolean
}
