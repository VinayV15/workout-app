import { useEffect, useMemo, useRef, useState } from 'react'
import { DRAFT_KEY, uid, useStore } from '../lib/store'
import type { Exercise, LoggedExercise, Muscle, Profile, SetEntry, Workout } from '../lib/types'
import { MUSCLES, MUSCLE_LABEL } from '../lib/types'
import {
  DEFAULT_BAR_LB,
  detectPRs,
  formatPlates,
  isBarLoaded,
  plateSetFor,
  platesFor,
  repeatLastSession,
  restSecondsFor,
  warmupRamp,
  type PRHit,
} from '../lib/gym'
import { allExercises, exerciseMap } from '../lib/exercises'
import {
  Button,
  Card,
  Chip,
  Empty,
  Field,
  SectionTitle,
  Segmented,
  SelectField,
  Sheet,
  Row,
  Stat,
} from '../components/ui'
import { ChartFrame, SERIES, TargetBars, TimeSeries, niceDomain } from '../components/charts'
import ExerciseGuide from '../components/ExerciseGuide'
import { guideFor } from '../lib/exerciseGuide'
import {
  bodyweightOn,
  daysBetween,
  dispWeight,
  E1RM_MAX_REPS,
  e1rm,
  fmtDate,
  fmtDateFull,
  muscleSetVolume,
  round,
  storeWeight,
  todayISO,
  weightUnit,
  workingSets,
} from '../lib/calc'
import { volumeBar, volumeTargets } from '../lib/recommend'
import RangePicker, { useDateRange } from '../components/RangePicker'
import { bucketFor, bucketLabel, bucketStart, withinRange } from '../lib/dateRange'
import { pctPerWeekOverRange } from '../lib/trends'
import {
  metricsFor,
  sessionSeries,
  strengthSummary,
  strengthTotal,
  trackedExercises,
  trackedMuscles,
  type LiftMetric,
  type Scope,
} from '../lib/strength'

type SubTab = 'log' | 'history' | 'progress' | 'volume'

export default function Lift() {
  const [tab, setTab] = useState<SubTab>('log')
  return (
    <div className="space-y-5">
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'log', label: 'Log' },
          { value: 'history', label: 'History' },
          { value: 'progress', label: 'Progress' },
          { value: 'volume', label: 'Volume' },
        ]}
      />
      {tab === 'log' && <LogTab />}
      {tab === 'history' && <HistoryTab onEdit={() => setTab('log')} />}
      {tab === 'progress' && <ProgressTab />}
      {tab === 'volume' && <VolumeTab />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

function emptyWorkout(): Workout {
  return { id: uid('w'), date: todayISO(), exercises: [] }
}

function LogTab() {
  const { data, saveWorkout } = useStore()
  const units = data.profile.units
  const wu = weightUnit(units)
  const map = useMemo(() => exerciseMap(data.customExercises), [data.customExercises])

  const [workout, setWorkout] = useState<Workout>(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (raw) return JSON.parse(raw) as Workout
    } catch {
      /* fall through to a fresh session */
    }
    return emptyWorkout()
  })
  const [picking, setPicking] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  /** Records set by the session just saved, shown until the next one starts. */
  const [prs, setPrs] = useState<PRHit[]>([])

  // Keep the in-progress session on disk so closing the app mid-workout,
  // or a phone locking itself, never loses the sets already entered.
  useEffect(() => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(workout))
  }, [workout])

  const bw = bodyweightOn(data.body, workout.date) ?? 0

  function addExercise(id: string) {
    setWorkout((w) =>
      w.exercises.some((e) => e.exerciseId === id)
        ? w
        : { ...w, exercises: [...w.exercises, { exerciseId: id, sets: [] }] },
    )
  }

  function updateExercise(idx: number, patch: Partial<LoggedExercise>) {
    setWorkout((w) => ({ ...w, exercises: w.exercises.map((e, i) => (i === idx ? { ...e, ...patch } : e)) }))
  }

  function removeExercise(idx: number) {
    setWorkout((w) => ({ ...w, exercises: w.exercises.filter((_, i) => i !== idx) }))
  }

  const totalSets = workout.exercises.reduce((a, e) => a + workingSets(e.sets).length, 0)
  const canSave = totalSets > 0

  function save() {
    const cleaned = { ...workout, exercises: workout.exercises.filter((e) => e.sets.length > 0) }
    // Judged before the save, against a log that does not yet contain this
    // session — afterwards it would be competing with itself.
    setPrs(detectPRs(cleaned, data))
    saveWorkout(cleaned)
    localStorage.removeItem(DRAFT_KEY)
    setWorkout(emptyWorkout())
  }

  function repeatLast() {
    const repeated = repeatLastSession(data, todayISO(), () => uid('w'))
    if (!repeated) return
    if (totalSets > 0 && !confirm('Replace the session in progress with a copy of your last one?')) return
    setWorkout(repeated)
    setPrs([])
  }

  const planBlock = workout.programBlockId ? data.programs.find((b) => b.id === workout.programBlockId) : undefined

  return (
    <div className="space-y-4">
      {/* A record is the clearest evidence the training is working, and it is
          otherwise invisible — the number it beat scrolled off the screen weeks
          ago, and nothing else in the app would mention it. */}
      {prs.length > 0 && (
        <div
          className="rounded-xl border px-3 py-2.5"
          style={{ borderColor: 'color-mix(in oklab, var(--good) 45%, transparent)' }}
        >
          <p className="flex items-center gap-2 text-sm font-medium">
            <span aria-hidden style={{ color: 'var(--good)' }}>
              ★
            </span>
            {prs.length === 1 ? 'New personal record' : `${prs.length} new personal records`}
          </p>
          <ul className="mt-1 space-y-0.5">
            {prs.map((pr) => (
              <li key={pr.exerciseId} className="text-[11px] text-ink-2">
                <span className="text-ink">{pr.name}</span>
                {pr.kinds.includes('weight') ? (
                  <>
                    {' '}
                    — heaviest set {round(dispWeight(pr.heaviestLb, units), 1)} {wu}, up from{' '}
                    {round(dispWeight(pr.previousHeaviestLb, units), 1)}
                  </>
                ) : (
                  <>
                    {' '}
                    — estimated 1RM {round(dispWeight(pr.e1rmLb, units), 1)} {wu}, up from{' '}
                    {round(dispWeight(pr.previousE1rmLb, units), 1)}
                  </>
                )}
              </li>
            ))}
          </ul>
          <button onClick={() => setPrs([])} className="mt-1.5 text-[11px] text-ink-3 hover:text-ink">
            Dismiss
          </button>
        </div>
      )}

      {planBlock && (
        <div
          className="flex items-start justify-between gap-3 rounded-xl border px-3 py-2.5 text-xs"
          style={{ borderColor: 'color-mix(in oklab, var(--series-1) 40%, transparent)' }}
        >
          <span className="min-w-0">
            <span className="font-medium">{workout.name || 'Planned session'}</span>
            <span className="mt-0.5 block text-[11px] text-ink-2">
              From {planBlock.name}. Sets and loads are pre-filled — correct what actually happened. Saving advances
              your plan to the next session.
            </span>
          </span>
          <button
            onClick={() =>
              setWorkout((w) => ({ ...w, programBlockId: undefined, programDayId: undefined }))
            }
            className="shrink-0 rounded-lg px-2 py-1 text-[11px] text-ink-3 hover:text-ink"
            title="Keep the sets but do not count this against the plan"
          >
            Unlink
          </button>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <Field
          label="Date"
          type="date"
          value={workout.date}
          onChange={(e) => setWorkout((w) => ({ ...w, date: e.target.value }))}
          className="w-40"
        />
        <Field
          label="Session name (optional)"
          value={workout.name ?? ''}
          onChange={(e) => setWorkout((w) => ({ ...w, name: e.target.value }))}
          placeholder="Upper A"
          className="min-w-40 flex-1"
        />
        <Button variant="secondary" onClick={() => setTemplateOpen(true)}>
          Template
        </Button>
      </div>

      {workout.exercises.length === 0 ? (
        <Empty
          title="Nothing logged yet"
          body="Add exercises one at a time, load a template, or repeat your last session with its loads already filled in. Your entries are saved as you type, so you can close the app mid-workout."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" onClick={() => setPicking(true)}>
                Add exercise
              </Button>
              {/* A template fills the exercise list; repeating fills the numbers
                  too, which is what you want when running the same session again. */}
              {data.workouts.length > 0 && <Button onClick={repeatLast}>Repeat last session</Button>}
              <Button onClick={() => setTemplateOpen(true)}>Use template</Button>
            </div>
          }
        />
      ) : (
        <div className="space-y-3">
          {workout.exercises.map((le, idx) => (
            <ExerciseCard
              key={`${le.exerciseId}_${idx}`}
              exercise={map.get(le.exerciseId)}
              logged={le}
              bodyweight={bw}
              units={units}
              profile={data.profile}
              lastSession={findLastSession(data.workouts, le.exerciseId, workout.id)}
              onChange={(patch) => updateExercise(idx, patch)}
              onRemove={() => removeExercise(idx)}
            />
          ))}
        </div>
      )}

      {workout.exercises.length > 0 && (
        <>
          <Button variant="secondary" className="w-full" onClick={() => setPicking(true)}>
            + Add exercise
          </Button>

          <Card className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <SelectField
                label="Session effort (RPE)"
                value={workout.rpe ?? ''}
                onChange={(e) => setWorkout((w) => ({ ...w, rpe: e.target.value ? Number(e.target.value) : undefined }))}
              >
                <option value="">—</option>
                {[5, 6, 7, 8, 9, 10].map((n) => (
                  <option key={n} value={n}>
                    {n} — {rpeWord(n)}
                  </option>
                ))}
              </SelectField>
              <Field
                label="Duration"
                type="number"
                inputMode="numeric"
                suffix="min"
                value={workout.durationMin ?? ''}
                onChange={(e) =>
                  setWorkout((w) => ({ ...w, durationMin: e.target.value ? Number(e.target.value) : undefined }))
                }
              />
            </div>
            <Field
              label="Notes"
              value={workout.note ?? ''}
              onChange={(e) => setWorkout((w) => ({ ...w, note: e.target.value }))}
              placeholder="Left shoulder felt tight on pressing"
            />
            <p className="text-[11px] text-ink-3">
              Session RPE feeds the deload check — the coach watches for several maximal sessions in a row.
            </p>
          </Card>

          <div className="sticky bottom-20 z-20 flex gap-2 sm:bottom-4">
            <Button variant="primary" className="flex-1 shadow-lg" disabled={!canSave} onClick={save}>
              Save session · {totalSets} set{totalSets === 1 ? '' : 's'}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                if (confirm('Discard this session?')) {
                  localStorage.removeItem(DRAFT_KEY)
                  setWorkout(emptyWorkout())
                }
              }}
            >
              Discard
            </Button>
          </div>
        </>
      )}

      <ExercisePicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(id) => {
          addExercise(id)
          setPicking(false)
        }}
      />

      <Sheet open={templateOpen} onClose={() => setTemplateOpen(false)} title="Load a template">
        <div className="space-y-2">
          {data.templates.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                setWorkout((w) => ({
                  ...w,
                  name: w.name || t.name,
                  exercises: [
                    ...w.exercises,
                    ...t.exerciseIds
                      .filter((id) => !w.exercises.some((e) => e.exerciseId === id))
                      .map((id) => ({ exerciseId: id, sets: [] })),
                  ],
                }))
                setTemplateOpen(false)
              }}
              className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-left transition hover:border-line-strong"
            >
              <div className="text-sm font-medium">{t.name}</div>
              <div className="mt-0.5 truncate text-[11px] text-ink-3">
                {t.exerciseIds.map((id) => map.get(id)?.name ?? id).join(' · ')}
              </div>
            </button>
          ))}
        </div>
        <p className="mt-3 text-[11px] text-ink-3">
          Templates only pre-fill the exercise list — you still log the sets. Sets from your previous session are shown
          on each card so you know what to beat.
        </p>
      </Sheet>
      <p className="pb-4 text-center text-[11px] text-ink-3">Loads are entered in {wu}.</p>
    </div>
  )
}

function rpeWord(n: number): string {
  if (n <= 5) return 'very easy'
  if (n === 6) return 'easy'
  if (n === 7) return 'moderate'
  if (n === 8) return 'hard'
  if (n === 9) return 'very hard'
  return 'maximal'
}

function findLastSession(workouts: Workout[], exerciseId: string, excludeId: string) {
  const prior = workouts
    .filter((w) => w.id !== excludeId && w.exercises.some((e) => e.exerciseId === exerciseId))
    .sort((a, b) => b.date.localeCompare(a.date))[0]
  if (!prior) return null
  return { date: prior.date, sets: prior.exercises.find((e) => e.exerciseId === exerciseId)!.sets }
}

function ExerciseCard({
  exercise,
  logged,
  bodyweight,
  units,
  profile,
  lastSession,
  onChange,
  onRemove,
}: {
  exercise?: Exercise
  logged: LoggedExercise
  bodyweight: number
  units: 'imperial' | 'metric'
  profile: Profile
  lastSession: { date: string; sets: SetEntry[] } | null
  onChange: (patch: Partial<LoggedExercise>) => void
  onRemove: () => void
}) {
  const wu = weightUnit(units)
  const isTime = exercise?.loadType === 'time'
  const isBw = exercise?.loadType === 'bodyweight' || exercise?.loadType === 'weighted_bodyweight'
  const [restEnd, setRestEnd] = useState<number | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)

  const restSec = restSecondsFor(profile, exercise)
  const barLb = profile.barWeightLb ?? DEFAULT_BAR_LB
  const plates = useMemo(() => plateSetFor(units), [units])
  const loadable = isBarLoaded(exercise)

  function addSet() {
    const last = logged.sets[logged.sets.length - 1]
    const prev = lastSession?.sets.filter((s) => !s.warmup)[logged.sets.length]
    const seed: SetEntry = last
      ? { ...last }
      : prev
        ? { reps: prev.reps, weight: prev.weight, seconds: prev.seconds }
        : { reps: isTime ? 0 : 8, weight: 0 }
    onChange({ sets: [...logged.sets, seed] })
    // Only when the timer is switched on, and for the duration this exercise
    // warrants rather than one number for everything.
    if (restSec != null) setRestEnd(Date.now() + restSec * 1000)
  }

  /**
   * Prepends a warm-up ramp to the heaviest working set already entered. Runs off
   * what is in the grid rather than asking for a target, because by the time you
   * want warm-ups you have already decided today's top set.
   */
  function addWarmups() {
    const top = workingSets(logged.sets).reduce((m, s) => Math.max(m, s.weight || 0), 0)
    const ramp = warmupRamp(top, barLb, plates, loadable)
    if (ramp.length === 0) return
    onChange({ sets: [...ramp, ...logged.sets] })
  }

  function updateSet(i: number, patch: Partial<SetEntry>) {
    onChange({ sets: logged.sets.map((s, j) => (j === i ? { ...s, ...patch } : s)) })
  }

  function removeSet(i: number) {
    onChange({ sets: logged.sets.filter((_, j) => j !== i) })
  }

  const working = workingSets(logged.sets)
  const best = working.reduce((b, s) => {
    const load = isBw ? bodyweight + (s.weight || 0) : s.weight
    return Math.max(b, e1rm(load, s.reps))
  }, 0)

  // Only offer a ramp when there is a working load to ramp toward and no warm-ups
  // are already sitting there.
  const canRamp =
    !isTime &&
    !logged.sets.some((s) => s.warmup) &&
    working.some((s) => (s.weight || 0) > 0) &&
    warmupRamp(
      working.reduce((m, s) => Math.max(m, s.weight || 0), 0),
      barLb,
      plates,
      loadable,
    ).length > 0

  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{exercise?.name ?? 'Unknown exercise'}</h3>
          <p className="mt-0.5 text-[11px] text-ink-3">
            {exercise ? exercise.primary.map((m) => MUSCLE_LABEL[m]).join(', ') : ''}
            {isBw ? ' · bodyweight + added load' : ''}
          </p>
          {/* Stating the convention where the number is entered, because getting
              it wrong silently corrupts every e1RM, tonnage and prescription
              downstream — and nothing else in the app would flag it. */}
          {!isTime && <p className="mt-0.5 text-[11px] text-ink-3">Enter {weightConvention(exercise)}.</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {/* Reachable mid-set, which is when a form question actually comes up. */}
          {exercise && guideFor(exercise.id) && (
            <button
              onClick={() => setGuideOpen(true)}
              className="rounded-full border border-line px-2 py-1 text-[11px] text-ink-3 hover:text-ink"
              aria-label={`How to perform ${exercise.name}`}
              title="How to perform this exercise"
            >
              ?
            </button>
          )}
          <button onClick={onRemove} className="rounded-lg px-2 py-1 text-xs text-ink-3 hover:text-critical">
            Remove
          </button>
        </div>
      </div>

      {exercise && guideOpen && (
        <ExerciseGuide exercise={exercise} open onClose={() => setGuideOpen(false)} />
      )}

      {lastSession && (
        <div className="rounded-lg bg-surface-2 px-2.5 py-2 text-[11px] text-ink-2">
          <span className="text-ink-3">Last time ({fmtDate(lastSession.date)}): </span>
          {lastSession.sets
            .filter((s) => !s.warmup)
            .map((s) => (isTime ? `${s.seconds ?? 0}s` : `${s.reps}×${round(dispWeight(s.weight, units), 1)}`))
            .join(', ') || 'no working sets'}
        </div>
      )}

      {logged.sets.length > 0 && (
        <div className="space-y-1.5">
          <div className="grid grid-cols-[1.6rem_1fr_1fr_3.2rem_1.6rem] items-center gap-1.5 text-[10px] text-ink-3">
            <span>#</span>
            <span>{isTime ? 'Seconds' : 'Reps'}</span>
            <span>{isBw ? `+${wu}` : loadable ? `${wu} total` : wu}</span>
            <span>RPE</span>
            <span />
          </div>
          {logged.sets.map((s, i) => (
            <div key={i} className="grid grid-cols-[1.6rem_1fr_1fr_3.2rem_1.6rem] items-center gap-1.5">
              <button
                onClick={() => updateSet(i, { warmup: !s.warmup })}
                title={s.warmup ? 'Warm-up set — not counted' : 'Working set'}
                className="tabular rounded-md py-1 text-[11px]"
                style={{ color: s.warmup ? 'var(--text-muted)' : 'var(--text-primary)' }}
              >
                {s.warmup ? 'w' : working.indexOf(s) + 1}
              </button>
              <input
                className="field tabular px-2 py-1.5 text-sm"
                type="number"
                inputMode="numeric"
                value={isTime ? (s.seconds ?? '') : s.reps || ''}
                onChange={(e) =>
                  isTime
                    ? updateSet(i, { seconds: Number(e.target.value), reps: 1 })
                    : updateSet(i, { reps: Number(e.target.value) })
                }
              />
              <input
                className="field tabular px-2 py-1.5 text-sm"
                type="number"
                inputMode="decimal"
                step="0.5"
                value={s.weight ? round(dispWeight(s.weight, units), 1) : ''}
                onChange={(e) => updateSet(i, { weight: storeWeight(Number(e.target.value), units) })}
              />
              <input
                className="field tabular px-1.5 py-1.5 text-center text-sm"
                type="number"
                inputMode="numeric"
                placeholder="—"
                value={s.rpe ?? ''}
                onChange={(e) => updateSet(i, { rpe: e.target.value ? Number(e.target.value) : undefined })}
              />
              <button onClick={() => removeSet(i)} className="rounded-md py-1 text-xs text-ink-3 hover:text-critical">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* What to actually hang on the bar for the set just entered — the number in
          the grid is the total, and nobody wants to halve it under a squat rack. */}
      {loadable && <PlateHint sets={logged.sets} barLb={barLb} plates={plates} units={units} />}

      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={addSet} className="flex-1">
          + Set
        </Button>
        {canRamp && (
          <Button variant="ghost" onClick={addWarmups} title="Add 3 warm-up sets working up to your top set">
            Warm up
          </Button>
        )}
        {restEnd && (
          <RestTimer
            endAt={restEnd}
            onDone={() => setRestEnd(null)}
            onExtend={() => setRestEnd((e) => (e ?? Date.now()) + 30_000)}
          />
        )}
      </div>

      {best > 0 && (
        <p className="text-[11px] text-ink-3">
          Best set this session ≈ {round(dispWeight(best, units), 1)} {wu} estimated 1RM.
          {isBw && bodyweight > 0 && ` Bodyweight ${round(dispWeight(bodyweight, units), 0)} ${wu} included.`}
        </p>
      )}
    </Card>
  )
}

/** How the weight column should be read, per equipment. */
function weightConvention(ex?: Exercise): string {
  if (ex?.loadType === 'bodyweight' || ex?.loadType === 'weighted_bodyweight') {
    return 'any weight you added — leave it blank for bodyweight alone'
  }
  if (ex?.equipment === 'barbell') return 'the total load including the bar'
  if (ex?.equipment === 'dumbbell') return 'the weight of one dumbbell'
  return 'the weight shown on the machine'
}

/**
 * Per-side plate breakdown for the last set entered.
 *
 * The last set rather than all of them: during a session the number you need is
 * the one you are about to load, and a breakdown per row would triple the height
 * of the grid on a phone.
 */
function PlateHint({
  sets,
  barLb,
  plates,
  units,
}: {
  sets: SetEntry[]
  barLb: number
  plates: number[]
  units: 'imperial' | 'metric'
}) {
  const last = sets[sets.length - 1]
  if (!last?.weight) return null
  const b = platesFor(last.weight, barLb, plates, units)
  const wu = weightUnit(units)
  return (
    <p className="text-[11px] text-ink-3">
      {b.belowBar ? (
        <>
          {round(dispWeight(last.weight, units), 1)} {wu} is below the bar itself ({round(b.bar, 1)} {wu}).
        </>
      ) : (
        <>
          <span className="text-ink-2">Per side:</span> {formatPlates(b.perSide)}
          <span className="text-ink-3">
            {' '}
            · {round(b.bar, 1)} {wu} bar
          </span>
          {b.leftover > 0.01 && (
            <span style={{ color: 'var(--warning)' }}>
              {' '}
              · {round(b.leftover, 2)} {wu} short of your plates
            </span>
          )}
        </>
      )}
    </p>
  )
}

/**
 * Counts down the rest interval; a chip rather than a modal so it never blocks
 * logging. `+30` is there because the honest answer to "how long should I rest"
 * is often "a bit longer than I planned", and the alternative is doing arithmetic
 * with a barbell waiting.
 */
function RestTimer({
  endAt,
  onDone,
  onExtend,
}: {
  endAt: number
  onDone: () => void
  onExtend: () => void
}) {
  const [now, setNow] = useState(Date.now())
  const firedRef = useRef(false)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [])
  const remaining = Math.max(0, Math.round((endAt - now) / 1000))
  useEffect(() => {
    if (remaining > 0) {
      // Extending past zero re-arms the buzz, so a second countdown still ends
      // with one.
      firedRef.current = false
      return
    }
    if (!firedRef.current) {
      firedRef.current = true
      // A short vibration where supported; silent elsewhere.
      navigator.vibrate?.(200)
    }
  }, [remaining])

  const done = remaining === 0
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        onClick={onExtend}
        className="rounded-lg border border-line px-2 py-2 text-[11px] text-ink-3 hover:text-ink"
        title="Rest 30 seconds longer"
      >
        +30
      </button>
      <button
        onClick={onDone}
        className="tabular rounded-xl border px-3 py-2 text-sm"
        style={{
          color: done ? 'var(--good)' : 'var(--text-secondary)',
          borderColor: done ? 'color-mix(in oklab, var(--good) 45%, transparent)' : 'var(--border)',
        }}
        title="Tap to dismiss the rest timer"
      >
        {done ? 'Rest done' : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`}
      </button>
    </div>
  )
}

function ExercisePicker({
  open,
  onClose,
  onPick,
}: {
  open: boolean
  onClose: () => void
  onPick: (id: string) => void
}) {
  const { data, addCustomExercise } = useStore()
  const [query, setQuery] = useState('')
  const [muscle, setMuscle] = useState<Muscle | 'all'>('all')
  const [creating, setCreating] = useState(false)
  const [guideExercise, setGuideFor] = useState<Exercise | null>(null)
  const list = useMemo(() => allExercises(data.customExercises), [data.customExercises])

  const filtered = list.filter((e) => {
    const matchesQuery = e.name.toLowerCase().includes(query.trim().toLowerCase())
    const matchesMuscle = muscle === 'all' || e.primary.includes(muscle) || e.secondary.includes(muscle)
    return matchesQuery && matchesMuscle
  })

  return (
    <Sheet open={open} onClose={onClose} title="Add exercise">
      <div className="space-y-3">
        <Field
          placeholder="Search exercises"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
          <Chip active={muscle === 'all'} onClick={() => setMuscle('all')}>
            All
          </Chip>
          {MUSCLES.map((m) => (
            <Chip key={m} active={muscle === m} onClick={() => setMuscle(m)}>
              {MUSCLE_LABEL[m]}
            </Chip>
          ))}
        </div>
        <div className="space-y-1">
          {filtered.map((e) => (
            <div key={e.id} className="flex items-center gap-1 rounded-xl transition hover:bg-surface-2">
              <button onClick={() => onPick(e.id)} className="min-w-0 flex-1 px-3 py-2.5 text-left">
                <div className="text-sm">{e.name}</div>
                <div className="text-[11px] text-ink-3">
                  {e.primary.map((m) => MUSCLE_LABEL[m]).join(', ')}
                  {e.secondary.length > 0 && ` · ${e.secondary.map((m) => MUSCLE_LABEL[m]).join(', ')}`}
                </div>
              </button>
              {/* Separate from the row so choosing an exercise and reading how to do
                  it are different taps — tapping the name should still just add it. */}
              {guideFor(e.id) && (
                <button
                  onClick={() => setGuideFor(e)}
                  className="mr-1.5 shrink-0 rounded-full border border-line px-2 py-1 text-[11px] text-ink-3 hover:text-ink"
                  aria-label={`How to perform ${e.name}`}
                  title={`How to perform ${e.name}`}
                >
                  ?
                </button>
              )}
            </div>
          ))}
          {filtered.length === 0 && <p className="px-1 py-4 text-xs text-ink-3">No match.</p>}
        </div>

        {creating ? (
          <CustomExerciseForm
            initialName={query}
            onCancel={() => setCreating(false)}
            onCreate={(ex) => {
              addCustomExercise(ex)
              setCreating(false)
              onPick(ex.id)
            }}
          />
        ) : (
          <Button variant="ghost" className="w-full" onClick={() => setCreating(true)}>
            + Create a custom exercise
          </Button>
        )}
      </div>

      {guideExercise && (
        <ExerciseGuide exercise={guideExercise} open onClose={() => setGuideFor(null)} />
      )}
    </Sheet>
  )
}

function CustomExerciseForm({
  initialName,
  onCancel,
  onCreate,
}: {
  initialName: string
  onCancel: () => void
  onCreate: (e: Exercise) => void
}) {
  const [name, setName] = useState(initialName)
  const [primary, setPrimary] = useState<Muscle[]>([])
  const [pattern, setPattern] = useState<Exercise['pattern']>('isolation')

  return (
    <Card className="space-y-3">
      <Field label="Exercise name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <div>
        <span className="label">Primary muscles (drives volume tracking)</span>
        <div className="flex flex-wrap gap-1.5">
          {MUSCLES.map((m) => (
            <Chip
              key={m}
              active={primary.includes(m)}
              onClick={() => setPrimary((p) => (p.includes(m) ? p.filter((x) => x !== m) : [...p, m]))}
            >
              {MUSCLE_LABEL[m]}
            </Chip>
          ))}
        </div>
      </div>
      <SelectField label="Pattern" value={pattern} onChange={(e) => setPattern(e.target.value as Exercise['pattern'])}>
        {(
          [
            'horizontal_push',
            'vertical_push',
            'horizontal_pull',
            'vertical_pull',
            'squat',
            'hinge',
            'lunge',
            'carry',
            'isolation',
            'core',
          ] as Exercise['pattern'][]
        ).map((p) => (
          <option key={p} value={p}>
            {p.replace(/_/g, ' ')}
          </option>
        ))}
      </SelectField>
      <div className="flex gap-2">
        <Button
          variant="primary"
          disabled={!name.trim() || primary.length === 0}
          onClick={() =>
            onCreate({
              id: uid('ex'),
              name: name.trim(),
              pattern,
              loadType: 'weight',
              equipment: 'other',
              primary,
              secondary: [],
              custom: true,
            })
          }
        >
          Create
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

function HistoryTab({ onEdit }: { onEdit: () => void }) {
  const { data, deleteWorkout } = useStore()
  const units = data.profile.units
  const map = useMemo(() => exerciseMap(data.customExercises), [data.customExercises])
  const [open, setOpen] = useState<string | null>(null)
  const { range, resolved, setRange } = useDateRange('lift')
  const earliest = useMemo(() => [...data.workouts].map((w) => w.date).sort()[0] ?? null, [data.workouts])
  const sorted = useMemo(
    () => withinRange(data.workouts, resolved).sort((a, b) => b.date.localeCompare(a.date)),
    [data.workouts, resolved],
  )
  const selected = sorted.find((w) => w.id === open)

  return (
    <div className="space-y-2">
      <RangePicker range={range} resolved={resolved} onChange={setRange} earliest={earliest} />
      {sorted.length === 0 && (
        <Empty
          title={data.workouts.length ? 'No sessions in this range' : 'No sessions yet'}
          body={
            data.workouts.length
              ? 'Widen the range or choose All time to see the sessions you have logged.'
              : 'Saved workouts appear here, newest first, with every set you logged.'
          }
        />
      )}
      {sorted.map((w) => {
        const sets = w.exercises.reduce((a, e) => a + workingSets(e.sets).length, 0)
        const bw = bodyweightOn(data.body, w.date) ?? 0
        const tonnage = w.exercises.reduce(
          (a, e) =>
            a +
            workingSets(e.sets).reduce((b, s) => {
              const ex = map.get(e.exerciseId)
              const load = ex?.loadType === 'bodyweight' || ex?.loadType === 'weighted_bodyweight' ? bw + s.weight : s.weight
              return b + load * s.reps
            }, 0),
          0,
        )
        return (
          <button
            key={w.id}
            onClick={() => setOpen(w.id)}
            className="card w-full p-3.5 text-left transition hover:border-line-strong"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium">{w.name || 'Session'}</span>
              <span className="text-[11px] text-ink-3">{fmtDateFull(w.date)}</span>
            </div>
            <div className="mt-1 truncate text-[11px] text-ink-3">
              {w.exercises.map((e) => map.get(e.exerciseId)?.name ?? e.exerciseId).join(' · ')}
            </div>
            <div className="tabular mt-2 flex gap-4 text-[11px] text-ink-2">
              <span>{sets} sets</span>
              <span>
                {round(dispWeight(tonnage, units), 0).toLocaleString()} {weightUnit(units)} total
              </span>
              {w.rpe && <span>RPE {w.rpe}</span>}
              {w.durationMin && <span>{w.durationMin} min</span>}
            </div>
          </button>
        )
      })}

      <Sheet
        open={!!selected}
        onClose={() => setOpen(null)}
        title={selected ? `${selected.name || 'Session'} · ${fmtDate(selected.date)}` : ''}
        footer={
          selected && (
            <div className="flex gap-2">
              <Button
                variant="danger"
                onClick={() => {
                  if (confirm('Delete this session?')) {
                    deleteWorkout(selected.id)
                    setOpen(null)
                  }
                }}
              >
                Delete
              </Button>
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  // Re-open as a draft so it can be corrected or repeated.
                  localStorage.setItem(DRAFT_KEY, JSON.stringify(selected))
                  deleteWorkout(selected.id)
                  setOpen(null)
                  onEdit()
                }}
              >
                Edit in log
              </Button>
            </div>
          )
        }
      >
        {selected && (
          <div className="space-y-4">
            {selected.exercises.map((e) => {
              const ex = map.get(e.exerciseId)
              return (
                <div key={e.exerciseId}>
                  <h4 className="text-sm font-medium">{ex?.name ?? e.exerciseId}</h4>
                  <div className="mt-1 space-y-0.5">
                    {e.sets.map((s, i) => (
                      <div key={i} className="tabular flex gap-3 text-xs text-ink-2">
                        <span className="w-6 text-ink-3">{s.warmup ? 'w' : i + 1}</span>
                        <span>
                          {ex?.loadType === 'time'
                            ? `${s.seconds ?? 0}s`
                            : `${s.reps} × ${round(dispWeight(s.weight, units), 1)} ${weightUnit(units)}`}
                        </span>
                        {s.rpe && <span className="text-ink-3">RPE {s.rpe}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
            {selected.note && <p className="text-xs text-ink-2 italic">{selected.note}</p>}
          </div>
        )}
      </Sheet>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Per-exercise progression
// ---------------------------------------------------------------------------

function ProgressTab() {
  const { data } = useStore()
  const units = data.profile.units
  const wu = weightUnit(units)
  const map = useMemo(() => exerciseMap(data.customExercises), [data.customExercises])
  const { range, resolved, setRange } = useDateRange('progress')
  const earliest = useMemo(() => [...data.workouts].map((w) => w.date).sort()[0] ?? null, [data.workouts])

  const exercises = useMemo(() => trackedExercises(data), [data])
  const muscles = useMemo(() => trackedMuscles(data), [data])
  const [kind, setKind] = useState<Scope['kind']>('exercise')
  const [exerciseId, setExerciseId] = useState<string | null>(null)
  const [muscle, setMuscle] = useState<Muscle | null>(null)
  const [metric, setMetric] = useState<LiftMetric>('e1rm')

  const scope: Scope | null =
    kind === 'exercise'
      ? (exerciseId ?? exercises[0])
        ? { kind: 'exercise', id: exerciseId ?? exercises[0] }
        : null
      : (muscle ?? muscles[0])
        ? { kind: 'muscle', muscle: muscle ?? muscles[0] }
        : null

  const metrics = metricsFor(kind)
  // Switching to a muscle drops the metrics that cannot aggregate, so fall back
  // rather than charting nothing.
  const activeMetric = metrics.some((m) => m.key === metric) ? metric : metrics[0].key
  const spec = metrics.find((m) => m.key === activeMetric)!

  const allSeries = useMemo(() => (scope ? sessionSeries(data, scope) : []), [data, scope])
  const series = useMemo(() => withinRange(allSeries, resolved), [allSeries, resolved])
  const inRangeWorkouts = useMemo(() => withinRange(data.workouts, resolved), [data.workouts, resolved])
  const summary = useMemo(() => strengthSummary(data, inRangeWorkouts), [data, inRangeWorkouts])
  const total = useMemo(() => strengthTotal(summary), [summary])

  const scopeLabel =
    scope?.kind === 'exercise' ? (map.get(scope.id)?.name ?? scope.id) : scope ? MUSCLE_LABEL[scope.muscle] : ''

  if (exercises.length === 0) {
    return (
      <Empty
        title="No exercise history yet"
        body="Once you have logged the same exercise two or three times, its estimated one-rep max and volume trend appear here."
      />
    )
  }

  const show = (v: number) => (spec.weight ? round(dispWeight(v, units), 1) : Math.round(v))
  const chart = series.map((p) => ({ date: p.date, value: show(p[activeMetric]) }))
  const latest = series[series.length - 1]
  const best = series.length ? series.reduce((b, p) => (p[activeMetric] > b[activeMetric] ? p : b)) : null
  const trend = pctPerWeekOverRange(series, (p) => p[activeMetric])

  return (
    <div className="space-y-4">
      <RangePicker range={range} resolved={resolved} onChange={setRange} earliest={earliest} />

      {/* Estimated 1RM for every lift at once — one answer to "is my maximal
          strength going up", which a single-lift chart cannot give. */}
      {summary.length > 0 && (
        <Card>
          <SectionTitle
            sub={`Heaviest single rep your best set implies, within ${resolved.label.toLowerCase()}`}
          >
            Estimated 1 rep max
          </SectionTitle>
          <div className="space-y-0.5">
            {summary.slice(0, 8).map((r) => (
              <Row
                key={r.exerciseId}
                label={r.name}
                sub={`from ${r.topSet} · ${r.sessions} session${r.sessions === 1 ? '' : 's'}`}
                value={
                  <span className="flex items-baseline gap-2">
                    <span>
                      {round(dispWeight(r.currentLb, units), 1)} {wu}
                    </span>
                    {r.changeLb != null && Math.abs(r.changeLb) >= 0.5 && (
                      <span
                        className="text-[11px]"
                        style={{ color: r.changeLb > 0 ? 'var(--delta-good)' : 'var(--critical)' }}
                      >
                        {r.changeLb > 0 ? '+' : ''}
                        {round(dispWeight(r.changeLb, units), 1)}
                      </span>
                    )}
                  </span>
                }
              />
            ))}
          </div>
          {total.lifts > 1 && (
            <div className="mt-2 flex items-baseline justify-between border-t border-line pt-2 text-sm">
              <span className="font-medium">Total of {total.lifts} main lifts</span>
              <span className="tabular font-medium">
                {round(dispWeight(total.totalLb, units), 0).toLocaleString()} {wu}
                {Math.abs(total.changeLb) >= 1 && (
                  <span
                    className="ml-2 text-[11px]"
                    style={{ color: total.changeLb > 0 ? 'var(--delta-good)' : 'var(--critical)' }}
                  >
                    {total.changeLb > 0 ? '+' : ''}
                    {round(dispWeight(total.changeLb, units), 0)}
                  </span>
                )}
              </span>
            </div>
          )}
          <p className="mt-2.5 text-[11px] leading-relaxed text-ink-3">
            Blended from three established formulas rather than one, because each is only reliable over part of
            the rep range. Sets above {E1RM_MAX_REPS} reps are treated as {E1RM_MAX_REPS} — past that a set
            measures endurance, not maximal strength.
          </p>
        </Card>
      )}

      {/* Scope: one lift, or everything training one muscle. */}
      <div className="space-y-2">
        <Segmented
          value={kind}
          onChange={(k: Scope['kind']) => setKind(k)}
          options={[
            { value: 'exercise', label: 'By exercise' },
            { value: 'muscle', label: 'By muscle' },
          ]}
        />
        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
          {kind === 'exercise'
            ? exercises.map((id) => (
                <Chip key={id} active={scope?.kind === 'exercise' && scope.id === id} onClick={() => setExerciseId(id)}>
                  {map.get(id)?.name ?? id}
                </Chip>
              ))
            : muscles.map((m) => (
                <Chip key={m} active={scope?.kind === 'muscle' && scope.muscle === m} onClick={() => setMuscle(m)}>
                  {MUSCLE_LABEL[m]}
                </Chip>
              ))}
        </div>
        <div className="no-scrollbar -mx-4 flex gap-1.5 overflow-x-auto px-4">
          {metrics.map((m) => (
            <button
              key={m.key}
              onClick={() => setMetric(m.key)}
              className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                activeMetric === m.key
                  ? 'border-transparent bg-s1 text-white'
                  : 'border-line bg-surface-2 text-ink-2 hover:text-ink'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        {kind === 'muscle' && (
          <p className="text-[11px] leading-relaxed text-ink-3">
            Everything that trains {scopeLabel.toLowerCase()}, directly or as an assister. A 1RM is not offered here
            because it does not add up across movements — a bench press max and a fly max do not sum to anything.
          </p>
        )}
      </div>

      {series.length === 0 ? (
        <Empty
          title="Nothing in this range"
          body={`No ${scopeLabel} sessions in ${resolved.label.toLowerCase()}. Widen the range or choose All time.`}
        />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2.5">
            <Stat
              label="Latest"
              value={latest ? show(latest[activeMetric]) : '—'}
              unit={spec.weight ? wu : undefined}
              sub={latest ? fmtDate(latest.date) : undefined}
            />
            <Stat
              label="Best in range"
              value={best ? show(best[activeMetric]) : '—'}
              unit={spec.weight ? wu : undefined}
              sub={best ? fmtDate(best.date) : undefined}
            />
            <Stat
              label="Trend"
              value={trend == null ? '—' : `${trend > 0 ? '+' : ''}${round(trend, 1)}%`}
              sub={`per week · ${resolved.label.toLowerCase()}`}
            />
          </div>

          <ChartFrame
            title={`${spec.label} — ${scopeLabel}`}
            sub={`${spec.sub}. One point per session.`}
            table={{
              head: ['Date', `${spec.label}${spec.weight ? ` (${wu})` : ''}`, ...(activeMetric === 'e1rm' ? ['From set'] : [])],
              rows: [...series]
                .reverse()
                .map((p) => [fmtDate(p.date), show(p[activeMetric]), ...(activeMetric === 'e1rm' ? [p.topSet] : [])]),
            }}
          >
            <TimeSeries
              data={chart}
              xKey="date"
              xTickFormatter={fmtDate}
              series={[
                {
                  key: 'value',
                  label: spec.label,
                  color: SERIES.s1,
                  area: activeMetric === 'e1rm' || activeMetric === 'heaviest',
                  bar: activeMetric === 'volume' || activeMetric === 'sets' || activeMetric === 'reps',
                },
              ]}
              yDomain={
                activeMetric === 'e1rm' || activeMetric === 'heaviest'
                  ? niceDomain(chart.map((c) => c.value))
                  : undefined
              }
            />
          </ChartFrame>

          <Card>
            <SectionTitle sub={`Sessions in ${resolved.label.toLowerCase()}, newest first`}>Session log</SectionTitle>
            {[...series].reverse().slice(0, 24).map((p) => (
              <Row
                key={p.date}
                label={fmtDate(p.date)}
                sub={
                  scope?.kind === 'exercise'
                    ? `top set ${p.topSet} · ${p.sets} set${p.sets === 1 ? '' : 's'}, ${p.reps} reps`
                    : `${p.sets} set${p.sets === 1 ? '' : 's'}, ${p.reps} reps`
                }
                value={`${show(p[activeMetric])}${spec.weight ? ` ${wu}` : ''}`}
              />
            ))}
          </Card>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Volume
// ---------------------------------------------------------------------------

function VolumeTab() {
  const { data } = useStore()
  const targets = useMemo(() => volumeTargets(data), [data])
  const { range, resolved, setRange } = useDateRange('volume')
  const earliest = useMemo(() => [...data.workouts].map((w) => w.date).sort()[0] ?? null, [data.workouts])
  const inRange = useMemo(() => withinRange(data.workouts, resolved), [data.workouts, resolved])

  // Bucketed to suit the window: a year of weekly bars is 52 slivers, so long ranges
  // roll up to months.
  const bucket = bucketFor(resolved, earliest ? Math.abs(daysBetween(earliest, todayISO())) + 1 : 90)
  const buckets = useMemo(() => {
    const map = new Map<string, number>()
    for (const w of inRange) {
      const k = bucketStart(w.date, bucket)
      const sets = w.exercises.reduce((b, e) => b + workingSets(e.sets).length, 0)
      map.set(k, (map.get(k) ?? 0) + sets)
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([period, sets]) => ({ period, sets }))
  }, [inRange, bucket])

  const rows = targets
    .filter((t) => t.target > 0)
    .sort((a, b) => b.deficit - a.deficit)
    .map(volumeBar)

  // Per-muscle totals over the chosen range, shown as a per-week average so the
  // number stays comparable however wide the window is.
  const raw = useMemo(() => muscleSetVolume(inRange, data.customExercises), [inRange, data.customExercises])
  const weeks = Math.max(1, (resolved.days ?? (earliest ? Math.abs(daysBetween(earliest, todayISO())) + 1 : 7)) / 7)

  return (
    <div className="space-y-4">
      <RangePicker range={range} resolved={resolved} onChange={setRange} earliest={earliest} />

      <Card>
        <SectionTitle sub="Weekly average over the last 14 days, against the target for your current goal">
          Sets per muscle group
        </SectionTitle>
        <TargetBars rows={rows} />
        <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
          A set counts fully for the muscles a lift targets directly and half for assisting muscles — a bench press is
          one chest set and half a triceps set. Bars are amber where you are three or more sets short.
        </p>
      </Card>

      <ChartFrame
        title={`Total hard sets per ${bucket}`}
        sub="All working sets across every muscle group. Warm-ups are excluded."
        table={{ head: [bucketLabel(bucket), 'Sets'], rows: [...buckets].reverse().map((w) => [fmtDate(w.period), w.sets]) }}
      >
        <TimeSeries
          data={buckets}
          xKey="period"
          xTickFormatter={fmtDate}
          series={[{ key: 'sets', label: 'Sets', color: SERIES.s1, bar: true }]}
        />
      </ChartFrame>

      <Card>
        <SectionTitle sub={`${resolved.label} · fractional sets, averaged per week`}>Volume per muscle</SectionTitle>
        {MUSCLES.filter((m) => raw[m] > 0).map((m) => (
          <Row key={m} label={MUSCLE_LABEL[m]} value={round(raw[m] / weeks, 1)} sub={`${round(raw[m], 1)} total`} />
        ))}
        {MUSCLES.every((m) => raw[m] === 0) && (
          <p className="text-xs text-ink-3">No sets logged in {resolved.label.toLowerCase()}.</p>
        )}
      </Card>
    </div>
  )
}
