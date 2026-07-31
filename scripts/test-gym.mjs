/**
 * Tests for the gym-floor helpers. No test framework — run with:
 *   npm test
 *
 * Plate math and PR detection are the two that must be exactly right: a wrong
 * plate breakdown gets loaded onto a bar, and a PR that fires on every session is
 * worse than none at all.
 */
import {
  DEFAULT_BAR_LB,
  DEFAULT_REST_COMPOUND_SEC,
  DEFAULT_REST_ISOLATION_SEC,
  DEFAULT_REST_SEC,
  detectPRs,
  formatPlates,
  isBarLoaded,
  plateSetFor,
  platesFor,
  repeatLastSession,
  restSecondsFor,
  roundToLoadable,
  smallestIncrementLb,
  warmupRamp,
} from '../src/lib/gym.ts'
import { EXERCISES } from '../src/lib/exercises.ts'
import { addDays, todayISO, workingSets } from '../src/lib/calc.ts'

let passed = 0
let failed = 0

function check(name, pass, detail = '') {
  if (pass) {
    passed++
    console.log(`  ok   ${name}`)
  } else {
    failed++
    console.error(`  FAIL ${name}${detail ? ` :: ${detail}` : ''}`)
  }
}

const ex = (id) => EXERCISES.find((e) => e.id === id)
const LB = plateSetFor('imperial')

const data = (over = {}) => ({
  version: 1,
  profile: { sex: 'male', units: 'imperial', activity: 'light', heightIn: 70 },
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

const session = (id, exerciseId, date, sets) => ({
  id,
  date,
  exercises: [{ exerciseId, sets }],
})

// ---------------------------------------------------------------------------
// Rest between sets
// ---------------------------------------------------------------------------
console.log('rest timer')
{
  check('off means no timer at all', restSecondsFor({ restMode: 'off' }, ex('back_squat')) === null)
  check(
    'the default is a single uniform duration',
    restSecondsFor({}, ex('back_squat')) === DEFAULT_REST_SEC,
    `got ${restSecondsFor({}, ex('back_squat'))}`,
  )
  check('a uniform duration is used as set', restSecondsFor({ restMode: 'uniform', restSec: 120 }, ex('back_squat')) === 120)
  check(
    'a uniform duration of zero is the same as off',
    restSecondsFor({ restMode: 'uniform', restSec: 0 }, ex('back_squat')) === null,
  )

  const byPattern = { restMode: 'byPattern', restCompoundSec: 200, restIsolationSec: 45 }
  check('a squat gets the compound duration', restSecondsFor(byPattern, ex('back_squat')) === 200)
  check('a bench gets the compound duration', restSecondsFor(byPattern, ex('bench_press')) === 200)
  check('a deadlift gets the compound duration', restSecondsFor(byPattern, ex('deadlift')) === 200)
  check('a lateral raise gets the isolation duration', restSecondsFor(byPattern, ex('lateral_raise')) === 45)
  check('a curl gets the isolation duration', restSecondsFor(byPattern, ex('barbell_curl')) === 45)
  check('core work gets the isolation duration', restSecondsFor(byPattern, ex('plank')) === 45)
  check(
    'by-pattern falls back to sensible defaults',
    restSecondsFor({ restMode: 'byPattern' }, ex('back_squat')) === DEFAULT_REST_COMPOUND_SEC &&
      restSecondsFor({ restMode: 'byPattern' }, ex('db_curl')) === DEFAULT_REST_ISOLATION_SEC,
  )
  check(
    'zeroing one side of by-pattern switches it off just for that side',
    restSecondsFor({ restMode: 'byPattern', restIsolationSec: 0 }, ex('db_curl')) === null &&
      restSecondsFor({ restMode: 'byPattern', restIsolationSec: 0 }, ex('back_squat')) !== null,
  )
  check('an unknown exercise is treated as a compound', restSecondsFor({ restMode: 'byPattern' }, undefined) === DEFAULT_REST_COMPOUND_SEC)
}

// ---------------------------------------------------------------------------
// Plates. Total load in, per-side breakdown out.
// ---------------------------------------------------------------------------
console.log('\nplate calculator')
{
  const b225 = platesFor(225, 45, LB, 'imperial')
  check('225 on a 45 bar is two 45s a side', JSON.stringify(b225.perSide) === '[45,45]', JSON.stringify(b225.perSide))
  check('and nothing left over', b225.leftover === 0)

  const b135 = platesFor(135, 45, LB, 'imperial')
  check('135 is one 45 a side', JSON.stringify(b135.perSide) === '[45]')

  const bBar = platesFor(45, 45, LB, 'imperial')
  check('the bar alone needs no plates', bBar.perSide.length === 0 && !bBar.belowBar)
  check('and reads as an empty bar', formatPlates(bBar.perSide) === 'empty bar')

  const b95 = platesFor(95, 45, LB, 'imperial')
  check('95 is a 25 a side', JSON.stringify(b95.perSide) === '[25]')

  const b100 = platesFor(100, 45, LB, 'imperial')
  check('100 is 25 + 2.5 a side', JSON.stringify(b100.perSide) === '[25,2.5]', JSON.stringify(b100.perSide))

  const b315 = platesFor(315, 45, LB, 'imperial')
  check('315 is three 45s a side', JSON.stringify(b315.perSide) === '[45,45,45]')
  check('and formats with a count', formatPlates(b315.perSide) === '3×45', formatPlates(b315.perSide))

  // With a 2.5 lb plate available, any total 5 lb above the bar is makeable — so
  // an unmakeable one has to fall between those steps.
  const b230 = platesFor(230, 45, LB, 'imperial')
  check('230 is makeable exactly', b230.leftover === 0 && JSON.stringify(b230.perSide) === '[45,45,2.5]', JSON.stringify(b230.perSide))

  const odd = platesFor(227.5, 45, LB, 'imperial')
  check('a total between plate steps reports the shortfall', odd.leftover > 0, `leftover ${odd.leftover}`)
  check('and the shortfall is a whole-bar figure', Math.abs(odd.leftover - 2.5) < 0.01, `got ${odd.leftover}`)

  const below = platesFor(30, 45, LB, 'imperial')
  check('a target under the bar says so', below.belowBar === true)

  // Every plate breakdown must actually add up to what was asked for.
  let sumsMatch = true
  for (let total = 45; total <= 500; total += 2.5) {
    const b = platesFor(total, 45, LB, 'imperial')
    const actual = 45 + b.perSide.reduce((a, p) => a + p, 0) * 2
    if (Math.abs(actual + b.leftover - total) > 0.02) sumsMatch = false
  }
  check('bar + plates + shortfall always equals the target', sumsMatch)

  // A women's bar changes the answer.
  const w135 = platesFor(135, 35, LB, 'imperial')
  check('a 35 lb bar shifts the breakdown', JSON.stringify(w135.perSide) === '[45,5]', JSON.stringify(w135.perSide))

  check('a barbell lift is bar-loaded', isBarLoaded(ex('back_squat')) === true)
  check('a dumbbell lift is not', isBarLoaded(ex('db_curl')) === false)
  check('a pull-up is not', isBarLoaded(ex('pullup')) === false)
  check('a machine is not', isBarLoaded(ex('leg_press')) === false)

  check('the smallest lb step is 5 lb on the bar', smallestIncrementLb(LB) === 5)
  check('rounding snaps to a loadable total', roundToLoadable(228, 45, LB) === 230)
  check('and never goes below the bar', roundToLoadable(10, 45, LB) === 45)
}

console.log('\nmetric plates')
{
  const KG = plateSetFor('metric')
  // A 20 kg bar plus 20 kg a side = 60 kg total. Everything is stored in pounds.
  const bar20kg = 20 * 2.2046226218
  const b = platesFor(bar20kg + 20 * 2.2046226218 * 2, bar20kg, KG, 'metric')
  check('a 20 kg bar with 20 kg a side reads as 20', Math.abs(b.perSide[0] - 20) < 0.01, JSON.stringify(b.perSide))
  check('and the bar reads as 20 kg', Math.abs(b.bar - 20) < 0.01)
  check('with nothing left over', b.leftover < 0.01)
}

// ---------------------------------------------------------------------------
// Warm-up ramp
// ---------------------------------------------------------------------------
console.log('\nwarm-up ramp')
{
  const ramp = warmupRamp(225, 45, LB, true)
  check('there are three steps to a heavy top set', ramp.length === 3, `got ${ramp.length}`)
  check('every step is flagged as a warm-up', ramp.every((s) => s.warmup === true))
  check('loads climb', ramp.every((s, i) => i === 0 || s.weight > ramp[i - 1].weight))
  check('reps fall as load climbs', ramp.every((s, i) => i === 0 || s.reps <= ramp[i - 1].reps))
  check('nothing reaches the working load', ramp.every((s) => s.weight < 225))
  check('every load is loadable on the bar', ramp.every((s) => (s.weight - 45) % 5 === 0), JSON.stringify(ramp.map((s) => s.weight)))
  check('warm-ups do not count as working sets', workingSets(ramp).length === 0)

  // A light top set cannot support three distinct steps, and must not invent them.
  const light = warmupRamp(65, 45, LB, true)
  check('a light top set produces fewer, distinct steps', new Set(light.map((s) => s.weight)).size === light.length)
  check('and still never reaches the working load', light.every((s) => s.weight < 65))

  check('the bar itself needs no ramp', warmupRamp(45, 45, LB, true).length === 0)
  check('a zero top set produces nothing', warmupRamp(0, 45, LB, true).length === 0)

  // Dumbbells are not bar-loaded, so loads are not snapped to plate maths.
  const db = warmupRamp(100, 45, LB, false)
  check('unloadable equipment ramps on raw percentages', db.length === 3 && db[0].weight === 40, JSON.stringify(db.map((s) => s.weight)))
}

// ---------------------------------------------------------------------------
// Personal records
// ---------------------------------------------------------------------------
console.log('\npersonal records')
{
  const older = session('w1', 'bench_press', addDays(todayISO(), -14), [{ reps: 5, weight: 185 }])
  const heavier = session('w2', 'bench_press', todayISO(), [{ reps: 5, weight: 205 }])

  const hits = detectPRs(heavier, data({ workouts: [older] }))
  check('a heavier set is a record', hits.length === 1 && hits[0].kinds.includes('weight'))
  check('and reports what it beat', hits[0].previousHeaviestLb === 185)
  check('and the estimated 1RM improves too', hits[0].kinds.includes('e1rm'))

  // More reps at the same load is an e1RM record but not a weight record.
  const moreReps = session('w3', 'bench_press', todayISO(), [{ reps: 8, weight: 185 }])
  const repHits = detectPRs(moreReps, data({ workouts: [older] }))
  check('more reps at the same load is an e1RM record', repHits[0].kinds.includes('e1rm'))
  check('but not a heaviest-set record', !repHits[0].kinds.includes('weight'))

  // Repeating a session exactly is not a record.
  const same = session('w4', 'bench_press', todayISO(), [{ reps: 5, weight: 185 }])
  check('matching your best is not a record', detectPRs(same, data({ workouts: [older] })).length === 0)

  const lighter = session('w5', 'bench_press', todayISO(), [{ reps: 3, weight: 175 }])
  check('a worse session is not a record', detectPRs(lighter, data({ workouts: [older] })).length === 0)

  // The very first session has nothing to beat.
  check('a first-ever session is not a record', detectPRs(heavier, data()).length === 0)

  // Re-saving an edited PR session must not report it beating itself.
  check(
    'a session does not beat itself',
    detectPRs(heavier, data({ workouts: [older, heavier] })).length === 1,
  )
  const onlyItself = detectPRs(older, data({ workouts: [older] }))
  check('and with no other history there is no record', onlyItself.length === 0)

  // Warm-ups must not set records.
  const withWarmup = session('w6', 'bench_press', todayISO(), [
    { reps: 1, weight: 400, warmup: true },
    { reps: 5, weight: 150 },
  ])
  check('a warm-up cannot set a record', detectPRs(withWarmup, data({ workouts: [older] })).length === 0)

  // Bodyweight movements count the body.
  const bodyData = data({
    body: [{ id: 'b', date: addDays(todayISO(), -30), weightLb: 180 }],
    workouts: [session('p1', 'pullup', addDays(todayISO(), -14), [{ reps: 5, weight: 0 }])],
  })
  const weighted = session('p2', 'pullup', todayISO(), [{ reps: 5, weight: 25 }])
  const pullHits = detectPRs(weighted, bodyData)
  check('a weighted pull-up beats an unweighted one', pullHits.length === 1)
  check('and the record includes bodyweight', pullHits[0].heaviestLb === 205, `got ${pullHits[0].heaviestLb}`)

  // Time-based work has no load, so no record.
  const plank = session('t1', 'plank', todayISO(), [{ reps: 1, weight: 0, seconds: 120 }])
  check(
    'time-based work does not produce a load record',
    detectPRs(plank, data({ workouts: [session('t0', 'plank', addDays(todayISO(), -7), [{ reps: 1, weight: 0, seconds: 60 }])] }))
      .length === 0,
  )

  // Several records in one session are ranked heaviest first.
  const multi = {
    id: 'w7',
    date: todayISO(),
    exercises: [
      { exerciseId: 'db_curl', sets: [{ reps: 10, weight: 40 }] },
      { exerciseId: 'back_squat', sets: [{ reps: 5, weight: 315 }] },
    ],
  }
  const multiHits = detectPRs(
    multi,
    data({
      workouts: [
        session('h1', 'db_curl', addDays(todayISO(), -7), [{ reps: 10, weight: 35 }]),
        session('h2', 'back_squat', addDays(todayISO(), -7), [{ reps: 5, weight: 275 }]),
      ],
    }),
  )
  check('two records in one session are both found', multiHits.length === 2)
  check('and the heaviest leads', multiHits[0].exerciseId === 'back_squat')
}

// ---------------------------------------------------------------------------
// Repeating a session
// ---------------------------------------------------------------------------
console.log('\nrepeat last session')
{
  check('with no history there is nothing to repeat', repeatLastSession(data(), todayISO(), () => 'x') === null)

  const older = session('w1', 'bench_press', addDays(todayISO(), -10), [{ reps: 5, weight: 185 }])
  const recent = {
    ...session('w2', 'back_squat', addDays(todayISO(), -3), [
      { reps: 10, weight: 95, warmup: true },
      { reps: 5, weight: 225 },
      { reps: 5, weight: 225 },
    ]),
    name: 'Lower A',
    programBlockId: 'blk',
    programDayId: 'd1',
  }
  const repeated = repeatLastSession(data({ workouts: [older, recent] }), todayISO(), () => 'new')

  check('the most recent session is the one repeated', repeated.exercises[0].exerciseId === 'back_squat')
  check('it gets a fresh id', repeated.id === 'new')
  check('and today’s date', repeated.date === todayISO())
  check('the name comes across', repeated.name === 'Lower A')
  check('the loads come across', repeated.exercises[0].sets[1].weight === 225)
  check('warm-ups come across', repeated.exercises[0].sets[0].warmup === true)
  check('working sets are preserved', workingSets(repeated.exercises[0].sets).length === 2)
  // Repeating by hand is not completing the block's next prescribed session.
  check('the plan link does not come across', !repeated.programBlockId && !repeated.programDayId)
  // Deep copy, so editing the repeat cannot rewrite history.
  repeated.exercises[0].sets[1].weight = 999
  check('the sets are copied, not shared', recent.exercises[0].sets[1].weight === 225)
}

console.log('\ndefaults are sane')
{
  check('the default bar is an Olympic bar', DEFAULT_BAR_LB === 45)
  check('the default rest is a minute and a half', DEFAULT_REST_SEC === 90)
  check('compounds rest longer than isolation', DEFAULT_REST_COMPOUND_SEC > DEFAULT_REST_ISOLATION_SEC)
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
