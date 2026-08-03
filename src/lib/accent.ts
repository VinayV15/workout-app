/**
 * The accent colour, which the user picks.
 *
 * Deliberately a *separate* token from `--series-1`. They used to be the same blue,
 * which meant the accent could not be changed without also recolouring the first
 * series of every chart — and a chart's categorical palette is chosen as a set, for
 * separability. Whatever the user picks for buttons and chips, a line chart keeps the
 * validated palette.
 *
 * Only two values need computing in JS: the colour itself, and whether text on top of
 * it should be white or near-black. Every other shade (hover, soft tints, the glass
 * edge glow) is derived in CSS with `color-mix`, so there is one source of truth and
 * no drift between them.
 */

export interface AccentPreset {
  name: string
  hex: string
}

/**
 * Presets that all sit at a similar lightness and chroma, so switching between them
 * changes the hue without making the UI suddenly darker, washed out or unreadable.
 * A free-form picker is offered alongside these; the presets are the safe path.
 */
export const ACCENT_PRESETS: AccentPreset[] = [
  { name: 'Amethyst', hex: '#9d7bff' },
  { name: 'Iris', hex: '#7c6cf0' },
  { name: 'Orchid', hex: '#c470e8' },
  { name: 'Cerulean', hex: '#3987e5' },
  { name: 'Teal', hex: '#22b3a6' },
  { name: 'Jade', hex: '#2fb573' },
  { name: 'Ember', hex: '#ff7a3d' },
  { name: 'Rose', hex: '#f2618a' },
  { name: 'Crimson', hex: '#e2504f' },
  { name: 'Slate', hex: '#8a93a6' },
]

/** Amethyst — the default, and what the app ships looking like. */
export const DEFAULT_ACCENT = ACCENT_PRESETS[0].hex

const HEX = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i

/**
 * Parses a user-supplied colour, returning null rather than throwing.
 *
 * The value reaches here from a synced document as well as from the picker, so it can
 * be anything an older or hand-edited build wrote. Callers fall back to the default.
 */
export function parseHex(input: string): { r: number; g: number; b: number } | null {
  const m = HEX.exec(input.trim())
  if (!m) return null
  let h = m[1]
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

/** Normalised to a 6-digit lowercase hex with a leading hash, or the default. */
export function normaliseAccent(input: string | undefined): string {
  if (!input) return DEFAULT_ACCENT
  const rgb = parseHex(input)
  if (!rgb) return DEFAULT_ACCENT
  const to = (n: number) => n.toString(16).padStart(2, '0')
  return `#${to(rgb.r)}${to(rgb.g)}${to(rgb.b)}`
}

/** One channel, gamma-decoded to linear light. */
function linearise(channel: number): number {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** Relative luminance, per WCAG. */
export function luminance(hex: string): number {
  const rgb = parseHex(hex) ?? parseHex(DEFAULT_ACCENT)!
  return 0.2126 * linearise(rgb.r) + 0.7152 * linearise(rgb.g) + 0.0722 * linearise(rgb.b)
}

/** WCAG contrast ratio between two colours, 1 (identical) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  const [hi, lo] = la > lb ? [la, lb] : [lb, la]
  return (hi + 0.05) / (lo + 0.05)
}

/** Near-black rather than pure black: softer on a saturated fill, still 20:1 on white. */
export const INK_ON_LIGHT = '#12121a'
export const INK_ON_DARK = '#ffffff'

/**
 * Text colour to sit on top of the accent — whichever of white or near-black has the
 * better contrast against it.
 *
 * This is the whole reason a free-form picker is safe to offer. A user who chooses
 * bright yellow gets dark text on their buttons automatically instead of the white-on-
 * yellow that a hard-coded foreground would have produced.
 */
export function inkOn(accent: string): string {
  return contrastRatio(accent, INK_ON_DARK) >= contrastRatio(accent, INK_ON_LIGHT)
    ? INK_ON_DARK
    : INK_ON_LIGHT
}

/**
 * Whether an accent has enough contrast against the dark page to be legible as text
 * or as a thin line on top of it. Very dark picks fail this, and the picker warns
 * rather than silently rendering an unreadable label.
 */
export function readableOnPage(accent: string, page = '#0d0d0d'): boolean {
  return contrastRatio(accent, page) >= 3
}

/** The CSS custom properties an accent contributes. Applied to the document root. */
export function accentVars(input: string | undefined): Record<string, string> {
  const accent = normaliseAccent(input)
  return {
    '--accent': accent,
    '--accent-ink': inkOn(accent),
  }
}
