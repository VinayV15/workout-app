/**
 * Tests for training blocks. No test framework — run with:
 *   npm test
 *
 * The two things that must not break: the prescription arithmetic (a load that
 * moves when it should not is worse than no plan) and the rotation (a session
 * that goes missing, or one that never advances, makes the plan untrustworthy).
 */
import {
  activeBlock,
  adherence,
  blockEndDate,
  blockFromPreset,
  blockWeek,
  draftFromDay,
  isDeload,
  nextDay,
  plannedVolume,
  prescribe,
  prescribeDay,
  presetsForGoal,
  repeatBlock,
  weekProgress,
  PROGRAM_PRESETS,
} from '../src/lib/program.ts'
import { suggestToday, generateRecommendations } from '../src/lib/recommend.ts'
import { addDays, todayISO, weekStart, workingSets } from '../src/lib/calc.ts'
import { EXERCISES } from '../src/lib/exercises.ts'

let passed = 0
let failed = 0
let n = 0

function check(name, pass, detail = '') {
  if (pass) {
    passed++
    console.log(`  ok   ${name}`)
  } else {
    failed++
    console.error(`  FAIL ${name}${detail ? ` :: ${detail}` : ''}`)
  }
}

const id = () => `t${++n}`

const data = (over = {}) => ({
  version: 1,
  profile: { sex: 'male', units: 'imperial', activity: 'light', heightIn: 70, birthDate: '1990-01-01' },
  goals: { primary: 'muscle_gain', liftDaysPerWeek: 4, runDaysPerWeek: 2, focusMuscles: [] },
  workouts: [],
  runs: [],
  body: [],
  customExercises: [],
  templates: [],
  programs: [],
  dismissed: {},
  sync: { rev: {}, deleted: {} },
  ...over,
})

/** A two-day block starting this Monday, with a deload in week 4. */
const block = (over = {}) => ({
  id: 'blk',
  name: 'Test block',
  startDate: weekStart(todayISO()),
  weeks: 4,
  deloadWeek: 4,
  goal: 'muscle_gain',
  progression: 'double',
  days: [
    { id: 'd1', name: 'Day one', kind: 'lift', slots: [{ exerciseId: 'bench_press', sets: 3, repMin: 5, repMax: 8 }] },
    { id: 'd2', name: 'Day two', kind: 'lift', slots: [{ exerciseId: 'back_squat', sets: 3, repMin: 5, repMax: 8 }] },
  ],
  ...over,
})

/** A logged session of one exercise at a fixed load and rep count per set. */
const session = (exerciseId, date, reps, weight, sets = 3, extra = {}) => ({
  id: `w_${exerciseId}_${date}`,
  date,
  exercises: [{ exerciseId, sets: Array.from({ length: sets }, (_, i) => ({ reps: Array.isArray(reps) ? reps[i] : reps, weight })) }],
  ...extra,
})

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------
console.log('presets')
{
  check('every preset has at least one session', PROGRAM_PRESETS.every((p) => p.days.length > 0))
  check(
    'perWeek matches the number of days',
    PROGRAM_PRESETS.every((p) => p.perWeek === p.days.length),
    PROGRAM_PRESETS.filter((p) => p.perWeek !== p.days.length)
      .map((p) => p.key)
      .join(','),
  )
  const known = new Set(EXERCISES.map((e) => e.id))
  const unknown = PROGRAM_PRESETS.flatMap((p) =>
    p.days.flatMap((d) => (d.slots ?? []).map((s) => s.exerciseId).filter((x) => !known.has(x))),
  )
  check('every prescribed exercise exists in the library', unknown.length === 0, unknown.join(','))
  check(
    'rep ranges are the right way round',
    PROGRAM_PRESETS.every((p) => p.days.every((d) => (d.slots ?? []).every((s) => s.repMin <= s.repMax && s.sets > 0))),
  )
  check(
    'a deload week, when set, is inside the block',
    PROGRAM_PRESETS.every((p) => p.deloadWeek == null || p.deloadWeek <= p.weeks),
  )
  check(
    'run days carry a run prescription and no slots',
    PROGRAM_PRESETS.every((p) => p.days.every((d) => (d.kind === 'run' ? !!d.run && !d.slots : !!d.slots))),
  )
  check('presets matching the goal are ordered first', presetsForGoal('endurance')[0].suits.includes('endurance'))

  const built = blockFromPreset(PROGRAM_PRESETS[0], 'recomp', id)
  check('a block built from a preset starts on a Monday', built.startDate === weekStart(built.startDate))
  check('and takes the goal it was started for', built.goal === 'recomp')
  check('and gives every day a unique id', new Set(built.days.map((d) => d.id)).size === built.days.length)
}

// ---------------------------------------------------------------------------
// Where you are in a block
// ---------------------------------------------------------------------------
console.log('\nblock timeline')
{
  const b = block()
  check('the starting week is week 1', blockWeek(b, b.startDate) === 1)
  check('seven days in is week 2', blockWeek(b, addDays(b.startDate, 7)) === 2)
  check('the last day is still week 4', blockWeek(b, addDays(b.startDate, 27)) === 4)
  check('one day past the end is outside the block', blockWeek(b, addDays(b.startDate, 28)) === null)
  check('before it starts is outside the block', blockWeek(b, addDays(b.startDate, -1)) === null)
  check('the end date is the last day of the last week', blockEndDate(b) === addDays(b.startDate, 27))
  check('week 4 is the deload', isDeload(b, 4) && !isDeload(b, 3))

  check('a live block is found', activeBlock(data({ programs: [b] }))?.id === 'blk')
  check('an archived block is not', activeBlock(data({ programs: [{ ...b, archived: true }] })) === null)
  check(
    'a finished block is not',
    activeBlock(data({ programs: [{ ...b, startDate: addDays(weekStart(todayISO()), -70) }] })) === null,
  )
  check(
    'the most recently started of two live blocks wins',
    activeBlock(
      data({
        programs: [
          { ...b, id: 'old', startDate: addDays(weekStart(todayISO()), -7) },
          { ...b, id: 'new' },
        ],
      }),
    )?.id === 'new',
  )
}

// ---------------------------------------------------------------------------
// Rotation
// ---------------------------------------------------------------------------
console.log('\nrotation')
{
  const b = block()
  check('with nothing logged the first session is next', nextDay(data({ programs: [b] }), b)?.id === 'd1')

  const afterD1 = data({
    programs: [b],
    workouts: [session('bench_press', todayISO(), 5, 135, 3, { programBlockId: 'blk', programDayId: 'd1' })],
  })
  check('completing a session advances the rotation', nextDay(afterD1, b)?.id === 'd2')
  check('and the week counts one done', weekProgress(afterD1, b).done === 1)

  const bothDone = data({
    programs: [b],
    workouts: [
      session('bench_press', todayISO(), 5, 135, 3, { programBlockId: 'blk', programDayId: 'd1' }),
      session('back_squat', todayISO(), 5, 225, 3, { programBlockId: 'blk', programDayId: 'd2' }),
    ],
  })
  check('finishing the rotation leaves nothing next', nextDay(bothDone, b) === null)
  check('and the week reads complete', weekProgress(bothDone, b).done === 2)

  // An unlinked session must not advance the plan — that is the whole point of
  // the Unlink button.
  const unlinked = data({ programs: [b], workouts: [session('bench_press', todayISO(), 5, 135)] })
  check('a session logged outside the plan does not advance it', nextDay(unlinked, b)?.id === 'd1')

  // Last week's completions must not satisfy this week's rotation.
  const lastWeek = data({
    programs: [{ ...b, startDate: addDays(weekStart(todayISO()), -7) }],
    workouts: [
      session('bench_press', addDays(weekStart(todayISO()), -7), 5, 135, 3, { programBlockId: 'blk', programDayId: 'd1' }),
    ],
  })
  check(
    'a session from last week does not count toward this one',
    nextDay(lastWeek, lastWeek.programs[0])?.id === 'd1',
  )

  // A run day is satisfied by a run, not by a workout.
  const withRun = block({
    days: [
      { id: 'r1', name: 'Easy run', kind: 'run', run: { type: 'easy', minutes: 30 } },
      { id: 'd1', name: 'Day one', kind: 'lift', slots: [{ exerciseId: 'bench_press', sets: 3, repMin: 5, repMax: 8 }] },
    ],
  })
  const runDone = data({
    programs: [withRun],
    runs: [
      { id: 'r', date: todayISO(), distanceMi: 3, seconds: 1500, type: 'easy', programBlockId: 'blk', programDayId: 'r1' },
    ],
  })
  check('a logged run satisfies a run day', nextDay(runDone, withRun)?.id === 'd1')
}

console.log('\nadherence')
{
  const b = block()
  const rows = adherence(
    data({
      programs: [b],
      workouts: [session('bench_press', b.startDate, 5, 135, 3, { programBlockId: 'blk', programDayId: 'd1' })],
    }),
    b,
  )
  check('there is one row per block week', rows.length === 4)
  check('week 1 shows the one completed session', rows[0].done === 1 && rows[0].total === 2)
  check('later weeks show nothing done', rows[3].done === 0)
}

// ---------------------------------------------------------------------------
// Double progression — the arithmetic that decides what you lift
// ---------------------------------------------------------------------------
console.log('\ndouble progression')
{
  const b = block()
  const slot = { exerciseId: 'bench_press', sets: 3, repMin: 5, repMax: 8 }

  const fresh = prescribe(data({ programs: [b] }), b, slot, 1)
  check('with no history there is no load to prescribe', fresh.loadLb === null)
  check('and the target is the bottom of the range', fresh.targetReps === 5)
  check('and it says how to find a starting load', /work up to/i.test(fresh.reason))

  // Every set at the top of the range earns the step up.
  const earned = prescribe(
    data({ programs: [b], workouts: [session('bench_press', addDays(todayISO(), -3), 8, 135)] }),
    b,
    slot,
    1,
  )
  check('hitting the top of the range on every set adds load', earned.loadLb === 140, `got ${earned.loadLb}`)
  check('and drops back to the bottom of the range', earned.targetReps === 5)

  // One short set is enough to hold the load — this is the case that matters,
  // because judging on the best set would run the load away from you.
  const held = prescribe(
    data({ programs: [b], workouts: [session('bench_press', addDays(todayISO(), -3), [8, 8, 6], 135)] }),
    b,
    slot,
    1,
  )
  check('one set short of the range holds the load', held.loadLb === 135, `got ${held.loadLb}`)
  check('and asks for one more rep than the hardest set managed', held.targetReps === 7, `got ${held.targetReps}`)

  // Fewer sets than prescribed is also not a completed week.
  const tooFewSets = prescribe(
    data({ programs: [b], workouts: [session('bench_press', addDays(todayISO(), -3), 8, 135, 2)] }),
    b,
    slot,
    1,
  )
  check('missing a set holds the load too', tooFewSets.loadLb === 135)

  // Warm-ups must not be read as working sets.
  const withWarmups = {
    id: 'w',
    date: addDays(todayISO(), -3),
    exercises: [
      {
        exerciseId: 'bench_press',
        sets: [
          { reps: 10, weight: 95, warmup: true },
          { reps: 8, weight: 135 },
          { reps: 8, weight: 135 },
          { reps: 8, weight: 135 },
        ],
      },
    ],
  }
  const ignoringWarmups = prescribe(data({ programs: [b], workouts: [withWarmups] }), b, slot, 1)
  check('warm-ups are excluded from the decision', ignoringWarmups.loadLb === 140, `got ${ignoringWarmups.loadLb}`)

  // Isolation work steps in smaller jumps than compounds.
  const iso = prescribe(
    data({ programs: [b], workouts: [session('lateral_raise', addDays(todayISO(), -3), 15, 20)] }),
    b,
    { exerciseId: 'lateral_raise', sets: 3, repMin: 12, repMax: 15 },
    1,
  )
  check('isolation work moves in 2.5 lb steps', iso.loadLb === 22.5, `got ${iso.loadLb}`)

  // Only the most recent session counts.
  const twoSessions = prescribe(
    data({
      programs: [b],
      workouts: [
        session('bench_press', addDays(todayISO(), -10), 8, 185),
        session('bench_press', addDays(todayISO(), -3), 5, 135),
      ],
    }),
    b,
    slot,
    1,
  )
  check('the most recent session is the one progressed from', twoSessions.loadLb === 135, `got ${twoSessions.loadLb}`)

  // Deload.
  const deloaded = prescribe(
    data({ programs: [b], workouts: [session('bench_press', addDays(todayISO(), -3), 8, 200)] }),
    b,
    slot,
    4,
  )
  check('a deload cuts the load by 10%', deloaded.loadLb === 184.5, `got ${deloaded.loadLb}`)
  check('and cuts the sets to two thirds', deloaded.sets === 2, `got ${deloaded.sets}`)
  check('and explains itself as a deload', /deload/i.test(deloaded.reason))
}

// ---------------------------------------------------------------------------
// Seeding the log
// ---------------------------------------------------------------------------
console.log('\nstarting a planned session')
{
  const b = block()
  const d = data({ programs: [b], workouts: [session('bench_press', addDays(todayISO(), -3), 8, 135)] })
  const draft = draftFromDay(d, b, b.days[0], 1, id)

  check('the draft is stamped with the block', draft.programBlockId === 'blk')
  check('and with the session', draft.programDayId === 'd1')
  check('and is dated today', draft.date === todayISO())
  check('and is named after the session', draft.name === 'Day one')
  check('it has one exercise per slot', draft.exercises.length === 1)
  check('with the prescribed number of sets', draft.exercises[0].sets.length === 3)
  check('at the prescribed load', draft.exercises[0].sets.every((s) => s.weight === 140))
  check('and the prescribed reps', draft.exercises[0].sets.every((s) => s.reps === 5))
  check('every seeded set counts as a working set', workingSets(draft.exercises[0].sets).length === 3)

  const deloadDraft = draftFromDay(d, b, b.days[0], 4, id)
  check('a deload session seeds fewer sets', deloadDraft.exercises[0].sets.length === 2)
}

// ---------------------------------------------------------------------------
// The block drives the Today card, but never over the top of fatigue
// ---------------------------------------------------------------------------
console.log('\ntoday follows the plan')
{
  const b = block()
  const withPlan = data({ programs: [b] })
  const s = suggestToday(withPlan)
  check('the suggestion comes from the plan', s.plan?.blockId === 'blk')
  check('and names the session', s.title === 'Day one')
  check('and carries its prescriptions', s.plan.prescriptions.length === 1)
  check('and says where in the block you are', /Week 1 of 4/.test(s.detail))

  const noPlan = suggestToday(data())
  check('with no block the reactive suggestion is unchanged', noPlan.plan === undefined && noPlan.kind === 'lift')

  // Fatigue must outrank the plan.
  const fatigued = data({
    programs: [b],
    workouts: [-1, -2, -3, -4, -5, -6].map((o) => session('back_squat', addDays(todayISO(), o), 5, 225)),
  })
  const rest = suggestToday(fatigued)
  check('six straight training days still overrides the plan', rest.kind === 'rest' && !rest.plan)

  // Finishing the week's rotation reads as done, not as another session.
  const done = data({
    programs: [b],
    workouts: [
      session('bench_press', todayISO(), 5, 135, 3, { programBlockId: 'blk', programDayId: 'd1' }),
      session('back_squat', todayISO(), 5, 225, 3, { programBlockId: 'blk', programDayId: 'd2' }),
    ],
  })
  check("a finished rotation suggests rest", suggestToday(done).kind === 'rest')
  check('and says the week is complete', /complete/i.test(suggestToday(done).title))

  const deloadWeek = data({ programs: [{ ...b, startDate: addDays(weekStart(todayISO()), -21) }] })
  check('the deload week is flagged on the card', suggestToday(deloadWeek).plan?.deload === true)
}

console.log('\na finished block is surfaced')
{
  const stale = data({
    programs: [{ ...block(), startDate: addDays(weekStart(todayISO()), -70) }],
  })
  check(
    'the coach says the block has finished',
    generateRecommendations(stale).some((r) => r.id === 'block_finished'),
  )
  check(
    'and does not while one is still running',
    !generateRecommendations(data({ programs: [block()] })).some((r) => r.id === 'block_finished'),
  )
  check(
    'nor when there was never a block',
    !generateRecommendations(data()).some((r) => r.id === 'block_finished'),
  )
}

console.log('\nplanned volume and repeats')
{
  const b = block()
  const vol = plannedVolume(data(), b)
  // Bench: 3 sets chest primary. Squat: 3 sets quads + glutes primary.
  check('primary muscles get the full set count', vol.chest === 3 && vol.quads === 3)
  check('assisting muscles get half', vol.triceps === 1.5, `got ${vol.triceps}`)

  const again = repeatBlock(b, id, addDays(todayISO(), 7))
  check('a repeat gets a new id', again.id !== b.id)
  check('and new day ids, so old sessions do not satisfy it', again.days.every((d) => !['d1', 'd2'].includes(d.id)))
  check('and is not archived', !again.archived)
  check('and keeps the structure', again.days.length === b.days.length && again.weeks === b.weeks)
  check('and starts on a Monday', again.startDate === weekStart(again.startDate))

  // A repeat must read its loads from the log, not from the block it copied.
  const d = data({ programs: [again], workouts: [session('bench_press', addDays(todayISO(), -3), 8, 300)] })
  check(
    'prescriptions in a repeated block carry the loads forward',
    prescribeDay(d, again, again.days[0], 1)[0].loadLb === 305,
  )
}

// ---------------------------------------------------------------------------
// Queuing the next block. "Repeat after this one" must not take effect today.
// ---------------------------------------------------------------------------
console.log('\nqueuing the next block')
{
  const current = block()
  const next = repeatBlock(current, id, addDays(blockEndDate(current), 1))
  const both = data({ programs: [current, next] })

  check('the queued block starts the day after this one ends', next.startDate === addDays(blockEndDate(current), 1))
  check('and that is a Monday', next.startDate === weekStart(next.startDate))
  check('the current block is still the active one', activeBlock(both)?.id === current.id)
  check('the queued block is not active yet', blockWeek(next) === null)
  check('so today still follows the current block', suggestToday(both).plan?.blockId === current.id)

  // Once the current block runs out, the queued one takes over on its own.
  const later = addDays(next.startDate, 1)
  check('after the handover the queued block is active', activeBlock(both, later)?.id === next.id)
  check('and the old one has expired', blockWeek(current, later) === null)
  check('and the new one is in week 1', blockWeek(next, later) === 1)
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
