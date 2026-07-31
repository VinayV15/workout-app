/**
 * Merge tests for cross-device sync. No test framework — run with:
 *   npm test
 *
 * These cover the cases that actually lose data if the merge is wrong: the same
 * record edited on two devices, deletions racing edits, records that predate
 * sync being switched on, and two devices logging different sessions the same
 * day.
 */
import { describeSyncError, mergeRows, rowsToPush } from '../src/lib/sync.ts'
import { launchView } from '../src/lib/firstRun.ts'

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

const T1 = '2026-07-01T10:00:00.000Z'
const T2 = '2026-07-02T10:00:00.000Z'
const T3 = '2026-07-03T10:00:00.000Z'

const base = (over = {}) => ({
  version: 1,
  profile: { sex: 'male', units: 'imperial', activity: 'light' },
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
const w = (id, name) => ({ id, date: '2026-07-01', name, exercises: [] })
const run = (id) => ({ id, date: '2026-07-01', distanceMi: 3, seconds: 1500, type: 'easy' })

console.log('sync merge')

// Pulling
{
  const r = mergeRows(base(), [{ tbl: 'workouts', id: 'w1', payload: w('w1', 'Remote'), updated_at: T1, deleted: false }])
  check('remote-only record is pulled in', r.data.workouts.length === 1 && r.data.sync.rev['workouts:w1'] === T1)
}

// Pushing
{
  const local = base({ workouts: [w('w2', 'Local')], sync: { rev: { 'workouts:w2': T2 }, deleted: {} } })
  const r = mergeRows(local, [])
  check('local-only record survives an empty pull', r.data.workouts.length === 1)
  check('local-only record is queued to push', rowsToPush(r.data, new Map()).some((p) => p.id === 'w2' && !p.deleted))
}

// Conflicts
{
  const local = base({ workouts: [w('w3', 'Local newer')], sync: { rev: { 'workouts:w3': T3 }, deleted: {} } })
  const r = mergeRows(local, [{ tbl: 'workouts', id: 'w3', payload: w('w3', 'Remote older'), updated_at: T1, deleted: false }])
  check('locally-newer edit wins', r.data.workouts[0].name === 'Local newer' && r.applied === 0)
  check('locally-newer edit is pushed back', rowsToPush(r.data, new Map([['workouts:w3', T1]])).some((p) => p.id === 'w3'))
}
{
  const local = base({ workouts: [w('w4', 'Local older')], sync: { rev: { 'workouts:w4': T1 }, deleted: {} } })
  const r = mergeRows(local, [{ tbl: 'workouts', id: 'w4', payload: w('w4', 'Remote newer'), updated_at: T3, deleted: false }])
  check('remotely-newer edit wins', r.data.workouts[0].name === 'Remote newer')
  check(
    'taking the remote copy leaves nothing to push back',
    rowsToPush(r.data, new Map([['workouts:w4', T3], ['settings:main', T3]])).length === 0,
  )
}

// Deletions
{
  const local = base({ runs: [run('r5')], sync: { rev: { 'runs:r5': T1 }, deleted: {} } })
  const r = mergeRows(local, [{ tbl: 'runs', id: 'r5', payload: null, updated_at: T3, deleted: true }])
  check('remote deletion removes the record and records a tombstone', r.data.runs.length === 0 && r.data.sync.deleted['runs:r5'] === T3)
}
{
  const local = base({ runs: [run('r6')], sync: { rev: { 'runs:r6': T3 }, deleted: {} } })
  const r = mergeRows(local, [{ tbl: 'runs', id: 'r6', payload: null, updated_at: T1, deleted: true }])
  check('a stale remote deletion does not delete a newer local edit', r.data.runs.length === 1)
}
{
  const local = base({ sync: { rev: {}, deleted: { 'body:b7': T2 } } })
  check('local tombstone is pushed as a deletion', rowsToPush(local, new Map()).some((p) => p.id === 'b7' && p.deleted))
  const r = mergeRows(local, [{ tbl: 'body', id: 'b7', payload: { id: 'b7', date: '2026-07-01' }, updated_at: T1, deleted: false }])
  check('an older remote copy does not resurrect a deleted record', r.data.body.length === 0)
}

// Data that predates sync
{
  const local = base({ workouts: [w('w9', 'Legacy')] })
  check('pre-sync record is pushed when the server has nothing', rowsToPush(local, new Map()).some((p) => p.id === 'w9'))
  const r = mergeRows(local, [{ tbl: 'workouts', id: 'w9', payload: w('w9', 'Remote edit'), updated_at: T1, deleted: false }])
  check('pre-sync record yields to a real remote edit', r.data.workouts[0].name === 'Remote edit')
}

// Settings
{
  const local = base({ sync: { rev: { 'settings:main': T1 }, deleted: {} } })
  const r = mergeRows(local, [
    {
      tbl: 'settings',
      id: 'main',
      payload: { profile: { units: 'metric' }, goals: { primary: 'muscle_gain' }, dismissed: { x: '2026-07-01' } },
      updated_at: T3,
      deleted: false,
    },
  ])
  check(
    'newer remote settings are applied',
    r.data.profile.units === 'metric' && r.data.goals.primary === 'muscle_gain' && r.data.dismissed.x === '2026-07-01',
  )
  check('settings merge keeps fields the remote did not carry', r.data.profile.sex === 'male' && r.data.goals.liftDaysPerWeek === 4)
}

// The case this whole design exists for
{
  const phone = base({ workouts: [w('wa', 'Phone session')], sync: { rev: { 'workouts:wa': T2 }, deleted: {} } })
  const r = mergeRows(phone, [{ tbl: 'workouts', id: 'wb', payload: w('wb', 'Laptop session'), updated_at: T2, deleted: false }])
  check(
    'two devices logging different sessions the same day keeps both',
    r.data.workouts.length === 2 && r.data.workouts.map((x) => x.id).sort().join() === 'wa,wb',
  )
}

// Recovery: a device whose storage was cleared (iOS eviction, cleared site data,
// a new phone) must rebuild its whole history from the server on first sync, and
// must not push its empty state over the top of it.
{
  const wiped = base() // no records, no revisions, never synced
  const remote = [
    { tbl: 'workouts', id: 'w1', payload: w('w1', 'Upper A'), updated_at: T1, deleted: false },
    { tbl: 'workouts', id: 'w2', payload: w('w2', 'Lower A'), updated_at: T2, deleted: false },
    { tbl: 'runs', id: 'r1', payload: run('r1'), updated_at: T2, deleted: false },
    { tbl: 'body', id: 'b1', payload: { id: 'b1', date: '2026-07-01', weightLb: 205 }, updated_at: T2, deleted: false },
    {
      tbl: 'settings',
      id: 'main',
      payload: { profile: { units: 'imperial', heightIn: 70 }, goals: { primary: 'fat_loss', targetWeightLb: 185 }, dismissed: {} },
      updated_at: T2,
      deleted: false,
    },
  ]
  const r = mergeRows(wiped, remote)
  check(
    'a wiped device restores every record from the server',
    r.data.workouts.length === 2 && r.data.runs.length === 1 && r.data.body.length === 1 && r.applied === 5,
  )
  check('a wiped device restores its goals', r.data.goals.targetWeightLb === 185 && r.data.profile.heightIn === 70)
  const remoteMap = new Map(remote.map((x) => [`${x.tbl}:${x.id}`, x.updated_at]))
  check('a wiped device pushes nothing back over the restored data', rowsToPush(r.data, remoteMap).length === 0)
}

// Timestamps
{
  const pg = new Date('2026-07-03T10:00:00.123456+00:00').toISOString()
  check('postgres timestamps normalise to a comparable ISO string', pg > T2 && pg < '2026-07-04T00:00:00.000Z', pg)
}

// Idempotency
{
  const local = base({ workouts: [w('ws', 'S')], sync: { rev: { 'workouts:ws': T1, 'settings:main': T1 }, deleted: {} } })
  const remote = new Map([
    ['workouts:ws', T1],
    ['settings:main', T1],
  ])
  check('a second sync with no changes pushes nothing', rowsToPush(local, remote).length === 0)
}

// ---------------------------------------------------------------------------
// Launch gate: which screen an app start lands on. The bug this replaces was a
// returning user on an empty device being treated as brand new.
// ---------------------------------------------------------------------------
console.log('\nlaunch gate')
{
  const at = (over) =>
    launchView({
      hasLocalData: false,
      syncConfigured: true,
      bootstrapped: true,
      syncing: false,
      signedIn: false,
      startFresh: false,
      ...over,
    })

  check('an empty signed-out device offers sign-in rather than setup', at() === 'welcome')
  check('a returning user is not shown setup while the pull is in flight', at({ syncing: true }) === 'restoring')
  check('setup is held until the launch sequence settles', at({ bootstrapped: false }) === 'restoring')
  check(
    'a signed-in account with genuinely no data goes to setup',
    at({ signedIn: true }) === 'onboarding',
  )
  check('choosing a local-only log goes straight to setup', at({ startFresh: true }) === 'onboarding')
  check('with no project configured there is nothing to restore', at({ syncConfigured: false }) === 'onboarding')
  check('existing local data opens the app', at({ hasLocalData: true }) === 'app')
  check(
    'existing local data opens the app even mid-sync',
    at({ hasLocalData: true, syncing: true, bootstrapped: false }) === 'app',
  )
  check(
    'an offline launch with saved data still opens the app',
    at({ hasLocalData: true, signedIn: true }) === 'app',
  )
  check(
    'a signed-out device that already has data is never interrupted',
    at({ hasLocalData: true, startFresh: false }) === 'app',
  )
}

// ---------------------------------------------------------------------------
// Error messages: these are the only explanation the user gets, so the common
// failures must not surface as raw API strings.
// ---------------------------------------------------------------------------
console.log('\nerror messages')
{
  const rewritten = (raw) => {
    const out = describeSyncError(raw)
    return out !== raw && out.length > 0
  }
  check('a wrong password explains itself', rewritten('Invalid login credentials'))
  check('a duplicate signup points at signing in', rewritten('User already registered'))
  check(
    'an unconfirmed email says where to turn confirmation off',
    describeSyncError('Email not confirmed').includes('Confirm email'),
  )
  check('disabled signups are explained', rewritten('Signups not allowed for this instance'))
  check('a consumed magic link is explained', rewritten('Email link is invalid or has expired'))
  check('a missing table points at the migration', describeSyncError('relation "records" does not exist').includes('migration'))
  check('an unrecognised error is passed through unchanged', describeSyncError('kaboom') === 'kaboom')
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
