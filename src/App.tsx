import { useEffect, useState } from 'react'
import { StoreProvider, useStore } from './lib/store'
import Dashboard from './screens/Dashboard'
import Lift from './screens/Lift'
import RunScreen from './screens/Run'
import Body from './screens/Body'
import Coach from './screens/Coach'
import Settings from './screens/Settings'
import Onboarding from './screens/Onboarding'
import Welcome from './screens/Welcome'
import { getSkipRestore, launchView } from './lib/firstRun'

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
      {/* Desktop sidebar */}
      <nav className="no-print sticky top-0 hidden h-dvh w-52 shrink-0 flex-col border-r border-line px-3 py-5 sm:flex">
        <div className="mb-6 px-2">
          <div className="text-lg font-semibold tracking-tight">Forge</div>
          <div className="text-[11px] text-ink-3">{data.profile.name ? data.profile.name : 'Training log'}</div>
        </div>
        <div className="space-y-1">
          {TABS.map((t, i) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition ${
                tab === t.id ? 'bg-surface-2 font-medium text-ink' : 'text-ink-2 hover:text-ink'
              }`}
            >
              <span aria-hidden className="w-4 text-center text-ink-3">
                {t.icon}
              </span>
              {t.label}
              <span className="ml-auto text-[10px] text-ink-3">{i + 1}</span>
            </button>
          ))}
        </div>
        <button
          onClick={() => setTab('settings')}
          className={`mt-auto flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition ${
            tab === 'settings' ? 'bg-surface-2 font-medium text-ink' : 'text-ink-2 hover:text-ink'
          }`}
        >
          <span aria-hidden className="w-4 text-center text-ink-3">
            ⚙
          </span>
          Settings
        </button>
      </nav>

      <main className="min-w-0 flex-1 pb-24 sm:pb-8">
        {/* Mobile header */}
        <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-line bg-page/85 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur sm:hidden">
          <span className="text-base font-semibold tracking-tight">
            {TABS.find((t) => t.id === tab)?.label ?? 'Settings'}
          </span>
          <button
            onClick={() => setTab('settings')}
            className="rounded-lg px-2 py-1 text-ink-3"
            aria-label="Settings"
          >
            ⚙
          </button>
        </header>

        <div className="mx-auto max-w-3xl px-4 py-4 sm:px-6 sm:py-7">
          {tab === 'today' && <Dashboard onNavigate={setTab} />}
          {tab === 'lift' && <Lift />}
          {tab === 'run' && <RunScreen />}
          {tab === 'body' && <Body />}
          {tab === 'coach' && <Coach onNavigate={setTab} />}
          {tab === 'settings' && <Settings />}
        </div>
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="no-print fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-page/90 pb-[max(0.4rem,env(safe-area-inset-bottom))] backdrop-blur sm:hidden">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition ${
              tab === t.id ? 'text-ink' : 'text-ink-3'
            }`}
          >
            <span aria-hidden className="text-base leading-none" style={tab === t.id ? { color: 'var(--series-1)' } : undefined}>
              {t.icon}
            </span>
            {t.label}
          </button>
        ))}
      </nav>
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
