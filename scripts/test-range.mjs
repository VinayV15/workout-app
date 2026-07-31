/**
 * Tests for the date-range presets. No test framework — run with:
 *   npm test
 *
 * Date arithmetic is where off-by-one errors live, and every one of them is
 * invisible in the UI: a chart quietly missing today's session, or a "30 days" window
 * that is really 29, looks perfectly normal. So the boundaries are asserted
 * explicitly, including the month-length and leap-year cases.
 */
import {
  CALENDAR_PRESETS,
  DEFAULT_RANGE,
  PRESET_LABEL,
  ROLLING_PRESETS,
  bucketFor,
  bucketStart,
  rangeKeys,
  resolveRange,
  withinRange,
} from '../src/lib/dateRange.ts'
import { addDays, daysBetween } from '../src/lib/calc.ts'
import { rateOverRange, leanRateOverRange, pctPerWeekOverRange } from '../src/lib/trends.ts'

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

const TODAY = '2026-07-31'

console.log('rolling windows')
{
  for (const [preset, days] of [['week', 7], ['month', 30], ['quarter', 90], ['year', 365]]) {
    const r = resolveRange({ preset }, TODAY)
    check(`${preset} spans exactly ${days} days`, r.days === days, `got ${r.days}`)
    check(`  and ends today`, r.to === TODAY)
    // Inclusive of both ends, which is the off-by-one that silently drops a session.
    check(`  with an inclusive start`, daysBetween(r.from, r.to) + 1 === days, `${r.from}..${r.to}`)
  }
  check('the default is the quarter', DEFAULT_RANGE.preset === 'quarter')
  check('a week includes today', withinRange([{ date: TODAY }], resolveRange({ preset: 'week' }, TODAY)).length === 1)
  check(
    'and includes the oldest day in the window',
    withinRange([{ date: addDays(TODAY, -6) }], resolveRange({ preset: 'week' }, TODAY)).length === 1,
  )
  check(
    'but not the day before it',
    withinRange([{ date: addDays(TODAY, -7) }], resolveRange({ preset: 'week' }, TODAY)).length === 0,
  )
  check(
    'nor a future date',
    withinRange([{ date: addDays(TODAY, 1) }], resolveRange({ preset: 'week' }, TODAY)).length === 0,
  )
}

console.log('\ncalendar periods')
{
  const tm = resolveRange({ preset: 'thisMonth' }, TODAY)
  check('this month starts on the 1st', tm.from === '2026-07-01')
  check('and runs to today, not to month end', tm.to === TODAY)

  const lm = resolveRange({ preset: 'lastMonth' }, TODAY)
  check('last month is the whole month', lm.from === '2026-06-01' && lm.to === '2026-06-30', `${lm.from}..${lm.to}`)
  check('and knows June has 30 days', lm.days === 30)

  // Month lengths and leap years are exactly where hand-rolled date maths breaks.
  const jan = resolveRange({ preset: 'lastMonth' }, '2026-02-14')
  check('January is 31 days', jan.from === '2026-01-01' && jan.to === '2026-01-31' && jan.days === 31)
  const mar = resolveRange({ preset: 'lastMonth' }, '2027-03-05')
  check('February 2027 is 28 days', mar.to === '2027-02-28' && mar.days === 28, `${mar.to}/${mar.days}`)
  const leap = resolveRange({ preset: 'lastMonth' }, '2028-03-05')
  check('February 2028 is 29 days', leap.to === '2028-02-29' && leap.days === 29, `${leap.to}/${leap.days}`)
  const dec = resolveRange({ preset: 'lastMonth' }, '2026-01-10')
  check('last month crosses the year boundary', dec.from === '2025-12-01' && dec.to === '2025-12-31')

  const ty = resolveRange({ preset: 'thisYear' }, TODAY)
  check('this year starts on 1 January', ty.from === '2026-01-01' && ty.to === TODAY)
  check('and is labelled with the year', ty.label === '2026')

  const jan1 = resolveRange({ preset: 'thisMonth' }, '2026-01-01')
  check('on the 1st, this month is a single day', jan1.days === 1 && jan1.from === jan1.to)
}

console.log('\nall time and custom')
{
  const all = resolveRange({ preset: 'all' }, TODAY)
  check('all time has no start', all.from === null)
  check('and no day count', all.days === null)
  check('and keeps everything, however old', withinRange([{ date: '1999-01-01' }], all).length === 1)
  check('but still excludes the future', withinRange([{ date: '2030-01-01' }], all).length === 0)

  const c = resolveRange({ preset: 'custom', from: '2026-03-01', to: '2026-03-31' }, TODAY)
  check('a custom range is used as given', c.from === '2026-03-01' && c.to === '2026-03-31' && c.days === 31)

  // Reversed dates are a slip while typing, not an empty range.
  const rev = resolveRange({ preset: 'custom', from: '2026-05-01', to: '2026-04-01' }, TODAY)
  check('reversed custom dates are swapped, not left empty', rev.from === '2026-04-01' && rev.to === '2026-05-01')

  const half = resolveRange({ preset: 'custom', to: '2026-06-01' }, TODAY)
  check('a half-typed custom range still resolves', half.from !== null && half.to === '2026-06-01')
  const oneDay = resolveRange({ preset: 'custom', from: TODAY, to: TODAY }, TODAY)
  check('a single-day range is one day, not zero', oneDay.days === 1)
}

console.log('\nlabels and presets')
{
  const all = [...ROLLING_PRESETS, ...CALENDAR_PRESETS, 'all', 'custom']
  check('every offered preset has a label', all.every((p) => (PRESET_LABEL[p] ?? '').length > 0))
  check('every offered preset resolves', all.every((p) => !!resolveRange({ preset: p }, TODAY).label))
  check('presets are not duplicated between groups', new Set(all).size === all.length)
  check('every scope has a storage key', rangeKeys().length === 5 && new Set(rangeKeys()).size === 5)
  check('keys are namespaced to the app', rangeKeys().every((k) => k.startsWith('forge.')))
}

console.log('\nbucketing scales with the window')
{
  check('a week is drawn by day', bucketFor(resolveRange({ preset: 'week' }, TODAY), 400) === 'day')
  check('a month is drawn by day', bucketFor(resolveRange({ preset: 'month' }, TODAY), 400) === 'day')
  check('a quarter rolls up to weeks', bucketFor(resolveRange({ preset: 'quarter' }, TODAY), 400) === 'week')
  check('a year rolls up to weeks', bucketFor(resolveRange({ preset: 'year' }, TODAY), 400) === 'week')
  // 52 weekly bars is already dense; several years of them is unreadable.
  check('all time over years rolls up to months', bucketFor(resolveRange({ preset: 'all' }, TODAY), 1200) === 'month')
  check('all time on a new log stays fine-grained', bucketFor(resolveRange({ preset: 'all' }, TODAY), 20) === 'day')

  check('a daily bucket is the day itself', bucketStart('2026-07-31', 'day') === '2026-07-31')
  // 31 Jul 2026 is a Friday, so its week starts Monday the 27th.
  check('a weekly bucket starts on the Monday', bucketStart('2026-07-31', 'week') === '2026-07-27')
  check('a monthly bucket starts on the 1st', bucketStart('2026-07-31', 'month') === '2026-07-01')
  // Mon 27 Jul through Sun 2 Aug is one Monday-start week, so all seven land in the
  // same bucket — and the eighth day must start a new one.
  const oneWeek = new Set(Array.from({ length: 7 }, (_, i) => bucketStart(addDays('2026-07-27', i), 'week')))
  check('all seven days of a week share one bucket', oneWeek.size === 1 && oneWeek.has('2026-07-27'), [...oneWeek].join(','))
  const eightDays = new Set(Array.from({ length: 8 }, (_, i) => bucketStart(addDays('2026-07-27', i), 'week')))
  check('and the eighth day starts the next one', eightDays.size === 2)
}

console.log('\ntrends over an arbitrary range')
{
  const profile = { sex: 'male', units: 'imperial', activity: 'light', heightIn: 70 }
  const r = resolveRange({ preset: 'quarter' }, TODAY)
  // A clean 1 lb/week loss over six weeks.
  const body = Array.from({ length: 7 }, (_, i) => ({
    id: `b${i}`,
    date: addDays(TODAY, -42 + i * 7),
    weightLb: 200 - i,
    waistIn: 34,
    neckIn: 15.5,
  }))
  const rate = rateOverRange(body, r)
  check('a steady loss is measured at the right rate', Math.abs(rate + 1) < 0.01, `${rate}`)
  check('two points are not enough for a trend', rateOverRange(body.slice(0, 2), r) === null)
  check('an empty range gives no trend', rateOverRange([], r) === null)

  const lean = leanRateOverRange(body, profile, r)
  check('lean mass also trends', lean !== null && lean < 0)

  // A 10% gain over 10 weeks is about 1%/week.
  const lifts = Array.from({ length: 6 }, (_, i) => ({ date: addDays(TODAY, -70 + i * 14), e1rm: 200 + i * 4 }))
  const pct = pctPerWeekOverRange(lifts, (h) => h.e1rm)
  check('e1RM trend is a percent per week', pct !== null && pct > 0.5 && pct < 1.5, `${pct}`)
  check('zero-value points are ignored', pctPerWeekOverRange([{ date: TODAY, e1rm: 0 }], (h) => h.e1rm) === null)
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
