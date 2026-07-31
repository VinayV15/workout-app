import { useState } from 'react'
import { Button, Field, Segmented } from './ui'
import {
  sendSignInEmail,
  signInWithPassword,
  signUpWithPassword,
  verifySignInCode,
} from '../lib/sync'

type Mode = 'signin' | 'signup'

/**
 * Sign-in for the sync account, shared by the launch gate and Settings.
 *
 * Email and password lead, because on a phone that is the only flow with no
 * moving parts: nothing to wait for in a mail app, no single-use token that a
 * link preview can burn, and it behaves the same in the installed app as in the
 * browser. The email-link flow is kept behind a disclosure as the recovery path
 * for a forgotten password.
 */
export default function SignInForm({
  onSignedIn,
  autoFocus = false,
}: {
  /** Called after a session exists — the caller decides whether to pull data. */
  onSignedIn: () => void | Promise<void>
  autoFocus?: boolean
}) {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [useLink, setUseLink] = useState(false)
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ text: string; kind: 'ok' | 'error' } | null>(null)

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

  const emailOk = /.+@.+\..+/.test(email.trim())

  function submitPassword() {
    void guard(async () => {
      if (mode === 'signup') {
        const result = await signUpWithPassword(email, password)
        if (result === 'confirm-email') {
          setMessage({
            text: 'Account created, but the project requires email confirmation — open the email Supabase just sent, then sign in.',
            kind: 'ok',
          })
          return
        }
      } else {
        await signInWithPassword(email, password)
      }
      setPassword('')
      await onSignedIn()
    })
  }

  return (
    <div className="space-y-3">
      <Segmented
        value={mode}
        onChange={(m) => {
          setMode(m)
          setMessage(null)
        }}
        options={[
          { value: 'signin', label: 'Sign in' },
          { value: 'signup', label: 'Create account' },
        ]}
      />

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!busy && emailOk && (useLink || password.length >= 8)) {
            if (useLink) void guard(async () => { await sendSignInEmail(email); setSent(true) }, 'Check your email and open the link on this device.')
            else submitPassword()
          }
        }}
      >
        <Field
          label="Email"
          type="email"
          autoComplete="email"
          autoFocus={autoFocus}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
        />

        {!useLink && (
          <>
            <Field
              label="Password"
              type="password"
              // Tells a password manager whether to offer a saved entry or to
              // generate and store a new one.
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              hint={mode === 'signup' ? 'At least 8 characters. Let your password manager pick it.' : undefined}
            />
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              disabled={busy || !emailOk || password.length < 8}
            >
              {busy ? 'Working…' : mode === 'signup' ? 'Create account' : 'Sign in'}
            </Button>
          </>
        )}

        {useLink && (
          <>
            <Button type="submit" variant="primary" className="w-full" disabled={busy || !emailOk}>
              {sent ? 'Resend sign-in link' : 'Email me a sign-in link'}
            </Button>
            {sent && (
              <div className="space-y-2 rounded-xl border border-line p-3">
                <Field
                  label="Or type the 6-digit code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="123456"
                  hint="More reliable than the link in an installed app, and immune to mail apps that consume a link by previewing it."
                />
                <Button
                  className="w-full"
                  disabled={busy || code.trim().length < 6}
                  onClick={() =>
                    void guard(async () => {
                      await verifySignInCode(email, code)
                      setCode('')
                      setSent(false)
                      await onSignedIn()
                    })
                  }
                >
                  Verify code
                </Button>
              </div>
            )}
          </>
        )}
      </form>

      <button
        type="button"
        className="text-[11px] text-ink-3 underline underline-offset-2 hover:text-ink-2"
        onClick={() => {
          setUseLink((v) => !v)
          setMessage(null)
          setSent(false)
        }}
      >
        {useLink ? 'Use a password instead' : 'Use an email link instead (forgotten password)'}
      </button>

      {message && (
        <p
          className="text-xs leading-relaxed"
          style={{ color: message.kind === 'ok' ? 'var(--good)' : 'var(--critical)' }}
        >
          {message.text}
        </p>
      )}
    </div>
  )
}
