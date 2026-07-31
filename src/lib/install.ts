/**
 * Home-screen install support.
 *
 * Chromium fires `beforeinstallprompt` once, shortly after load — long before
 * the user opens Settings. A listener mounted with that screen would miss it and
 * the install button would never appear, so the event is captured at startup
 * here and held for whoever asks later.
 */

export interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let captured: InstallPromptEvent | null = null
let installed = false
const listeners = new Set<() => void>()

function notify() {
  for (const fn of listeners) fn()
}

/** Call once, as early as possible. */
export function initInstallCapture() {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Suppress Chromium's own mini-infobar in favour of the in-app button.
    e.preventDefault()
    captured = e as InstallPromptEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    installed = true
    captured = null
    notify()
  })
}

export function getInstallPrompt(): InstallPromptEvent | null {
  return captured
}

export function wasInstalledThisSession(): boolean {
  return installed
}

export function subscribeInstall(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Shows the native install dialog. Resolves to whether it was accepted. */
export async function promptInstall(): Promise<boolean> {
  if (!captured) return false
  await captured.prompt()
  const { outcome } = await captured.userChoice
  // The event cannot be reused, whatever the answer.
  captured = null
  notify()
  return outcome === 'accepted'
}

/** True when running as an installed app rather than in a browser tab. */
export function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS home-screen apps predate the display-mode media query.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function isIos(): boolean {
  const ua = navigator.userAgent
  // iPads running iPadOS report as Macintosh, distinguishable by touch points.
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
}
