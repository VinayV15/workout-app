import { useStore } from '../lib/store'
import { setSkipRestore } from '../lib/firstRun'
import { Button, Card } from '../components/ui'
import SignInForm from '../components/SignInForm'

/**
 * The launch gate for a device with no data of its own.
 *
 * This is the screen that was missing: sync keeps the training history in the
 * project, but a fresh browser — or an installed iOS app, which gets its own
 * storage separate from the Safari tab it was added from — starts out empty, and
 * without somewhere to sign in the only visible path was to type everything again
 * as a new user.
 */
export default function Welcome({ onStartFresh }: { onStartFresh: () => void }) {
  const { sync, syncNow, refreshSyncStatus } = useStore()

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Forge</h1>
        <p className="mt-1 text-sm text-ink-2">
          Sign in to load your training history onto this device, or set it up as a new log.
        </p>
      </div>

      {sync.error && (
        <p className="mb-4 rounded-xl border border-critical/40 bg-critical/10 p-3 text-xs leading-relaxed text-ink-2">
          {sync.error}
        </p>
      )}

      <Card className="space-y-4">
        <SignInForm
          autoFocus
          onSignedIn={async () => {
            // Pull immediately: the point of signing in here is to get the data
            // back, and the app decides whether this is a new user from what
            // lands locally.
            await refreshSyncStatus()
            await syncNow()
          }}
        />
      </Card>

      <div className="mt-5 border-t border-line pt-4">
        <Button
          variant="ghost"
          className="w-full"
          onClick={() => {
            setSkipRestore(true)
            onStartFresh()
          }}
        >
          Set up as a new log instead
        </Button>
        <p className="mt-2 text-center text-[11px] leading-relaxed text-ink-3">
          No account needed — everything stays on this device. You can sign in later from Settings.
        </p>
      </div>
    </div>
  )
}
