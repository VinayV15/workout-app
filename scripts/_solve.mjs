import { computePhysique } from '../src/lib/physique.ts'
import { bodyFrame } from '../src/lib/anatomy.ts'
import { segmentTransforms, applyTransform } from '../src/lib/pose.ts'

const P = computePhysique({ heightIn: 70, weightLb: 175, bodyFatPct: 12, sex: 'male' })
const F = bodyFrame(P.lean)
const H = 70

/** Joint positions (z forward, y up) measured RELATIVE TO THE ANKLE. */
function joints(torsoPitch, hipFlex, knee, ankle) {
  const pose = { torsoPitch, both: { hipFlex, knee, ankle, shoulderFlex: torsoPitch } }
  const t = segmentTransforms(F, pose)
  const p = (seg, pt) => applyTransform(t[seg], pt)
  const an = p('shank:right', F.ankle[0])
  const rel = (q) => [q[2] - an[2], q[1] - an[1]]
  return {
    knee: rel(p('thigh:right', F.knee[0])),
    hip: rel(p('thigh:right', F.hip[0])),
    shoulder: rel(p('torso', F.shoulder[0])),
    wrist: rel(p('forearm:right', F.wrist[0])),
  }
}

/**
 * Target joint positions from real lifting geometry, as fractions of standing
 * height, measured from the ankle. Ankle sits ~0.04H off the floor.
 */
const T = (kz, ky, hz, hy, sz, sy) => ({ knee: [kz * H, ky * H - 0.04 * H], hip: [hz * H, hy * H - 0.04 * H], shoulder: [sz * H, sy * H - 0.04 * H] })

const TARGETS = {
  // Conventional deadlift start: shins near vertical, hips back and high,
  // shoulders just in front of the bar.
  'deadlift/setup':      T( 0.02, 0.28, -0.12, 0.42,  0.03, 0.62),
  'deadlift/break':      T( 0.01, 0.29, -0.11, 0.45,  0.02, 0.65),
  'deadlift/knees back': T( 0.00, 0.29, -0.07, 0.50,  0.01, 0.72),
  // RDL bottom: knees barely bent, hips pushed well back, torso near horizontal.
  'rdl/hinge':           T( 0.00, 0.29, -0.09, 0.48,  0.02, 0.70),
  'rdl/stretch':         T(-0.01, 0.29, -0.13, 0.44, -0.02, 0.58),
  // Back squat bottom: hip crease below the knee, knees forward over the feet.
  'squat/descend':       T( 0.05, 0.28, -0.03, 0.38,  0.03, 0.62),
  'squat/bottom':        T( 0.08, 0.27,  0.00, 0.26,  0.05, 0.51),
  // Bent-over row: torso about 50 degrees, knees soft.
  'row/hinge':           T( 0.01, 0.28, -0.10, 0.45,  0.03, 0.64),
}

/** Coarse-to-fine search over the four angles that decide the skeleton. */
function solve(target) {
  let best = null
  const err = (j) => {
    let e = 0
    for (const k of ['knee', 'hip', 'shoulder']) {
      e += (j[k][0] - target[k][0]) ** 2 + (j[k][1] - target[k][1]) ** 2
    }
    return e
  }
  let ranges = { tp: [0, 90, 6], hf: [0, 130, 8], kn: [0, 140, 8], an: [-10, 35, 5] }
  for (let pass = 0; pass < 4; pass++) {
    let localBest = null
    for (let tp = ranges.tp[0]; tp <= ranges.tp[1]; tp += ranges.tp[2])
      for (let hf = ranges.hf[0]; hf <= ranges.hf[1]; hf += ranges.hf[2])
        for (let kn = ranges.kn[0]; kn <= ranges.kn[1]; kn += ranges.kn[2])
          for (let an = ranges.an[0]; an <= ranges.an[1]; an += ranges.an[2]) {
            if (kn < 0 || kn > 145 || hf < -40) continue
            const e = err(joints(tp, hf, kn, an))
            if (!localBest || e < localBest.e) localBest = { e, tp, hf, kn, an }
          }
    best = localBest
    const s = 0.4
    ranges = {
      tp: [best.tp - ranges.tp[2], best.tp + ranges.tp[2], Math.max(1, ranges.tp[2] * s)],
      hf: [best.hf - ranges.hf[2], best.hf + ranges.hf[2], Math.max(1, ranges.hf[2] * s)],
      kn: [best.kn - ranges.kn[2], best.kn + ranges.kn[2], Math.max(1, ranges.kn[2] * s)],
      an: [best.an - ranges.an[2], best.an + ranges.an[2], Math.max(1, ranges.an[2] * s)],
    }
  }
  return best
}

const r = (n) => Math.round(n)
const r1 = (n) => Math.round(n * 10) / 10
for (const [name, target] of Object.entries(TARGETS)) {
  const b = solve(target)
  const j = joints(b.tp, b.hf, b.kn, b.an)
  const fit = (k) => `${k} want(${r1(target[k][0])},${r1(target[k][1])}) got(${r1(j[k][0])},${r1(j[k][1])})`
  console.log(`${name.padEnd(20)} torsoPitch:${r(b.tp)} hipFlex:${r(b.hf)} knee:${r(b.kn)} ankle:${r(b.an)}  rms=${r1(Math.sqrt(b.e / 3))}`)
  console.log(`  ${fit('knee')}  ${fit('hip')}  ${fit('shoulder')}`)
}
