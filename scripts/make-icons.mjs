/**
 * Generates the PWA icons as PNGs with no external dependencies — a minimal
 * PNG encoder over zlib, drawing a dumbbell glyph on a dark rounded square.
 * Run with: npm run icons
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const BG = [13, 13, 13]
const PLATE = [57, 135, 229] // series-1 blue
const BAR = [235, 235, 232]

function crc32(buf) {
  let c
  const table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** Encode an RGBA pixel buffer (size × size) as a PNG. */
function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type RGBA
  // Raw scanlines, each prefixed with filter type 0.
  const stride = size * 4
  const raw = Buffer.alloc((stride + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function makeIcon(size, maskable = false) {
  const buf = Buffer.alloc(size * size * 4)
  const s = size / 512 // design is authored at 512
  const radius = 96 * s

  const set = (x, y, [r, g, b], a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    const i = (y * size + x) * 4
    // Simple source-over composite so the glyph edges blend with the plate.
    const sa = a / 255
    buf[i] = Math.round(r * sa + buf[i] * (1 - sa))
    buf[i + 1] = Math.round(g * sa + buf[i + 1] * (1 - sa))
    buf[i + 2] = Math.round(b * sa + buf[i + 2] * (1 - sa))
    buf[i + 3] = Math.max(buf[i + 3], a)
  }

  // Background. A maskable icon is cropped to a circle or squircle by the OS,
  // so it must be full-bleed — rounding it ourselves would show as cut corners
  // inside the mask.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (maskable) {
        set(x, y, BG, 255)
        continue
      }
      const dx = Math.max(radius - x, x - (size - radius), 0)
      const dy = Math.max(radius - y, y - (size - radius), 0)
      const inside = dx === 0 || dy === 0 ? true : dx * dx + dy * dy <= radius * radius
      if (inside) set(x, y, BG, 255)
    }
  }

  const rect = (x0, y0, w, h, color) => {
    for (let y = Math.round(y0); y < Math.round(y0 + h); y++) {
      for (let x = Math.round(x0); x < Math.round(x0 + w); x++) set(x, y, color, 255)
    }
  }

  /**
   * Glyph scale. Maskable icons must keep everything meaningful inside the
   * central 80% — the safe zone — because the corners get cropped away. At
   * full size the dumbbell's plates would lose their ends.
   */
  // 0.8 puts the glyph's furthest corner ~149px from centre on the 512 grid,
  // comfortably inside the safe zone's ~204px radius, without looking lost.
  const g = maskable ? 0.8 : 1
  const c = 256 * s
  // Maps a 512-grid coordinate into the scaled glyph, about the centre.
  const gx = (v) => c + (v * s - c) * g
  const gw = (v) => v * s * g

  // Dumbbell: two plates either side of a bar, drawn on the 512 grid.
  const barH = gw(44)
  rect(gx(150), c - barH / 2, gw(212), barH, BAR)
  // Outer plates
  rect(gx(96), c - gw(96), gw(46), gw(192), PLATE)
  rect(gx(370), c - gw(96), gw(46), gw(192), PLATE)
  // Inner plates
  rect(gx(150), c - gw(68), gw(34), gw(136), PLATE)
  rect(gx(328), c - gw(68), gw(34), gw(136), PLATE)

  return encodePng(size, buf)
}

mkdirSync(OUT, { recursive: true })
for (const [name, size, maskable] of [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  // Android and Chrome crop this one to the platform's icon shape.
  ['icon-maskable-512.png', 512, true],
  // iOS applies its own rounding and never masks aggressively, so the
  // full-size glyph on a rounded square is right here.
  ['apple-touch-icon.png', 180, false],
]) {
  writeFileSync(join(OUT, name), makeIcon(size, maskable))
  console.log(`wrote public/${name} (${size}×${size})${maskable ? ' maskable' : ''}`)
}
