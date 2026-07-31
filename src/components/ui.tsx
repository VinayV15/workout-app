import {
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react'
import type { Severity } from '../lib/recommend'

export function Card({
  children,
  className = '',
  as: As = 'div',
}: {
  children: ReactNode
  className?: string
  as?: 'div' | 'section' | 'li'
}) {
  return <As className={`card p-4 ${className}`}>{children}</As>
}

export function SectionTitle({
  children,
  action,
  sub,
}: {
  children: ReactNode
  action?: ReactNode
  sub?: string
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-[15px] font-semibold tracking-tight">{children}</h2>
        {sub && <p className="mt-0.5 text-xs text-ink-3">{sub}</p>}
      </div>
      {action}
    </div>
  )
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export function Button({
  variant = 'secondary',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const base =
    'inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-medium transition active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100'
  const styles: Record<ButtonVariant, string> = {
    primary: 'bg-s1 text-white hover:brightness-110',
    secondary: 'bg-surface-2 text-ink border border-line hover:border-line-strong',
    ghost: 'text-ink-2 hover:text-ink hover:bg-surface-2',
    danger: 'bg-transparent text-critical border border-critical/40 hover:bg-critical/10',
  }
  return (
    <button className={`${base} ${styles[variant]} ${className}`} {...rest}>
      {children}
    </button>
  )
}

export function Field({
  label,
  hint,
  suffix,
  className = '',
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label?: string; hint?: string; suffix?: string }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="label">{label}</span>}
      <span className="relative block">
        <input className={`field tabular ${suffix ? 'pr-10' : ''}`} {...rest} />
        {suffix && (
          <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-ink-3">
            {suffix}
          </span>
        )}
      </span>
      {hint && <span className="mt-1 block text-[11px] text-ink-3">{hint}</span>}
    </label>
  )
}

export function SelectField({
  label,
  children,
  className = '',
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="label">{label}</span>}
      <select className="field appearance-none pr-8" {...rest}>
        {children}
      </select>
    </label>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className = '',
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  className?: string
}) {
  return (
    <div className={`no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1 ${className}`}>
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`flex-1 shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium whitespace-nowrap transition ${
            value === o.value ? 'bg-s1 text-white' : 'text-ink-2 hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Stat tile: label, value, optional delta and sub-line. The value uses
 * proportional figures — tabular digits look loose at display sizes.
 */
export function Stat({
  label,
  value,
  unit,
  delta,
  deltaGood,
  sub,
}: {
  label: string
  value: ReactNode
  unit?: string
  delta?: string
  /** Whether the delta's direction is a good thing. */
  deltaGood?: boolean
  sub?: string
}) {
  return (
    <div className="card p-3">
      <div className="text-[11px] leading-tight font-medium text-ink-3">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-2xl font-semibold tracking-tight">{value}</span>
        {unit && <span className="text-xs text-ink-3">{unit}</span>}
      </div>
      {(delta || sub) && (
        <div className="mt-1 flex items-center gap-1.5 text-[11px]">
          {delta && (
            <span
              className="tabular font-medium"
              style={{ color: deltaGood === undefined ? 'var(--text-secondary)' : deltaGood ? 'var(--delta-good)' : 'var(--critical)' }}
            >
              {delta}
            </span>
          )}
          {sub && <span className="text-ink-3">{sub}</span>}
        </div>
      )}
    </div>
  )
}

const SEVERITY_STYLE: Record<Severity, { color: string; icon: string; label: string }> = {
  critical: { color: 'var(--critical)', icon: '‼', label: 'Urgent' },
  serious: { color: 'var(--serious)', icon: '▲', label: 'Act now' },
  warning: { color: 'var(--warning)', icon: '●', label: 'Adjust' },
  info: { color: 'var(--series-1)', icon: 'i', label: 'Info' },
  good: { color: 'var(--good)', icon: '✓', label: 'On track' },
}

/** Status is never colour-alone: every badge ships with an icon and a word. */
export function SeverityBadge({ severity }: { severity: Severity }) {
  const s = SEVERITY_STYLE[severity]
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
      style={{ color: s.color, background: `color-mix(in oklab, ${s.color} 14%, transparent)` }}
    >
      <span aria-hidden>{s.icon}</span>
      {s.label}
    </span>
  )
}

export function severityColor(severity: Severity): string {
  return SEVERITY_STYLE[severity].color
}

/** Meter: fill carries the state, track is a lighter step of the same ramp. */
export function Meter({
  value,
  target,
  color = 'var(--series-1)',
  height = 6,
}: {
  value: number
  target: number
  color?: string
  height?: number
}) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0
  return (
    <div
      className="w-full overflow-hidden rounded-full"
      style={{ height, background: `color-mix(in oklab, ${color} 18%, var(--surface-2))` }}
      role="meter"
      aria-valuenow={value}
      aria-valuemax={target}
    >
      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-xs leading-relaxed text-ink-3">{body}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

/** Bottom sheet on mobile, centred dialog on wide screens. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative flex max-h-[92dvh] w-full flex-col rounded-t-2xl border border-line bg-surface-1 sm:max-w-lg sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <h3 className="text-sm font-semibold">{title}</h3>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer && <div className="border-t border-line px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  )
}

export function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean
  onClick?: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active ? 'border-transparent bg-s1 text-white' : 'border-line bg-surface-2 text-ink-2 hover:text-ink'
      }`}
    >
      {children}
    </button>
  )
}

export function Row({ label, value, sub }: { label: ReactNode; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-2.5 last:border-0">
      <div className="min-w-0">
        <div className="truncate text-sm">{label}</div>
        {sub && <div className="mt-0.5 text-[11px] text-ink-3">{sub}</div>}
      </div>
      <div className="tabular shrink-0 text-sm font-medium">{value}</div>
    </div>
  )
}
