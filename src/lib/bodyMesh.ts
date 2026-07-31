import { LEVELS, SECTION_EXPONENT, type BodyDims } from './physique'
import { armHangX, gridsToSegments, type MeshGrid, type Vec3 } from './anatomy'

/**
 * Builds the wireframe body as rings of points.
 *
 * The reference style is a pure quad mesh — no triangle diagonals — so this
 * produces rings plus longitudinal lines rather than a triangulated surface.
 * Everything is generated procedurally: there is no model file to download,
 * license or ship.
 *
 * Anatomy notes that matter for it reading as a body rather than a mannequin:
 *
 *  - Cross-sections are superellipses, not ellipses. A human torso is flat-ish
 *    front and back with rounded corners; a true ellipse looks like a tube.
 *  - The torso is NOT as wide as the shoulders. Clavicle width is roughly 60% of
 *    total shoulder width — the deltoids supply the rest. Making the torso itself
 *    shoulder-width is what produces the "coat hanger" silhouette.
 *  - The deltoids are therefore their own rounded caps, blending the torso into
 *    the arm, and the arms hang abducted a few degrees so they read separately.
 *
 * Units are inches; the caller centres and scales for the camera.
 */

export interface Ring {
  /** Height above the floor. */
  y: number
  /** Centre offset across the body and front-to-back. */
  cx: number
  cz: number
  /** Semi-axis across (a) and front-to-back (b). */
  a: number
  b: number
  /**
   * Superellipse exponent. 2 is a pure ellipse; higher is squarer with rounded
   * corners, which is what a torso cross-section actually looks like.
   */
  n?: number
}

export interface Chain {
  /** Identifies the body part, for tests and debugging. */
  name: string
  rings: Ring[]
  /** Points around each ring. */
  radial: number
  closed: boolean
}

const TORSO_RINGS = 96
const TORSO_RADIAL = 64
const LIMB_RINGS = 44
const LIMB_RADIAL = 30
const HEAD_RINGS = 30
const HEAD_RADIAL = 40

/** Torso cross-section squareness, and the limbs' (nearly circular). */
const TORSO_N = 2.7
const LIMB_N = 2.1

interface Control {
  t: number
  a: number
  b: number
  cz?: number
  n?: number
}

/** Smooth interpolation between control points along the body. */
function resample(control: Control[], count: number): Required<Control>[] {
  const out: Required<Control>[] = []
  const first = control[0]
  const last = control[control.length - 1]
  for (let i = 0; i < count; i++) {
    const t = first.t + ((last.t - first.t) * i) / (count - 1)
    let k = 0
    while (k < control.length - 2 && control[k + 1].t < t) k++
    const p0 = control[k]
    const p1 = control[k + 1]
    const span = p1.t - p0.t || 1
    const u = Math.max(0, Math.min(1, (t - p0.t) / span))
    // Smoothstep keeps the silhouette rounded rather than faceted at landmarks.
    const s = u * u * (3 - 2 * u)
    const lerp = (x: number, y: number) => x + (y - x) * s
    out.push({
      t,
      a: lerp(p0.a, p1.a),
      b: lerp(p0.b, p1.b),
      cz: lerp(p0.cz ?? 0, p1.cz ?? 0),
      n: lerp(p0.n ?? TORSO_N, p1.n ?? TORSO_N),
    })
  }
  return out
}

/**
 * Torso from the crotch to the jaw. The width here is clavicle/ribcage width;
 * the deltoid caps below add the rest of the shoulder span.
 */
function torsoChain(d: BodyDims): Chain {
  const H = d.heightIn
  // Clavicle span is about 60% of full shoulder width — the deltoids are the
  // other 40%, and treating them separately is what fixes the boxy shoulder.
  const clavicleA = d.shoulderHalfWidth * 0.6

  /**
   * How much belly there is, read off the shape itself: a lean abdomen is
   * shallower than the chest, a heavy one is deeper. Derived from the dimensions
   * rather than passed in, so it works for measured and projected bodies alike.
   */
  const belly = Math.max(0, Math.min(1, (d.waist.b / Math.max(d.chest.b, 0.1) - 0.85) / 0.45))
  // A belly protrudes forward and hangs low; it does not sit as an even ring.
  const forward = d.waist.b * belly * 0.34
  // The fullest point drops toward the navel and below as it grows.
  const sag = belly * 0.03
  const control: Control[] = [
    // Below the hip, tapering to where the legs separate.
    // The torso's lower opening tucks down between the legs, which the leg
    // chains then overlap — a wide flat ring here reads as a nappy outline.
    { t: LEVELS.crotch - 0.055, a: d.hip.a * 0.3, b: d.hip.b * 0.42, n: 2.2 },
    // Widest point of the pelvis is the greater trochanter, and it is LOW —
    // roughly half standing height. Putting the measured hip width up at the
    // iliac crest is what made the lower abdomen bulge out.
    { t: LEVELS.crotch + 0.02, a: d.hip.a, b: d.hip.b * 0.94, cz: forward * 0.5, n: 2.7 },
    // Between trochanter and crest — without this the pelvis narrows in one step
    // and the seam reads as a band across the hips.
    {
      t: LEVELS.hip - 0.005,
      a: d.waist.a + (d.hip.a - d.waist.a) * (0.62 + 0.2 * belly),
      b: d.waist.b + (d.hip.b - d.waist.b) * (0.6 + 0.25 * belly),
      cz: forward * 0.6,
      n: 2.65,
    },
    // Iliac crest: only a little wider than the waist on a lean body.
    {
      t: LEVELS.hip + 0.04,
      a: d.waist.a + (d.hip.a - d.waist.a) * (0.22 + 0.35 * belly),
      b: d.waist.b + (d.hip.b - d.waist.b) * (0.2 + 0.4 * belly),
      cz: forward * 0.75,
      n: 2.6,
    },
    // Lower abdomen. Flat on a lean body — flatter than the navel, not fuller —
    // and only becomes the fullest point once there is fat to fill it.
    {
      t: LEVELS.waist - 0.03 - sag,
      a: d.waist.a * (0.97 + 0.03 * belly),
      b: d.waist.b * (0.9 + 0.18 * belly),
      cz: forward * 0.9,
      n: 2.5,
    },
    // Navel: the narrowest point on a lean body.
    { t: LEVELS.waist, a: d.waist.a, b: d.waist.b, cz: -d.waist.b * 0.05 + forward * 0.92, n: SECTION_EXPONENT.waist },
    // Bottom of the ribcage. On a lean body this is only slightly wider than the
    // waist — making it near chest width is what erased the taper.
    {
      t: LEVELS.waist + (LEVELS.chest - LEVELS.waist) * 0.5,
      a: d.waist.a + (d.chest.a * 0.93 - d.waist.a) * (0.42 + 0.5 * belly),
      b: d.waist.b + (d.chest.b * 0.95 - d.waist.b) * (0.45 + 0.5 * belly),
      cz: forward * 0.45,
      n: 2.8,
    },
    // Nipple line.
    { t: LEVELS.chest, a: d.chest.a * 0.97, b: d.chest.b, cz: d.chest.b * 0.02, n: SECTION_EXPONENT.chest },
    // The ARMPIT is the widest the trunk gets, not the nipple line. With the
    // widest point lower down, the trunk read as a rounded bulb; putting it here
    // gives the straight diagonal lat line a lean torso actually has.
    { t: LEVELS.chest + (LEVELS.shoulder - LEVELS.chest) * 0.6, a: d.chest.a, b: d.chest.b * 0.92, n: 2.85 },
    // Above the armpit the trunk narrows quickly into the clavicles.
    { t: LEVELS.shoulder - 0.014, a: clavicleA * 1.12, b: d.chest.b * 0.84, n: 2.72 },
    { t: LEVELS.shoulder + 0.006, a: clavicleA, b: d.chest.b * 0.74, n: 2.6 },
    // Trapezius ramp into the neck.
    { t: LEVELS.neck, a: d.neck.a * 1.5, b: d.neck.b * 1.45, n: 2.4 },
    { t: LEVELS.chin - 0.004, a: d.neck.a, b: d.neck.b, cz: -d.neck.b * 0.04, n: 2.2 },
    // Slight overlap into the jaw so the head never floats.
    { t: LEVELS.chin + 0.012, a: d.neck.a * 0.94, b: d.neck.b * 0.96, cz: 0, n: 2.2 },
  ]
  const sampled = resample(control, TORSO_RINGS)
  return {
    name: 'torso',
    radial: TORSO_RADIAL,
    closed: true,
    rings: sampled.map((s) => ({ y: s.t * H, cx: 0, cz: s.cz, a: s.a, b: s.b, n: s.n })),
  }
}

/**
 * Head: an egg-shaped ellipsoid overlapping the neck. No features — the mesh is
 * the form.
 *
 * A head is much taller than it is wide: roughly 9in from chin to crown on a
 * 70in body but only about 6in across, and slightly deeper than it is wide. A
 * sphere sized off the vertical span produces the beach-ball look, so breadth
 * comes from `headR` and the height comes from the chin and crown landmarks.
 */
function headChain(d: BodyDims): Chain {
  const H = d.heightIn
  const breadth = d.headR
  const depth = breadth * 1.24
  const bottomY = (LEVELS.chin - 0.015) * H
  const topY = LEVELS.crown * H
  const centreY = bottomY + (topY - bottomY) * 0.56
  const halfHeight = (topY - bottomY) / 2
  const rings: Ring[] = []
  for (let i = 0; i < HEAD_RINGS; i++) {
    const phi = (Math.PI * (i + 0.5)) / HEAD_RINGS
    const y = centreY + Math.cos(phi) * halfHeight
    const scale = Math.sin(phi)
    // Taper the jaw below the centre so it is not a perfect ovoid.
    const below = y < centreY ? (centreY - y) / halfHeight : 0
    const taper = 1 - below * 0.3
    rings.push({
      y,
      cx: 0,
      // The skull sits slightly back of the jaw line.
      cz: depth * 0.06 - below * depth * 0.1,
      a: breadth * scale * taper,
      b: depth * scale * taper,
      n: 2.2,
    })
  }
  return { name: 'head', radial: HEAD_RADIAL, closed: true, rings }
}

interface Stop {
  t: number
  r: number
  x: number
  cz?: number
  squash?: number
}

function limbFromStops(name: string, stops: Stop[], H: number, ringCount: number): Chain {
  const rings: Ring[] = []
  for (let i = 0; i < ringCount; i++) {
    const u = i / (ringCount - 1)
    const idx = u * (stops.length - 1)
    const k = Math.min(stops.length - 2, Math.floor(idx))
    const f = idx - k
    const s0 = stops[k]
    const s1 = stops[k + 1]
    const sm = f * f * (3 - 2 * f)
    const lerp = (x: number, y: number) => x + (y - x) * sm
    const r = lerp(s0.r, s1.r)
    const squash = lerp(s0.squash ?? 1, s1.squash ?? 1)
    rings.push({
      y: lerp(s0.t, s1.t) * H,
      cx: lerp(s0.x, s1.x),
      cz: lerp(s0.cz ?? 0, s1.cz ?? 0),
      a: r * squash,
      b: r,
      n: LIMB_N,
    })
  }
  return { name, radial: LIMB_RADIAL, closed: true, rings }
}

/**
 * Shoulder and arm as ONE continuous chain, from the top of the deltoid down to
 * the hand.
 *
 * Modelling the deltoid as its own sphere makes it read as a puffed sleeve
 * sitting beside the body — the shoulder has to flow into the upper arm as a
 * single tapering form, which is what it does anatomically. The top ring is the
 * deltoid at full width and overlaps the torso, so the joint looks attached.
 *
 * The hand is a simple tapered paddle: no fingers, which suits a mesh-only style
 * rather than implying detail the model does not have.
 */
function armChain(d: BodyDims, side: 1 | -1): Chain {
  const H = d.heightIn
  // Deltoid radius. Kept modest: inflating it much past the upper arm turns the
  // shoulder into a shoulder pad.
  const deltR = d.upperArmR * 1.16
  const deltX = side * (d.shoulderHalfWidth - deltR * 0.94)
  const wristX = side * armHangX(d)
  const lerpX = (f: number) => deltX + (wristX - deltX) * f
  // Arms hang behind the body's mid-depth, which is what stops them reading as
  // panels glued to the front of the torso.
  const back = -d.upperArmR * 0.35
  const stops: Stop[] = [
    // Deltoid dome. Several closely-spaced stops are needed here: jumping
    // straight to full width gives the shoulder a square corner.
    // A spherical cap: several closely-spaced rings following a circular profile,
    // so the shoulder is round rather than a pad with a flat top.
    { t: LEVELS.shoulder + 0.026, r: deltR * 0.16, x: deltX - side * deltR * 0.62, cz: back * 0.2, squash: 0.95 },
    { t: LEVELS.shoulder + 0.022, r: deltR * 0.38, x: deltX - side * deltR * 0.48, cz: back * 0.3, squash: 0.95 },
    { t: LEVELS.shoulder + 0.016, r: deltR * 0.62, x: deltX - side * deltR * 0.3, cz: back * 0.45, squash: 0.96 },
    { t: LEVELS.shoulder + 0.008, r: deltR * 0.83, x: deltX - side * deltR * 0.15, cz: back * 0.6 },
    { t: LEVELS.shoulder - 0.002, r: deltR * 0.95, x: deltX - side * deltR * 0.04, cz: back * 0.72 },
    // Widest part of the deltoid.
    { t: LEVELS.shoulder - 0.026, r: deltR, x: deltX, cz: back * 0.8 },
    // Deltoid insertion, tapering into the upper arm.
    { t: LEVELS.shoulder - 0.062, r: d.upperArmR, x: lerpX(0.12), cz: back },
    { t: LEVELS.elbow + 0.04, r: d.upperArmR * 0.86, x: lerpX(0.48), cz: back },
    // Elbow, then the forearm's belly and taper to the wrist.
    { t: LEVELS.elbow, r: d.forearmR * 1.03, x: lerpX(0.58), cz: back * 0.9 },
    { t: LEVELS.elbow - 0.045, r: d.forearmR, x: lerpX(0.72), cz: back * 0.7 },
    { t: LEVELS.wrist + 0.022, r: d.wristR * 1.12, x: lerpX(0.94), cz: back * 0.4 },
    { t: LEVELS.wrist, r: d.wristR, x: wristX, cz: back * 0.3, squash: 0.82 },
    // Hand.
    { t: LEVELS.wrist - 0.022, r: d.wristR * 1.2, x: wristX, cz: back * 0.2, squash: 0.5 },
    { t: LEVELS.wrist - 0.058, r: d.wristR * 1.08, x: wristX, squash: 0.42 },
    { t: LEVELS.wrist - 0.078, r: d.wristR * 0.5, x: wristX, squash: 0.46 },
  ]
  return limbFromStops(`arm${side > 0 ? 'R' : 'L'}`, stops, H, LIMB_RINGS + 6)
}

/** A leg from the hip to the ankle, plus a simple wedge foot pointing forward. */
function legChain(d: BodyDims, side: 1 | -1): Chain {
  const H = d.heightIn
  // Position from the thigh's own radius, not from hip width: driving it off the
  // hip lets thick thighs overlap through the centreline, which reads as one
  // fused block instead of two legs.
  // 1.12 accounts for the glute blend inflating the topmost thigh ring, so the
  // two legs just meet at the crotch rather than passing through each other.
  const hipX = side * Math.max(d.thighR * 1.12, d.hip.a * 0.42)
  // Legs converge slightly toward the ankles, as they actually do.
  const ankleX = side * Math.max(d.ankleR * 1.6, d.thighR * 0.62)
  const xAt = (f: number) => hipX + (ankleX - hipX) * f
  // The vastus lateralis sweeps the outside of the thigh outward at mid-length.
  // That outward curve is what distinguishes a developed leg from a plain tube.
  const sweep = (f: number) =>
    side * d.thighR * 0.13 * Math.sin(Math.PI * Math.min(1, Math.max(0, f / 0.62)))
  const stops: Stop[] = [
    { t: LEVELS.crotch + 0.045, r: d.thighR * 1.04, x: xAt(0) },
    { t: LEVELS.crotch - 0.02, r: d.thighR, x: xAt(0.1) + sweep(0.1) },
    // Widest through the upper third, then a long taper toward the knee.
    { t: LEVELS.thigh + 0.02, r: d.thighR * 0.95, x: xAt(0.24) + sweep(0.24) },
    { t: LEVELS.thigh - 0.06, r: d.thighR * 0.83, x: xAt(0.4) + sweep(0.4) },
    // Just above the joint the quad tendon narrows sharply — that contrast is
    // most of what makes a thigh read as a thigh.
    { t: LEVELS.knee + 0.032, r: d.kneeR * 1.16, x: xAt(0.56) + sweep(0.56) },
    { t: LEVELS.knee, r: d.kneeR, x: xAt(0.62) },
    // Calf: full high, then a long taper into a thin ankle.
    { t: LEVELS.knee - 0.032, r: d.calfR * 0.95, x: xAt(0.68), cz: -d.calfR * 0.12 },
    { t: LEVELS.calf, r: d.calfR, x: xAt(0.76), cz: -d.calfR * 0.26 },
    { t: LEVELS.calf - 0.045, r: d.calfR * 0.8, x: xAt(0.84), cz: -d.calfR * 0.18 },
    { t: LEVELS.ankle + 0.045, r: d.ankleR * 1.2, x: xAt(0.95), cz: -d.calfR * 0.05 },
    { t: LEVELS.ankle, r: d.ankleR, x: xAt(1) },
    // Foot: flattened and pushed forward.
    { t: LEVELS.ankle - 0.022, r: d.ankleR * 1.08, x: xAt(1), cz: d.ankleR * 1.0, squash: 0.85 },
    { t: 0.004, r: d.ankleR * 0.92, x: xAt(1), cz: d.ankleR * 2.0, squash: 0.78 },
  ]
  return limbFromStops(`leg${side > 0 ? 'R' : 'L'}`, stops, H, LIMB_RINGS + 3)
}

export function buildChains(d: BodyDims): Chain[] {
  return [torsoChain(d), headChain(d), armChain(d, 1), armChain(d, -1), legChain(d, 1), legChain(d, -1)]
}

/** Superellipse point, which is what gives the torso a human cross-section. */
function ringPoint(r: Ring, i: number, radial: number): [number, number, number] {
  const theta = (2 * Math.PI * i) / radial
  const n = r.n ?? 2
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  const e = 2 / n
  const sx = Math.sign(c) * Math.abs(c) ** e
  const sz = Math.sign(s) * Math.abs(s) ** e
  return [r.cx + sx * r.a, r.y, r.cz + sz * r.b]
}

/**
 * Flattens the chains into line-segment vertex pairs: one pass around each ring,
 * one pass along each longitude. That is exactly the quad grid in the reference.
 */
export function chainsToSegments(chains: Chain[]): Float32Array {
  const out: number[] = []
  const push = (p: [number, number, number]) => out.push(p[0], p[1], p[2])

  for (const chain of chains) {
    const { rings, radial } = chain
    for (const ring of rings) {
      for (let i = 0; i < radial; i++) {
        push(ringPoint(ring, i, radial))
        push(ringPoint(ring, (i + 1) % radial, radial))
      }
    }
    for (let k = 0; k < rings.length - 1; k++) {
      for (let i = 0; i < radial; i++) {
        push(ringPoint(rings[k], i, radial))
        push(ringPoint(rings[k + 1], i, radial))
      }
    }
  }
  return new Float32Array(out)
}

/**
 * The smooth outer shell as mesh grids, so the frame, muscle and surface layers
 * all feed the same renderer.
 */
export function surfaceGrids(d: BodyDims): MeshGrid[] {
  return buildChains(d).map((chain) => ({
    name: chain.name,
    closedRings: chain.closed,
    rows: chain.rings.map((ring) => {
      const row: Vec3[] = []
      for (let i = 0; i < chain.radial; i++) row.push(ringPoint(ring, i, chain.radial))
      return row
    }),
  }))
}

/**
 * Pulls any point that has strayed outside a body section back onto it.
 *
 * Muscle bellies are placed by anatomical rule, which means a wide one can end up
 * poking through the skin or drifting into the space the arm occupies. Rather
 * than hand-tuning each placement, every belly is fitted to the lean surface it
 * belongs to: this is what guarantees the groups stay aligned with the body, and
 * it keeps working when a muscle definition changes.
 */
function clampToChain(p: Vec3, chain: Chain, margin: number): Vec3 {
  const rings = chain.rings
  // Find the bracketing rings by height WITHOUT assuming an ordering: the torso
  // is built bottom-to-top but limbs are built top-to-bottom, and assuming
  // ascending order silently clamped arm muscles against the hand.
  let i = 0
  for (let k = 1; k < rings.length; k++) {
    if (Math.abs(rings[k].y - p[1]) < Math.abs(rings[i].y - p[1])) i = k
  }
  let j = i
  for (const cand of [i - 1, i + 1]) {
    if (cand < 0 || cand >= rings.length) continue
    // Prefer the neighbour on the opposite side of the point.
    if ((rings[i].y - p[1]) * (rings[cand].y - p[1]) <= 0) {
      j = cand
      break
    }
  }
  const r0 = rings[i]
  const r1 = rings[j]
  const span = r1.y - r0.y
  const t = span !== 0 ? Math.max(0, Math.min(1, (p[1] - r0.y) / span)) : 0
  const lerp = (a: number, b: number) => a + (b - a) * t
  const cx = lerp(r0.cx, r1.cx)
  const cz = lerp(r0.cz, r1.cz)
  const a = lerp(r0.a, r1.a) * margin
  const b = lerp(r0.b, r1.b) * margin
  const n = lerp(r0.n ?? 2, r1.n ?? 2)

  const dx = p[0] - cx
  const dz = p[2] - cz
  if (a <= 0 || b <= 0) return p
  // Superellipse test: inside when this sum is at most 1.
  const f = Math.abs(dx / a) ** n + Math.abs(dz / b) ** n
  if (f <= 1) return p
  const shrink = f ** (-1 / n)
  return [cx + dx * shrink, p[1], cz + dz * shrink]
}

/** Which body section each muscle belongs inside. */
export function sectionFor(name: string): 'torso' | 'armR' | 'armL' | 'legR' | 'legL' | null {
  const right = name.endsWith('R')
  const ARM = ['deltoid', 'biceps-long', 'biceps-short', 'triceps', 'forearm', 'brachioradialis']
  const LEG = [
    'rectus-femoris',
    'vastus',
    'adductor',
    'biceps-femoris',
    'semitendinosus',
    'gastrocnemius',
    'soleus',
    'tibialis',
  ]
  if (ARM.some((m) => name.includes(m))) return right ? 'armR' : 'armL'
  if (LEG.some((m) => name.includes(m))) return right ? 'legR' : 'legL'
  return 'torso'
}

/**
 * How far outside its section a point sits: at most 1 is inside, above 1 is
 * through the surface. Exposed so the fitting can be verified rather than
 * assumed.
 */
export function containment(p: Vec3, chain: Chain, margin = 1): number {
  const rings = chain.rings
  let i = 0
  for (let k = 1; k < rings.length; k++) {
    if (Math.abs(rings[k].y - p[1]) < Math.abs(rings[i].y - p[1])) i = k
  }
  let j = i
  for (const cand of [i - 1, i + 1]) {
    if (cand < 0 || cand >= rings.length) continue
    if ((rings[i].y - p[1]) * (rings[cand].y - p[1]) <= 0) {
      j = cand
      break
    }
  }
  const r0 = rings[i]
  const r1 = rings[j]
  const span = r1.y - r0.y
  const t = span !== 0 ? Math.max(0, Math.min(1, (p[1] - r0.y) / span)) : 0
  const lerp = (a: number, b: number) => a + (b - a) * t
  const a = lerp(r0.a, r1.a) * margin
  const b = lerp(r0.b, r1.b) * margin
  const n = lerp(r0.n ?? 2, r1.n ?? 2)
  if (a <= 0 || b <= 0) return 0
  const dx = p[0] - lerp(r0.cx, r1.cx)
  const dz = p[2] - lerp(r0.cz, r1.cz)
  return Math.abs(dx / a) ** n + Math.abs(dz / b) ** n
}

/**
 * Fits muscle geometry inside the lean surface, so no belly overlaps a limb or
 * breaks the skin. `margin` leaves them just under the surface.
 */
export function fitMusclesToSurface(grids: MeshGrid[], lean: BodyDims, margin = 0.97): MeshGrid[] {
  const chains = new Map(buildChains(lean).map((c) => [c.name, c]))
  return grids.map((g) => {
    const section = sectionFor(g.name)
    const chain = section ? chains.get(section) : undefined
    if (!chain) return g
    return { ...g, rows: g.rows.map((row) => row.map((p) => clampToChain(p, chain, margin))) }
  })
}

export function segmentsForDims(d: BodyDims): Float32Array {
  return gridsToSegments(surfaceGrids(d))
}

/** Bounding box of a vertex buffer, for framing the camera. */
export function bounds(v: Float32Array) {
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (let i = 0; i < v.length; i += 3) {
    minX = Math.min(minX, v[i])
    maxX = Math.max(maxX, v[i])
    minY = Math.min(minY, v[i + 1])
    maxY = Math.max(maxY, v[i + 1])
    minZ = Math.min(minZ, v[i + 2])
    maxZ = Math.max(maxZ, v[i + 2])
  }
  return { minX, maxX, minY, maxY, minZ, maxZ }
}
