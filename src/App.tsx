import { Suspense, lazy, useEffect, useState } from 'react'
import { StoreProvider, useStore } from './lib/store'
import { accentVars } from './lib/accent'
import Dashboard from './screens/Dashboard'
import Onboarding from './screens/Onboarding'
import Welcome from './screens/Welcome'
import { getSkipRestore, launchView } from './lib/firstRun'

/**
 * Screens beyond Today are split into their own bundles.
 *
 * Today is what launches, and it is the only screen that has to be in the first
 * download. The rest bring real weight with them — the exercise guides and their pose
 * tables are ~70KB of data, the mesh builders another ~60KB, and the chart library
 * rides along with whichever loads first. Shipping all of it to open a screen showing
 * one card was most of the payload.
 *
 * They are then prefetched during the first idle moment, so by the time a tab is
 * tapped the chunk is already in cache and the split costs nothing at the tap. On a
 * dead connection the service worker has precached them anyway, which is what keeps
 * offline launch intact.
 */
const Lift = lazy(() => import('./screens/Lift'))
const RunScreen = lazy(() => import('./screens/Run'))
const Body = lazy(() => import('./screens/Body'))
const Coach = lazy(() => import('./screens/Coach'))
const Settings = lazy(() => import('./screens/Settings'))

const PREFETCH = [
  // The chart library first: Today draws one, so it is the chunk most likely to be
  // wanted within seconds of launch.
  () => import('./components/TimeSeriesChart'),
  () => import('./screens/Lift'),
  () => import('./screens/Run'),
  () => import('./screens/Body'),
  () => import('./screens/Coach'),
  () => import('./screens/Settings'),
]

/** Runs after the first paint has settled, without blocking it. */
function onIdle(fn: () => void): () => void {
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback
  if (ric) {
    const id = ric(fn)
    return () => (window as Window & { cancelIdleCallback?: (h: number) => void }).cancelIdleCallback?.(id)
  }
  // Safari only got requestIdleCallback recently, so fall back to a timer well
  // after first paint.
  const t = window.setTimeout(fn, 1500)
  return () => window.clearTimeout(t)
}

/**
 * Held for the moment a screen's bundle is in flight. Deliberately almost nothing:
 * after the idle prefetch this is never seen, and a spinner that flashes for 40ms
 * reads worse than a blank space that does not.
 */
function ScreenLoading() {
  return <div className="min-h-[60dvh]" aria-busy="true" />
}

type Tab = 'today' | 'lift' | 'run' | 'body' | 'coach' | 'settings'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'today', label: 'Today', icon: '◎' },
  { id: 'lift', label: 'Lift', icon: '▤' },
  { id: 'run', label: 'Run', icon: '➤' },
  { id: 'body', label: 'Body', icon: '◔' },
  { id: 'coach', label: 'Coach', icon: '✦' },
]

/**
 * Home-screen icon shortcuts launch with `?go=lift` and friends, so a long-press
 * can jump straight to logging.
 */
function initialTab(): Tab {
  const go = new URLSearchParams(window.location.search).get('go')
  return TABS.some((t) => t.id === go) ? (go as Tab) : 'today'
}

/** Held while the launch pull is in flight, so setup never flashes over it. */
function Restoring() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6 text-center">
      <div className="text-lg font-semibold tracking-tight">Forge</div>
      <p className="text-sm text-ink-2">Loading your training log…</p>
    </div>
  )
}

function Shell() {
  const { data, sync } = useStore()
  const [tab, setTab] = useState<Tab>(initialTab)
  const [startFresh, setStartFresh] = useState(getSkipRestore)
  const hasLocalData = !!data.profile.heightIn || data.body.length > 0 || data.workouts.length > 0
  // `email` is only set once a session has been confirmed, which makes it a
  // truer test than the phase — an expired link leaves an error phase with no
  // session, and that user still needs the sign-in gate rather than setup.
  const signedIn = !!sync.email

  /*
    The user's accent, applied to the document root so every `var(--accent)` in the
    app follows it — including the ambient light pools painted on `body`, which is
    what makes changing it re-tint the glass rather than just the buttons.

    Set on the root element rather than compiled into the stylesheet because it is a
    per-user value living in the synced document: it has to be applied after the data
    loads, and re-applied the moment it changes on another device.
  */
  useEffect(() => {
    const root = document.documentElement
    for (const [k, v] of Object.entries(accentVars(data.profile.accentHex))) {
      root.style.setProperty(k, v)
    }
  }, [data.profile.accentHex])

  // Pull the other screens down in the background, so splitting them costs nothing
  // at the tap. Deliberately after the launch pull has settled — competing with the
  // sync request for bandwidth would delay the thing the user is waiting for.
  useEffect(() => {
    if (!sync.bootstrapped) return
    return onIdle(() => {
      for (const load of PREFETCH) void load()
    })
  }, [sync.bootstrapped])

  // Keyboard shortcuts on desktop: 1–5 jump between tabs.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const target = e.target as HTMLElement
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return
      const idx = Number(e.key) - 1
      if (idx >= 0 && idx < TABS.length) setTab(TABS[idx].id)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const view = launchView({
    hasLocalData,
    syncConfigured: sync.phase !== 'off',
    bootstrapped: sync.bootstrapped,
    syncing: sync.phase === 'syncing',
    signedIn,
    startFresh,
  })
  if (view === 'restoring') return <Restoring />
  if (view === 'welcome') return <Welcome onStartFresh={() => setStartFresh(true)} />
  if (view === 'onboarding') return <Onboarding />

  return (
    <div className="min-h-dvh sm:flex">
      {/* The light the glass refracts. Behind everything, pinned to the viewport. */}
      <div className="ambience" aria-hidden />

      {/* Desktop sidebar */}
      <nav className="no-print sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-line/70 px-3 py-5 backdrop-blur-xl sm:flex">
        <div className="mb-6 px-2">
          <div className="text-lg font-semibold tracking-tight">Forge</div>
          <div className="text-[11px] text-ink-3">{data.profile.name ? data.profile.name : 'Training log'}</div>
        </div>
        <div className="space-y-1">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`relative flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-sm transition-[background-color,color] duration-150 ${
                tab === t.id ? 'font-medium text-ink' : 'text-ink-2 hover:bg-surface-2/60 hover:text-ink'
              }`}
              style={
                tab === t.id
                  ? {
                      background:
                        'linear-gradient(176deg, color-mix(in oklab, var(--accent) 26%, transparent), color-mix(in oklab, var(--accent) 12%, transparent))',
                      boxShadow: 'inset 0 1px 0 var(--pane-highlight)',
                    }
                  : undefined
              }
            >
              <span
                aria-hidden
                className="w-4 text-center"
                style={{ color: tab === t.id ? 'var(--accent)' : 'var(--text-muted)' }}
              >
                {t.icon}
              </span>
              {t.label}
              <span className="ml-auto text-[10px] text-ink-3">{i + 1}</span>
            </button>
          ))}
        </div>
        <button
          onClick={() => setTab('settings')}
          className={`mt-auto flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-sm transition-[background-color,color] duration-150 ${
            tab === 'settings' ? 'bg-surface-2/70 font-medium text-ink' : 'text-ink-2 hover:bg-surface-2/60 hover:text-ink'
          }`}
        >
          <span aria-hidden className="w-4 text-center text-ink-3">
            ⚙
          </span>
          Settings
        </button>
      </nav>

      {/*
        Bottom padding clears the floating bar rather than sitting behind it: the bar
        is 60px tall, inset 14px from the bottom, and the home-indicator inset sits
        below that again. Getting this wrong is what leaves the last card of a screen
        permanently unreachable under the nav.
      */}
      <main className="min-w-0 flex-1 pb-[calc(96px+env(safe-area-inset-bottom))] sm:pb-8">
        {/* Mobile header */}
        <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-[color:var(--glass-border)] bg-[color:var(--glass-bg)] px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur-xl backdrop-saturate-150 sm:hidden">
          <span className="text-[17px] font-semibold tracking-tight">
            {TABS.find((t) => t.id === tab)?.label ?? 'Settings'}
          </span>
          <button
            onClick={() => setTab('settings')}
            className="-mr-1 flex h-9 w-9 items-center justify-center rounded-full text-ink-3 transition active:scale-95"
            aria-label="Settings"
          >
            ⚙
          </button>
        </header>

        {/* `key` on the tab so the entry animation replays on every switch. */}
        <div key={tab} className="screen-in mx-auto max-w-3xl px-4 py-4 sm:px-6 sm:py-7">
          <Suspense fallback={<ScreenLoading />}>
            {tab === 'today' && <Dashboard onNavigate={setTab} />}
            {tab === 'lift' && <Lift />}
            {tab === 'run' && <RunScreen />}
            {tab === 'body' && <Body />}
            {tab === 'coach' && <Coach onNavigate={setTab} />}
            {tab === 'settings' && <Settings />}
          </Suspense>
        </div>
      </main>

      {/*
        Floating glass tab bar.

        Inset from all three edges so the page's content scrolls visibly underneath
        it — which is the entire point of the material, and impossible with the
        edge-to-edge bar this replaces: a bar welded to the bottom of the screen has
        nothing passing behind it to refract.

        `pointer-events-none` on the positioning wrapper so the gap either side of
        the pill does not swallow taps meant for the content beneath.
      */}
      <div className="no-print pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:hidden">
        <nav className="glass nav-float specular pointer-events-auto flex w-full max-w-md items-stretch gap-0.5 p-1.5">
          {TABS.map((t) => {
            const active = tab === t.id
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                aria-current={active ? 'page' : undefined}
                className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-full py-2 text-[10px] font-medium transition-[color,transform] duration-150 active:scale-95 ${
                  active ? 'text-ink' : 'text-ink-3'
                }`}
              >
                {/* The accent pill sits behind the label, tinted rather than solid so
                    the glass underneath still shows through it. */}
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-0 rounded-full"
                    style={{
                      background:
                        'linear-gradient(176deg, color-mix(in oklab, var(--accent) 34%, transparent), color-mix(in oklab, var(--accent) 14%, transparent))',
                      boxShadow: 'inset 0 1px 0 var(--pane-highlight)',
                    }}
                  />
                )}
                <span
                  aria-hidden
                  className="relative text-[17px] leading-none"
                  style={active ? { color: 'var(--accent)' } : undefined}
                >
                  {t.icon}
                </span>
                <span className="relative truncate">{t.label}</span>
              </button>
            )
          })}
        </nav>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  )
}
