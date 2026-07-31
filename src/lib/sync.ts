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
 * Everything lives in a single `records` table (see supabase/migrations/) keyed
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
            // The redirect is handled explicitly by completeSignInFromUrl below,
            // rather than relying on the SDK to notice it during construction.
            // The client here is created lazily, so "on construction" is not a
            // well-defined moment relative to page load.
            detectSessionInUrl: false,
            // Implicit rather than PKCE: PKCE requires the code verifier stored
            // when the link was requested to still be present in the same browser
            // profile when the link is opened. Mail clients, "open in app"
            // handoffs and private windows all break that, and the failure looks
            // like a silent no-op. Implicit returns the tokens on the redirect
            // itself, which is self-contained. They are stripped from the URL as
            // soon as they are consumed.
            flowType: 'implicit',
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

/**
 * Password sign-in.
 *
 * Preferred over the magic link on a phone: no mail round trip, no single-use
 * token that a mail app's link preview can consume, and it behaves identically in
 * the installed app and the browser. The link flow stays available as a recovery
 * path for a forgotten password.
 */
export async function signInWithPassword(email: string, password: string): Promise<void> {
  const client = await getClient()
  const { error } = await client.auth.signInWithPassword({ email: email.trim(), password })
  if (error) throw new Error(describe(error.message))
}

/**
 * Creates an account.
 *
 * With "Confirm email" switched off in the Supabase project this returns a usable
 * session straight away and no email is ever sent. With it on, the account is
 * created but unusable until the address is confirmed — the two outcomes need
 * different things from the user, so they are reported separately rather than
 * both looking like success.
 */
export async function signUpWithPassword(
  email: string,
  password: string,
): Promise<'signed-in' | 'confirm-email'> {
  if (password.length < 8) throw new Error('Use at least 8 characters for the password.')
  const client = await getClient()
  const { data, error } = await client.auth.signUp({ email: email.trim(), password })
  if (error) throw new Error(describe(error.message))
  return data.session ? 'signed-in' : 'confirm-email'
}

export async function signOutSync(): Promise<void> {
  const client = await getClient()
  await client.auth.signOut()
}

/** Strips auth material from the address bar without reloading the page. */
function clearAuthFromUrl() {
  const url = new URL(window.location.href)
  for (const key of ['code', 'error', 'error_code', 'error_description', 'sb']) {
    url.searchParams.delete(key)
  }
  url.hash = ''
  window.history.replaceState({}, '', url.pathname + (url.search || '') + '')
}

/**
 * Completes a sign-in that arrived on the URL, and reports what happened.
 *
 * Called explicitly at startup rather than leaving it to the SDK's
 * `detectSessionInUrl`. That option acts when the client is constructed, and this
 * client is constructed lazily — so whether it ran before or after the app read
 * the session depended on timing. When it lost that race the link appeared to do
 * nothing at all: the app opened, the tokens were discarded, and the user was
 * still signed out with no explanation.
 *
 * Returns 'signed-in' when a session was established, 'none' when the URL carried
 * nothing, and throws with a readable message when the link itself was rejected.
 */
export async function completeSignInFromUrl(): Promise<'signed-in' | 'none'> {
  if (!isSyncConfigured()) return 'none'

  const hash = window.location.hash.startsWith('#') ? window.location.hash.slice(1) : ''
  const fromHash = new URLSearchParams(hash)
  const fromQuery = new URLSearchParams(window.location.search)
  const pick = (key: string) => fromHash.get(key) ?? fromQuery.get(key)

  // Supabase reports a rejected link as an error on the redirect, which must be
  // surfaced — an expired link is the single most common thing to go wrong here.
  const errorDescription = pick('error_description') ?? pick('error')
  if (errorDescription) {
    clearAuthFromUrl()
    throw new Error(describe(errorDescription.replace(/\+/g, ' ')))
  }

  const accessToken = pick('access_token')
  const refreshToken = pick('refresh_token')
  const code = fromQuery.get('code')
  if (!accessToken && !code) return 'none'

  const client = await getClient()
  if (accessToken && refreshToken) {
    const { error } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
    if (error) {
      clearAuthFromUrl()
      throw new Error(describe(error.message))
    }
  } else if (code) {
    // Still handled, so a link minted under the previous PKCE configuration is
    // not simply ignored.
    const { error } = await client.auth.exchangeCodeForSession(code)
    if (error) {
      clearAuthFromUrl()
      throw new Error(describe(error.message))
    }
  }
  clearAuthFromUrl()
  return 'signed-in'
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
/** Exported under a clearer name for tests. */
export { describe as describeSyncError }

function describe(message: string): string {
  if (/relation .*records.* does not exist/i.test(message) || /Could not find the table/i.test(message)) {
    return 'The records table is missing — apply the migration in supabase/migrations/ to your project.'
  }
  if (/row-level security/i.test(message)) {
    return 'Blocked by row-level security — re-run the policy section of the migration in supabase/migrations/.'
  }
  if (/Failed to fetch|NetworkError|ERR_NAME_NOT_RESOLVED|fetch failed/i.test(message)) {
    return 'Could not reach the project. Check the URL, your connection, or whether a paused free project needs restoring.'
  }
  if (/Invalid API key|JWSError|invalid signature/i.test(message)) {
    return 'That anon key was rejected. Copy it again from Supabase → Settings → API.'
  }
  if (/otp_expired|Email link is invalid or has expired/i.test(message)) {
    return 'That sign-in link was already used or has expired. Request a new one — and if your mail app previews links, use the 6-digit code instead, because a preview consumes the link.'
  }
  if (/access_denied/i.test(message)) {
    return 'That sign-in link was rejected. Request a new one.'
  }
  if (/both auth code and code verifier|flow ?state|code verifier/i.test(message)) {
    return 'This link was opened in a different browser from the one that requested it. Request a new link and open it in the same browser, or use the 6-digit code.'
  }
  if (/abort|timed? ?out|timeout/i.test(message)) {
    return 'The project did not respond in time. It may be paused on the free tier — restore it from the Supabase dashboard, or try again on a better connection.'
  }
  if (/Invalid login credentials/i.test(message)) {
    return 'That email and password do not match an account. If you have not made one yet, use "Create account".'
  }
  if (/User already registered|already been registered/i.test(message)) {
    return 'An account already exists for that email — sign in instead, or use a sign-in link if you have forgotten the password.'
  }
  if (/Email not confirmed/i.test(message)) {
    return 'This account still needs its email confirmed. Either open the confirmation email, or turn off Authentication → Sign In / Providers → "Confirm email" in Supabase.'
  }
  if (/Signups not allowed|signup is disabled|Email signups are disabled/i.test(message)) {
    return 'New accounts are switched off for this project. Re-enable signups in Supabase → Authentication → Sign In / Providers.'
  }
  if (/Password should be at least/i.test(message)) {
    return 'That password is too short for this project\u2019s minimum length.'
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
