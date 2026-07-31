import { useEffect, useRef, useState } from 'react'
import { exportCsv, exportData, importData, useStore } from '../lib/store'
import {
  getInstallPrompt,
  isIos,
  isStandalone,
  promptInstall,
  subscribeInstall,
  wasInstalledThisSession,
} from '../lib/install'
import {
  getSyncConfig,
  setSyncConfig,
  signOutSync,
} from '../lib/sync'
import { Button, Card, Chip, Field, SectionTitle, Segmented, SelectField } from '../components/ui'
import SignInForm from '../components/SignInForm'
import { GOAL_LABEL, MUSCLES, MUSCLE_LABEL, type GoalPrimary, type Sex, type Units } from '../lib/types'
import {
  RACE_DISTANCES,
  dispDistance,
  dispWeight,
  fmtDuration,
  parseDuration,
  round,
  storeWeight,
  weightUnit,
} from '../lib/calc'

export default function Settings() {
  const { data, setProfile, setGoals, replaceAll, reset } = useStore()
  const units = data.profile.units
  const wu = weightUnit(units)
  const fileRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [theme, setTheme] = useState<'dark' | 'light'>(
    (document.documentElement.dataset.theme as 'dark' | 'light') ?? 'dark',
  )
  const [raceTime, setRaceTime] = useState(data.goals.raceTimeSec ? fmtDuration(data.goals.raceTimeSec) : '')

  function applyTheme(t: 'dark' | 'light') {
    setTheme(t)
    document.documentElement.dataset.theme = t
    localStorage.setItem('forge.theme', t)
  }

  const heightFt = data.profile.heightIn ? Math.floor(data.profile.heightIn / 12) : ''
  const heightInRem = data.profile.heightIn ? round(data.profile.heightIn % 12, 1) : ''

  return (
    <div className="space-y-6 pb-6">
      <section>
        <SectionTitle sub="Drives the calorie, BMI and body-fat calculations">Profile</SectionTitle>
        <Card className="space-y-3">
          <Field
            label="Name"
            value={data.profile.name ?? ''}
            onChange={(e) => setProfile({ name: e.target.value || undefined })}
          />
          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Sex" value={data.profile.sex} onChange={(e) => setProfile({ sex: e.target.value as Sex })}>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </SelectField>
            <Field
              label="Date of birth"
              type="date"
              value={data.profile.birthDate ?? ''}
              onChange={(e) => setProfile({ birthDate: e.target.value || undefined })}
            />
          </div>

          {units === 'metric' ? (
            <Field
              label="Height"
              type="number"
              suffix="cm"
              value={data.profile.heightIn ? round(data.profile.heightIn * 2.54, 1) : ''}
              onChange={(e) => setProfile({ heightIn: e.target.value ? Number(e.target.value) / 2.54 : undefined })}
            />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Height"
                type="number"
                suffix="ft"
                value={heightFt}
                onChange={(e) => setProfile({ heightIn: Number(e.target.value) * 12 + Number(heightInRem || 0) })}
              />
              <Field
                label="&nbsp;"
                type="number"
                suffix="in"
                value={heightInRem}
                onChange={(e) => setProfile({ heightIn: Number(heightFt || 0) * 12 + Number(e.target.value) })}
              />
            </div>
          )}

          <SelectField
            label="Daily activity outside training"
            value={data.profile.activity}
            onChange={(e) => setProfile({ activity: e.target.value as typeof data.profile.activity })}
          >
            <option value="sedentary">Sedentary — desk job</option>
            <option value="light">Lightly active</option>
            <option value="moderate">Moderately active</option>
            <option value="high">Very active</option>
          </SelectField>

          <Field
            label="Maintenance calories (optional override)"
            type="number"
            suffix="kcal"
            value={data.profile.tdeeOverride ?? ''}
            onChange={(e) => setProfile({ tdeeOverride: e.target.value ? Number(e.target.value) : undefined })}
            hint="Leave blank to estimate from your height, weight, age and logged training. Set it if you have tracked intake and know your real maintenance."
          />

          <div>
            <span className="label">Units</span>
            <Segmented
              value={units}
              onChange={(u: Units) => setProfile({ units: u })}
              options={[
                { value: 'imperial', label: 'lb / miles' },
                { value: 'metric', label: 'kg / km' },
              ]}
            />
          </div>

          <div>
            <span className="label">Appearance</span>
            <Segmented
              value={theme}
              onChange={applyTheme}
              options={[
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
              ]}
            />
          </div>
        </Card>
      </section>

      <section>
        <SectionTitle sub="Change these any time — every recommendation, volume target and calorie number adjusts immediately">
          Goals
        </SectionTitle>
        <Card className="space-y-3">
          <SelectField
            label="Primary goal"
            value={data.goals.primary}
            onChange={(e) => setGoals({ primary: e.target.value as GoalPrimary })}
          >
            {(Object.keys(GOAL_LABEL) as GoalPrimary[]).map((g) => (
              <option key={g} value={g}>
                {GOAL_LABEL[g]}
              </option>
            ))}
          </SelectField>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Target weight"
              type="number"
              suffix={wu}
              value={data.goals.targetWeightLb ? round(dispWeight(data.goals.targetWeightLb, units), 1) : ''}
              onChange={(e) => setGoals({ targetWeightLb: e.target.value ? storeWeight(Number(e.target.value), units) : undefined })}
            />
            <Field
              label="Target body fat"
              type="number"
              suffix="%"
              value={data.goals.targetBodyFatPct ?? ''}
              onChange={(e) => setGoals({ targetBodyFatPct: e.target.value ? Number(e.target.value) : undefined })}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Lifting days per week"
              type="number"
              min={0}
              max={7}
              value={data.goals.liftDaysPerWeek}
              onChange={(e) => setGoals({ liftDaysPerWeek: Number(e.target.value) })}
            />
            <Field
              label="Running days per week"
              type="number"
              min={0}
              max={7}
              value={data.goals.runDaysPerWeek}
              onChange={(e) => setGoals({ runDaysPerWeek: Number(e.target.value) })}
            />
          </div>

          <div>
            <span className="label">Muscle groups to prioritise</span>
            <div className="flex flex-wrap gap-1.5">
              {MUSCLES.map((m) => (
                <Chip
                  key={m}
                  active={data.goals.focusMuscles.includes(m)}
                  onClick={() =>
                    setGoals({
                      focusMuscles: data.goals.focusMuscles.includes(m)
                        ? data.goals.focusMuscles.filter((x) => x !== m)
                        : [...data.goals.focusMuscles, m],
                    })
                  }
                >
                  {MUSCLE_LABEL[m]}
                </Chip>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-ink-3">
              Selected groups get a 25% higher weekly set target and are pushed up the priority list.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label="Race goal distance"
              value={data.goals.raceDistanceMi ?? ''}
              onChange={(e) => setGoals({ raceDistanceMi: e.target.value ? Number(e.target.value) : undefined })}
            >
              <option value="">None</option>
              {RACE_DISTANCES.map((d) => (
                <option key={d.name} value={d.mi}>
                  {d.name} ({round(dispDistance(d.mi, units), 2)} {units === 'metric' ? 'km' : 'mi'})
                </option>
              ))}
            </SelectField>
            <Field
              label="Goal time"
              value={raceTime}
              placeholder="25:00"
              onChange={(e) => {
                setRaceTime(e.target.value)
                const sec = parseDuration(e.target.value)
                setGoals({ raceTimeSec: sec ?? undefined })
              }}
              hint="mm:ss or h:mm:ss"
            />
          </div>

          <Field
            label="Target date (optional)"
            type="date"
            value={data.goals.targetDate ?? ''}
            onChange={(e) => setGoals({ targetDate: e.target.value || undefined })}
          />
        </Card>
      </section>

      <section>
        <SectionTitle sub="Export regularly — that file is your real backup, whether or not sync is switched on.">
          Data
        </SectionTitle>
        <Card className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => exportData(data)}>
              Export backup (JSON)
            </Button>
            <Button onClick={() => exportCsv(data)}>Export CSV</Button>
            <Button onClick={() => fileRef.current?.click()}>Import backup</Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0]
              if (!file) return
              try {
                const imported = await importData(file)
                const counts = `${imported.workouts.length} workouts, ${imported.runs.length} runs, ${imported.body.length} body entries`
                if (confirm(`Replace everything currently on this device with the backup (${counts})?`)) {
                  replaceAll(imported)
                  setStatus(`Imported ${counts}.`)
                }
              } catch (err) {
                setStatus(`Import failed: ${(err as Error).message}`)
              }
              e.target.value = ''
            }}
          />
          {status && <p className="text-xs" style={{ color: 'var(--series-1)' }}>{status}</p>}

          <p className="text-[11px] leading-relaxed text-ink-3">
            Export is your backup even with sync switched on — it is the only copy that survives losing access to
            both your devices and the sync project.
          </p>

          <div className="tabular grid grid-cols-3 gap-3 border-t border-line pt-3 text-xs text-ink-2">
            <div>
              <div className="text-lg font-semibold text-ink">{data.workouts.length}</div>
              workouts
            </div>
            <div>
              <div className="text-lg font-semibold text-ink">{data.runs.length}</div>
              runs
            </div>
            <div>
              <div className="text-lg font-semibold text-ink">{data.body.length}</div>
              body entries
            </div>
          </div>

          <Button
            variant="danger"
            onClick={() => {
              if (confirm('Erase all data on this device? Export a backup first if you want to keep it.')) {
                if (confirm('This cannot be undone. Really erase everything?')) reset()
              }
            }}
          >
            Erase all data
          </Button>
        </Card>
      </section>

      <SyncSection />

      <InstallSection />
    </div>
  )
}

/**
 * Installing to the home screen. Chromium hands us a real install prompt (caught
 * at startup, since it fires before this screen exists); iOS has no such API, so
 * there the only honest thing is to name the exact taps.
 */
function InstallSection() {
  const [, force] = useState(0)
  useEffect(() => subscribeInstall(() => force((n) => n + 1)), [])

  const promptEvent = getInstallPrompt()
  const installed = isStandalone() || wasInstalledThisSession()

  return (
    <section>
      <SectionTitle sub="It installs from the web, not an app store — free, and it stays installed.">
        Install as an app
      </SectionTitle>
      <Card>
        {installed ? (
          <div className="space-y-2 text-xs leading-relaxed text-ink-2">
            <p className="flex items-center gap-2 text-sm font-medium text-ink">
              <span aria-hidden style={{ color: 'var(--good)' }}>
                ✓
              </span>
              Installed on this device
            </p>
            <p>
              You are running the installed app — its own window, no browser bar, and it opens with no connection.
              Long-press the icon for shortcuts straight to logging a lift, a run, or your weight.
            </p>
          </div>
        ) : (
          <div className="space-y-3 text-xs leading-relaxed text-ink-2">
            {promptEvent && (
              <Button variant="primary" onClick={() => void promptInstall()}>
                Install Forge
              </Button>
            )}
            {isIos() ? (
              <div className="space-y-1.5">
                <p className="font-medium text-ink">On iPhone or iPad</p>
                <p>
                  1. Open this page in <span className="text-ink">Safari</span> — Chrome on iOS cannot install apps.
                </p>
                <p>
                  2. Tap the <span className="text-ink">Share</span> button (the square with an arrow).
                </p>
                <p>
                  3. Scroll down and tap <span className="text-ink">Add to Home Screen</span>, then{' '}
                  <span className="text-ink">Add</span>.
                </p>
                <p className="text-ink-3">
                  It then behaves like any other app: its own icon, no browser interface, and it opens offline.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {!promptEvent && (
                  <p className="text-ink-3">
                    No install prompt available here — this usually means it is already installed, the page is not being
                    served over HTTPS, or the browser does not support installing. Chrome, Edge and Safari all do.
                  </p>
                )}
                <p>
                  <span className="font-medium text-ink">Android:</span> Chrome menu → <span className="text-ink">Install app</span>.
                </p>
                <p>
                  <span className="font-medium text-ink">Mac / Windows:</span> the install icon in Chrome or Edge's
                  address bar, or menu → Install.
                </p>
              </div>
            )}
            <p className="border-t border-line pt-2 text-ink-3">
              Installing matters for more than convenience: browsers grant persistent storage to installed apps, so
              your log is far less likely to be evicted, and the app is cached for offline launch.
            </p>
          </div>
        )}
      </Card>
    </section>
  )
}

/**
 * Cross-device sync setup and status. Kept in Settings because it is a one-time
 * setup followed by something you should never have to think about again.
 */
function SyncSection() {
  const { data, sync, pendingChanges, syncNow, refreshSyncStatus, toggleAutoSync } = useStore()
  const existing = getSyncConfig()
  const signedIn = !!sync.email

  const [editingConfig, setEditingConfig] = useState(!existing)
  const [url, setUrl] = useState(existing?.url ?? '')
  const [anonKey, setAnonKey] = useState(existing?.anonKey ?? '')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; kind: 'ok' | 'error' } | null>(null)

  useEffect(() => {
    void refreshSyncStatus()
  }, [refreshSyncStatus])

  async function guard(fn: () => Promise<void>, done?: string) {
    setBusy(true)
    setMessage(null)
    try {
      await fn()
      if (done) setMessage({ text: done, kind: 'ok' })
    } catch (err) {
      setMessage({ text: (err as Error).message, kind: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const lastSynced = sync.lastSyncedAt ?? data.sync.lastSyncedAt
  const statusLabel: Record<typeof sync.phase, string> = {
    off: 'Not set up',
    'signed-out': 'Not signed in',
    idle: pendingChanges > 0 ? 'Connected — changes queued' : 'Connected',
    syncing: 'Syncing…',
    offline: 'Offline — queued',
    error: 'Needs attention',
  }
  const statusColor =
    sync.phase === 'idle'
      ? 'var(--good)'
      : sync.phase === 'error'
        ? 'var(--critical)'
        : sync.phase === 'syncing'
          ? 'var(--series-1)'
          : sync.phase === 'offline'
            ? 'var(--warning)'
            : 'var(--text-muted)'

  return (
    <section>
      <SectionTitle sub="Optional. Keeps your phone, laptop and desktop in step through your own free Supabase project.">
        Cross-device sync
      </SectionTitle>
      <Card className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-sm">
            <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: statusColor }} />
            {statusLabel[sync.phase]}
            {sync.email && <span className="text-[11px] text-ink-3">{sync.email}</span>}
          </span>
          {sync.phase === 'idle' || sync.phase === 'error' || sync.phase === 'offline' ? (
            <Button onClick={() => void syncNow()} disabled={busy}>
              Sync now
            </Button>
          ) : null}
        </div>

        {pendingChanges > 0 && (
          <p className="text-[11px] text-ink-3">
            {pendingChanges} local change{pendingChanges === 1 ? '' : 's'} waiting to upload. Nothing is lost — they
            are stored on this device until sync succeeds.
          </p>
        )}

        {lastSynced && (
          <p className="text-[11px] text-ink-3">
            Last synced {new Date(lastSynced).toLocaleString()}
            {sync.lastResult
              ? ` · pulled ${sync.lastResult.applied} change${sync.lastResult.applied === 1 ? '' : 's'}, pushed ${sync.lastResult.pushed}`
              : ''}
          </p>
        )}

        {sync.error && (
          <p className="text-xs" style={{ color: 'var(--critical)' }}>
            {sync.error}
          </p>
        )}

        {/* --- Step 1: project credentials ---------------------------------- */}
        {editingConfig ? (
          <div className="space-y-3 border-t border-line pt-3">
            <div className="space-y-1.5 text-xs leading-relaxed text-ink-2">
              <p className="font-medium text-ink">One-time setup (about five minutes)</p>
              <p>
                1. Create a free project at <span className="text-ink">supabase.com</span>.
              </p>
              <p>
                2. In the project's SQL editor, paste and run the contents of{' '}
                <span className="text-ink">supabase/migrations/</span> from this repo.
              </p>
              <p>
                3. Copy the Project URL and the <span className="text-ink">anon public</span> key from Settings → API,
                and paste them below.
              </p>
            </div>
            <Field
              label="Project URL"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://abcdefgh.supabase.co"
            />
            <Field
              label="Anon public key"
              value={anonKey}
              onChange={(e) => setAnonKey(e.target.value)}
              placeholder="eyJhbGciOi…"
              hint="This key is meant to be public — row-level security is what keeps your data private, so only you can read your rows."
            />
            <div className="flex gap-2">
              <Button
                variant="primary"
                disabled={!url.trim() || !anonKey.trim()}
                onClick={() =>
                  void guard(async () => {
                    setSyncConfig({ url: url.trim().replace(/\/$/, ''), anonKey: anonKey.trim() })
                    await refreshSyncStatus()
                    setEditingConfig(false)
                  }, 'Project saved. Sign in with your email to start syncing.')
                }
              >
                Save project
              </Button>
              {existing && (
                <Button variant="ghost" onClick={() => setEditingConfig(false)}>
                  Cancel
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
            <span className="truncate text-[11px] text-ink-3">{existing?.url}</span>
            <Button variant="ghost" className="text-[11px]" onClick={() => setEditingConfig(true)}>
              Change project
            </Button>
          </div>
        )}

        {/* --- Step 2: sign in --------------------------------------------- */}
        {!editingConfig && !signedIn && (
          <div className="space-y-3 border-t border-line pt-3">
            <SignInForm
              onSignedIn={async () => {
                await refreshSyncStatus()
                await syncNow()
              }}
            />
          </div>
        )}

        {/* --- Step 3: ongoing -------------------------------------------- */}
        {!editingConfig && signedIn && (
          <div className="space-y-3 border-t border-line pt-3">
            <label className="flex items-start gap-2.5 text-xs">
              <input
                type="checkbox"
                checked={sync.autoSync}
                onChange={(e) => toggleAutoSync(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-[var(--series-1)]"
              />
              <span>
                <span className="font-medium">Sync automatically</span>
                <span className="mt-0.5 block text-[11px] text-ink-3">
                  A few seconds after you log something, and whenever the app is reopened or comes back online.
                </span>
              </span>
            </label>
            <Button
              variant="ghost"
              className="text-[11px]"
              onClick={() =>
                void guard(async () => {
                  await signOutSync()
                  await refreshSyncStatus()
                }, 'Signed out on this device. Your local log is untouched.')
              }
            >
              Sign out of sync
            </Button>
          </div>
        )}

        {message && (
          <p
            className="text-xs leading-relaxed"
            style={{ color: message.kind === 'error' ? 'var(--critical)' : 'var(--series-1)' }}
          >
            {message.kind === 'error' && <span aria-hidden>⚠ </span>}
            {message.text}
          </p>
        )}

        <div className="space-y-1.5 border-t border-line pt-3 text-[11px] leading-relaxed text-ink-3">
          <p>
            Sync merges record by record, so logging on your phone and editing on your laptop the same day keeps both.
            If the same record is edited in two places, the most recent edit wins.
          </p>
          <p>
            Erasing data on one device is local only and does not delete your synced history — but deleting an
            individual workout, run or entry does sync, on purpose.
          </p>
          <p>
            Supabase's free tier pauses a project after about a week with no activity. Normal use keeps it awake; if it
            pauses, restore it from the Supabase dashboard.
          </p>
        </div>
      </Card>
    </section>
  )
}
