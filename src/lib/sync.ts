import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppData, BodyEntry, Exercise, Run, Workout, WorkoutTemplate } from './types'

/**
 * Cross-device sync against a Supabase project.
 *
 * The design goal is that two devices used the same day never lose data. Rather
 * than pushing the whole document (where the last device to sync wins and the
 * other's sessions vanish), every workout, run, body entry, template and the
 * settings blob is its own record with its own timestamp. Sync pulls all
 * records, merges each one by timestamp, then pushes back only what is locally
 * newer. Deletions travel as tombstones so they propagate instead of the record
 * being resurrected by the other device.
 *
 * Everything lives in a single `records` table (see supabase/schema.sql) keyed
 * by (user_id, tbl, id), which keeps the schema stable as the app's own types
 * evolve and makes the row-level security policy a one-liner.
 */

export type SyncTable = 'workouts' | 'runs' | 'body' | 'customExercises' | 'templates' | 'settings'

/** Tables that are plain lists of records with `id` fields. */
const LIST_TABLES = ['workouts', 'runs', 'body', 'customExercises', 'templates'] as const
type ListTable = (typeof LIST_TABLES)[number]

/** The single id used for the settings record (profile + goals + dismissals). */
const SETTINGS_ID = 'main'

/**
 * Timestamp assumed for records that predate sync being switched on. It is
 * older than any real edit, so a record that exists on both devices resolves to
 * whichever side has an actual edit recorded.
 */
const BACKFILL_TS = '2000-01-01T00:00:00.000Z'

const CONFIG_KEY = 'forge.sync.config'
const AUTO_KEY = 'forge.sync.auto'
const TABLE = 'records'

/**
 * Ceiling on each request. Without it, an unreachable host (a paused project, a
 * captive-portal wifi) can leave sync spinning indefinitely with no feedback.
 */
const REQUEST_TIMEOUT_MS = 20_000

export interface SyncConfig {
  url: string
  anonKey: string
}

export interface RemoteRow {
  tbl: SyncTable
  id: string
  payload: unknown
  /** Normalised to `new Date().toISOString()` form so string compares are valid. */
  updated_at: string
  deleted: boolean
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Project credentials come from the build environment when present, and can be
 * overridden at runtime from Settings — so an already-deployed copy of the app
 * can be pointed at a project without rebuilding. The anon key is designed to
 * be public; row-level security is what protects the data.
 */
export function getSyncConfig(): SyncConfig | null {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as SyncConfig
      if (parsed.url && parsed.anonKey) return parsed
    }
  } catch {
    /* fall through to the build-time values */
  }
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  return url && anonKey ? { url, anonKey } : null
}

export function setSyncConfig(config: SyncConfig | null) {
  if (config) localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
  else localStorage.removeItem(CONFIG_KEY)
  cached = null
}

export function isSyncConfigured(): boolean {
  return getSyncConfig() !== null
}

/** Auto-sync is per-device, so it is not part of the synced document. */
export function getAutoSync(): boolean {
  return localStorage.getItem(AUTO_KEY) !== 'off'
}

export function setAutoSync(on: boolean) {
  localStorage.setItem(AUTO_KEY, on ? 'on' : 'off')
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

let cached: { key: string; client: Promise<SupabaseClient> } | null = null

/**
 * The Supabase SDK is imported on demand — it is a large dependency and the app
 * is fully usable without ever turning sync on.
 */
export async function getClient(): Promise<SupabaseClient> {
  const config = getSyncConfig()
  if (!config) throw new Error('Sync is not configured yet.')
  const key = `${config.url}|${config.anonKey}`
  if (cached?.key !== key) {
    cached = {
      key,
      client: import('@supabase/supabase-js').then(({ createClient }) =>
        createClient(config.url, config.anonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            // Picks up the session from the magic-link redirect fragment.
            detectSessionInUrl: true,
            storageKey: 'forge.sync.auth',
          },
        }),
      ),
    }
  }
  return cached.client
}

export async function currentUser(): Promise<{ id: string; email?: string } | null> {
  if (!isSyncConfigured()) return null
  const client = await getClient()
  const { data } = await client.auth.getSession()
  const user = data.session?.user
  return user ? { id: user.id, email: user.email ?? undefined } : null
}

/** Sends a passwordless sign-in email (link, plus a code if the template has one). */
export async function sendSignInEmail(email: string): Promise<void> {
  const client = await getClient()
  const { error } = await client.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: window.location.href.split('#')[0] },
  })
  if (error) throw new Error(describe(error.message))
}

/** Completes sign-in with the 6-digit code, for devices where links are awkward. */
export async function verifySignInCode(email: string, code: string): Promise<void> {
  const client = await getClient()
  const { error } = await client.auth.verifyOtp({
    email: email.trim(),
    token: code.trim(),
    type: 'email',
  })
  if (error) throw new Error(describe(error.message))
}

export async function signOutSync(): Promise<void> {
  const client = await getClient()
  await client.auth.signOut()
}

// ---------------------------------------------------------------------------
// Record extraction and application
// ---------------------------------------------------------------------------

export function recordKey(tbl: SyncTable, id: string): string {
  return `${tbl}:${id}`
}

export function emptySyncMeta() {
  return { rev: {} as Record<string, string>, deleted: {} as Record<string, string> }
}

function listOf(data: AppData, tbl: ListTable): { id: string }[] {
  switch (tbl) {
    case 'workouts':
      return data.workouts
    case 'runs':
      return data.runs
    case 'body':
      return data.body
    case 'customExercises':
      return data.customExercises
    case 'templates':
      return data.templates
  }
}

function setList(data: AppData, tbl: ListTable, items: unknown[]) {
  switch (tbl) {
    case 'workouts':
      data.workouts = items as Workout[]
      break
    case 'runs':
      data.runs = items as Run[]
      break
    case 'body':
      data.body = items as BodyEntry[]
      break
    case 'customExercises':
      data.customExercises = items as Exercise[]
      break
    case 'templates':
      data.templates = items as WorkoutTemplate[]
      break
  }
}

interface LocalRecord {
  tbl: SyncTable
  id: string
  payload: unknown
}

/** Every syncable record in the local document. */
export function localRecords(data: AppData): LocalRecord[] {
  const out: LocalRecord[] = []
  for (const tbl of LIST_TABLES) {
    for (const item of listOf(data, tbl)) out.push({ tbl, id: item.id, payload: item })
  }
  out.push({
    tbl: 'settings',
    id: SETTINGS_ID,
    payload: { profile: data.profile, goals: data.goals, dismissed: data.dismissed },
  })
  return out
}

function existsLocally(data: AppData, tbl: SyncTable, id: string): boolean {
  if (tbl === 'settings') return true // settings always exist
  return listOf(data, tbl).some((i) => i.id === id)
}

function applyRemote(data: AppData, row: RemoteRow) {
  if (row.tbl === 'settings') {
    const p = row.payload as Partial<Pick<AppData, 'profile' | 'goals' | 'dismissed'>>
    if (p?.profile) data.profile = { ...data.profile, ...p.profile }
    if (p?.goals) data.goals = { ...data.goals, ...p.goals }
    if (p?.dismissed) data.dismissed = p.dismissed
    return
  }
  const items = [...listOf(data, row.tbl as ListTable)]
  const idx = items.findIndex((i) => i.id === row.id)
  const value = row.payload as { id: string }
  if (idx >= 0) items[idx] = value
  else items.push(value)
  setList(data, row.tbl as ListTable, items)
}

function removeLocal(data: AppData, tbl: SyncTable, id: string) {
  if (tbl === 'settings') return // settings are never deleted
  setList(
    data,
    tbl as ListTable,
    listOf(data, tbl as ListTable).filter((i) => i.id !== id),
  )
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

/**
 * Applies remote rows that are newer than the local copy of the same record.
 * Local-only records and locally-newer edits are left untouched — they get
 * pushed afterwards.
 */
export function mergeRows(local: AppData, rows: RemoteRow[]): { data: AppData; applied: number } {
  const next: AppData = structuredClone(local)
  next.sync = { ...next.sync, rev: { ...next.sync.rev }, deleted: { ...next.sync.deleted } }
  let applied = 0

  for (const row of rows) {
    const key = recordKey(row.tbl, row.id)
    const recordedTs = next.sync.rev[key] ?? next.sync.deleted[key]
    // A record with no recorded revision but which exists locally predates sync.
    const localTs = recordedTs ?? (existsLocally(next, row.tbl, row.id) ? BACKFILL_TS : null)
    if (localTs !== null && row.updated_at <= localTs) continue

    if (row.deleted) {
      removeLocal(next, row.tbl, row.id)
      delete next.sync.rev[key]
      next.sync.deleted[key] = row.updated_at
    } else {
      applyRemote(next, row)
      next.sync.rev[key] = row.updated_at
      delete next.sync.deleted[key]
    }
    applied++
  }
  return { data: next, applied }
}

/** Records whose local timestamp is ahead of the remote copy (or absent there). */
export function rowsToPush(data: AppData, remote: Map<string, string>): RemoteRow[] {
  const out: RemoteRow[] = []
  for (const rec of localRecords(data)) {
    const key = recordKey(rec.tbl, rec.id)
    const ts = data.sync.rev[key] ?? BACKFILL_TS
    const remoteTs = remote.get(key)
    if (remoteTs === undefined || ts > remoteTs) {
      out.push({ tbl: rec.tbl, id: rec.id, payload: rec.payload, updated_at: ts, deleted: false })
    }
  }
  for (const [key, ts] of Object.entries(data.sync.deleted)) {
    const sep = key.indexOf(':')
    const tbl = key.slice(0, sep) as SyncTable
    const id = key.slice(sep + 1)
    const remoteTs = remote.get(key)
    if (remoteTs === undefined || ts > remoteTs) {
      out.push({ tbl, id, payload: null, updated_at: ts, deleted: true })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// The sync round trip
// ---------------------------------------------------------------------------

export interface SyncResult {
  data: AppData
  pulled: number
  applied: number
  pushed: number
  at: string
}

export async function runSync(local: AppData): Promise<SyncResult> {
  const client = await getClient()
  const { data: sessionData } = await client.auth.getSession()
  const userId = sessionData.session?.user.id
  if (!userId) throw new Error('Sign in to sync.')

  // 1. Pull everything. A personal training history is small — a year of daily
  //    logging is well under a megabyte — so a full pull is simpler and more
  //    robust than a watermark, with no risk of missing a row after clock skew.
  const { data: raw, error } = await client
    .from(TABLE)
    .select('tbl,id,payload,updated_at,deleted')
    .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS))
  if (error) throw new Error(describe(error.message))

  const rows: RemoteRow[] = (raw ?? []).map((r) => ({
    tbl: r.tbl as SyncTable,
    id: r.id as string,
    payload: r.payload,
    // Postgres renders timestamptz differently from Date#toISOString, and these
    // values get compared as strings — so normalise before doing that.
    updated_at: new Date(r.updated_at as string).toISOString(),
    deleted: !!r.deleted,
  }))

  // 2. Merge remote into local.
  const { data: merged, applied } = mergeRows(local, rows)

  // 3. Push what is locally newer.
  const remoteMap = new Map(rows.map((r) => [recordKey(r.tbl, r.id), r.updated_at]))
  const pushes = rowsToPush(merged, remoteMap)

  for (let i = 0; i < pushes.length; i += 400) {
    const chunk = pushes.slice(i, i + 400).map((r) => ({ ...r, user_id: userId }))
    const { error: pushError } = await client
      .from(TABLE)
      .upsert(chunk, { onConflict: 'user_id,tbl,id' })
      .abortSignal(AbortSignal.timeout(REQUEST_TIMEOUT_MS))
    if (pushError) throw new Error(describe(pushError.message))
  }

  const at = new Date().toISOString()
  return {
    data: { ...merged, sync: { ...merged.sync, lastSyncedAt: at } },
    pulled: rows.length,
    applied,
    pushed: pushes.length,
    at,
  }
}

/** Turns the most common Supabase errors into something actionable. */
function describe(message: string): string {
  if (/relation .*records.* does not exist/i.test(message) || /Could not find the table/i.test(message)) {
    return 'The records table is missing — run supabase/schema.sql in your project\'s SQL editor.'
  }
  if (/row-level security/i.test(message)) {
    return 'Blocked by row-level security — re-run the policy section of supabase/schema.sql.'
  }
  if (/Failed to fetch|NetworkError|ERR_NAME_NOT_RESOLVED|fetch failed/i.test(message)) {
    return 'Could not reach the project. Check the URL, your connection, or whether a paused free project needs restoring.'
  }
  if (/Invalid API key|JWSError|invalid signature/i.test(message)) {
    return 'That anon key was rejected. Copy it again from Supabase → Settings → API.'
  }
  if (/abort|timed? ?out|timeout/i.test(message)) {
    return 'The project did not respond in time. It may be paused on the free tier — restore it from the Supabase dashboard, or try again on a better connection.'
  }
  if (/rate limit|too many requests/i.test(message)) {
    return 'Supabase is rate-limiting sign-in emails (a few per hour on the free tier). Wait a little and try again.'
  }
  return message
}

/**
 * How many local records have changed since the last successful sync. Drives the
 * "N changes waiting" message, so an offline session never leaves you wondering
 * whether the work made it off the device.
 */
export function pendingChangeCount(data: AppData): number {
  const since = data.sync.lastSyncedAt
  if (!since) return localRecords(data).length + Object.keys(data.sync.deleted).length
  let n = 0
  for (const ts of Object.values(data.sync.rev)) if (ts > since) n++
  for (const ts of Object.values(data.sync.deleted)) if (ts > since) n++
  return n
}

/**
 * Stamps every record as changed. Used after importing a backup so the imported
 * history is treated as the newest version and propagates to other devices.
 */
export function stampAllRecords(data: AppData): AppData {
  const now = new Date().toISOString()
  const rev: Record<string, string> = {}
  for (const rec of localRecords(data)) rev[recordKey(rec.tbl, rec.id)] = now
  return { ...data, sync: { ...data.sync, rev, deleted: { ...data.sync.deleted } } }
}
