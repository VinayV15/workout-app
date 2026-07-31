import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { AppData, BodyEntry, Exercise, Goals, Profile, Run, Workout, WorkoutTemplate } from './types'
import { DEFAULT_TEMPLATES } from './exercises'
import { todayISO } from './calc'
import {
  completeSignInFromUrl,
  currentUser,
  emptySyncMeta,
  getAutoSync,
  isSyncConfigured,
  pendingChangeCount,
  recordKey,
  runSync,
  setAutoSync,
  stampAllRecords,
  type SyncTable,
} from './sync'

const STORAGE_KEY = 'forge.data.v1'
const DATA_VERSION = 1

/** Debounce before an edit triggers an automatic sync. */
const AUTO_SYNC_DELAY_MS = 4000

/** Wait before retrying a failed sync once. */
const RETRY_DELAY_MS = 30_000

export function defaultData(): AppData {
  return {
    version: DATA_VERSION,
    profile: {
      sex: 'male',
      units: 'imperial',
      activity: 'light',
    },
    goals: {
      primary: 'fat_loss',
      secondary: 'muscle_gain',
      liftDaysPerWeek: 4,
      runDaysPerWeek: 3,
      focusMuscles: [],
    },
    workouts: [],
    runs: [],
    body: [],
    customExercises: [],
    templates: DEFAULT_TEMPLATES,
    dismissed: {},
    sync: emptySyncMeta(),
  }
}

function load(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultData()
    const parsed = JSON.parse(raw) as Partial<AppData>
    return migrate(parsed)
  } catch (err) {
    console.error('Could not read saved data; starting fresh.', err)
    return defaultData()
  }
}

/** Fill in anything a older/partial document is missing. */
export function migrate(parsed: Partial<AppData>): AppData {
  const base = defaultData()
  return {
    version: DATA_VERSION,
    profile: { ...base.profile, ...parsed.profile },
    goals: { ...base.goals, ...parsed.goals, focusMuscles: parsed.goals?.focusMuscles ?? [] },
    workouts: parsed.workouts ?? [],
    runs: parsed.runs ?? [],
    body: parsed.body ?? [],
    customExercises: parsed.customExercises ?? [],
    templates: parsed.templates?.length ? parsed.templates : base.templates,
    dismissed: parsed.dismissed ?? {},
    sync: {
      rev: parsed.sync?.rev ?? {},
      deleted: parsed.sync?.deleted ?? {},
      lastSyncedAt: parsed.sync?.lastSyncedAt,
    },
  }
}

export function uid(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

/** Records a local change so sync knows this side is the newer one. */
function stamp(data: AppData, tbl: SyncTable, id: string): AppData {
  const now = new Date().toISOString()
  const rev = { ...data.sync.rev, [recordKey(tbl, id)]: now }
  const deleted = { ...data.sync.deleted }
  delete deleted[recordKey(tbl, id)]
  return { ...data, sync: { ...data.sync, rev, deleted } }
}

/** Records a deletion as a tombstone so it propagates rather than coming back. */
function stampDeleted(data: AppData, tbl: SyncTable, id: string): AppData {
  const now = new Date().toISOString()
  const key = recordKey(tbl, id)
  const rev = { ...data.sync.rev }
  delete rev[key]
  return { ...data, sync: { ...data.sync, rev, deleted: { ...data.sync.deleted, [key]: now } } }
}

export type SyncPhase = 'off' | 'signed-out' | 'idle' | 'syncing' | 'offline' | 'error'

export interface SyncState {
  phase: SyncPhase
  email?: string
  lastSyncedAt?: string
  error?: string
  /** Summary of the most recent successful sync, for the UI. */
  lastResult?: { applied: number; pushed: number }
  autoSync: boolean
  /**
   * False until the launch sequence has settled — the session has been checked
   * and, if signed in, the first pull has finished. A device with no local data
   * must not be told it is a new user before this is true, or a returning user
   * gets dropped into first-run setup while their history is still in flight.
   */
  bootstrapped: boolean
}

interface Store {
  data: AppData
  setProfile: (p: Partial<Profile>) => void
  setGoals: (g: Partial<Goals>) => void
  saveWorkout: (w: Workout) => void
  deleteWorkout: (id: string) => void
  saveRun: (r: Run) => void
  deleteRun: (id: string) => void
  saveBody: (b: BodyEntry) => void
  deleteBody: (id: string) => void
  addCustomExercise: (e: Exercise) => void
  deleteCustomExercise: (id: string) => void
  saveTemplate: (t: WorkoutTemplate) => void
  deleteTemplate: (id: string) => void
  dismiss: (recId: string, week: string) => void
  replaceAll: (d: AppData) => void
  reset: () => void
  sync: SyncState
  /** Local changes not yet pushed — 0 when everything is in step. */
  pendingChanges: number
  syncNow: () => Promise<void>
  refreshSyncStatus: () => Promise<void>
  toggleAutoSync: (on: boolean) => void
}

const StoreContext = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(load)
  const [sync, setSync] = useState<SyncState>({
    phase: isSyncConfigured() ? 'signed-out' : 'off',
    autoSync: getAutoSync(),
    // With no project configured there is nothing to wait for.
    bootstrapped: !isSyncConfigured(),
  })

  // Persist on every change. The document is small enough (a year of training
  // is well under a megabyte) that writing it whole is simpler and safer than
  // maintaining incremental updates.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch (err) {
      console.error('Save failed — storage may be full.', err)
    }
  }, [data])

  // The sync round trip is async and must read the freshest document, not the
  // one captured when it was scheduled.
  const dataRef = useRef(data)
  dataRef.current = data
  const runningRef = useRef(false)
  const dirtyRef = useRef(false)
  const timerRef = useRef<number | null>(null)
  const retryRef = useRef<number | null>(null)
  // Lets the failure path schedule a retry of itself without a circular dep.
  const syncNowRef = useRef<(() => Promise<void>) | null>(null)

  const syncNow = useCallback(async () => {
    if (!isSyncConfigured() || runningRef.current) return
    // Being offline is a normal state for a gym app, not a failure. Skip the
    // attempt, keep the pending changes, and say so plainly — the `online`
    // listener picks it up the moment a connection is back.
    if (!navigator.onLine) {
      setSync((s) => ({ ...s, phase: 'offline', error: undefined }))
      return
    }
    const user = await currentUser()
    if (!user) {
      setSync((s) => ({ ...s, phase: 'signed-out', email: undefined }))
      return
    }
    runningRef.current = true
    dirtyRef.current = false
    setSync((s) => ({ ...s, phase: 'syncing', error: undefined, email: user.email }))
    try {
      const result = await runSync(dataRef.current)
      // Anything edited while the request was in flight is newer than what was
      // just merged, so re-apply it on top of the merged document.
      setData((current) => reapplyLocalEdits(result.data, current))
      setSync((s) => ({
        ...s,
        phase: 'idle',
        email: user.email,
        lastSyncedAt: result.at,
        lastResult: { applied: result.applied, pushed: result.pushed },
        error: undefined,
      }))
    } catch (err) {
      setSync((s) => ({ ...s, phase: 'error', error: (err as Error).message }))
      // One delayed retry covers the common transient case (a dropped tunnel, a
      // project waking from pause) without waiting for the next app launch.
      if (retryRef.current) window.clearTimeout(retryRef.current)
      retryRef.current = window.setTimeout(() => {
        retryRef.current = null
        void syncNowRef.current?.()
      }, RETRY_DELAY_MS)
    } finally {
      runningRef.current = false
    }
  }, [])

  syncNowRef.current = syncNow

  const scheduleSync = useCallback(() => {
    dirtyRef.current = true
    if (!isSyncConfigured() || !getAutoSync()) return
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      void syncNow()
    }, AUTO_SYNC_DELAY_MS)
  }, [syncNow])

  const refreshSyncStatus = useCallback(async () => {
    if (!isSyncConfigured()) {
      setSync((s) => ({ ...s, phase: 'off', email: undefined }))
      return
    }
    const user = await currentUser()
    setSync((s) => {
      // A sync in flight, or one that just failed, is more informative than the
      // session check — don't overwrite either with a bare "connected".
      const keepPhase =
        s.phase === 'syncing' || ((s.phase === 'error' || s.phase === 'offline') && !!user)
      return {
        ...s,
        phase: keepPhase ? s.phase : user ? 'idle' : 'signed-out',
        email: user?.email,
        autoSync: getAutoSync(),
        lastSyncedAt: s.lastSyncedAt ?? dataRef.current.sync.lastSyncedAt,
      }
    })
  }, [])

  // Ask the browser to treat this data as persistent. Without it, both iOS and
  // Android may evict a web app's storage under pressure — and for an offline
  // log that has not synced yet, eviction means losing sessions. Installed apps
  // are usually granted this silently.
  useEffect(() => {
    void navigator.storage?.persist?.().catch(() => {
      /* not supported, or declined — export backups remain the safety net */
    })
  }, [])

  // On launch: pick up the session (including one arriving from a magic-link
  // redirect) and pull anything logged on another device.
  useEffect(() => {
    if (!isSyncConfigured()) return
    let cancelled = false
    void (async () => {
      // A sign-in arriving on the URL has to be consumed before the session is
      // read, or the app decides it is signed out and the link's tokens are lost.
      let linkError: string | undefined
      try {
        await completeSignInFromUrl()
      } catch (err) {
        linkError = (err as Error).message
      }
      const user = await currentUser()
      if (cancelled) return
      setSync((s) => ({
        ...s,
        phase: linkError ? 'error' : user ? 'idle' : 'signed-out',
        email: user?.email,
        error: linkError,
        lastSyncedAt: dataRef.current.sync.lastSyncedAt,
      }))
      // Awaited, not fired and forgotten: the first pull is what turns an empty
      // device back into this user's training log, and the UI holds a brief
      // "restoring" state until it lands.
      if (user && getAutoSync()) await syncNow()
      if (!cancelled) setSync((s) => ({ ...s, bootstrapped: true }))
    })()
    return () => {
      cancelled = true
    }
  }, [syncNow])

  // Sync when the app comes back to the foreground or regains a connection —
  // the two moments most likely to follow a session logged elsewhere.
  useEffect(() => {
    if (!isSyncConfigured()) return
    const onWake = () => {
      if (document.visibilityState === 'visible' && getAutoSync()) void syncNow()
    }
    const onOnline = () => {
      if (getAutoSync()) void syncNow()
    }
    document.addEventListener('visibilitychange', onWake)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onWake)
      window.removeEventListener('online', onOnline)
    }
  }, [syncNow])

  // A pending edit should not be lost if the tab closes before the debounce
  // fires; this is best-effort and only fires when something is unsynced.
  useEffect(() => {
    const onHide = () => {
      if (dirtyRef.current && isSyncConfigured() && getAutoSync()) void syncNow()
    }
    window.addEventListener('pagehide', onHide)
    return () => window.removeEventListener('pagehide', onHide)
  }, [syncNow])

  const upsert = useCallback(
    <T extends { id: string }>(key: ListKey, item: T) => {
      setData((d) => {
        const list = d[key] as unknown as T[]
        const idx = list.findIndex((i) => i.id === item.id)
        const next = idx >= 0 ? list.map((i) => (i.id === item.id ? item : i)) : [...list, item]
        return stamp({ ...d, [key]: next }, key, item.id)
      })
      scheduleSync()
    },
    [scheduleSync],
  )

  const remove = useCallback(
    (key: ListKey, id: string) => {
      setData((d) =>
        stampDeleted({ ...d, [key]: (d[key] as { id: string }[]).filter((i) => i.id !== id) }, key, id),
      )
      scheduleSync()
    },
    [scheduleSync],
  )

  /** Profile, goals and dismissals travel together as one settings record. */
  const patchSettings = useCallback(
    (fn: (d: AppData) => AppData) => {
      setData((d) => stamp(fn(d), 'settings', 'main'))
      scheduleSync()
    },
    [scheduleSync],
  )

  const store = useMemo<Store>(
    () => ({
      data,
      setProfile: (p) => patchSettings((d) => ({ ...d, profile: { ...d.profile, ...p } })),
      setGoals: (g) => patchSettings((d) => ({ ...d, goals: { ...d.goals, ...g } })),
      saveWorkout: (w) => upsert('workouts', w),
      deleteWorkout: (id) => remove('workouts', id),
      saveRun: (r) => upsert('runs', r),
      deleteRun: (id) => remove('runs', id),
      saveBody: (b) => upsert('body', b),
      deleteBody: (id) => remove('body', id),
      addCustomExercise: (e) => upsert('customExercises', e),
      deleteCustomExercise: (id) => remove('customExercises', id),
      saveTemplate: (t) => upsert('templates', t),
      deleteTemplate: (id) => remove('templates', id),
      dismiss: (recId, week) =>
        patchSettings((d) => ({ ...d, dismissed: { ...d.dismissed, [recId]: week } })),
      replaceAll: (d) => {
        // An imported backup is treated as the newest state, so it propagates
        // to the other devices rather than being overwritten by them.
        setData(stampAllRecords(migrate(d)))
        scheduleSync()
      },
      reset: () => {
        // Local-only: erasing this device does not delete the synced history.
        setData(defaultData())
      },
      sync,
      pendingChanges: isSyncConfigured() ? pendingChangeCount(data) : 0,
      syncNow,
      refreshSyncStatus,
      toggleAutoSync: (on) => {
        setAutoSync(on)
        setSync((s) => ({ ...s, autoSync: on }))
        if (on) void syncNow()
      },
    }),
    [data, upsert, remove, patchSettings, scheduleSync, sync, syncNow, refreshSyncStatus],
  )

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>
}

type ListKey = 'workouts' | 'runs' | 'body' | 'customExercises' | 'templates'

/**
 * Re-applies any local record that was edited while a sync was in flight. The
 * merged document is authoritative for everything else.
 */
function reapplyLocalEdits(merged: AppData, current: AppData): AppData {
  const out: AppData = { ...merged }
  for (const key of ['workouts', 'runs', 'body', 'customExercises', 'templates'] as ListKey[]) {
    const currentList = current[key] as { id: string }[]
    const mergedList = out[key] as { id: string }[]
    const next = [...mergedList]
    let touched = false
    for (const item of currentList) {
      const localTs = current.sync.rev[recordKey(key, item.id)]
      const mergedTs = merged.sync.rev[recordKey(key, item.id)]
      if (localTs && (!mergedTs || localTs > mergedTs)) {
        const idx = next.findIndex((i) => i.id === item.id)
        if (idx >= 0) next[idx] = item
        else next.push(item)
        out.sync = { ...out.sync, rev: { ...out.sync.rev, [recordKey(key, item.id)]: localTs } }
        touched = true
      }
    }
    if (touched) (out as unknown as Record<string, unknown>)[key] = next
  }
  const settingsKey = recordKey('settings', 'main')
  const localSettingsTs = current.sync.rev[settingsKey]
  const mergedSettingsTs = merged.sync.rev[settingsKey]
  if (localSettingsTs && (!mergedSettingsTs || localSettingsTs > mergedSettingsTs)) {
    out.profile = current.profile
    out.goals = current.goals
    out.dismissed = current.dismissed
    out.sync = { ...out.sync, rev: { ...out.sync.rev, [settingsKey]: localSettingsTs } }
  }
  return out
}

export function useStore(): Store {
  const ctx = useContext(StoreContext)
  if (!ctx) throw new Error('useStore must be used inside StoreProvider')
  return ctx
}

// ---------------------------------------------------------------------------
// Backup / restore
// ---------------------------------------------------------------------------

export function exportData(data: AppData) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `forge-backup-${todayISO()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function importData(file: File): Promise<AppData> {
  const text = await file.text()
  const parsed = JSON.parse(text) as Partial<AppData>
  if (!parsed || typeof parsed !== 'object') throw new Error('That file is not a Forge backup.')
  return migrate(parsed)
}

/** CSV export, for spreadsheets or moving into another tool later. */
export function exportCsv(data: AppData) {
  const rows: string[][] = [['type', 'date', 'name', 'field1', 'field2', 'field3', 'field4']]
  for (const w of data.workouts) {
    for (const e of w.exercises) {
      for (const s of e.sets) {
        rows.push(['set', w.date, e.exerciseId, String(s.reps), String(s.weight), s.rpe ? String(s.rpe) : '', s.warmup ? 'warmup' : ''])
      }
    }
  }
  for (const r of data.runs) rows.push(['run', r.date, r.type, String(r.distanceMi), String(r.seconds), r.avgHr ? String(r.avgHr) : '', ''])
  for (const b of data.body)
    rows.push(['body', b.date, '', b.weightLb ? String(b.weightLb) : '', b.bodyFatPct ? String(b.bodyFatPct) : '', b.waistIn ? String(b.waistIn) : '', b.neckIn ? String(b.neckIn) : ''])
  const csv = rows.map((r) => r.map((c) => (c.includes(',') ? `"${c}"` : c)).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `forge-export-${todayISO()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
