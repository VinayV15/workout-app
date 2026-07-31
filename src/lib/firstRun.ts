const SKIP_KEY = 'forge.firstRun.local'

/**
 * Whether this device has been told to skip the restore prompt and set up as a
 * fresh log.
 *
 * It has to outlive a reload: between choosing "set up as new" and finishing the
 * questions there is no saved data yet, so without a sticky flag a refresh would
 * drop the user back on the sign-in gate they just dismissed.
 */
export function getSkipRestore(): boolean {
  try {
    return localStorage.getItem(SKIP_KEY) === 'on'
  } catch {
    return false
  }
}

export function setSkipRestore(on: boolean) {
  try {
    if (on) localStorage.setItem(SKIP_KEY, 'on')
    else localStorage.removeItem(SKIP_KEY)
  } catch {
    /* private browsing with storage denied — the gate simply shows again */
  }
}

export type LaunchView = 'app' | 'restoring' | 'welcome' | 'onboarding'

/**
 * Which screen a launch should land on.
 *
 * Pulled out of the component because the branches are what got this wrong: an
 * empty device was read as "new user" and dropped straight into first-run setup,
 * so a returning user on a new browser — or in the installed iOS app, which gets
 * storage separate from the Safari tab it was added from — had to retype
 * everything, every launch.
 */
export function launchView(input: {
  /** Anything worth keeping already on this device. */
  hasLocalData: boolean
  syncConfigured: boolean
  /** The launch session check and first pull have settled. */
  bootstrapped: boolean
  syncing: boolean
  signedIn: boolean
  /** This device chose to set up a local-only log. */
  startFresh: boolean
}): LaunchView {
  // Local data always wins: the app is offline-first, so it must open straight
  // into the log even when the project is unreachable or a pull is still running.
  if (input.hasLocalData) return 'app'
  if (!input.syncConfigured || input.startFresh) return 'onboarding'
  // Data may still be on its way; showing setup now would invite a second,
  // conflicting profile.
  if (!input.bootstrapped || input.syncing) return 'restoring'
  if (!input.signedIn) return 'welcome'
  // Signed in, pull finished, still nothing — a genuinely new account.
  return 'onboarding'
}
