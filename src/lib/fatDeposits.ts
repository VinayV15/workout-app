import { LEVELS, type BodyDims, type Physique } from './physique'
import { add, bodyFrame, lerp3, norm, spindle, v, type MeshGrid, type Vec3 } from './anatomy'
import type { Sex } from './types'

/**
 * The fat layer, built the same way as the muscle layer: discrete deposits at the
 * places human bodies actually store fat, rather than one even shell.
 *
 * Fat is not distributed like a coat of paint. Men fill the abdomen first, then
 * the flanks — the "love handles" over the iliac crest — then the chest and the
 * back of the arms. Women fill the hips and outer thighs first, then the glutes,
 * breasts and lower abdomen. Those patterns are why the same body-fat percentage
 * looks so different on a man and a woman, and drawing them as separate deposits
 * is what makes the fat layer informative instead of decorative.
 *
 * Each deposit's size comes from the modelled fat thickness for its region, so at
 * low body fat they are thin lenses and at high body fat they are the dominant
 * masses.
 */

export interface FatGroup {
  key: string
  label: string
  color: number
  match: string[]
}

/**
 * Deposit colours. Reused from the validated palette and assigned so that no two
 * neighbouring deposits share a hue, exactly as the muscle groups are.
 */
export const FAT_GROUPS: FatGroup[] = [
  { key: 'abdomen', label: 'Abdomen', color: 0xd95926, match: ['belly', 'suprapubic'] },
  { key: 'flanks', label: 'Flanks (love handles)', color: 0xc98500, match: ['love-handle'] },
  { key: 'chest', label: 'Chest', color: 0x3987e5, match: ['chest-fat', 'breast'] },
  { key: 'back', label: 'Back', color: 0x1f9e3f, match: ['lower-back', 'upper-back'] },
  { key: 'hips', label: 'Hips & seat', color: 0xd55181, match: ['hip-saddle', 'glute-fat'] },
  { key: 'thighs', label: 'Thighs', color: 0x9085e9, match: ['inner-thigh', 'outer-thigh'] },
  { key: 'arms', label: 'Arms', color: 0xe66767, match: ['triceps-fat'] },
  { key: 'neck', label: 'Neck & face', color: 0x2ee6a8, match: ['submental'] },
]

export function fatColorOf(name: string, fallback: number): number {
  for (const g of FAT_GROUPS) if (g.match.some((m) => name.includes(m))) return g.color
  return fallback
}

/** Which deposits a given sex actually shows, in descending prominence. */
export function fatSitesFor(sex: Sex): string[] {
  return sex === 'male'
    ? ['Abdomen', 'Flanks (love handles)', 'Lower back', 'Chest', 'Back of arms', 'Under the chin']
    : ['Hips & outer thighs', 'Seat', 'Lower abdomen', 'Breasts', 'Back of arms', 'Inner thighs']
}

const FRONT: Vec3 = [0, 0, 1]
const BACK: Vec3 = [0, 0, -1]

function dir(...parts: Vec3[]): Vec3 {
  let acc: Vec3 = [0, 0, 0]
  for (const p of parts) acc = add(acc, p)
  return norm(acc)
}

/**
 * Builds the fat deposits for a physique.
 *
 * `dims` is the surface the deposits sit under (the full, fleshed body) and the
 * thicknesses come from the physique's own regional fat model, so these are the
 * same numbers the skin is built from — not an independent guess.
 */
export function buildFatGrids(p: Physique, dims: BodyDims): MeshGrid[] {
  const f = bodyFrame(dims)
  const H = f.H
  const t = p.fatThickness
  const male = p.sex === 'male'
  const out: MeshGrid[] = []
  const push = (m: MeshGrid) => out.push(m)

  // A deposit only appears once there is fat to put in it. Below essential
  // levels these collapse to nothing, which is correct.
  const scale = (thickness: number, k: number) => Math.max(0.02, thickness * k)

  /**
   * Deposits spread as well as thicken. A small amount of fat sits as a compact
   * pocket; a large amount spreads across its region as it deepens. Scaling only
   * the thickness left a lean body covered in wide, paper-thin sheets — which is
   * wrong, and reads as far more fat than is actually there.
   */
  const meanThickness = (t.waist + t.chest + t.hip + t.thigh + t.arm) / 5
  const spread = 0.3 + 0.7 * Math.max(0.05, Math.min(1, meanThickness / 0.9))
  const fatSpindle: typeof spindle = (name, p0, p1, o) =>
    spindle(name, p0, p1, { ...o, width: o.width * spread })

  // ---- Abdomen: the male pattern's first and largest store ---------------
  const bellyThick = scale(t.waist, male ? 1.55 : 1.05)
  push(
    fatSpindle(
      'belly',
      v(0, (LEVELS.chest - 0.055) * H, dims.waist.b * 0.42),
      v(0, (LEVELS.hip - 0.005) * H, dims.hip.b * 0.36),
      {
        width: dims.waist.a * (male ? 0.72 : 0.66),
        thickness: bellyThick,
        out: FRONT,
        // Fullest low: a belly hangs rather than sitting evenly.
        alpha: 2.5,
        beta: 2.0,
        rings: 12,
        radial: 16,
        endScale: 0.3,
      },
    ),
  )
  push(
    fatSpindle(
      'suprapubic',
      v(0, (LEVELS.hip - 0.01) * H, dims.hip.b * 0.42),
      v(0, (LEVELS.crotch + 0.025) * H, dims.hip.b * 0.34),
      {
        width: dims.waist.a * 0.5,
        thickness: scale(t.waist, male ? 0.85 : 1.15),
        out: FRONT,
        alpha: 2.2,
        beta: 2.2,
        rings: 8,
        radial: 14,
        endScale: 0.35,
      },
    ),
  )

  // ---- Upper back / nape, which fills late ------------------------------
  push(
    fatSpindle(
      'upper-back',
      v(0, (LEVELS.neck - 0.012) * H, -dims.neck.b * 0.9),
      v(0, (LEVELS.chest + 0.035) * H, -dims.chest.b * 0.86),
      {
        width: dims.chest.a * 0.42,
        thickness: scale(t.chest, 0.75),
        out: BACK,
        alpha: 2,
        beta: 2.2,
        rings: 8,
        radial: 14,
        endScale: 0.3,
      },
    ),
  )
  push(
    fatSpindle('submental', v(0, (LEVELS.chin - 0.012) * H, dims.neck.b * 0.6), v(0, (LEVELS.neck + 0.004) * H, dims.neck.b * 0.95), {
      width: dims.neck.a * 0.68,
      thickness: scale(t.neck, 0.9),
      out: FRONT,
      alpha: 2,
      beta: 2,
      rings: 7,
      radial: 12,
      endScale: 0.4,
    }),
  )

  for (const idx of [0, 1] as const) {
    const s: 1 | -1 = idx === 0 ? 1 : -1
    const LAT: Vec3 = [s, 0, 0]
    const MED: Vec3 = [-s, 0, 0]
    const tag = s > 0 ? 'R' : 'L'

    // ---- Flanks: the male "love handle" over the iliac crest -------------
    push(
      fatSpindle(
        `love-handle-${tag}`,
        v(s * dims.waist.a * 0.66, (LEVELS.waist + 0.025) * H, dims.waist.b * 0.14),
        v(s * dims.hip.a * 0.72, (LEVELS.hip - 0.015) * H, -dims.hip.b * 0.22),
        {
          width: dims.waist.a * 0.4,
          thickness: scale(t.waist, male ? 1.25 : 0.7),
          out: dir(LAT, FRONT),
          alpha: 2.2,
          beta: 2.1,
          rings: 10,
          radial: 14,
          endScale: 0.3,
        },
      ),
    )

    // ---- Lower back ------------------------------------------------------
    push(
      fatSpindle(
        `lower-back-${tag}`,
        v(s * dims.waist.a * 0.34, (LEVELS.waist + 0.015) * H, -dims.waist.b * 0.82),
        v(s * dims.hip.a * 0.5, (LEVELS.hip - 0.02) * H, -dims.hip.b * 0.72),
        {
          width: dims.waist.a * 0.34,
          thickness: scale(t.waist, male ? 0.85 : 0.9),
          out: BACK,
          alpha: 2,
          beta: 2,
          rings: 8,
          radial: 14,
          endScale: 0.32,
        },
      ),
    )

    // ---- Chest: pseudo-gynaecomastia in men, breast tissue in women -------
    push(
      fatSpindle(
        male ? `chest-fat-${tag}` : `breast-${tag}`,
        v(s * dims.chest.a * 0.2, (LEVELS.chest + (male ? 0.005 : 0.015)) * H, dims.chest.b * 0.86),
        v(s * dims.chest.a * 0.68, (LEVELS.chest - (male ? 0.035 : 0.045)) * H, dims.chest.b * 0.7),
        {
          width: dims.chest.b * (male ? 0.52 : 0.68),
          thickness: scale(t.chest, male ? 1.05 : 2.1),
          out: FRONT,
          alpha: 2.2,
          beta: 2.0,
          rings: 10,
          radial: 16,
          endScale: 0.3,
        },
      ),
    )

    // ---- Hips and seat: the dominant female store ------------------------
    push(
      fatSpindle(
        `hip-saddle-${tag}`,
        v(s * dims.hip.a * 0.8, (LEVELS.hip - 0.01) * H, -dims.hip.b * 0.1),
        v(s * dims.hip.a * 0.78, (LEVELS.thigh + 0.02) * H, -dims.hip.b * 0.05),
        {
          width: dims.hip.a * 0.34,
          thickness: scale(t.hip, male ? 0.6 : 1.7),
          out: LAT,
          alpha: 2.1,
          beta: 2.3,
          rings: 10,
          radial: 14,
          endScale: 0.28,
        },
      ),
    )
    push(
      fatSpindle(
        `glute-fat-${tag}`,
        v(s * dims.hip.a * 0.24, (LEVELS.hip + 0.01) * H, -dims.hip.b * 0.6),
        v(s * dims.hip.a * 0.66, (LEVELS.crotch + 0.015) * H, -dims.hip.b * 0.5),
        {
          width: dims.hip.a * 0.42,
          thickness: scale(t.hip, male ? 0.7 : 1.5),
          out: BACK,
          alpha: 2.1,
          beta: 2.1,
          rings: 10,
          radial: 14,
          endScale: 0.3,
        },
      ),
    )

    // ---- Thighs ----------------------------------------------------------
    const thighTop = lerp3(f.hip[idx], f.knee[idx], 0.08)
    push(
      fatSpindle(`inner-thigh-${tag}`, thighTop, lerp3(f.hip[idx], f.knee[idx], 0.62), {
        width: dims.thighR * 0.5,
        thickness: scale(t.thigh, male ? 0.75 : 1.35),
        out: MED,
        alpha: 1.9,
        beta: 2.4,
        rings: 10,
        radial: 14,
        endScale: 0.3,
      }),
    )
    push(
      fatSpindle(`outer-thigh-${tag}`, thighTop, lerp3(f.hip[idx], f.knee[idx], 0.55), {
        width: dims.thighR * 0.46,
        thickness: scale(t.thigh, male ? 0.5 : 1.4),
        out: LAT,
        alpha: 1.8,
        beta: 2.5,
        rings: 10,
        radial: 14,
        endScale: 0.3,
      }),
    )

    // ---- Back of the arm -------------------------------------------------
    push(
      fatSpindle(
        `triceps-fat-${tag}`,
        lerp3(f.shoulder[idx], f.elbow[idx], 0.24),
        lerp3(f.shoulder[idx], f.elbow[idx], 0.94),
        {
          width: dims.upperArmR * 0.52,
          thickness: scale(t.arm, male ? 0.9 : 1.35),
          out: dir(BACK, MED),
          alpha: 2.1,
          beta: 2.3,
          rings: 10,
          radial: 14,
          endScale: 0.3,
        },
      ),
    )
  }

  return out
}
