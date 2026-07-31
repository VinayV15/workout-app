/**
 * Tests for the posed exercise diagrams. No test framework — run with:
 *   npm test
 *
 * Two things here are worth real assertions. The joint sign conventions, because
 * every one of the 40-odd archetypes is authored against them and a flipped sign
 * silently bends 60 exercises the wrong way — three of the four were wrong on the
 * first attempt. And segment connectivity, because a part that fails to match its
 * side falls back to the torso transform and floats off on its own: that is exactly
 * how the feet ended up detached from the legs, and it is invisible to a typechecker.
 */
import { computePhysique } from '../src/lib/physique.ts'
import { bodyFrame } from '../src/lib/anatomy.ts'
import { buildMuscleGrids } from '../src/lib/muscles.ts'
import { fitMusclesToSurface } from '../src/lib/bodyMesh.ts'
import { buildFrameGrids } from '../src/lib/skeletonMesh.ts'
import {
  anchorGrids,
  applyTransform,
  boundsOf,
  poseGrids,
  segmentOf,
  segmentTransforms,
} from '../src/lib/pose.ts'
import { POSE_ARCHETYPES } from '../src/lib/exercisePoses.ts'
import { EXERCISE_GUIDES, framesFor, guideFor, missingGuides } from '../src/lib/exerciseGuide.ts'
import { EXERCISES } from '../src/lib/exercises.ts'

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

const P = computePhysique({ heightIn: 70, weightLb: 175, bodyFatPct: 12, sex: 'male' })
const F = bodyFrame(P.lean)
const MUSCLES = fitMusclesToSurface(buildMuscleGrids(P.lean, P.frame), P.lean)
const BONES = buildFrameGrids(P.frame)
const ALL = [...MUSCLES, ...BONES]

const at = (pose, seg, point) => applyTransform(segmentTransforms(F, pose)[seg], point)
const VIEWS = new Set(['front', 'side', 'back', 'threequarter'])

// ---------------------------------------------------------------------------
// Joint conventions. Flexion is forward; a knee is the exception that goes back.
// ---------------------------------------------------------------------------
console.log('joint directions')
{
  const knee = at({ right: { knee: 90 } }, 'shank:right', F.ankle[0])
  check('a bent knee sends the ankle BEHIND the knee', knee[2] < F.knee[0][2] - 5, `z ${knee[2].toFixed(1)}`)
  check('and raises it to about knee height', Math.abs(knee[1] - F.knee[0][1]) < 2)

  const hip = at({ right: { hipFlex: 90 } }, 'thigh:right', F.knee[0])
  check('hip flexion sends the knee IN FRONT of the hip', hip[2] > F.hip[0][2] + 5, `z ${hip[2].toFixed(1)}`)

  const elbow = at({ right: { elbow: 90 } }, 'forearm:right', F.wrist[0])
  check('elbow flexion brings the hand FORWARD', elbow[2] > F.elbow[0][2] + 5, `z ${elbow[2].toFixed(1)}`)
  const elbowPivot = at({ right: { elbow: 90 } }, 'forearm:right', F.elbow[0])
  check('and the elbow itself does not move', dist(elbowPivot, F.elbow[0]) < 1e-6)

  const flex = at({ right: { shoulderFlex: 90 } }, 'upperArm:right', F.elbow[0])
  check('shoulder flexion raises the arm IN FRONT', flex[2] > F.shoulder[0][2] + 5, `z ${flex[2].toFixed(1)}`)
  const overhead = at({ right: { shoulderFlex: 175 } }, 'upperArm:right', F.wrist[0])
  check('and 175° puts the hand overhead', overhead[1] > F.shoulder[0][1] + 15)

  const abR = at({ both: { shoulderAbduct: 90 } }, 'upperArm:right', F.wrist[0])
  const abL = at({ both: { shoulderAbduct: 90 } }, 'upperArm:left', F.wrist[1])
  check('abduction takes the right arm out to the right', abR[0] > F.shoulder[0][0] + 5, `x ${abR[0].toFixed(1)}`)
  check('and the left arm out to the left', abL[0] < F.shoulder[1][0] - 5, `x ${abL[0].toFixed(1)}`)
  check('symmetrically', Math.abs(abR[0] + abL[0]) < 1e-6 && Math.abs(abR[1] - abL[1]) < 1e-6)

  const ankle = at({ right: { ankle: -30 } }, 'foot:right', F.toe[0])
  check('pointing the toes moves the foot', dist(ankle, F.toe[0]) > 1)
}

console.log('\nthe torso hinges over stationary legs')
{
  const pose = { torsoPitch: 90 }
  const sh = at(pose, 'torso', F.shoulder[0])
  check('a 90° hinge puts the shoulder in front of the hip', sh[2] > 10, `z ${sh[2].toFixed(1)}`)
  check('and drops it to about hip height', Math.abs(sh[1] - F.hip[0][1]) < 3)
  // This is the whole point of a hinge: if the legs came too it would be a whole
  // body rotation, and a deadlift would look like a faceplant.
  check('the hip does not move', dist(at(pose, 'thigh:right', F.hip[0]), F.hip[0]) < 1e-6)
  check('the knee does not move', dist(at(pose, 'thigh:right', F.knee[0]), F.knee[0]) < 1e-6)
  check('the ankle does not move', dist(at(pose, 'shank:right', F.ankle[0]), F.ankle[0]) < 1e-6)
}

console.log('\nlying down')
{
  const supine = boundsOf([poseGrids(ALL, P.lean, { rootPitch: -90 })])
  check('rootPitch -90 lays the body flat', supine.max[1] - supine.min[1] < 15, `height ${(supine.max[1] - supine.min[1]).toFixed(1)}`)
  check('and stretches it along the depth axis', supine.max[2] - supine.min[2] > 50)

  const prone = poseGrids(ALL, P.lean, { rootPitch: 90 })
  const proneB = boundsOf([prone])
  check('rootPitch +90 also lays it flat, face down', proneB.max[1] - proneB.min[1] < 15)
  // Supine and prone must differ, or one of them is drawing the wrong side up.
  const chestSupine = centroid(poseGrids(MUSCLES, P.lean, { rootPitch: -90 }).find((g) => g.name === 'pectoral-upper-R'))
  const chestProne = centroid(poseGrids(MUSCLES, P.lean, { rootPitch: 90 }).find((g) => g.name === 'pectoral-upper-R'))
  check('the chest faces up when supine and down when prone', chestSupine[1] > chestProne[1] + 3)
}

console.log('\nidentity and stability')
{
  const same = poseGrids(ALL, P.lean, {})
  let maxDelta = 0
  for (let i = 0; i < ALL.length; i++)
    for (let r = 0; r < ALL[i].rows.length; r++)
      for (let k = 0; k < ALL[i].rows[r].length; k++)
        for (let a = 0; a < 3; a++)
          maxDelta = Math.max(maxDelta, Math.abs(ALL[i].rows[r][k][a] - same[i].rows[r][k][a]))
  check('an empty pose leaves the geometry untouched', maxDelta === 0)
  check('grid names and shapes survive posing', same.every((g, i) => g.name === ALL[i].name && g.rows.length === ALL[i].rows.length))
}

// ---------------------------------------------------------------------------
// Segment classification. A part with no side silently falls back to the torso.
// ---------------------------------------------------------------------------
console.log('\nevery part knows which bone it rides on')
{
  const sideless = ALL.map((g) => ({ n: g.name, ...segmentOf(g.name) })).filter((x) => x.segment !== 'torso' && !x.side)
  check('no limb part is missing its side', sideless.length === 0, sideless.map((x) => x.n).join(', '))

  // The hyphenated indices are the ones that broke: `metatarsal-R-1`, `finger-L-3`.
  check('a hyphenated index still resolves', segmentOf('metatarsal-R-1').side === 'right')
  check('and on the left', segmentOf('finger-L-3').side === 'left')
  check('an un-indexed limb part resolves', segmentOf('heel-R').side === 'right')
  check('abs are torso, not a mis-read left side', segmentOf('rectus-abdominis-2L').segment === 'torso')
  check('the pelvis stays with the torso', segmentOf('ilium-R').segment === 'torso')
  check('the shoulder girdle stays with the torso', segmentOf('scapula-L').segment === 'torso')
  check('the femur is a thigh', segmentOf('femur-L').segment === 'thigh')
  check('the humerus is an upper arm', segmentOf('humerus-R').segment === 'upperArm')
  check('the hand rides on the forearm', segmentOf('palm-R').segment === 'forearm')
}

/**
 * The check that would have caught the detached feet: after posing, every part must
 * still have a neighbour close by. A part on the wrong transform drifts off alone.
 */
console.log('\nno part comes adrift when posed')
{
  const offenders = []
  for (const [key, frames] of Object.entries(POSE_ARCHETYPES)) {
    for (const f of frames) {
      const posed = poseGrids(BONES, P.lean, f.pose)
      const centres = posed.map((g) => ({ name: g.name, c: centroid(g) }))
      for (const a of centres) {
        let nearest = Infinity
        for (const b of centres) if (a !== b) nearest = Math.min(nearest, dist(a.c, b.c))
        // 11in, measured centroid to centroid. The humerus is a foot long, so with
        // the arm extended overhead its centre sits ~9.5in from the scapula and the
        // radius either side of it — that is a real body, not a break. The bug this
        // guards against put the metatarsals 30in from the heel, so the threshold
        // has plenty of room to be loose and still catch it.
        if (nearest > 11) offenders.push(`${key}/${f.label}:${a.name}@${nearest.toFixed(1)}`)
      }
    }
  }
  check('every bone has a neighbour within 11 inches in every pose', offenders.length === 0, offenders.slice(0, 6).join(' '))
}

// ---------------------------------------------------------------------------
// Physics. A weight in your hands hangs straight down whatever your torso is
// doing — the arms are children of the torso, so this has to be corrected for
// explicitly, and getting it wrong drew the deadlift bar behind the lifter.
// ---------------------------------------------------------------------------
console.log('\nloads hang under gravity')
{
  /** Angle of the upper arm away from straight down, in degrees, in world space. */
  const armAngle = (pose, side) => {
    const idx = side === 'right' ? 0 : 1
    const t = segmentTransforms(F, pose)
    const sh = applyTransform(t[`upperArm:${side}`], F.shoulder[idx])
    const el = applyTransform(t[`upperArm:${side}`], F.elbow[idx])
    const dy = sh[1] - el[1]
    return (Math.atan2(Math.hypot(el[0] - sh[0], el[2] - sh[2]), dy) * 180) / Math.PI
  }

  /**
   * Frames where the hands hold a free weight with the arm essentially hanging.
   * The upper arm must be near vertical, whatever the torso is doing.
   */
  const HANGING = [
    ['hinge_deadlift', 0], ['hinge_deadlift', 1], ['hinge_deadlift', 2], ['hinge_deadlift', 3],
    ['hinge_rdl', 0], ['hinge_rdl', 1], ['hinge_rdl', 2], ['hinge_rdl', 3],
    ['row_bent', 0], ['row_supported', 0], ['row_rear_delt', 0],
    ['carry', 0], ['carry', 1], ['carry', 2],
    ['curl_incline', 0], ['curl', 0], ['shrug', 0], ['shrug', 2],
    ['calf_raise', 0], ['calf_raise', 2], ['lunge', 0], ['hinge_deadlift', 3],
  ]
  const notHanging = []
  for (const [key, i] of HANGING) {
    const f = POSE_ARCHETYPES[key][i]
    for (const side of ['right', 'left']) {
      const a = armAngle(f.pose, side)
      if (a > 18) notHanging.push(`${key}/${f.label}=${a.toFixed(0)}°`)
    }
  }
  check('a held weight hangs within 18° of vertical', notHanging.length === 0, [...new Set(notHanging)].join(' '))

  // The regression itself: before the fix, the deadlift set-up put the arm 58°
  // off vertical — behind the lifter, which is a different exercise.
  const dl = POSE_ARCHETYPES.hinge_deadlift[0].pose
  check('the deadlift bar hangs in front of the shins, not behind', armAngle(dl, 'right') < 10, `${armAngle(dl, 'right').toFixed(0)}°`)

  /** The wrist must be below the shoulder, and roughly under it, for a hanging arm. */
  const wristUnderShoulder = (pose, side) => {
    const idx = side === 'right' ? 0 : 1
    const t = segmentTransforms(F, pose)
    const sh = applyTransform(t.torso, F.shoulder[idx])
    const wr = applyTransform(t[`forearm:${side}`], F.wrist[idx])
    return { below: wr[1] < sh[1] - 8, offset: Math.abs(wr[2] - sh[2]) }
  }
  const misplaced = []
  for (const [key, i] of HANGING) {
    const f = POSE_ARCHETYPES[key][i]
    const r = wristUnderShoulder(f.pose, 'right')
    if (!r.below || r.offset > 7) misplaced.push(`${key}/${f.label}(dz ${r.offset.toFixed(1)})`)
  }
  check('and the hand sits under the shoulder', misplaced.length === 0, [...new Set(misplaced)].join(' '))
}

console.log('\npresses put the hands where the load is')
{
  const handHeight = (pose) => {
    const t = segmentTransforms(F, pose)
    return applyTransform(t['forearm:right'], F.wrist[0])[1] - applyTransform(t.torso, F.shoulder[0])[1]
  }
  // Lying on a bench, the bar is above you: the hand must end up above the shoulder.
  const bench = POSE_ARCHETYPES.press_bench
  check('a bench press locks out with the hands above the shoulders', handHeight(bench[0].pose) > 8, handHeight(bench[0].pose).toFixed(1))
  check('and at the chest they are much lower', handHeight(bench[2].pose) < handHeight(bench[0].pose) - 8)
  // Standing overhead press: hands finish above the head.
  const ohp = POSE_ARCHETYPES.press_overhead
  check('an overhead press finishes with the hands overhead', handHeight(ohp[2].pose) > 12, handHeight(ohp[2].pose).toFixed(1))
  check('and starts at about shoulder height', Math.abs(handHeight(ohp[0].pose)) < 12)
  // A pulldown starts overhead and finishes low.
  const pd = POSE_ARCHETYPES.pull_down
  check('a pulldown starts with the hands overhead', handHeight(pd[0].pose) > 10)
  check('and finishes at the chest', handHeight(pd[2].pose) < handHeight(pd[0].pose) - 10)
  // A pull-up: the hands stay put and the BODY moves, so measured against the
  // shoulder the hand gets relatively lower as you rise.
  const pu = POSE_ARCHETYPES.pull_up
  check('a pull-up starts with the hands well above the shoulders', handHeight(pu[0].pose) > 10)
  check('and the shoulders come up to the hands', handHeight(pu[2].pose) < handHeight(pu[0].pose) - 8)
}

/**
 * Joint positions against real lifting geometry, measured relative to the foot and
 * as fractions of standing height. These numbers are what the angles were solved
 * against, so they are the thing that actually pins the diagrams to reality — the
 * angles themselves are just the solution.
 */
console.log('\nskeletons match real lifting geometry')
{
  const H = 70
  const rel = (pose) => {
    const t = segmentTransforms(F, pose)
    const an = applyTransform(t['shank:right'], F.ankle[0])
    const g = (seg, p) => {
      const q = applyTransform(t[seg], p)
      return [(q[2] - an[2]) / H, (q[1] - an[1]) / H]
    }
    return { knee: g('thigh:right', F.knee[0]), hip: g('thigh:right', F.hip[0]), shoulder: g('torso', F.shoulder[0]) }
  }
  // z forward, y up, both as a fraction of height, from the ankle. Ankle is 0.04H up.
  const T = (kz, ky, hz, hy, sz, sy) => ({ knee: [kz, ky - 0.04], hip: [hz, hy - 0.04], shoulder: [sz, sy - 0.04] })
  const CASES = [
    ['hinge_deadlift', 0, T(0.02, 0.28, -0.12, 0.42, 0.03, 0.62), 'shins near vertical, hips back and high'],
    ['hinge_deadlift', 2, T(0.0, 0.29, -0.07, 0.5, 0.01, 0.72), 'past the knees, still angled'],
    ['hinge_rdl', 1, T(0.0, 0.29, -0.09, 0.48, 0.02, 0.7), 'knees barely bent, hips back'],
    ['hinge_rdl', 2, T(-0.01, 0.29, -0.13, 0.44, -0.02, 0.58), 'hamstrings at length'],
    // Derived from the segment lengths rather than guessed: with thigh and shank
    // both about 0.245H, a hip BELOW the knee forces hipFlex past 90, which in turn
    // fixes where the hip can be. The first target here asked for a hip position no
    // leg can reach, and the pose was blamed for it.
    ['squat_back', 2, T(0.104, 0.302, -0.137, 0.259, 0.002, 0.482), 'hip crease below the knee'],
    ['row_bent', 0, T(0.01, 0.28, -0.1, 0.45, 0.03, 0.64), 'hinged to about 45 degrees'],
  ]
  const off = []
  for (const [key, i, target, why] of CASES) {
    const got = rel(POSE_ARCHETYPES[key][i].pose)
    for (const j of ['knee', 'hip', 'shoulder']) {
      // 0.06H is about 4in on a 70in figure — tight enough to catch a wrong
      // exercise, loose enough that stance and build can vary.
      const d = Math.hypot(got[j][0] - target[j][0], got[j][1] - target[j][1])
      if (d > 0.06) off.push(`${key}[${i}] ${j} out by ${(d * H).toFixed(1)}in (${why})`)
    }
  }
  check('hips, knees and shoulders land where the lift puts them', off.length === 0, off.join('; '))

  // The specific error the deadlift had: the shin must not slope forward, because
  // that is a leg reaching out in front like a chair rather than a lifting stance.
  const shinLean = (pose) => {
    const t = segmentTransforms(F, pose)
    const kn = applyTransform(t['thigh:right'], F.knee[0])
    const an = applyTransform(t['shank:right'], F.ankle[0])
    return kn[2] - an[2]
  }
  check('the deadlift knee sits in front of the ankle', shinLean(POSE_ARCHETYPES.hinge_deadlift[0].pose) > 0, shinLean(POSE_ARCHETYPES.hinge_deadlift[0].pose).toFixed(1))
  check('as does the bent-row knee', shinLean(POSE_ARCHETYPES.row_bent[0].pose) > 0)
  check('and the squat knee travels further forward still', shinLean(POSE_ARCHETYPES.squat_back[2].pose) > 4)
}

/** A foot on the floor has to be level, or the figure balances on its toes. */
console.log('\nfeet stay flat on the floor')
{
  const STANDING = [
    'hinge_deadlift', 'hinge_rdl', 'row_bent', 'row_supported', 'row_rear_delt',
    'squat_back', 'squat_front', 'curl', 'curl_incline', 'shrug', 'raise_lateral',
    'extension_pushdown', 'press_overhead', 'carry', 'calf_raise',
  ]
  const tilted = []
  for (const key of STANDING) {
    for (const f of POSE_ARCHETYPES[key]) {
      // Calf raises are supposed to be on the toes, so skip their lifted frames.
      if (key === 'calf_raise' && f.label !== 'Set up') continue
      const posed = poseGrids(BONES, P.lean, f.pose)
      const heel = posed.find((g) => g.name === 'heel-R')
      const toe = posed.filter((g) => g.name.startsWith('metatarsal-R'))
      if (!heel || !toe.length) continue
      const hy = centroid(heel)[1]
      const ty = toe.reduce((a, g) => a + centroid(g)[1], 0) / toe.length
      if (Math.abs(hy - ty) > 2.5) tilted.push(`${key}/${f.label}=${(hy - ty).toFixed(1)}in`)
    }
  }
  check('the sole is level in every standing frame', tilted.length === 0, tilted.join(' '))
}

console.log('\njoint ranges stay human')
{
  const limbs = Object.entries(POSE_ARCHETYPES).flatMap(([key, frames]) =>
    frames.flatMap((f) => [f.pose.both, f.pose.left, f.pose.right].filter(Boolean).map((l) => ({ key, label: f.label, l }))),
  )
  const bad = (name, pred) => limbs.filter((x) => x.l[name] !== undefined && pred(x.l[name])).map((x) => `${x.key}/${x.label}:${name}=${x.l[name]}`)
  check('no knee bends backward', bad('knee', (v) => v < 0).length === 0, bad('knee', (v) => v < 0).join(' '))
  check('no knee bends past 145°', bad('knee', (v) => v > 145).length === 0, bad('knee', (v) => v > 145).join(' '))
  check('no elbow bends backward', bad('elbow', (v) => v < 0).length === 0, bad('elbow', (v) => v < 0).join(' '))
  check('no elbow bends past 150°', bad('elbow', (v) => v > 150).length === 0, bad('elbow', (v) => v > 150).join(' '))
  check('no hip flexes past 130°', bad('hipFlex', (v) => v > 130).length === 0, bad('hipFlex', (v) => v > 130).join(' '))
  check('no hip extends past 45° behind', bad('hipFlex', (v) => v < -45).length === 0, bad('hipFlex', (v) => v < -45).join(' '))
  check('no shoulder abducts past 180°', bad('shoulderAbduct', (v) => v > 180 || v < -20).length === 0)
  check('no torso hinges past 90°', Object.entries(POSE_ARCHETYPES).flatMap(([k, fr]) => fr.filter((f) => (f.pose.torsoPitch ?? 0) > 90 || (f.pose.torsoPitch ?? 0) < -30).map((f) => `${k}/${f.label}`)).length === 0)
}

// ---------------------------------------------------------------------------
// Anchoring
// ---------------------------------------------------------------------------
console.log('\nanchoring puts the body back in contact with the world')
{
  const squatBottom = POSE_ARCHETYPES.squat_back[2].pose
  const raw = [poseGrids(MUSCLES, P.lean, squatBottom), poseGrids(BONES, P.lean, squatBottom)]
  check('un-anchored, a squat leaves the floor', boundsOf(raw).min[1] > 1)

  const grounded = anchorGrids(raw, 'feet')
  check('anchoring by the feet puts the lowest point on the floor', Math.abs(boundsOf(grounded).min[1]) < 1e-6)
  // Muscles and bones must move by the SAME offset or the bones slide out.
  const dyM = boundsOf([grounded[0]]).min[1] - boundsOf([raw[0]]).min[1]
  const dyB = boundsOf([grounded[1]]).min[1] - boundsOf([raw[1]]).min[1]
  check('muscles and bones move together', Math.abs(dyM - dyB) < 1e-9, `${dyM} vs ${dyB}`)

  const hung = anchorGrids(raw, 'hands', 90)
  check('anchoring by the hands hangs it from the given height', Math.abs(boundsOf(hung).max[1] - 90) < 1e-6)
  check("'none' leaves it where it is", anchorGrids(raw, 'none') === raw)

  // A squat has to actually get lower as it descends, or the sequence is nonsense.
  const heights = POSE_ARCHETYPES.squat_back.map((f) => {
    const g = anchorGrids([poseGrids(BONES, P.lean, f.pose)], f.pose.anchor ?? 'feet')
    return boundsOf(g).max[1]
  })
  check('a squat gets shorter into the bottom and taller coming up', heights[0] > heights[2] + 3 && heights[3] > heights[2], heights.map((h) => h.toFixed(1)).join(' '))
}

// ---------------------------------------------------------------------------
// Every archetype has to produce drawable geometry
// ---------------------------------------------------------------------------
console.log('\nevery archetype renders')
{
  const bad = []
  const empty = []
  const offscale = []
  for (const [key, frames] of Object.entries(POSE_ARCHETYPES)) {
    for (const f of frames) {
      const sets = anchorGrids(
        [poseGrids(MUSCLES, P.lean, f.pose), poseGrids(BONES, P.lean, f.pose)],
        f.pose.anchor ?? 'feet',
        90,
      )
      for (const grids of sets) {
        for (const g of grids) for (const row of g.rows) for (const v of row) if (!v.every(Number.isFinite)) bad.push(`${key}/${f.label}:${g.name}`)
        if (grids.length === 0) empty.push(`${key}/${f.label}`)
      }
      const b = boundsOf(sets)
      // A body is about 70in tall; nothing should span more than twice that.
      const span = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2])
      if (span < 20 || span > 140) offscale.push(`${key}/${f.label}=${span.toFixed(0)}`)
    }
  }
  check('no non-finite vertices anywhere', bad.length === 0, bad.slice(0, 4).join(' '))
  check('no empty frame', empty.length === 0, empty.join(' '))
  check('every pose stays a plausible size', offscale.length === 0, offscale.slice(0, 6).join(' '))
}

console.log('\narchetype shape')
{
  const counts = Object.entries(POSE_ARCHETYPES).map(([k, f]) => [k, f.length])
  check('every archetype has 2 to 4 frames', counts.every(([, n]) => n >= 2 && n <= 4), counts.filter(([, n]) => n < 2 || n > 4).join(' '))
  const all = Object.values(POSE_ARCHETYPES).flat()
  check('every frame has a label', all.every((f) => f.label.trim().length > 0))
  check('every frame has a caption', all.every((f) => f.caption.trim().length > 10))
  check('every frame names a valid camera view', all.every((f) => VIEWS.has(f.view)), all.filter((f) => !VIEWS.has(f.view)).map((f) => f.view).join(' '))
  check('captions end in a full stop', all.every((f) => /[.!]$/.test(f.caption)))
  check('labels are unique within an archetype', Object.values(POSE_ARCHETYPES).every((f) => new Set(f.map((x) => x.label)).size === f.length))
}

// ---------------------------------------------------------------------------
// Guide coverage and content
// ---------------------------------------------------------------------------
console.log('\nevery exercise is documented')
{
  check('no built-in exercise is missing a guide', missingGuides().length === 0, missingGuides().join(', '))
  check('there is no guide for an exercise that does not exist', Object.keys(EXERCISE_GUIDES).every((id) => EXERCISES.some((e) => e.id === id)))
  const entries = Object.entries(EXERCISE_GUIDES)
  check('every archetype referenced exists', entries.every(([, g]) => !g.archetype || POSE_ARCHETYPES[g.archetype]))
  const unused = Object.keys(POSE_ARCHETYPES).filter((k) => !entries.some(([, g]) => g.archetype === k))
  check('no archetype is defined but never used', unused.length === 0, unused.join(', '))

  check('every guide has a summary', entries.every(([, g]) => g.summary.length > 20))
  check('every guide says how to set up', entries.every(([, g]) => g.setup.length > 0))
  check('every guide says how to perform it', entries.every(([, g]) => g.execution.length > 0))
  check('every guide lists a common mistake', entries.every(([, g]) => g.mistakes.length > 0))
  // A missing diagram must be explained, and an explanation without a missing
  // diagram means the reason will never be shown.
  check('a guide has a diagram OR a reason it has none', entries.every(([, g]) => !!g.archetype !== !!g.noDiagram), entries.filter(([, g]) => !!g.archetype === !!g.noDiagram).map(([k]) => k).join(' '))
  check('the no-diagram cases are the spinal-flexion ones', entries.filter(([, g]) => g.noDiagram).map(([k]) => k).sort().join(',') === 'ab_wheel,cable_crunch')

  check('framesFor returns frames for a documented lift', framesFor('bench_press').length === 4)
  check('and none for a no-diagram lift', framesFor('cable_crunch').length === 0)
  check('and none for an unknown id', framesFor('not_a_lift').length === 0)
  check('guideFor returns null for a custom exercise', guideFor('ex_custom123') === null)

  // No markdown: nothing renders it, so an asterisk shows up literally on screen.
  const marked = entries.filter(([, g]) =>
    [g.summary, ...g.setup, ...g.execution, ...g.cues, ...g.mistakes, g.noDiagram ?? ''].some((s) => /\*|_[a-z]+_|`/.test(s)),
  )
  check('no unrendered markdown in the copy', marked.length === 0, marked.map(([k]) => k).join(' '))

  // Every muscle an exercise claims must be highlightable, or the diagram lights
  // nothing and the "which muscles" half of the feature silently does nothing.
  const { MUSCLE_BELLIES } = await import('../src/lib/muscles.ts')
  const names = new Set(MUSCLES.map((g) => g.name))
  const unmatched = []
  for (const e of EXERCISES) {
    for (const m of [...e.primary, ...e.secondary]) {
      const frags = MUSCLE_BELLIES[m] ?? []
      if (!frags.some((fr) => [...names].some((n) => n.includes(fr)))) unmatched.push(`${e.id}:${m}`)
    }
  }
  check('every tracked muscle maps onto real bellies', unmatched.length === 0, unmatched.slice(0, 6).join(' '))
}

function centroid(g) {
  let x = 0
  let y = 0
  let z = 0
  let n = 0
  for (const row of g.rows) for (const p of row) {
    x += p[0]
    y += p[1]
    z += p[2]
    n++
  }
  return [x / n, y / n, z / n]
}

function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
