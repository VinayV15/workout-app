/**
 * Tests for the user-configurable accent colour. Run with `npm test`.
 *
 * The contrast maths is what makes offering a free-form colour picker defensible. If
 * `inkOn` picks the wrong foreground, every button label in the app becomes unreadable
 * — and it fails silently, because the developer picking a nice mid-tone purple never
 * sees what happens to somebody who picks pale yellow. So the property is asserted
 * across the whole hue circle rather than on a few chosen colours.
 */
import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT,
  INK_ON_DARK,
  INK_ON_LIGHT,
  contrastRatio,
  inkOn,
  luminance,
  normaliseAccent,
  parseHex,
  readableOnPage,
} from '../src/lib/accent.ts'

let passed = 0
let failed = 0
function check(name, pass, detail = '') {
  if (pass) {
    passed++
    console.log(`  ok   ${name}`)
  } else {
    failed++
    console.error(`  FAIL ${name}${detail ? ` :: ${detail}` : ''}`)
  }
}

console.log('parsing')
{
  check('a six-digit hex parses', JSON.stringify(parseHex('#9d7bff')) === JSON.stringify({ r: 157, g: 123, b: 255 }))
  check('a three-digit hex expands', JSON.stringify(parseHex('#f0a')) === JSON.stringify({ r: 255, g: 0, b: 170 }))
  check('a missing hash still parses', parseHex('9d7bff') !== null)
  check('surrounding space is tolerated', parseHex('  #9d7bff  ') !== null)
  check('case does not matter', JSON.stringify(parseHex('#9D7BFF')) === JSON.stringify(parseHex('#9d7bff')))

  check('nonsense is rejected rather than throwing', parseHex('rebeccapurple') === null)
  check('a short string is rejected', parseHex('#12') === null)
  check('an over-long string is rejected', parseHex('#1234567') === null)
  check('an empty string is rejected', parseHex('') === null)

  // These arrive from a synced document, which an older or hand-edited build wrote.
  check('a bad stored value falls back to the default', normaliseAccent('not a colour') === DEFAULT_ACCENT)
  check('undefined falls back to the default', normaliseAccent(undefined) === DEFAULT_ACCENT)
  check('a good value is normalised to lowercase with a hash', normaliseAccent('9D7BFF') === '#9d7bff')
  check('the default is itself normalised', normaliseAccent(DEFAULT_ACCENT) === DEFAULT_ACCENT)
}

console.log('\nluminance and contrast')
{
  check('black has no luminance', luminance('#000000') === 0)
  check('white has full luminance', Math.abs(luminance('#ffffff') - 1) < 1e-9)
  check('grey sits in between', luminance('#808080') > 0.2 && luminance('#808080') < 0.3)
  // Green contributes most to perceived brightness, blue least. A formula with the
  // coefficients transposed would pass a black/white check and fail this.
  check('green reads brighter than red, red brighter than blue', luminance('#00ff00') > luminance('#ff0000') && luminance('#ff0000') > luminance('#0000ff'))

  check('black on white is the maximum 21:1', Math.abs(contrastRatio('#000000', '#ffffff') - 21) < 0.01)
  check('a colour against itself is 1:1', Math.abs(contrastRatio('#9d7bff', '#9d7bff') - 1) < 1e-9)
  check('contrast is symmetric', Math.abs(contrastRatio('#123456', '#abcdef') - contrastRatio('#abcdef', '#123456')) < 1e-9)
}

console.log('\nink on the accent is always the more legible of the two')
{
  check('white text on a dark accent', inkOn('#2a1a6b') === INK_ON_DARK)
  check('dark text on pale yellow', inkOn('#ffee55') === INK_ON_LIGHT)
  check('dark text on white', inkOn('#ffffff') === INK_ON_LIGHT)
  check('white text on black', inkOn('#000000') === INK_ON_DARK)

  // The real property: whichever ink is chosen must be the better of the two, for
  // every colour a user could possibly pick. Swept across the hue circle at several
  // lightnesses, which is where a naive luminance threshold goes wrong.
  let alwaysBest = true
  let worst = { hex: null, ratio: Infinity }
  const samples = []
  for (let h = 0; h < 360; h += 5) {
    for (const [s, l] of [[100, 25], [100, 50], [100, 75], [60, 40], [60, 60], [30, 50], [15, 85]]) {
      samples.push(hslHex(h, s, l))
    }
  }
  samples.push('#000000', '#ffffff', '#808080', DEFAULT_ACCENT)

  for (const hex of samples) {
    const chosen = inkOn(hex)
    const other = chosen === INK_ON_DARK ? INK_ON_LIGHT : INK_ON_DARK
    if (contrastRatio(hex, chosen) < contrastRatio(hex, other)) alwaysBest = false
    const r = contrastRatio(hex, chosen)
    if (r < worst.ratio) worst = { hex, ratio: r }
  }
  check(`the better ink is chosen for all ${samples.length} sampled colours`, alwaysBest)

  // Mid-tone colours are genuinely hard: no foreground reaches 4.5:1 on them, which
  // is a fact about colour rather than a bug. What must hold is the 3:1 that WCAG
  // requires of UI component text at this size, so the floor is asserted at 3.
  check(
    `the worst sampled colour still clears 3:1 (${worst.hex} at ${worst.ratio.toFixed(2)}:1)`,
    worst.ratio >= 3,
    `${worst.hex} only reaches ${worst.ratio.toFixed(2)}:1`,
  )
}

console.log('\nthe shipped presets are all usable')
{
  check('there are presets to choose from', ACCENT_PRESETS.length >= 6)
  check('the default is one of them', ACCENT_PRESETS.some((p) => p.hex === DEFAULT_ACCENT))
  check('the default is a purple', (() => {
    const rgb = parseHex(DEFAULT_ACCENT)
    return rgb.b > rgb.r && rgb.r > rgb.g
  })())
  check('every preset is a valid colour', ACCENT_PRESETS.every((p) => parseHex(p.hex) !== null))
  check('no two presets are the same colour', new Set(ACCENT_PRESETS.map((p) => p.hex.toLowerCase())).size === ACCENT_PRESETS.length)
  check('every preset has a name', ACCENT_PRESETS.every((p) => p.name.trim().length > 0))

  // A preset is the safe path, so a preset must never be one of the colours the
  // picker would have to warn about.
  const unreadable = ACCENT_PRESETS.filter((p) => !readableOnPage(p.hex))
  check('every preset is legible against the dark page', unreadable.length === 0, unreadable.map((p) => p.name).join(', '))

  const lowInk = ACCENT_PRESETS.filter((p) => contrastRatio(p.hex, inkOn(p.hex)) < 3)
  check('every preset clears 3:1 against its own label colour', lowInk.length === 0, lowInk.map((p) => `${p.name} ${contrastRatio(p.hex, inkOn(p.hex)).toFixed(2)}`).join(', '))

  // Presets are meant to sit at a similar lightness so switching hue does not make
  // the interface suddenly darker or washed out.
  const ls = ACCENT_PRESETS.map((p) => luminance(p.hex))
  check(
    `preset lightness stays in a narrow band (${Math.min(...ls).toFixed(2)}-${Math.max(...ls).toFixed(2)})`,
    Math.max(...ls) - Math.min(...ls) < 0.35,
    `spread ${(Math.max(...ls) - Math.min(...ls)).toFixed(2)}`,
  )
}

console.log('\nwarning about colours too dark to see')
{
  check('near-black is flagged against the dark page', !readableOnPage('#101010'))
  check('a dark navy is flagged', !readableOnPage('#161a2e'))
  check('the default is not flagged', readableOnPage(DEFAULT_ACCENT))
  check('white is not flagged', readableOnPage('#ffffff'))
}

/** HSL to hex, for sweeping the hue circle in the tests. */
function hslHex(h, s, l) {
  const S = s / 100
  const L = l / 100
  const c = (1 - Math.abs(2 * L - 1)) * S
  const hp = h / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x]
  const m = L - c / 2
  const to = (v) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${to(r1)}${to(g1)}${to(b1)}`
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
