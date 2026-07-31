/**
 * Tests for the coaching math. No test framework — run with:
 *   npm test
 *
 * These lock down the cases where a wrong answer is worse than no answer: advice
 * that arrives a day too late to act on, and totals that disagree with the same
 * total shown one screen over.
 */
import {
  addDays,
  consecutiveTrainingDays,
  csvCell,
  currentStreak,
  dispElevation,
  exercisePR,
  storeElevation,
  todayISO,
} from '../src/lib/calc.ts'
import { generateRecommendations, suggestToday, weeklyScore } from '../src/lib/recommend.ts'

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

const day = (n) => addDays(todayISO(), n)

const data = (over = {}) => ({
  version: 1,
  profile: { sex: 'male', units: 'imperial', activity: 'light', heightIn: 70, birthDate: '1990-01-01' },
  goals: { primary: 'fat_loss', liftDaysPerWeek: 4, runDaysPerWeek: 3, focusMuscles: [] },
  workouts: [],
  runs: [],
  body: [],
  customExercises: [],
  templates: [],
  dismissed: {},
  sync: { rev: {}, deleted: {} },
  ...over,
})

/** A session on `offset` days from today, with `sets` working sets of squats. */
const lift = (offset, sets = 3) => ({
  id: `w${offset}`,
  date: day(offset),
  exercises: [{ exerciseId: 'back_squat', sets: Array.from({ length: sets }, () => ({ reps: 5, weight: 225 })) }],
})

// ---------------------------------------------------------------------------
// Fatigue: the run of training days has to be visible BEFORE today's session,
// because "take a rest day" is only actionable while the day is still free.
// ---------------------------------------------------------------------------
console.log('consecutive training days')
{
  const endingYesterday = data({ workouts: [-1, -2, -3, -4, -5, -6, -7].map((n) => lift(n)) })
  check(
    'a run of days ending yesterday is counted, with nothing logged today',
    consecutiveTrainingDays(endingYesterday) === 7,
    `got ${consecutiveTrainingDays(endingYesterday)}`,
  )
  check('the streak agrees with it', currentStreak(endingYesterday) === 7)

  const throughToday = data({ workouts: [0, -1, -2, -3, -4, -5, -6].map((n) => lift(n)) })
  check('logging today extends it rather than restarting it', consecutiveTrainingDays(throughToday) === 7)

  const restedYesterday = data({ workouts: [-2, -3, -4, -5, -6, -7, -8].map((n) => lift(n)) })
  check('a full rest day resets it to zero', consecutiveTrainingDays(restedYesterday) === 0)

  check('an empty log is zero', consecutiveTrainingDays(data()) === 0)
}

console.log('\nrest-day advice reaches you in time')
{
  const sixDays = data({ workouts: [-1, -2, -3, -4, -5, -6].map((n) => lift(n)) })
  check("today's suggestion is rest after six straight days", suggestToday(sixDays).kind === 'rest')

  const sevenDays = data({ workouts: [-1, -2, -3, -4, -5, -6, -7].map((n) => lift(n)) })
  check(
    'the coach flags the missing rest day',
    generateRecommendations(sevenDays).some((r) => r.id === 'need_rest_day'),
  )

  const rested = data({ workouts: [-2, -3, -4, -5, -6, -7, -8].map((n) => lift(n)) })
  check(
    'and does not flag it once a rest day has been taken',
    !generateRecommendations(rested).some((r) => r.id === 'need_rest_day'),
  )
}

// ---------------------------------------------------------------------------
// Bodyweight load: a weighted pull-up moves your body plus the plate. Counting
// only the plate made the dashboard disagree with the Lift tab's own total.
// ---------------------------------------------------------------------------
console.log('\nbodyweight movements carry your bodyweight')
{
  const withPullups = data({
    body: [{ id: 'b1', date: day(-30), weightLb: 180 }],
    workouts: [
      {
        id: 'w1',
        date: todayISO(),
        exercises: [
          { exerciseId: 'pullup', sets: [{ reps: 5, weight: 25 }, { reps: 5, weight: 25 }, { reps: 5, weight: 25 }] },
        ],
      },
    ],
  })
  // (180 + 25) x 5 x 3 = 3,075 lb, not 25 x 5 x 3 = 375.
  const tonnage = weeklyScore(withPullups).find((s) => s.label === 'Tonnage')
  check('weekly tonnage counts bodyweight plus the added load', tonnage.value === '3.1k', `got ${tonnage.value}`)

  const pr = exercisePR('pullup', withPullups)
  check('the heaviest set is the total load', pr.heaviest === 205, `got ${pr.heaviest}`)
  check('the heaviest set keeps its rep count', pr.heaviestReps === 5)
  check('and the estimated 1RM is built on the same load', pr.bestE1rm > 205)

  const barbell = data({
    body: [{ id: 'b1', date: day(-30), weightLb: 180 }],
    workouts: [lift(0, 3)],
  })
  // A barbell lift must NOT pick up bodyweight: 225 x 5 x 3 = 3,375.
  const barTonnage = weeklyScore(barbell).find((s) => s.label === 'Tonnage')
  check('a barbell lift is unaffected by bodyweight', barTonnage.value === '3.4k', `got ${barTonnage.value}`)
  check('and its heaviest set is the bar load', exercisePR('back_squat', barbell).heaviest === 225)
}

// ---------------------------------------------------------------------------
// Units: elevation is stored imperial like every other length, so a metric
// entry has to convert rather than being relabelled.
// ---------------------------------------------------------------------------
console.log('\nelevation units')
{
  const stored = storeElevation(100, 'metric')
  check('100 m stores as about 328 ft', Math.abs(stored - 328.084) < 0.01, `got ${stored}`)
  check('metric survives a round trip', Math.abs(dispElevation(stored, 'metric') - 100) < 1e-9)
  check('imperial is stored as entered', storeElevation(500, 'imperial') === 500)
  check('and displayed as entered', dispElevation(500, 'imperial') === 500)
}

// ---------------------------------------------------------------------------
// CSV: a note is free text, and free text is where separators come from.
// ---------------------------------------------------------------------------
console.log('\ncsv escaping')
{
  check('a plain value is left alone', csvCell('easy') === 'easy')
  check('a comma is quoted', csvCell('hot, felt heavy') === '"hot, felt heavy"')
  check('a quote is doubled and wrapped', csvCell('felt "off"') === '"felt ""off"""')
  check('a newline is quoted', csvCell('line one\nline two') === '"line one\nline two"')
  check('a carriage return is quoted', csvCell('a\rb') === '"a\rb"')
  check('an empty value stays empty', csvCell('') === '')
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
