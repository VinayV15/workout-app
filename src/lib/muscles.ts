import { LEVELS, type BodyDims } from './physique'
import type { Muscle } from './types'
import {
  add,
  bodyFrame,
  lerp3,
  norm,
  scale,
  spindle,
  sub,
  v,
  type MeshGrid,
  type Vec3,
} from './anatomy'

/**
 * The muscle layer: individually shaped bellies, each attached along the bone it
 * actually runs over.
 *
 * Every muscle is a spindle — an ellipse swept along its line of pull, tapering
 * to a tendon at both ends — with its own peak position. That peak is what makes
 * a muscle identifiable: a vastus medialis peaks just above the knee, a
 * gastrocnemius peaks high and runs into a long Achilles, a biceps peaks past
 * the midpoint. The gaps between neighbouring bellies are the separations you
 * see on a lean person, so they are left as real gaps rather than smoothed over.
 *
 * Sizes come from the gap between the lean and frame shells at each site, so the
 * muscles grow and shrink with measured lean mass rather than being decorative.
 */

/** How much bigger than the bone the lean shell is, per region. */
interface Gaps {
  arm: number
  forearm: number
  thigh: number
  calf: number
  chestA: number
  chestB: number
  waistB: number
  waistA: number
  hipA: number
  neck: number
  shoulder: number
}

function gaps(lean: BodyDims, frame: BodyDims): Gaps {
  const g = (a: number, b: number) => Math.max(0.12, a - b)
  return {
    arm: g(lean.upperArmR, frame.upperArmR),
    forearm: g(lean.forearmR, frame.forearmR),
    thigh: g(lean.thighR, frame.thighR),
    calf: g(lean.calfR, frame.calfR),
    chestA: g(lean.chest.a, frame.chest.a),
    chestB: g(lean.chest.b, frame.chest.b),
    waistB: g(lean.waist.b, frame.waist.b),
    waistA: g(lean.waist.a, frame.waist.a),
    hipA: g(lean.hip.a, frame.hip.a),
    neck: g(lean.neck.a, frame.neck.a),
    shoulder: g(lean.shoulderHalfWidth, frame.shoulderHalfWidth),
  }
}

/**
 * Local size references. A muscle's WIDTH is a fraction of the limb's own radius
 * — it wraps part of the circumference — while its THICKNESS is a fraction of
 * the gap between bone and lean surface. Sizing width off the gap too is what
 * makes muscles look like thin blades instead of bellies.
 */
interface Local {
  arm: number
  forearm: number
  thigh: number
  calf: number
  chestA: number
  chestB: number
  waistA: number
  waistB: number
  hipA: number
  neck: number
}

function locals(lean: BodyDims): Local {
  return {
    arm: lean.upperArmR,
    forearm: lean.forearmR,
    thigh: lean.thighR,
    calf: lean.calfR,
    chestA: lean.chest.a,
    chestB: lean.chest.b,
    waistA: lean.waist.a,
    waistB: lean.waist.b,
    hipA: lean.hip.a,
    neck: lean.neck.a,
  }
}

const FRONT: Vec3 = [0, 0, 1]
const BACK: Vec3 = [0, 0, -1]

/** Combine direction hints into a unit vector. */
function dir(...parts: Vec3[]): Vec3 {
  let acc: Vec3 = [0, 0, 0]
  for (const p of parts) acc = add(acc, p)
  return norm(acc)
}

export function buildMuscleGrids(lean: BodyDims, frame: BodyDims): MeshGrid[] {
  const f = bodyFrame(lean)
  const g = gaps(lean, frame)
  const L = locals(lean)
  const H = f.H
  const out: MeshGrid[] = []
  const push = (m: MeshGrid) => out.push(m)

  for (const idx of [0, 1] as const) {
    const side: 1 | -1 = idx === 0 ? 1 : -1
    const s = side
    const LAT: Vec3 = [s, 0, 0]
    const MED: Vec3 = [-s, 0, 0]
    const tag = side > 0 ? 'R' : 'L'

    // ---- Shoulder: three deltoid heads ---------------------------------
    const deltTop = add(f.acromion[idx], v(0, H * 0.004, 0))
    const deltBottom = lerp3(f.shoulder[idx], f.elbow[idx], 0.3)
    push(
      spindle(`deltoid-anterior-${tag}`, add(deltTop, scale(FRONT, lean.chest.b * 0.25)), deltBottom, {
        width: L.arm * 0.831,
        thickness: g.arm * 0.95,
        endScale: 0.3,
        out: dir(FRONT, LAT),
        alpha: 1.7,
        beta: 2.6,
        rings: 8,
      }),
    )
    push(
      spindle(`deltoid-lateral-${tag}`, deltTop, deltBottom, {
        width: L.arm * 0.884,
        thickness: g.arm * 1.15,
        endScale: 0.3,
        out: LAT,
        alpha: 1.7,
        beta: 2.4,
        rings: 8,
      }),
    )
    push(
      spindle(`deltoid-posterior-${tag}`, add(deltTop, scale(BACK, lean.chest.b * 0.28)), deltBottom, {
        width: L.arm * 0.777,
        thickness: g.arm * 0.85,
        endScale: 0.3,
        out: dir(BACK, LAT),
        alpha: 1.7,
        beta: 2.6,
        rings: 8,
      }),
    )

    // ---- Upper arm: biceps (two heads) and triceps (two visible heads) --
    const armTop = lerp3(f.shoulder[idx], f.elbow[idx], 0.16)
    const armBottom = lerp3(f.shoulder[idx], f.elbow[idx], 0.94)
    for (const [n, off] of [
      ['long', 0.45],
      ['short', -0.45],
    ] as const) {
      push(
        spindle(
          `biceps-${n}-${tag}`,
          add(armTop, scale(LAT, g.arm * off * 0.8)),
          add(armBottom, scale(LAT, g.arm * off * 0.5)),
          {
            width: L.arm * 0.59,
            thickness: g.arm * 0.95,
            endScale: 0.34,
            out: FRONT,
            // Biceps peak past the midpoint of the upper arm.
            alpha: 2.7,
            beta: 2.0,
            rings: 9,
          },
        ),
      )
    }
    push(
      spindle(`triceps-lateral-${tag}`, add(armTop, scale(LAT, g.arm * 0.3)), armBottom, {
        width: L.arm * 0.616,
        thickness: g.arm * 0.92,
        endScale: 0.32,
        out: dir(BACK, LAT),
        // Triceps are fullest high, tapering into the elbow tendon.
        alpha: 2.0,
        beta: 2.7,
        rings: 9,
      }),
    )
    push(
      spindle(`triceps-long-${tag}`, add(f.shoulder[idx], scale(BACK, g.arm * 0.3)), armBottom, {
        width: L.arm * 0.563,
        thickness: g.arm * 0.86,
        endScale: 0.32,
        out: dir(BACK, MED),
        alpha: 2.2,
        beta: 2.5,
        rings: 9,
      }),
    )

    // ---- Forearm: flexors, extensors, brachioradialis ------------------
    const feTop = lerp3(f.elbow[idx], f.wrist[idx], 0.04)
    const feBottom = lerp3(f.elbow[idx], f.wrist[idx], 0.97)
    push(
      spindle(`forearm-flexors-${tag}`, feTop, feBottom, {
        width: L.forearm * 0.697,
        thickness: g.forearm * 0.98,
        endScale: 0.3,
        out: FRONT,
        // Forearm mass sits just below the elbow and runs to tendon at the wrist.
        alpha: 1.6,
        beta: 3.4,
        rings: 9,
      }),
    )
    push(
      spindle(`forearm-extensors-${tag}`, feTop, feBottom, {
        width: L.forearm * 0.643,
        thickness: g.forearm * 0.88,
        endScale: 0.3,
        out: dir(BACK, LAT),
        alpha: 1.7,
        beta: 3.2,
        rings: 9,
      }),
    )
    push(
      spindle(`brachioradialis-${tag}`, lerp3(f.elbow[idx], f.wrist[idx], -0.06), lerp3(f.elbow[idx], f.wrist[idx], 0.6), {
        width: L.forearm * 0.509,
        thickness: g.forearm * 0.82,
        endScale: 0.3,
        out: dir(LAT, FRONT),
        alpha: 1.5,
        beta: 2.8,
        rings: 8,
      }),
    )

    // ---- Chest: two pectoral heads -------------------------------------
    const pecInnerUpper = v(s * lean.chest.a * 0.1, (LEVELS.chest + 0.055) * H, lean.chest.b * 0.82)
    const pecInnerLower = v(s * lean.chest.a * 0.12, (LEVELS.chest - 0.025) * H, lean.chest.b * 0.86)
    const pecOuter = add(f.shoulder[idx], scale(FRONT, lean.chest.b * 0.3))
    push(
      spindle(`pectoral-upper-${tag}`, pecInnerUpper, add(pecOuter, v(0, H * 0.012, 0)), {
        width: L.chestB * 0.62,
        // A lean pec is a shelf, not a dome: it stands off the ribcage by well
        // under an inch. Filling the whole bone-to-skin gap gave a barrel chest.
        thickness: g.chestB * 0.5,
        out: FRONT,
        alpha: 2.1,
        beta: 2.1,
        rings: 8,
        endScale: 0.2,
      }),
    )
    push(
      spindle(`pectoral-lower-${tag}`, pecInnerLower, pecOuter, {
        width: L.chestB * 0.84,
        thickness: g.chestB * 0.62,
        out: FRONT,
        alpha: 2.3,
        beta: 1.9,
        rings: 9,
        endScale: 0.18,
      }),
    )

    // ---- Obliques and serratus -----------------------------------------
    push(
      spindle(
        `oblique-${tag}`,
        // Placed off the WAIST's width, not the chest's: an oblique runs down the
        // flank of the midsection, and referencing the ribcage put it outside the
        // narrow part of the torso where it then had to be clipped away.
        v(s * lean.waist.a * 0.7, (LEVELS.chest - 0.05) * H, lean.waist.b * 0.46),
        v(s * lean.waist.a * 0.62, (LEVELS.hip + 0.005) * H, lean.hip.b * 0.3),
        {
          // Sized to the narrow part of the trunk it wraps, so fitting trims it
          // rather than having to cut it back.
          width: L.waistA * 0.33,
          thickness: g.waistA * 0.8,
          endScale: 0.32,
          out: dir(LAT, FRONT),
          alpha: 2.2,
          beta: 2.0,
          rings: 9,
        },
      ),
    )
    push(
      spindle(
        `serratus-${tag}`,
        v(s * lean.chest.a * 0.6, (LEVELS.chest - 0.055) * H, lean.chest.b * 0.55),
        v(s * lean.chest.a * 0.9, (LEVELS.chest + 0.02) * H, -lean.chest.b * 0.1),
        {
          width: L.waistA * 0.268,
          thickness: g.waistA * 0.5,
          endScale: 0.3,
          out: dir(LAT, FRONT),
          alpha: 2,
          beta: 2,
          rings: 7,
        },
      ),
    )

    // ---- Back: lats, traps, erectors ------------------------------------
    push(
      spindle(
        `latissimus-${tag}`,
        v(s * lean.waist.a * 0.42, (LEVELS.waist - 0.02) * H, -lean.waist.b * 0.78),
        v(s * lean.shoulderHalfWidth * 0.72, (LEVELS.shoulder - 0.045) * H, -lean.chest.b * 0.34),
        {
          width: L.chestB * 0.831,
          thickness: g.chestB * 0.72,
          out: dir(BACK, LAT),
          // Widest high, near the armpit — the taper is what makes a V-shape.
          alpha: 2.7,
          beta: 1.8,
          rings: 10,
          endScale: 0.16,
        },
      ),
    )
    push(
      spindle(
        `trapezius-upper-${tag}`,
        v(s * lean.neck.a * 0.35, (LEVELS.neck + 0.008) * H, -lean.neck.b * 0.25),
        add(f.acromion[idx], scale(BACK, lean.chest.b * 0.18)),
        {
          width: L.neck * 0.831,
          thickness: g.neck * 1.05,
          out: dir(BACK, [0, 1, 0]),
          alpha: 1.9,
          beta: 2.2,
          rings: 8,
          endScale: 0.22,
        },
      ),
    )
    push(
      spindle(
        `trapezius-mid-${tag}`,
        v(s * lean.chest.a * 0.12, (LEVELS.chest + 0.045) * H, -lean.chest.b * 0.82),
        v(s * lean.chest.a * 0.78, (LEVELS.shoulder - 0.05) * H, -lean.chest.b * 0.5),
        {
          width: L.chestB * 0.536,
          thickness: g.chestB * 0.5,
          out: BACK,
          alpha: 2,
          beta: 2,
          rings: 7,
          endScale: 0.2,
        },
      ),
    )
    push(
      spindle(
        `erector-${tag}`,
        v(s * lean.waist.a * 0.2, (LEVELS.hip - 0.005) * H, -lean.hip.b * 0.72),
        v(s * lean.waist.a * 0.16, (LEVELS.chest + 0.02) * H, -lean.chest.b * 0.78),
        {
          width: L.waistA * 0.268,
          thickness: g.waistB * 0.62,
          endScale: 0.4,
          out: BACK,
          alpha: 2.4,
          beta: 2.2,
          rings: 8,
        },
      ),
    )

    // ---- Neck ------------------------------------------------------------
    push(
      spindle(
        `sternocleidomastoid-${tag}`,
        v(s * lean.neck.a * 0.62, (LEVELS.chin - 0.004) * H, -lean.neck.b * 0.1),
        v(s * lean.neck.a * 0.3, (LEVELS.shoulder + 0.004) * H, lean.neck.b * 0.72),
        {
          width: L.neck * 0.402,
          thickness: g.neck * 0.6,
          endScale: 0.35,
          out: dir(FRONT, LAT),
          alpha: 2,
          beta: 2,
          rings: 7,
        },
      ),
    )

    // ---- Glutes ----------------------------------------------------------
    push(
      spindle(
        `gluteus-${tag}`,
        v(s * lean.hip.a * 0.22, (LEVELS.hip + 0.02) * H, -lean.hip.b * 0.55),
        v(s * lean.hip.a * 0.72, (LEVELS.crotch + 0.01) * H, -lean.hip.b * 0.35),
        {
          width: L.hipA * 0.563,
          thickness: g.hipA * 1.0,
          out: BACK,
          alpha: 2.1,
          beta: 2.1,
          rings: 9,
          endScale: 0.25,
          bow: g.hipA * 0.25,
        },
      ),
    )

    // ---- Thigh: quadriceps, hamstrings, adductors ------------------------
    const thighTop = lerp3(f.hip[idx], f.knee[idx], 0.05)
    const thighBottom = lerp3(f.hip[idx], f.knee[idx], 0.96)
    push(
      spindle(`rectus-femoris-${tag}`, thighTop, thighBottom, {
        width: L.thigh * 0.536,
        thickness: g.thigh * 0.92,
        endScale: 0.32,
        out: FRONT,
        alpha: 2.2,
        beta: 2.4,
        rings: 10,
      }),
    )
    push(
      spindle(`vastus-lateralis-${tag}`, thighTop, lerp3(f.hip[idx], f.knee[idx], 0.88), {
        width: L.thigh * 0.59,
        thickness: g.thigh * 0.98,
        endScale: 0.3,
        out: dir(LAT, FRONT),
        // Sweeps out mid-thigh — the outer flare of a developed quad.
        alpha: 2.5,
        beta: 2.1,
        rings: 10,
      }),
    )
    push(
      spindle(`vastus-medialis-${tag}`, lerp3(f.hip[idx], f.knee[idx], 0.4), thighBottom, {
        width: L.thigh * 0.482,
        thickness: g.thigh * 0.88,
        endScale: 0.3,
        out: dir(MED, FRONT),
        // The teardrop: peaks just above the knee.
        alpha: 3.2,
        beta: 1.5,
        rings: 9,
      }),
    )
    push(
      spindle(`adductor-${tag}`, add(thighTop, v(0, H * 0.01, 0)), lerp3(f.hip[idx], f.knee[idx], 0.75), {
        width: L.thigh * 0.456,
        thickness: g.thigh * 0.78,
        endScale: 0.3,
        out: MED,
        alpha: 1.7,
        beta: 2.6,
        rings: 9,
      }),
    )
    push(
      spindle(`biceps-femoris-${tag}`, thighTop, lerp3(f.hip[idx], f.knee[idx], 0.92), {
        width: L.thigh * 0.536,
        thickness: g.thigh * 0.92,
        endScale: 0.32,
        out: dir(BACK, LAT),
        alpha: 2.2,
        beta: 2.3,
        rings: 10,
      }),
    )
    push(
      spindle(`semitendinosus-${tag}`, thighTop, lerp3(f.hip[idx], f.knee[idx], 0.94), {
        width: L.thigh * 0.482,
        thickness: g.thigh * 0.85,
        endScale: 0.32,
        out: dir(BACK, MED),
        alpha: 2.2,
        beta: 2.4,
        rings: 10,
      }),
    )

    // ---- Calf: two gastrocnemius heads, soleus, tibialis -----------------
    const shinTop = lerp3(f.knee[idx], f.ankle[idx], 0.02)
    const shinBottom = lerp3(f.knee[idx], f.ankle[idx], 0.97)
    push(
      spindle(`gastrocnemius-medial-${tag}`, shinTop, lerp3(f.knee[idx], f.ankle[idx], 0.78), {
        width: L.calf * 0.616,
        thickness: g.calf * 1.0,
        endScale: 0.28,
        out: dir(BACK, MED),
        // Peaks high and runs into a long Achilles tendon.
        alpha: 1.7,
        beta: 3.2,
        rings: 10,
      }),
    )
    push(
      spindle(`gastrocnemius-lateral-${tag}`, shinTop, lerp3(f.knee[idx], f.ankle[idx], 0.72), {
        width: L.calf * 0.563,
        thickness: g.calf * 0.9,
        endScale: 0.28,
        out: dir(BACK, LAT),
        alpha: 1.6,
        beta: 3.4,
        rings: 10,
      }),
    )
    push(
      spindle(`soleus-${tag}`, lerp3(f.knee[idx], f.ankle[idx], 0.2), shinBottom, {
        width: L.calf * 0.67,
        thickness: g.calf * 0.66,
        endScale: 0.3,
        out: BACK,
        alpha: 1.8,
        beta: 3.0,
        rings: 9,
      }),
    )
    push(
      spindle(`tibialis-anterior-${tag}`, shinTop, lerp3(f.knee[idx], f.ankle[idx], 0.85), {
        width: L.calf * 0.375,
        thickness: g.calf * 0.56,
        endScale: 0.3,
        out: dir(FRONT, LAT),
        alpha: 1.8,
        beta: 3.0,
        rings: 9,
      }),
    )
  }

  // ---- Abdominals: a real six/eight-pack grid ---------------------------
  // Four rows of paired pads with gaps between them: the gaps are the linea alba
  // and the tendinous bands, and they are the whole reason abs read as abs.
  const absTop = (LEVELS.chest - 0.045) * H
  const absBottom = (LEVELS.hip + 0.015) * H
  const rows = 4
  for (let r = 0; r < rows; r++) {
    const t0 = r / rows
    const t1 = (r + 1) / rows
    // Pads narrow slightly as they descend.
    const narrow = 1 - t0 * 0.22
    const y0 = absTop + (absBottom - absTop) * t0
    const y1 = absTop + (absBottom - absTop) * t1
    for (const s of [1, -1] as const) {
      const cx = s * lean.waist.a * 0.37 * narrow
      const zf = lean.waist.b * 0.82
      push(
        spindle(
          `rectus-abdominis-${r + 1}${s > 0 ? 'R' : 'L'}`,
          v(cx, y0 - (y0 - y1) * 0.08, zf),
          v(cx, y1 + (y0 - y1) * 0.08, zf),
          {
            width: L.waistA * 0.26 * narrow,
            thickness: g.waistB * 0.75,
            out: FRONT,
            alpha: 2,
            beta: 2,
            rings: 5,
            radial: 8,
            endScale: 0.45,
          },
        ),
      )
    }
  }
  // Lower abdominal wall below the pads.
  push(
    spindle(
      'lower-abdominals',
      v(0, absBottom + H * 0.004, lean.waist.b * 0.76),
      v(0, (LEVELS.crotch + 0.03) * H, lean.hip.b * 0.7),
      {
        width: L.waistA * 0.44,
        thickness: g.waistB * 0.42,
        out: FRONT,
        alpha: 2,
        beta: 2.4,
        rings: 6,
        endScale: 0.4,
      },
    ),
  )

  return out
}

/**
 * Body parts, each with the colour used when a layer is shown on its own.
 *
 * Hues are the eight validated categorical slots, reused across the body rather
 * than inventing new ones — but assigned so that **no two anatomically touching
 * parts share a hue**, which is the pairing that actually has to be
 * distinguishable. Shoulders never sit next to the yellow group, because orange
 * and yellow are the weakest pair in the palette.
 */
export interface MuscleGroup {
  key: string
  label: string
  color: number
  /** Name fragments that belong to this group. */
  match: string[]
}

export const MUSCLE_GROUPS: MuscleGroup[] = [
  { key: 'chest', label: 'Chest', color: 0x3987e5, match: ['pectoral'] },
  { key: 'shoulders', label: 'Shoulders', color: 0xd95926, match: ['deltoid'] },
  { key: 'abs', label: 'Abs', color: 0x2ee6a8, match: ['rectus-abdominis', 'lower-abdominals'] },
  { key: 'obliques', label: 'Obliques', color: 0xd55181, match: ['oblique', 'serratus'] },
  { key: 'back', label: 'Back', color: 0x1f9e3f, match: ['latissimus', 'trapezius', 'erector'] },
  { key: 'biceps', label: 'Biceps', color: 0x9085e9, match: ['biceps-long', 'biceps-short'] },
  { key: 'triceps', label: 'Triceps', color: 0xe66767, match: ['triceps'] },
  { key: 'forearms', label: 'Forearms', color: 0xc98500, match: ['forearm', 'brachioradialis'] },
  { key: 'glutes', label: 'Glutes', color: 0x3987e5, match: ['gluteus'] },
  { key: 'quads', label: 'Quads', color: 0x9085e9, match: ['rectus-femoris', 'vastus'] },
  { key: 'hamstrings', label: 'Hamstrings', color: 0xd95926, match: ['biceps-femoris', 'semitendinosus', 'adductor'] },
  { key: 'calves', label: 'Calves', color: 0x1f9e3f, match: ['gastrocnemius', 'soleus', 'tibialis'] },
  { key: 'neck', label: 'Neck', color: 0xd55181, match: ['sternocleidomastoid'] },
]

/**
 * Which bellies each *tracked* muscle group is drawn from.
 *
 * The app tracks twelve groups for volume purposes; the mesh has thirty-nine
 * bellies. This is the bridge, so an exercise's `primary` and `secondary` lists can
 * light up the muscles it actually works on the diagram.
 */
export const MUSCLE_BELLIES: Record<Muscle, string[]> = {
  chest: ['pectoral'],
  lats: ['latissimus'],
  upper_back: ['trapezius', 'erector'],
  shoulders: ['deltoid-anterior', 'deltoid-lateral'],
  rear_delts: ['deltoid-posterior'],
  biceps: ['biceps-long', 'biceps-short', 'brachioradialis'],
  triceps: ['triceps'],
  quads: ['rectus-femoris', 'vastus'],
  hamstrings: ['biceps-femoris', 'semitendinosus', 'adductor'],
  glutes: ['gluteus'],
  calves: ['gastrocnemius', 'soleus', 'tibialis'],
  core: ['rectus-abdominis', 'oblique', 'serratus', 'lower-abdominals'],
}

/** Whether a belly belongs to one of the given tracked muscle groups. */
export function bellyInMuscles(name: string, muscles: Muscle[]): boolean {
  return muscles.some((m) => MUSCLE_BELLIES[m].some((frag) => name.includes(frag)))
}

/** Which group a belly belongs to, by its mesh name. */
export function muscleGroupOf(name: string): MuscleGroup | null {
  for (const g of MUSCLE_GROUPS) {
    if (g.match.some((m) => name.includes(m))) return g
  }
  return null
}

export function muscleColorOf(name: string, fallback: number): number {
  return muscleGroupOf(name)?.color ?? fallback
}

export const MUSCLE_GROUP_LABELS = MUSCLE_GROUPS.map((g) => g.label.toLowerCase())

/** Count of distinct bellies, for the UI to report what it is drawing. */
export function muscleCount(lean: BodyDims, frame: BodyDims): number {
  return buildMuscleGrids(lean, frame).length
}

export { sub as subVec }
