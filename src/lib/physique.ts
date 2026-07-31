import type { BodyEntry, Profile, Sex } from './types'
import { fatMass, leanMass, lbToKg, navyBodyFat } from './calc'

/**
 * Turns measurements into the dimensions of three nested body shells:
 *
 *   frame  — skeletal minimum, the body you cannot go below
 *   lean   — frame + muscle, i.e. your physique at essentially no fat
 *   full   — lean + a subcutaneous fat shell, i.e. how you look now
 *
 * Fat is then literally the space between the lean and full shells, which is
 * what makes the layer toggles meaningful rather than decorative.
 *
 * IMPORTANT, and stated in the UI too: girths do not determine shape. Many
 * different bodies produce identical tape measurements, so this is a model
 * driven by your numbers — good for direction and change over time, not a
 * likeness. Every number below is either a standard anthropometric ratio or an
 * explicitly-labelled estimate.
 */

/** Circumferences in inches, except `shoulders`, which is a width. */
export interface Girths {
  neck: number
  shoulders: number
  chest: number
  waist: number
  hips: number
  arm: number
  forearm: number
  thigh: number
  calf: number
}

/** An elliptical cross-section: semi-axis across (a) and front-to-back (b). */
export interface Site {
  a: number
  b: number
}

export interface BodyDims {
  heightIn: number
  /** Half the acromion-to-acromion width. */
  shoulderHalfWidth: number
  neck: Site
  chest: Site
  waist: Site
  hip: Site
  headR: number
  upperArmR: number
  forearmR: number
  wristR: number
  thighR: number
  kneeR: number
  calfR: number
  ankleR: number
}

export type LayerName = 'frame' | 'lean' | 'full' | 'frameFat'

export interface Physique {
  /** The dimensions used for each shell the UI can draw. */
  frame: BodyDims
  lean: BodyDims
  full: BodyDims
  /** Frame wrapped in the fat shell — what "fat only, no muscle" shows. */
  frameFat: BodyDims
  /** Inputs after estimation, so the UI can say what was measured vs derived. */
  girths: Girths
  estimated: (keyof Girths)[]
  weightLb: number
  bodyFatPct: number
  leanLb: number
  fatLb: number
  heightIn: number
  sex: Sex
  /** Fat shell thickness in inches at a few readable landmarks. */
  fatThickness: { waist: number; chest: number; hip: number; thigh: number; arm: number; neck: number }
}

// ---------------------------------------------------------------------------
// Anthropometric constants
// ---------------------------------------------------------------------------

/**
 * Vertical landmarks as a fraction of standing height, measured from the floor.
 * These are conventional proportions (Drillis & Contini and similar).
 */
export const LEVELS = {
  ankle: 0.039,
  calf: 0.16,
  knee: 0.285,
  thigh: 0.42,
  crotch: 0.48,
  hip: 0.53,
  waist: 0.62,
  chest: 0.72,
  shoulder: 0.815,
  neck: 0.855,
  chin: 0.875,
  crown: 1.0,
  wrist: 0.44,
  elbow: 0.63,
} as const

/**
 * Front-to-back depth as a fraction of width, per site.
 *
 * The abdomen's ratio is not fixed: a lean waist is wider than it is deep, but
 * stored abdominal fat pushes *forward* far more than it spreads sideways, so a
 * heavy waist becomes round and eventually deeper than it is wide. Treating it as
 * a constant made a 46in waist come out merely wide, which reads as a barrel
 * rather than a belly.
 */
const DEPTH_RATIO = {
  neck: 0.9,
  // A lean male chest is broad and comparatively shallow.
  chest: 0.68,
  hip: 0.74,
} as const

function waistDepthRatio(bodyFatPct: number, sex: Sex): number {
  const lean = sex === 'male' ? 0.76 : 0.8
  const t = clamp((bodyFatPct - (sex === 'male' ? 14 : 22)) / 26, 0, 1)
  return lean + t * 0.34
}

function hipDepthRatio(bodyFatPct: number, sex: Sex): number {
  const t = clamp((bodyFatPct - (sex === 'male' ? 14 : 22)) / 26, 0, 1)
  return DEPTH_RATIO.hip + t * 0.12
}

/**
 * Relative subcutaneous fat thickness by region. Men store proportionally more
 * abdominally, women more at the hip and thigh — the difference is large enough
 * that a single distribution would look wrong for one of them.
 */
const FAT_PATTERN: Record<Sex, Record<string, number>> = {
  male: { waist: 1.75, chest: 1.0, hip: 0.95, thigh: 0.8, arm: 0.65, forearm: 0.4, calf: 0.55, neck: 0.5, head: 0.15 },
  female: { waist: 1.0, chest: 1.15, hip: 1.7, thigh: 1.55, arm: 0.85, forearm: 0.5, calf: 0.8, neck: 0.4, head: 0.15 },
}

/** Essential fat that cannot be removed, so "no fat" stays physiological. */
const ESSENTIAL_FAT: Record<Sex, number> = { male: 4, female: 11 }

/** Reference fat-free mass index, for scaling estimated girths by muscularity. */
const REFERENCE_FFMI: Record<Sex, number> = { male: 19, female: 15.5 }

// 1 lb of fat ≈ 30.8 in³ (453.6 g at 0.9 g/cm³, 16.387 cm³ per in³).
const IN3_PER_LB_FAT = 453.592 / 0.9 / 16.387

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Cross-section squareness per site, shared with the mesh so the shape solved for
 * here is the shape that actually gets drawn. A human torso is not an ellipse: it
 * is flat-ish front and back with rounded corners.
 */
export const SECTION_EXPONENT = {
  neck: 2.2,
  chest: 2.9,
  waist: 2.6,
  hip: 2.7,
} as const

/**
 * Perimeter of a unit superellipse (a = 1) with the given depth ratio and
 * exponent, measured along the same parametrisation the renderer uses.
 *
 * This matters more than it sounds. Solving the semi-axes with the ellipse
 * perimeter formula and then *drawing* a superellipse overshot every measured
 * girth by 4–6%, because a superellipse is longer round than an ellipse with the
 * same axes. Cross-sectional area was therefore ~10% too large everywhere, which
 * is why the body read as bigger than its own measurements.
 */
function unitSuperellipsePerimeter(depthRatio: number, n: number, samples = 256): number {
  const e = 2 / n
  let total = 0
  let px = 1
  let pz = 0
  for (let i = 1; i <= samples; i++) {
    const th = (2 * Math.PI * i) / samples
    const c = Math.cos(th)
    const sn = Math.sin(th)
    const x = Math.sign(c) * Math.abs(c) ** e
    const z = Math.sign(sn) * Math.abs(sn) ** e * depthRatio
    total += Math.hypot(x - px, z - pz)
    px = x
    pz = z
  }
  return total
}

/**
 * Area enclosed by a unit superellipse, by the shoelace formula over the same
 * sampling. Needed because the ellipse area pi*a*b understates a superellipse by
 * ~10%, which quietly cancelled the girth-overshoot bug in the volume check.
 */
function unitSuperellipseArea(depthRatio: number, n: number, samples = 256): number {
  const e = 2 / n
  let acc = 0
  let px = 1
  let pz = 0
  for (let i = 1; i <= samples; i++) {
    const th = (2 * Math.PI * i) / samples
    const c = Math.cos(th)
    const sn = Math.sin(th)
    const x = Math.sign(c) * Math.abs(c) ** e
    const z = Math.sign(sn) * Math.abs(sn) ** e * depthRatio
    acc += px * z - x * pz
    px = x
    pz = z
  }
  return Math.abs(acc) / 2
}

/** Cross-sectional area of a body section as it is actually drawn. */
export function sectionArea(s: Site, n: number): number {
  return unitSuperellipseArea(s.b / s.a, n) * s.a * s.a
}

/** Circumference of a body section as it is actually drawn. */
export function sectionGirth(s: Site, n: number): number {
  return s.a * unitSuperellipsePerimeter(s.b / s.a, n)
}

/** Semi-axis across the body for a cross-section of a given circumference. */
function semiAxisFromGirth(girth: number, depthRatio: number, n: number): number {
  // Perimeter scales linearly with the semi-axis, so one unit measurement solves
  // it exactly — no iteration needed.
  return girth / unitSuperellipsePerimeter(depthRatio, n)
}

function site(girth: number, depthRatio: number, n: number): Site {
  const a = semiAxisFromGirth(girth, depthRatio, n)
  return { a, b: a * depthRatio }
}

function radiusFromGirth(girth: number): number {
  return girth / (2 * Math.PI)
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

// ---------------------------------------------------------------------------
// Estimating missing girths
// ---------------------------------------------------------------------------

/**
 * Fills in girths that were never measured, from height, lean mass and body fat.
 * Scaled by fat-free mass index so a muscular body does not get average limbs,
 * and by fat above reference for the sites that carry it.
 */
export function estimateGirths(
  heightIn: number,
  weightLb: number,
  bodyFatPct: number,
  sex: Sex,
  measured: Partial<Girths>,
): { girths: Girths; estimated: (keyof Girths)[] } {
  const leanKg = lbToKg(leanMass(weightLb, bodyFatPct))
  const heightM = (heightIn * 2.54) / 100
  const ffmi = leanKg / (heightM * heightM)
  // Muscularity multiplier, deliberately gentle: girth grows with the square
  // root of cross-sectional area, so a 20% FFMI difference is ~10% on a limb.
  const m = clamp(Math.sqrt(ffmi / REFERENCE_FFMI[sex]), 0.8, 1.35)
  const refFat = sex === 'male' ? 15 : 24
  const fatExcess = (bodyFatPct - refFat) / 100

  const base: Girths =
    sex === 'male'
      ? {
          neck: 0.215 * heightIn * m,
          shoulders: 0.245 * heightIn * m,
          chest: 0.52 * heightIn * m * (1 + fatExcess * 0.55),
          waist: 0.445 * heightIn * (1 + fatExcess * 1.9),
          hips: 0.52 * heightIn * (1 + fatExcess * 0.8),
          arm: 0.185 * heightIn * m * (1 + fatExcess * 0.4),
          forearm: 0.155 * heightIn * m * (1 + fatExcess * 0.2),
          thigh: 0.31 * heightIn * m * (1 + fatExcess * 0.9),
          calf: 0.213 * heightIn * m * (1 + fatExcess * 0.4),
        }
      : {
          neck: 0.19 * heightIn * m,
          shoulders: 0.228 * heightIn * m,
          chest: 0.5 * heightIn * m * (1 + fatExcess * 0.5),
          waist: 0.41 * heightIn * (1 + fatExcess * 1.5),
          hips: 0.545 * heightIn * (1 + fatExcess * 1.3),
          arm: 0.17 * heightIn * m * (1 + fatExcess * 0.5),
          forearm: 0.142 * heightIn * m * (1 + fatExcess * 0.25),
          thigh: 0.325 * heightIn * m * (1 + fatExcess * 1.2),
          calf: 0.205 * heightIn * m * (1 + fatExcess * 0.5),
        }

  const girths = { ...base }
  const estimated: (keyof Girths)[] = []
  for (const key of Object.keys(base) as (keyof Girths)[]) {
    const given = measured[key]
    if (given && given > 0) girths[key] = given
    else estimated.push(key)
  }
  return { girths, estimated }
}

// ---------------------------------------------------------------------------
// The fat shell
// ---------------------------------------------------------------------------

/**
 * Solves for a single thickness scalar such that the total volume of the fat
 * shell equals the volume implied by fat mass, then reports the thickness at
 * each region using the sex-specific distribution. This is what ties the
 * drawing to the actual numbers instead of guessing a bulge.
 */
function fatShell(heightIn: number, girths: Girths, fatLb: number, bodyFatPct: number, sex: Sex) {
  const pattern = FAT_PATTERN[sex]
  const H = heightIn
  // Region: girth to wrap, axial length, how many of them, and its fat weight.
  const regions: { key: string; girth: number; length: number; count: number }[] = [
    { key: 'waist', girth: girths.waist, length: (LEVELS.chest - LEVELS.hip) * H, count: 1 },
    { key: 'chest', girth: girths.chest, length: (LEVELS.shoulder - LEVELS.chest) * H, count: 1 },
    { key: 'hip', girth: girths.hips, length: (LEVELS.hip - LEVELS.crotch) * H, count: 1 },
    { key: 'thigh', girth: girths.thigh, length: (LEVELS.crotch - LEVELS.knee) * H, count: 2 },
    { key: 'calf', girth: girths.calf, length: (LEVELS.knee - LEVELS.ankle) * H, count: 2 },
    { key: 'arm', girth: girths.arm, length: (LEVELS.shoulder - LEVELS.elbow) * H, count: 2 },
    { key: 'forearm', girth: girths.forearm, length: (LEVELS.elbow - LEVELS.wrist) * H, count: 2 },
    { key: 'neck', girth: girths.neck, length: (LEVELS.chin - LEVELS.shoulder) * H, count: 1 },
  ]

  // Only fat above the essential minimum shapes the outline: essential fat sits
  // in organs, marrow and the central nervous system, not under the skin.
  const shapeable = Math.max(0, (bodyFatPct - ESSENTIAL_FAT[sex]) / Math.max(bodyFatPct, 1))
  const storedLb = fatLb * shapeable
  const targetVolume = storedLb * IN3_PER_LB_FAT * 0.72 // ~72% of stored fat is subcutaneous

  let denom = 0
  for (const r of regions) denom += (pattern[r.key] ?? 0.5) * r.girth * r.length * r.count
  const scalar = denom > 0 ? targetVolume / denom : 0

  const thickness: Record<string, number> = {}
  for (const r of regions) {
    // Cap at a physically sane shell; beyond ~2.5in the model is extrapolating.
    thickness[r.key] = clamp((pattern[r.key] ?? 0.5) * scalar, 0, 3)
  }
  thickness.head = clamp((pattern.head ?? 0.15) * scalar, 0, 0.5)
  return thickness
}

// ---------------------------------------------------------------------------
// The three shells
// ---------------------------------------------------------------------------

/** Skeletal minimum, as fractions of height. Nothing can be thinner than this. */
function frameDims(heightIn: number, girths: Girths, sex: Sex): BodyDims {
  const H = heightIn
  // Shoulder bone width tracks measured shoulder width, but only partly — the
  // rest of that measurement is deltoid.
  const shoulderHalf = Math.max(0.098 * H, girths.shoulders * 0.5 * 0.78)
  const narrow = sex === 'male' ? 1 : 0.95
  return {
    heightIn: H,
    shoulderHalfWidth: shoulderHalf,
    neck: { a: 0.03 * H, b: 0.028 * H },
    chest: { a: 0.078 * H * narrow, b: 0.056 * H },
    waist: { a: 0.055 * H * narrow, b: 0.046 * H },
    hip: { a: 0.077 * H, b: 0.05 * H },
    // Head *breadth* (about 6in on a 70in body), not a sphere radius.
    headR: 0.0405 * H,
    upperArmR: 0.021 * H,
    forearmR: 0.017 * H,
    wristR: 0.0135 * H,
    thighR: 0.034 * H,
    kneeR: 0.031 * H,
    calfR: 0.025 * H,
    ankleR: 0.0165 * H,
  }
}

/** The outer surface: straight from the girths. */
function fullDims(heightIn: number, girths: Girths, bodyFatPct: number, sex: Sex): BodyDims {
  return {
    heightIn,
    shoulderHalfWidth: girths.shoulders / 2,
    neck: site(girths.neck, DEPTH_RATIO.neck, SECTION_EXPONENT.neck),
    chest: site(girths.chest, DEPTH_RATIO.chest, SECTION_EXPONENT.chest),
    waist: site(girths.waist, waistDepthRatio(bodyFatPct, sex), SECTION_EXPONENT.waist),
    hip: site(girths.hips, hipDepthRatio(bodyFatPct, sex), SECTION_EXPONENT.hip),
    headR: 0.0435 * heightIn,
    upperArmR: radiusFromGirth(girths.arm),
    forearmR: radiusFromGirth(girths.forearm),
    wristR: radiusFromGirth(girths.forearm) * 0.68,
    thighR: radiusFromGirth(girths.thigh),
    // The knee is a joint, sized by the bone that runs through it — NOT a
    // fraction of the thigh. Deriving it from thigh girth made the knee come out
    // wider than the calf, so the leg had no narrowing at all and read as one
    // long tube. It must be narrower than both the thigh and the calf.
    kneeR: Math.max(0.029 * heightIn, radiusFromGirth(girths.calf) * 0.86),
    calfR: radiusFromGirth(girths.calf),
    ankleR: radiusFromGirth(girths.calf) * 0.52,
  }
}

/** Subtracts a per-site thickness from every dimension, never below the frame. */
function shrink(dims: BodyDims, frame: BodyDims, t: Record<string, number>): BodyDims {
  const floor = (v: number, f: number) => Math.max(f * 1.01, v)
  const shrinkSite = (s: Site, f: Site, th: number): Site => ({
    a: floor(s.a - th, f.a),
    b: floor(s.b - th, f.b),
  })
  return {
    heightIn: dims.heightIn,
    // Shoulder width loses less than a girth does: fat over the acromion is thin.
    shoulderHalfWidth: floor(dims.shoulderHalfWidth - (t.chest ?? 0) * 0.5, frame.shoulderHalfWidth),
    neck: shrinkSite(dims.neck, frame.neck, t.neck ?? 0),
    chest: shrinkSite(dims.chest, frame.chest, t.chest ?? 0),
    waist: shrinkSite(dims.waist, frame.waist, t.waist ?? 0),
    hip: shrinkSite(dims.hip, frame.hip, t.hip ?? 0),
    headR: floor(dims.headR - (t.head ?? 0), frame.headR),
    upperArmR: floor(dims.upperArmR - (t.arm ?? 0), frame.upperArmR),
    forearmR: floor(dims.forearmR - (t.forearm ?? 0), frame.forearmR),
    wristR: floor(dims.wristR - (t.forearm ?? 0) * 0.4, frame.wristR),
    thighR: floor(dims.thighR - (t.thigh ?? 0), frame.thighR),
    kneeR: floor(dims.kneeR - (t.thigh ?? 0) * 0.5, frame.kneeR),
    calfR: floor(dims.calfR - (t.calf ?? 0), frame.calfR),
    ankleR: floor(dims.ankleR - (t.calf ?? 0) * 0.3, frame.ankleR),
  }
}

/**
 * Adds a per-site thickness to every dimension. Abdominal fat is deliberately
 * anisotropic — it goes forward roughly twice as far as it goes sideways, which
 * is what makes a heavy body protrude rather than just widen.
 */
function grow(dims: BodyDims, t: Record<string, number>): BodyDims {
  const growSite = (s: Site, th: number): Site => ({ a: s.a + th, b: s.b + th })
  const growBelly = (s: Site, th: number, wide: number, deep: number): Site => ({
    a: s.a + th * wide,
    b: s.b + th * deep,
  })
  return {
    heightIn: dims.heightIn,
    shoulderHalfWidth: dims.shoulderHalfWidth + (t.chest ?? 0) * 0.5,
    neck: growSite(dims.neck, t.neck ?? 0),
    chest: growSite(dims.chest, t.chest ?? 0),
    waist: growBelly(dims.waist, t.waist ?? 0, 0.7, 1.85),
    hip: growBelly(dims.hip, t.hip ?? 0, 0.85, 1.3),
    headR: dims.headR + (t.head ?? 0),
    upperArmR: dims.upperArmR + (t.arm ?? 0),
    forearmR: dims.forearmR + (t.forearm ?? 0),
    wristR: dims.wristR + (t.forearm ?? 0) * 0.4,
    thighR: dims.thighR + (t.thigh ?? 0),
    kneeR: dims.kneeR + (t.thigh ?? 0) * 0.5,
    calfR: dims.calfR + (t.calf ?? 0),
    ankleR: dims.ankleR + (t.calf ?? 0) * 0.3,
  }
}

export interface PhysiqueInput {
  heightIn: number
  weightLb: number
  bodyFatPct: number
  sex: Sex
  measured?: Partial<Girths>
}

export function computePhysique(input: PhysiqueInput): Physique {
  const heightIn = clamp(input.heightIn || 69, 48, 90)
  const weightLb = clamp(input.weightLb || 160, 60, 600)
  const sex = input.sex
  const bodyFatPct = clamp(input.bodyFatPct, ESSENTIAL_FAT[sex], 65)

  const { girths, estimated } = estimateGirths(heightIn, weightLb, bodyFatPct, sex, input.measured ?? {})
  const fatLb = fatMass(weightLb, bodyFatPct)
  const leanLb = leanMass(weightLb, bodyFatPct)

  const t = fatShell(heightIn, girths, fatLb, bodyFatPct, sex)
  const frame = frameDims(heightIn, girths, sex)
  const full = fullDims(heightIn, girths, bodyFatPct, sex)
  const lean = shrink(full, frame, t)
  const frameFat = grow(frame, t)

  return {
    frame,
    lean,
    full,
    frameFat,
    girths,
    estimated,
    weightLb,
    bodyFatPct,
    leanLb,
    fatLb,
    heightIn,
    sex,
    fatThickness: {
      waist: t.waist ?? 0,
      chest: t.chest ?? 0,
      hip: t.hip ?? 0,
      thigh: t.thigh ?? 0,
      arm: t.arm ?? 0,
      neck: t.neck ?? 0,
    },
  }
}

/**
 * Re-derives a physique at a different weight and body fat while keeping the
 * person's own proportions.
 *
 * This is what history and projection use. Re-estimating girths from scratch
 * would throw away their measured shape and show a generic body; instead the
 * muscle layer is scaled by the change in lean mass (radius with the square root
 * of it, since volume is what actually changes) and a fresh fat shell for the
 * new body-fat level is wrapped back around it.
 */
export function physiqueAtComposition(base: Physique, weightLb: number, bodyFatPct: number): Physique {
  const sex = base.sex
  const heightIn = base.heightIn
  const bf = clamp(bodyFatPct, ESSENTIAL_FAT[sex], 65)
  const w = clamp(weightLb, 60, 600)
  const newLeanLb = leanMass(w, bf)
  const newFatLb = fatMass(w, bf)

  // Scale the muscle layer — the gap between frame and lean — by the change in
  // lean mass. Cross-section grows with volume, radius with its square root.
  const muscleScale = base.leanLb > 0 ? Math.sqrt(clamp(newLeanLb / base.leanLb, 0.5, 2)) : 1
  const frame = base.frame
  const scaleSite = (leanS: Site, frameS: Site): Site => ({
    a: frameS.a + (leanS.a - frameS.a) * muscleScale,
    b: frameS.b + (leanS.b - frameS.b) * muscleScale,
  })
  const scaleR = (leanR: number, frameR: number) => frameR + (leanR - frameR) * muscleScale

  const lean: BodyDims = {
    heightIn,
    shoulderHalfWidth: scaleR(base.lean.shoulderHalfWidth, frame.shoulderHalfWidth),
    neck: scaleSite(base.lean.neck, frame.neck),
    chest: scaleSite(base.lean.chest, frame.chest),
    waist: scaleSite(base.lean.waist, frame.waist),
    hip: scaleSite(base.lean.hip, frame.hip),
    headR: base.lean.headR,
    upperArmR: scaleR(base.lean.upperArmR, frame.upperArmR),
    forearmR: scaleR(base.lean.forearmR, frame.forearmR),
    wristR: scaleR(base.lean.wristR, frame.wristR),
    thighR: scaleR(base.lean.thighR, frame.thighR),
    kneeR: scaleR(base.lean.kneeR, frame.kneeR),
    calfR: scaleR(base.lean.calfR, frame.calfR),
    ankleR: scaleR(base.lean.ankleR, frame.ankleR),
  }

  // Fat shell for the new composition, wrapped on the rescaled lean girths.
  const leanGirths: Girths = {
    neck: sectionGirth(lean.neck, SECTION_EXPONENT.neck),
    shoulders: lean.shoulderHalfWidth * 2,
    chest: sectionGirth(lean.chest, SECTION_EXPONENT.chest),
    waist: sectionGirth(lean.waist, SECTION_EXPONENT.waist),
    hips: sectionGirth(lean.hip, SECTION_EXPONENT.hip),
    arm: 2 * Math.PI * lean.upperArmR,
    forearm: 2 * Math.PI * lean.forearmR,
    thigh: 2 * Math.PI * lean.thighR,
    calf: 2 * Math.PI * lean.calfR,
  }
  const t = fatShell(heightIn, leanGirths, newFatLb, bf, sex)

  return {
    frame,
    lean,
    full: grow(lean, t),
    frameFat: grow(frame, t),
    girths: leanGirths,
    estimated: base.estimated,
    weightLb: w,
    bodyFatPct: bf,
    leanLb: newLeanLb,
    fatLb: newFatLb,
    heightIn,
    sex,
    fatThickness: {
      waist: t.waist ?? 0,
      chest: t.chest ?? 0,
      hip: t.hip ?? 0,
      thigh: t.thigh ?? 0,
      arm: t.arm ?? 0,
      neck: t.neck ?? 0,
    },
  }
}

/** Reads a body entry into physique inputs, using the tape where present. */
export function physiqueFromEntry(entry: BodyEntry, profile: Profile, fallbackWeightLb?: number): PhysiqueInput | null {
  const weightLb = entry.weightLb ?? fallbackWeightLb
  if (!weightLb || !profile.heightIn) return null
  const bf = entry.bodyFatPct ?? navyBodyFat(entry, profile) ?? (profile.sex === 'male' ? 20 : 28)
  const measured: Partial<Girths> = {}
  if (entry.neckIn) measured.neck = entry.neckIn
  if (entry.shouldersIn) measured.shoulders = entry.shouldersIn
  if (entry.chestIn) measured.chest = entry.chestIn
  if (entry.waistIn) measured.waist = entry.waistIn
  if (entry.hipsIn) measured.hips = entry.hipsIn
  if (entry.armIn) measured.arm = entry.armIn
  if (entry.forearmIn) measured.forearm = entry.forearmIn
  if (entry.thighIn) measured.thigh = entry.thighIn
  if (entry.calfIn) measured.calf = entry.calfIn
  return { heightIn: profile.heightIn, weightLb, bodyFatPct: bf, sex: profile.sex, measured }
}

/**
 * Approximate body volume from a shell, for sanity-checking the model against
 * weight. Sums elliptical frusta for the torso plus cylinders for the limbs.
 */
export function approxVolumeIn3(d: BodyDims): number {
  const H = d.heightIn
  // Frustum volume from the two end areas, using the superellipse area the mesh
  // actually encloses rather than an ellipse's.
  const seg = (s1: Site, s2: Site, len: number, n: number = SECTION_EXPONENT.waist) => {
    const A1 = sectionArea(s1, n)
    const A2 = sectionArea(s2, n)
    return ((A1 + A2 + Math.sqrt(A1 * A2)) * len) / 3
  }
  const cyl = (r1: number, r2: number, len: number) => (Math.PI * (r1 * r1 + r1 * r2 + r2 * r2) * len) / 3

  let v = 0
  v += seg(d.hip, d.waist, (LEVELS.waist - LEVELS.crotch) * H, SECTION_EXPONENT.hip)
  v += seg(d.waist, d.chest, (LEVELS.chest - LEVELS.waist) * H, SECTION_EXPONENT.waist)
  v += seg(d.chest, { a: d.shoulderHalfWidth * 0.8, b: d.chest.b * 0.85 }, (LEVELS.shoulder - LEVELS.chest) * H, SECTION_EXPONENT.chest)
  v += seg(d.neck, d.neck, (LEVELS.chin - LEVELS.shoulder) * H, SECTION_EXPONENT.neck)
  v += (4 / 3) * Math.PI * d.headR ** 3 * 0.85
  v += 2 * cyl(d.upperArmR, d.forearmR, (LEVELS.shoulder - LEVELS.elbow) * H)
  v += 2 * cyl(d.forearmR, d.wristR, (LEVELS.elbow - LEVELS.wrist) * H)
  v += 2 * cyl(d.thighR, d.kneeR, (LEVELS.crotch - LEVELS.knee) * H)
  v += 2 * cyl(d.calfR, d.ankleR, (LEVELS.knee - LEVELS.ankle) * H)
  return v
}

/** Whole-body density is ~1.03 g/cm³, so weight implies a volume. */
export function volumeFromWeightIn3(weightLb: number, bodyFatPct: number): number {
  // Siri's two-compartment densities: fat 0.9, fat-free 1.1 g/cm³.
  const f = bodyFatPct / 100
  const density = 1 / (f / 0.9 + (1 - f) / 1.1)
  return (weightLb * 453.592) / density / 16.387
}
