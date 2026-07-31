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
