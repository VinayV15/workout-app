/**
 * Tests for the per-exercise and per-distance analysis. Run with `npm test`.
 *
 * The 1RM blend needs real assertions because three formulas are being stitched
 * together and the seams are where monotonicity breaks: if 11 reps ever scores lower
 * than 10, "more reps at the same weight is stronger" stops holding and every PR and
 * trend built on it goes wrong. The distance conversion needs them because it is the
 * one place the app turns a run into a number about a distance you did not run.
 */
import { e1rm, E1RM_MAX_REPS, RACE_DISTANCES, riegel } from '../src/lib/calc.ts'
import {
  distanceSeries,
  equivalentSeconds,
  isActualAt,
  summarise,
  volumeByPeriod,
} from '../src/lib/runDistance.ts'
import {
  metricsFor,
  sessionSeries,
  strengthSummary,
  strengthTotal,
  trackedExercises,
  trackedMuscles,
} from '../src/lib/strength.ts'
import { addDays, todayISO } from '../src/lib/calc.ts'

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

// ---------------------------------------------------------------------------
// Estimated 1RM
// ---------------------------------------------------------------------------
console.log('estimated 1RM')
{
  check('a single is the weight itself, not an estimate', e1rm(225, 1) === 225)
  check('zero weight gives zero', e1rm(0, 5) === 0)
  check('zero reps gives zero', e1rm(225, 0) === 0)

  // The seam check. Three formulas are blended with a fading weight, and a step
  // anywhere in that fade would make more reps score worse than fewer.
  let monotonic = true
  let prev = e1rm(100, 1)
  const breaks = []
  for (let r = 2; r <= E1RM_MAX_REPS; r++) {
    const v = e1rm(100, r)
    if (v <= prev) {
      monotonic = false
      breaks.push(`${r - 1}->${r}: ${prev.toFixed(2)} -> ${v.toFixed(2)}`)
    }
    prev = v
  }
  check('more reps at the same weight always estimates higher', monotonic, breaks.join(' '))

  let heavier = true
  for (let r = 1; r <= 20; r++) if (e1rm(200, r) <= e1rm(100, r)) heavier = false
  check('more weight at the same reps always estimates higher', heavier)

  // Sanity against the numbers lifters actually use.
  check('5 reps implies about 15% more than the bar weight', e1rm(100, 5) > 112 && e1rm(100, 5) < 120, String(e1rm(100, 5)))
  check('10 reps implies about 30% more', e1rm(100, 10) > 125 && e1rm(100, 10) < 137, String(e1rm(100, 10)))
  check('a 5x225 bench implies a 1RM in the 250s', e1rm(225, 5) > 250 && e1rm(225, 5) < 270, String(e1rm(225, 5)))

  // The specific defect the blend fixes: Epley capped at 12 made every set above 12
  // reps score identically, so a 15-rep trainee could not see strength improve.
  check('15 reps beats 12 reps', e1rm(100, 15) > e1rm(100, 12))
  check('20 reps beats 15 reps', e1rm(100, 20) > e1rm(100, 15))
  check(
    'and past 20 reps it stops, because that is endurance not strength',
    e1rm(100, 40) === e1rm(100, E1RM_MAX_REPS),
  )
  // Brzycki alone would claim 2.1x at 20 reps. The blend must stay sane.
  check('a 20-rep set does not claim an absurd max', e1rm(100, 20) < 160, String(e1rm(100, 20)))
}

// ---------------------------------------------------------------------------
// Distances
// ---------------------------------------------------------------------------
console.log('\ndistance list')
{
  check('the fitness-test distances are offered', ['1.5 mile', '2 mile', '3 mile'].every((n) => RACE_DISTANCES.some((d) => d.name === n)))
  check('the race distances are still there', ['1 mile', '5K', '10K', 'Marathon'].every((n) => RACE_DISTANCES.some((d) => d.name === n)))
  check('the list is sorted by distance', RACE_DISTANCES.every((d, i) => i === 0 || d.mi >= RACE_DISTANCES[i - 1].mi))
  check('no two entries share a distance', new Set(RACE_DISTANCES.map((d) => d.mi)).size === RACE_DISTANCES.length)
}

console.log('\npace scaling is exactly what was asked for')
{
  // The worked example from the request: 2 miles in 20 minutes is a 10:00 pace, so a
  // 10:00 mile and a 30:00 three-miler.
  const run = { id: 'r', date: todayISO(), distanceMi: 2, seconds: 1200, type: 'easy' }
  check('2 miles in 20:00 gives a 10:00 mile', equivalentSeconds(run, 1, 'pace') === 600)
  check('and 30:00 for three miles', equivalentSeconds(run, 3, 'pace') === 1800)
  check('and the same time back at its own distance', equivalentSeconds(run, 2, 'pace') === 1200)

  // Riegel must differ, and in the right direction: longer is relatively slower.
  check('Riegel predicts a faster mile than pace scaling', equivalentSeconds(run, 1, 'riegel') < 600)
  check('and a slower three miles', equivalentSeconds(run, 3, 'riegel') > 1800)
  check('Riegel agrees at the run’s own distance', Math.abs(equivalentSeconds(run, 2, 'riegel') - 1200) < 1)
  check('and matches the shared formula', equivalentSeconds(run, 5, 'riegel') === riegel(1200, 2, 5))

  check('a zero-distance run converts to nothing', equivalentSeconds({ ...run, distanceMi: 0 }, 1, 'pace') === null)
  check('a zero-time run converts to nothing', equivalentSeconds({ ...run, seconds: 0 }, 1, 'pace') === null)
  check('a zero target converts to nothing', equivalentSeconds(run, 0, 'pace') === null)
}

console.log('\nactual versus converted')
{
  const at5k = { id: 'a', date: todayISO(), distanceMi: 3.10686, seconds: 1400, type: 'race' }
  check('a run at the distance is marked actual', isActualAt(at5k, 3.10686))
  check('and within 4% still counts', isActualAt({ ...at5k, distanceMi: 3.2 }, 3.10686))
  check('but 20% off does not', !isActualAt({ ...at5k, distanceMi: 3.8 }, 3.10686))
}

console.log('\ndistance series')
{
  const runs = [
    { id: '1', date: addDays(todayISO(), -30), distanceMi: 2, seconds: 1200, type: 'easy' },
    { id: '2', date: addDays(todayISO(), -20), distanceMi: 3.10686, seconds: 1500, type: 'race' },
    { id: '3', date: addDays(todayISO(), -10), distanceMi: 5, seconds: 2700, type: 'long' },
    { id: '4', date: todayISO(), distanceMi: 1, seconds: 540, type: 'tempo' },
  ]
  const s = distanceSeries(runs, 3.10686, 'pace')
  check('every run contributes a point, whatever its distance', s.length === 4)
  check('points are oldest first', s.every((p, i) => i === 0 || p.date >= s[i - 1].date))
  check('the run actually at 5K is flagged', s.filter((p) => p.actual).length === 1)
  check('pace is carried through per mile', Math.abs(s[0].paceSecPerMi - 600) < 0.01)
  check('every point keeps its source run', s.every((p) => !!p.run.id))

  const sum = summarise(s)
  check('the best is the fastest equivalent', sum.best.seconds === Math.min(...s.map((p) => p.seconds)))
  check('the best actual is the real 5K', sum.bestActual.run.id === '2')
  check('the latest is the most recent', sum.latest.run.id === '4')
  check('the count of real efforts is reported', sum.actualCount === 1 && sum.total === 4)
  // The 9:00 mile at the end is the fastest pace, so the change should be negative.
  check('getting faster shows as a negative change', sum.changeSec < 0, String(sum.changeSec))

  const empty = summarise([])
  check('an empty series summarises safely', empty.best === null && empty.total === 0 && empty.changeSec === null)
  const single = summarise(distanceSeries([runs[0]], 1, 'pace'))
  check('a single point has no change to report', single.changeSec === null)
}

console.log('\nvolume includes time spent')
{
  const runs = [
    { id: '1', date: '2026-07-06', distanceMi: 3, seconds: 1800, type: 'easy' },
    { id: '2', date: '2026-07-08', distanceMi: 5, seconds: 3000, type: 'long' },
    { id: '3', date: '2026-07-15', distanceMi: 4, seconds: 2400, type: 'easy' },
  ]
  const weekly = volumeByPeriod(runs, (iso) => (iso < '2026-07-13' ? '2026-07-06' : '2026-07-13'))
  check('runs group into periods', weekly.length === 2)
  check('distance sums per period', weekly[0].miles === 8 && weekly[1].miles === 4)
  check('time spent sums per period', weekly[0].seconds === 4800 && weekly[1].seconds === 2400)
  check('run counts are kept', weekly[0].runs === 2 && weekly[1].runs === 1)
  check('periods come out in order', weekly[0].period < weekly[1].period)
}

// ---------------------------------------------------------------------------
// Lift scopes
// ---------------------------------------------------------------------------
console.log('\nlift scopes and metrics')
{
  const data = {
    version: 1,
    profile: { sex: 'male', units: 'imperial', activity: 'light', heightIn: 70 },
    goals: { primary: 'muscle_gain', liftDaysPerWeek: 4, runDaysPerWeek: 2, focusMuscles: [] },
    body: [{ id: 'b', date: addDays(todayISO(), -60), weightLb: 180 }],
    workouts: [
      {
        id: 'w1',
        date: addDays(todayISO(), -20),
        exercises: [
          { exerciseId: 'bench_press', sets: [{ reps: 5, weight: 185 }, { reps: 5, weight: 185 }] },
          { exerciseId: 'cable_fly', sets: [{ reps: 12, weight: 40 }] },
        ],
      },
      {
        id: 'w2',
        date: todayISO(),
        exercises: [
          {
            exerciseId: 'bench_press',
            sets: [{ reps: 10, weight: 95, warmup: true }, { reps: 5, weight: 205 }, { reps: 5, weight: 205 }],
          },
          { exerciseId: 'back_squat', sets: [{ reps: 5, weight: 275 }] },
        ],
      },
    ],
    runs: [],
    customExercises: [],
    templates: [],
    programs: [],
    dismissed: {},
    sync: { rev: {}, deleted: {} },
  }

  const bench = sessionSeries(data, { kind: 'exercise', id: 'bench_press' })
  check('one point per session for an exercise', bench.length === 2)
  check('points are oldest first', bench[0].date < bench[1].date)
  check('warm-ups are excluded from the set count', bench[1].sets === 2)
  check('reps count only working sets', bench[1].reps === 10)
  check('the heaviest set is the real load', bench[1].heaviest === 205)
  check('volume is sets x reps x load', bench[1].volume === 205 * 5 * 2)
  check('the 1RM estimate rises with the load', bench[1].e1rm > bench[0].e1rm)
  check('and reports the set it came from', bench[1].topSet === '5 × 205')

  // The label and the number have to be the same set. Picking the highest-VOLUME set
  // instead labelled a bench estimate "from 8 × 190" when it came from 5 × 210 — the
  // heavier low-rep set gives the higher estimate, the lighter long set moves more
  // total weight.
  const mixed = {
    ...data,
    workouts: [
      {
        id: 'm',
        date: todayISO(),
        exercises: [
          { exerciseId: 'bench_press', sets: [{ reps: 8, weight: 190 }, { reps: 5, weight: 210 }] },
        ],
      },
    ],
  }
  const mixedPoint = sessionSeries(mixed, { kind: 'exercise', id: 'bench_press' })[0]
  check(
    'the quoted set is the one with the best estimate, not the most volume',
    mixedPoint.topSet === '5 × 210',
    mixedPoint.topSet,
  )
  check(
    'and it matches the estimate reported',
    Math.abs(mixedPoint.e1rm - e1rm(210, 5)) < 0.01,
    `${mixedPoint.e1rm} vs ${e1rm(210, 5)}`,
  )

  // A muscle scope aggregates across every exercise that trains it.
  const chest = sessionSeries(data, { kind: 'muscle', muscle: 'chest' })
  check('a muscle scope covers several exercises', chest[0].sets === 3, `${chest[0].sets} sets`)
  check('and sums their volume', chest[0].volume === 185 * 5 * 2 + 40 * 12)

  check('quads pick up the squat', sessionSeries(data, { kind: 'muscle', muscle: 'quads' }).length === 1)
  check('an untrained muscle has no series', sessionSeries(data, { kind: 'muscle', muscle: 'calves' }).length === 0)
  check('an unlogged exercise has no series', sessionSeries(data, { kind: 'exercise', id: 'deadlift' }).length === 0)

  // A 1RM cannot be summed across movements, so it must not be offered for a muscle.
  check('exercise scope offers a 1RM', metricsFor('exercise').some((m) => m.key === 'e1rm'))
  check('muscle scope does NOT offer a 1RM', !metricsFor('muscle').some((m) => m.key === 'e1rm'))
  check('nor a heaviest set', !metricsFor('muscle').some((m) => m.key === 'heaviest'))
  check('but volume, reps and sets are offered for both', ['volume', 'reps', 'sets'].every((k) =>
    metricsFor('muscle').some((m) => m.key === k) && metricsFor('exercise').some((m) => m.key === k),
  ))

  check('tracked exercises are ordered by use', trackedExercises(data)[0] === 'bench_press')
  check('tracked muscles include the ones trained', trackedMuscles(data).includes('chest') && trackedMuscles(data).includes('quads'))
  check('and exclude the ones not trained', !trackedMuscles(data).includes('calves'))

  const summary = strengthSummary(data, data.workouts)
  check('the summary has a row per lift with history', summary.length >= 3)
  check('rows are ordered heaviest first', summary.every((r, i) => i === 0 || r.currentLb <= summary[i - 1].currentLb))
  const benchRow = summary.find((r) => r.exerciseId === 'bench_press')
  check('a lift that improved shows a positive change', benchRow.changeLb > 0, String(benchRow.changeLb))
  check('and reports the set behind the estimate', benchRow.topSet === '5 × 205')
  const squatRow = summary.find((r) => r.exerciseId === 'back_squat')
  check('a lift with one session has no change to report', squatRow.changeLb === null)

  const total = strengthTotal(summary)
  check('the total counts only the benchmark lifts', total.lifts === 2, `${total.lifts} lifts`)
  check('and sums their estimates', Math.abs(total.totalLb - (benchRow.currentLb + squatRow.currentLb)) < 0.01)

  // Scoping to a range must change the answer, or the picker does nothing here.
  const older = strengthSummary(data, [data.workouts[0]])
  check('a narrower range uses only the sessions inside it', older.find((r) => r.exerciseId === 'bench_press').currentLb < benchRow.currentLb)
  check('and drops lifts with nothing in range', !older.some((r) => r.exerciseId === 'back_squat'))
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
