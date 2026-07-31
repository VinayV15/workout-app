import { LEVELS, type BodyDims } from './physique'

/**
 * Shared anatomy: joint positions, and the mesh primitives the frame, muscle and
 * surface layers are all built from.
 *
 * The three layers are genuinely different constructions, not the same shape at
 * three sizes:
 *
 *   frame   — bones: thin faceted rods, vertebral blocks, rib hoops. No curves.
 *   muscle  — individual bellies, each a spindle that tapers to a tendon at both
 *             ends, placed on the bone it actually attaches to. Grooves between
 *             them are what make abs read as abs.
 *   surface — one smooth shell per cross-section: the soft outer form fat gives.
 *
 * A single ring per height can only ever produce one smooth outline, which is
 * why muscles need their own primitive rather than a bulgier version of the
 * shell.
 */

export type Vec3 = [number, number, number]

export const v = (x: number, y: number, z: number): Vec3 => [x, y, z]
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
export const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
export const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
]
export const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2])
export function norm(a: Vec3): Vec3 {
  const l = len(a)
  return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 1, 0]
}
export const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

/**
 * A wireframe patch: rows of points. Consecutive points in a row are joined, and
 * point i of each row is joined to point i of the next — a quad grid, exactly
 * the reference's construction with no triangle diagonals.
 */
export interface MeshGrid {
  name: string
  rows: Vec3[][]
  /** Whether each row closes back on itself (a tube) or is an open strip. */
  closedRings: boolean
}

// ---------------------------------------------------------------------------
// Placement constants, shared so the layers line up with each other
// ---------------------------------------------------------------------------

/** How far behind mid-depth the arms hang. */
export const ARM_BACK = 0.35
/** Deltoid radius as a multiple of the upper-arm radius. */
export const DELT_FACTOR = 1.16

export interface BodyFrame {
  H: number
  dims: BodyDims
  /** Sacrum / pelvis centre. */
  pelvis: Vec3
  lumbar: Vec3
  sternumTop: Vec3
  sternumBottom: Vec3
  neckBase: Vec3
  headCentre: Vec3
  crown: Vec3
  /** Index 0 is the body's right (positive x), 1 the left. */
  acromion: [Vec3, Vec3]
  shoulder: [Vec3, Vec3]
  elbow: [Vec3, Vec3]
  wrist: [Vec3, Vec3]
  handEnd: [Vec3, Vec3]
  hip: [Vec3, Vec3]
  knee: [Vec3, Vec3]
  ankle: [Vec3, Vec3]
  toe: [Vec3, Vec3]
  /** Deltoid radius, needed by both the shell and the muscle layer. */
  deltR: number
}

const SIDES: (1 | -1)[] = [1, -1]

/**
 * How far out the hands hang.
 *
 * Arms hanging straight down from the shoulder joint would pass *through* the
 * waist, and arms hanging just outside the hip leave so little space that the
 * eye reads arm and torso as one mass — which is what made a lean body look
 * heavy, because the V-taper was filled in. The hands are therefore set to clear
 * the waist by a real margin, which is also what anatomical reference figures do.
 */
/**
 * Clearance between the forearm and the waist. Small on purpose: arms at rest
 * touch the lats at the armpit and open only slightly below. Forcing a wide gap
 * pushed the hands past the shoulders, so the arms read as separate strips
 * floating beside the body instead of hanging from it.
 */
export const ARM_TORSO_GAP = 0.55

export function armHangX(d: BodyDims): number {
  const deltR = d.upperArmR * DELT_FACTOR
  const deltX = d.shoulderHalfWidth - deltR * 0.94
  // The hand hangs *against* the thigh, not through it. Without this term the
  // forearm passed 2in into the leg, which made a standing figure read as one fused
  // mass from the hip down.
  //
  // Contact rather than clearance is the target, and deliberately so: on wide hips
  // you cannot have both a gap to the thigh and a hand inside the shoulder line, and
  // arms at rest really do touch the outer thigh. So this asks for the forearm's
  // inner edge to reach the thigh — grazing it — and no further out than that.
  const pastThigh = d.hip.a * THIGH_WITHIN_HIP + d.forearmR * 0.9
  const clear = Math.max(d.hip.a * 0.92 + d.wristR, d.waist.a + d.forearmR + ARM_TORSO_GAP, pastThigh)
  // The deltoid normally stays the widest part of the body, as it is on a real
  // standing figure, so the hand does not swing outside the shoulder line. But that
  // rule exists to protect the V-taper, and on a pear-shaped body there is no V to
  // protect: with hips wider than shoulders the arms really do hang outside the
  // shoulder line, because they have to clear the hips.
  //
  // So the cap yields — as far as a forearm's width past the shoulder, and no
  // further, which keeps the arms reading as attached. At the extreme (48in hips on
  // 30in shoulders) that still leaves the forearm touching the thigh, which is what
  // actually happens on that body rather than a modelling failure.
  const reachLimit = d.shoulderHalfWidth + d.forearmR
  const cap = Math.max(d.shoulderHalfWidth - d.forearmR * 0.35, Math.min(pastThigh, reachLimit))
  return Math.min(Math.max(cap, deltX), Math.max(deltX * 0.98, clear))
}

/** Arm path points, so the shell and the muscles agree on where the arm is. */
export function armPoints(d: BodyDims, side: 1 | -1) {
  const H = d.heightIn
  const deltR = d.upperArmR * DELT_FACTOR
  const back = -d.upperArmR * ARM_BACK
  const deltX = side * (d.shoulderHalfWidth - deltR * 0.94)
  const wristX = side * armHangX(d)
  const at = (f: number) => deltX + (wristX - deltX) * f
  return {
    deltR,
    back,
    shoulder: v(deltX, (LEVELS.shoulder - 0.026) * H, back * 0.8),
    upperArm: v(at(0.12), (LEVELS.shoulder - 0.062) * H, back),
    elbow: v(at(0.6), LEVELS.elbow * H, back * 0.9),
    wrist: v(wristX, LEVELS.wrist * H, back * 0.3),
    handEnd: v(wristX, (LEVELS.wrist - 0.078) * H, 0),
  }
}

/**
 * How far out the thigh's outer surface may sit, as a fraction of the hip's
 * half-width. Just inside 1, because the greater trochanter *is* the widest point
 * of the hips and the thigh tapers in below it — a leg cannot be wider than the
 * pelvis it hangs from.
 */
export const THIGH_WITHIN_HIP = 0.97

/**
 * Where a leg's axis sits, at the hip and at the ankle.
 *
 * The single source of truth for leg placement. It has to be: the surface shell kept
 * its own copy of this and drifted, so fixing the muscle and skeleton layers moved
 * those and left the outer shell's legs planted 2-3in outside the pelvis — visibly
 * bolted on, while the layers underneath had already been corrected.
 *
 * Placement is derived from the hip, not from the thigh. The original
 * `max(thighR * 1.12, hip.a * 0.42)` let the thigh term win, so the bigger the legs
 * the further out they went, with nothing tying them to the pelvis — and it got worse
 * the heavier the body, which is backwards.
 *
 * `topScale` is the widest the leg gets at its very top, so callers that flare the
 * first ring (the glute blend on the shell does) still land inside the pelvis.
 */
export function legAxisX(d: BodyDims, side: 1 | -1, topScale = 1): { hipX: number; ankleX: number } {
  const outer = d.hip.a * THIGH_WITHIN_HIP
  // Two thighs are wider than the pelvis on almost every body, so at the top they
  // overlap toward the midline — which is exactly what adductors do. The floor is
  // low because on genuinely thick legs the overlap is genuinely large: a 31in
  // thigh on 40in hips touches its neighbour the whole way up, and a higher floor
  // pushed the outer surface back outside the pelvis to make room.
  const hipX = Math.max(d.thighR * 0.3, outer - d.thighR * topScale)
  return {
    hipX: side * hipX,
    ankleX: side * Math.max(d.ankleR * 1.6, d.thighR * 0.62),
  }
}

/** Leg path points, matching the shell's leg chain. */
export function legPoints(d: BodyDims, side: 1 | -1) {
  const H = d.heightIn
  const { hipX, ankleX } = legAxisX(d, side)
  const at = (f: number) => hipX + (ankleX - hipX) * f
  return {
    hip: v(hipX, (LEVELS.crotch + 0.045) * H, 0),
    knee: v(at(0.62), LEVELS.knee * H, 0),
    calf: v(at(0.76), LEVELS.calf * H, -d.calfR * 0.24),
    ankle: v(at(1), LEVELS.ankle * H, 0),
    toe: v(at(1), 0.004 * H, d.ankleR * 2.0),
  }
}

export function bodyFrame(d: BodyDims): BodyFrame {
  const H = d.heightIn
  const arms = SIDES.map((s) => armPoints(d, s))
  const legs = SIDES.map((s) => legPoints(d, s))
  return {
    H,
    dims: d,
    pelvis: v(0, LEVELS.hip * H, -d.hip.b * 0.1),
    lumbar: v(0, (LEVELS.waist - 0.005) * H, -d.waist.b * 0.35),
    sternumTop: v(0, (LEVELS.shoulder - 0.02) * H, d.chest.b * 0.55),
    sternumBottom: v(0, (LEVELS.chest - 0.035) * H, d.chest.b * 0.72),
    neckBase: v(0, LEVELS.neck * H, 0),
    headCentre: v(0, (LEVELS.chin + (LEVELS.crown - LEVELS.chin) * 0.56) * H, d.headR * 0.06),
    crown: v(0, LEVELS.crown * H, 0),
    acromion: [
      v(d.shoulderHalfWidth * 0.9, LEVELS.shoulder * H, d.chest.b * 0.1),
      v(-d.shoulderHalfWidth * 0.9, LEVELS.shoulder * H, d.chest.b * 0.1),
    ],
    shoulder: [arms[0].shoulder, arms[1].shoulder],
    elbow: [arms[0].elbow, arms[1].elbow],
    wrist: [arms[0].wrist, arms[1].wrist],
    handEnd: [arms[0].handEnd, arms[1].handEnd],
    hip: [legs[0].hip, legs[1].hip],
    knee: [legs[0].knee, legs[1].knee],
    ankle: [legs[0].ankle, legs[1].ankle],
    toe: [legs[0].toe, legs[1].toe],
    deltR: arms[0].deltR,
  }
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** Orthonormal frame around an axis, used to sweep rings along it. */
function axisFrame(axis: Vec3, preferOut?: Vec3) {
  const a = norm(axis)
  // Choose an "outward" reference that is not parallel to the axis.
  let out = preferOut ? norm(preferOut) : ([0, 0, 1] as Vec3)
  const dot = a[0] * out[0] + a[1] * out[1] + a[2] * out[2]
  if (Math.abs(dot) > 0.98) out = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
  // Re-orthogonalise out against the axis.
  const proj = a[0] * out[0] + a[1] * out[1] + a[2] * out[2]
  const o = norm(sub(out, scale(a, proj)))
  const side = norm(cross(a, o))
  return { axis: a, out: o, side }
}

/**
 * Normalised belly profile: zero at both ends, peaking somewhere between.
 * `alpha`/`beta` skew where the thickest part sits — a biceps peaks past
 * halfway, a gastrocnemius peaks early and tapers into a long tendon.
 */
function bellyProfile(t: number, alpha: number, beta: number): number {
  const peak = alpha / (alpha + beta)
  const maxV = peak ** alpha * (1 - peak) ** beta
  const val = t ** alpha * (1 - t) ** beta
  return maxV > 0 ? val / maxV : 0
}

export interface SpindleOptions {
  /** Half-width across the muscle, at its thickest. */
  width: number
  /** How far it stands off the bone, at its thickest. */
  thickness: number
  /** Profile skew: higher alpha pushes the belly toward the far end. */
  alpha?: number
  beta?: number
  /** Direction the muscle bulges. */
  out?: Vec3
  rings?: number
  radial?: number
  /** Keep a little thickness at the ends instead of a sharp point. */
  endScale?: number
  /** Bow the whole belly outward along `out`, for muscles that wrap a limb. */
  bow?: number
}

/**
 * A muscle belly: an ellipse swept along the bone, tapering to tendons at both
 * ends, its inner face sitting on the bone and its bulk standing outward.
 */
/**
 * Global detail multiplier for the anatomical bellies. The reference art has a
 * very fine grid, and density is also what lets muscle relief resolve on the
 * skin: too few rings and four rows of abs cannot be told apart.
 */
export const BELLY_DETAIL = 1.9

export function spindle(name: string, p0: Vec3, p1: Vec3, o: SpindleOptions): MeshGrid {
  const rings = Math.max(5, Math.round((o.rings ?? 9) * BELLY_DETAIL))
  // Radial counts must be EVEN. With an odd count a mirrored belly's points land
  // half a step round from its partner's instead of mirroring exactly, so the
  // left and right sides come out subtly different.
  const radial = Math.max(6, 2 * Math.round(((o.radial ?? 8) * BELLY_DETAIL) / 2))
  const alpha = o.alpha ?? 2
  const beta = o.beta ?? 2
  const endScale = o.endScale ?? 0.12
  const bow = o.bow ?? 0
  const f = axisFrame(sub(p1, p0), o.out)
  const rows: Vec3[][] = []

  for (let i = 0; i < rings; i++) {
    const t = i / (rings - 1)
    const p = bellyProfile(t, alpha, beta)
    const amp = endScale + (1 - endScale) * p
    const w = o.width * amp
    const th = o.thickness * amp
    // Sit the inner face on the bone and bulge outward, plus any extra bow.
    const centre = add(lerp3(p0, p1, t), scale(f.out, th + bow * p))
    const row: Vec3[] = []
    for (let k = 0; k < radial; k++) {
      const a = (2 * Math.PI * k) / radial
      row.push(add(centre, add(scale(f.side, Math.cos(a) * w), scale(f.out, Math.sin(a) * th))))
    }
    rows.push(row)
  }
  return { name, rows, closedRings: true }
}

/**
 * A bone: a thin, faceted, straight rod with a slight swell at each end for the
 * joint. Deliberately low-sided and un-curved — the frame layer should read as
 * skeleton, not as a skinny body.
 */
export function bone(name: string, p0: Vec3, p1: Vec3, radius: number, sides = 8): MeshGrid {
  const f = axisFrame(sub(p1, p0))
  const stops = [
    { t: 0, r: radius * 1.5 },
    { t: 0.08, r: radius * 0.95 },
    { t: 0.5, r: radius * 0.8 },
    { t: 0.92, r: radius * 0.95 },
    { t: 1, r: radius * 1.5 },
  ]
  const rows: Vec3[][] = []
  for (const s of stops) {
    const centre = lerp3(p0, p1, s.t)
    const row: Vec3[] = []
    for (let k = 0; k < sides; k++) {
      const a = (2 * Math.PI * k) / sides
      row.push(add(centre, add(scale(f.side, Math.cos(a) * s.r), scale(f.out, Math.sin(a) * s.r))))
    }
    rows.push(row)
  }
  return { name, rows, closedRings: true }
}

/** A faceted block, for vertebrae and the small bones of the hands and feet. */
export function block(name: string, centre: Vec3, halfX: number, halfY: number, halfZ: number): MeshGrid {
  const rows: Vec3[][] = []
  for (const sy of [-1, 1]) {
    const y = centre[1] + sy * halfY
    rows.push([
      v(centre[0] - halfX, y, centre[2] - halfZ),
      v(centre[0] + halfX, y, centre[2] - halfZ),
      v(centre[0] + halfX, y, centre[2] + halfZ),
      v(centre[0] - halfX, y, centre[2] + halfZ),
    ])
  }
  return { name, rows, closedRings: true }
}

/** A flat plate, for the scapula and pelvis. */
export function plate(name: string, corners: [Vec3, Vec3, Vec3, Vec3], thickness: number, div = 3): MeshGrid {
  const rows: Vec3[][] = []
  const nrm = norm(cross(sub(corners[1], corners[0]), sub(corners[3], corners[0])))
  for (const off of [-thickness / 2, thickness / 2]) {
    for (let i = 0; i <= div; i++) {
      const t = i / div
      const left = lerp3(corners[0], corners[3], t)
      const right = lerp3(corners[1], corners[2], t)
      const row: Vec3[] = []
      for (let k = 0; k <= div; k++) {
        row.push(add(lerp3(left, right, k / div), scale(nrm, off)))
      }
      rows.push(row)
    }
  }
  return { name, rows, closedRings: false }
}

/** A faceted skull: low-sided so it reads as bone rather than a smooth head. */
export function skull(name: string, centre: Vec3, breadth: number, height: number, depth: number): MeshGrid {
  const rows: Vec3[][] = []
  const ringCount = 9
  const radial = 12
  for (let i = 0; i < ringCount; i++) {
    const phi = (Math.PI * (i + 0.5)) / ringCount
    const y = centre[1] + Math.cos(phi) * height
    const s = Math.sin(phi)
    const below = y < centre[1] ? (centre[1] - y) / height : 0
    const taper = 1 - below * 0.35
    const row: Vec3[] = []
    for (let k = 0; k < radial; k++) {
      const a = (2 * Math.PI * k) / radial
      row.push(v(centre[0] + Math.cos(a) * breadth * s * taper, y, centre[2] + Math.sin(a) * depth * s * taper))
    }
    rows.push(row)
  }
  return { name, rows, closedRings: true }
}

/**
 * How many vertices each grid contributes, in the same order `gridsToSegments`
 * emits them. Lets the renderer colour per body part without a draw call each.
 */
export function gridVertexCounts(grids: MeshGrid[]): { name: string; count: number }[] {
  return grids.map((g) => {
    let count = 0
    for (const row of g.rows) count += (g.closedRings ? row.length : row.length - 1) * 2
    for (let r = 0; r < g.rows.length - 1; r++) count += Math.min(g.rows[r].length, g.rows[r + 1].length) * 2
    return { name: g.name, count }
  })
}

/**
 * Triangulates the grids into a solid surface.
 *
 * Used only to write depth: with a solid form occupying the z-buffer, wireframe
 * lines on the far side of the body are correctly hidden, so a front view shows
 * the front and a side view shows the side. Without it every line shows through
 * and the body reads as a transparent cage.
 */
export function gridsToTriangles(grids: MeshGrid[]): Float32Array {
  const out: number[] = []
  const tri = (a: Vec3, b: Vec3, c: Vec3) => {
    out.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2])
  }
  for (const g of grids) {
    for (let r = 0; r < g.rows.length - 1; r++) {
      const rowA = g.rows[r]
      const rowB = g.rows[r + 1]
      const n = Math.min(rowA.length, rowB.length)
      const last = g.closedRings ? n : n - 1
      for (let i = 0; i < last; i++) {
        const j = (i + 1) % n
        // Both windings, so the shell writes depth from either side and a
        // single-sided patch (a plate) still occludes.
        tri(rowA[i], rowB[i], rowB[j])
        tri(rowA[i], rowB[j], rowA[j])
      }
    }
  }
  return new Float32Array(out)
}

/** Flattens grids into line-segment pairs for a LineSegments geometry. */
export function gridsToSegments(grids: MeshGrid[]): Float32Array {
  const out: number[] = []
  const push = (p: Vec3) => out.push(p[0], p[1], p[2])
  for (const g of grids) {
    for (const row of g.rows) {
      const last = g.closedRings ? row.length : row.length - 1
      for (let i = 0; i < last; i++) {
        push(row[i])
        push(row[(i + 1) % row.length])
      }
    }
    for (let r = 0; r < g.rows.length - 1; r++) {
      const a = g.rows[r]
      const b = g.rows[r + 1]
      const n = Math.min(a.length, b.length)
      for (let i = 0; i < n; i++) {
        push(a[i])
        push(b[i])
      }
    }
  }
  return new Float32Array(out)
}
