import {
  useCallback,
  useEffect,
  useRef,
  useState,
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

/**
 * A horizontally scrolling row that fades whichever end has more content past it.
 *
 * The chip rows (date ranges, distances, exercises) can hold more options than fit,
 * and previously the overflow just clipped: "All time" and "Marathon" sat cut in half
 * at the edge, which reads as a rendering fault rather than as an invitation to
 * scroll. A fade on a side only means "there is more this way", so it has to be
 * per-side and measured — a static fade on both ends dims the first chip even when
 * the row fits, and the first chip is usually the selected one.
 *
 * Deliberately no scroll snapping. It looks like a natural fit for a chip row and is
 * actively wrong here: a snap point sits on the chip's own edge and ignores the
 * container's inline padding, so the row came to rest at scrollLeft 16 instead of 0 —
 * which clipped the first chip against the container edge AND tripped the left fade,
 * making the selected chip look half-drawn before the user had scrolled anything.
 */
export function ScrollRow({
  children,
  className = '',
  label,
}: {
  children: ReactNode
  className?: string
  label?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [ends, setEnds] = useState({ left: false, right: false })

  const measure = useCallback(() => {
    const el = ref.current
    if (!el) return
    // A couple of pixels of tolerance: fractional scroll positions and device pixel
    // ratios mean scrollLeft rarely lands exactly on 0 or on the maximum.
    const slack = 2
    setEnds({
      left: el.scrollLeft > slack,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - slack,
    })
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    // Content changes (a new exercise logged, a preset list swapped) change whether
    // there is anything to scroll to, and so does rotating the phone.
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    for (const child of Array.from(el.children)) ro.observe(child)
    return () => {
      el.removeEventListener('scroll', measure)
      ro.disconnect()
    }
  }, [measure, children])

  return (
    <div
      ref={ref}
      role={label ? 'group' : undefined}
      aria-label={label}
      className={`no-scrollbar flex overflow-x-auto ${
        ends.left ? 'fade-l' : ''
      } ${ends.right ? 'fade-r' : ''} ${className}`}
    >
      {children}
    </div>
  )
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
  // 44px minimum touch target on the primary and secondary variants. Below that,
  // taps miss — and this is used one-handed, mid-set, with the other hand on a bar.
  const base =
    'relative inline-flex min-h-[44px] items-center justify-center gap-1.5 overflow-hidden rounded-2xl px-4 py-2 text-sm font-medium transition-[transform,filter,background-color,border-color] duration-150 active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100'
  const styles: Record<ButtonVariant, string> = {
    primary: 'accent-fill hover:brightness-[1.08]',
    secondary: 'border border-line bg-surface-2/60 text-ink hover:border-line-strong',
    ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
    danger: 'border border-critical/40 bg-critical/10 text-critical hover:bg-critical/20',
  }
  /*
    The gradient and the two shadows are the glass treatment — lit along the upper
    rim, falling off below, with an accent-tinted glow beneath so the control reads
    as sitting above the surface.
    Written as inline style rather than an arbitrary Tailwind class because both
    values contain `color-mix(...)`, and the commas inside those functions are not
    reliably parsed inside `shadow-[...]`. A silently dropped utility is worse than
    a slightly longer style object.
  */
  const glass: Record<string, string> = {
    primary:
      'inset 0 1px 0 rgba(255,255,255,0.28), 0 6px 18px -8px color-mix(in oklab, var(--accent) 70%, transparent)',
    secondary: 'inset 0 1px 0 var(--pane-highlight)',
    ghost: 'none',
    danger: 'none',
  }
  return (
    <button
      className={`${base} ${styles[variant]} ${className}`}
      style={{ boxShadow: glass[variant] }}
      {...rest}
    >
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
    /*
      `min-w-0` on the items is the fix for a control that used to overflow instead of
      fitting: they were `flex-1 shrink-0`, which asks each item to grow AND forbids it
      from shrinking, so four segments could not compress onto a 390px screen and the
      whole control scrolled sideways. They now share the width and truncate only if
      they genuinely cannot fit.
    */
    <div className={`track flex gap-1 rounded-2xl p-1 ${className}`}>
      {options.map((o) => (
        <button
          key={o.value}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-w-0 flex-1 truncate rounded-xl px-2.5 py-2 text-xs font-medium transition-[background-color,color,box-shadow] duration-150 ${
            value === o.value ? 'accent-fill' : 'text-ink-2 hover:text-ink'
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
    /*
      `min-w-0` and the fluid value size are the mobile fix. These tiles sit in
      three- and four-column grids, which on a 390px phone is about 105px of usable
      width each — and a fixed 24px "1,017 lb" does not fit in that, so it spilled
      over its neighbour. The value now scales with the viewport between 19px and
      24px and the label is allowed to truncate rather than push the tile wider.
    */
    <div className="card min-w-0 p-3">
      <div className="truncate text-[11px] leading-tight font-medium text-ink-3">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="min-w-0 truncate text-[clamp(1.2rem,5.2vw,1.5rem)] font-semibold tracking-tight">
          {value}
        </span>
        {unit && <span className="shrink-0 text-xs text-ink-3">{unit}</span>}
      </div>
      {(delta || sub) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px]">
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

/*
 * Status colours, and deliberately NOT the user's accent.
 *
 * Severity is semantic: "Info" has to stay distinguishable from "Urgent" no matter
 * what colour the user picked for their buttons. If these followed the accent, a user
 * who chose red would get Info badges that look like critical warnings, and one who
 * chose amber would get Info badges identical to Adjust. The accent is decoration;
 * this is meaning. (Every badge also carries an icon and a word, so none of it is
 * colour-alone in the first place.)
 */
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
  color = 'var(--accent)',
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
      <div className="absolute inset-0 bg-black/50 backdrop-blur-[3px]" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="glass relative flex max-h-[92dvh] w-full flex-col rounded-t-3xl sm:max-w-lg sm:rounded-3xl"
      >
        {/* Grab handle: signals a bottom sheet, and gives the eye an edge to read the
            glass against. Mobile only — on a centred dialog it means nothing. */}
        <div className="mx-auto mt-2 h-1 w-9 shrink-0 rounded-full bg-ink-3/40 sm:hidden" />
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
      aria-pressed={active}
      className={`min-h-[36px] shrink-0 rounded-full border px-3.5 text-xs font-medium transition-[background-color,color,border-color,transform] duration-150 active:scale-[0.97] ${
        active ? 'accent-fill border-transparent' : 'border-line bg-surface-2/60 text-ink-2 hover:text-ink'
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
