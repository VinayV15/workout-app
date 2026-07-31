import { bodyFrame, type BodyFrame, type MeshGrid, type Vec3 } from './anatomy'
import type { BodyDims } from './physique'

/**
 * Posing the figure, for the exercise diagrams.
 *
 * The physique model builds one body: standing, arms hanging, legs straight —
 * every joint a fixed fraction of height. Showing a squat or a press needs that
 * figure articulated, and the cheapest correct way to get there is *rigid segment
 * transforms* rather than a second mesh builder.
 *
 * The bellies are built once in the rest pose, then each is moved by the transform
 * of the bone it sits on. That works because the muscle layer already anchors
 * every limb belly between two joints, so a belly and its bone agree on where they
 * are. Joints show a small crease where two segments meet at a sharp angle, which
 * is what you get without vertex blending — but the bellies taper to nothing at
 * both ends, so the seam lands where there is almost no geometry.
 *
 * The torso is one rigid segment. It can be tilted (a hinge) or laid flat (a
 * bench) but it cannot *bend*, because the torso bellies are placed at absolute
 * heights rather than along a spine. That rules out honest diagrams for spinal
 * flexion — a crunch, an ab-wheel rollout — and those exercises say so rather than
 * showing a figure that is quietly wrong.
 */

// ---------------------------------------------------------------------------
// Small rigid-transform type. A 3×3 rotation plus a translation.
// ---------------------------------------------------------------------------

export interface Transform {
  /** Row-major 3×3 rotation. */
  r: number[]
  t: Vec3
}

export const IDENTITY: Transform = { r: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] }

export function applyTransform(m: Transform, p: Vec3): Vec3 {
  const [x, y, z] = p
  return [
    m.r[0] * x + m.r[1] * y + m.r[2] * z + m.t[0],
    m.r[3] * x + m.r[4] * y + m.r[5] * z + m.t[1],
    m.r[6] * x + m.r[7] * y + m.r[8] * z + m.t[2],
  ]
}

/** `compose(a, b)` applies b first, then a. */
export function compose(a: Transform, b: Transform): Transform {
  const r = new Array<number>(9)
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      r[i * 3 + j] = a.r[i * 3] * b.r[j] + a.r[i * 3 + 1] * b.r[3 + j] + a.r[i * 3 + 2] * b.r[6 + j]
    }
  }
  return { r, t: applyTransform(a, b.t) }
}

const DEG = Math.PI / 180

/** Rotation about a world axis through a pivot, so a joint stays put as it turns. */
export function rotateAbout(pivot: Vec3, axis: 'x' | 'y' | 'z', deg: number): Transform {
  if (!deg) return IDENTITY
  const c = Math.cos(deg * DEG)
  const s = Math.sin(deg * DEG)
  const r =
    axis === 'x'
      ? [1, 0, 0, 0, c, -s, 0, s, c]
      : axis === 'y'
        ? [c, 0, s, 0, 1, 0, -s, 0, c]
        : [c, -s, 0, s, c, 0, 0, 0, 1]
  const rp: Vec3 = [
    r[0] * pivot[0] + r[1] * pivot[1] + r[2] * pivot[2],
    r[3] * pivot[0] + r[4] * pivot[1] + r[5] * pivot[2],
    r[6] * pivot[0] + r[7] * pivot[1] + r[8] * pivot[2],
  ]
  return { r, t: [pivot[0] - rp[0], pivot[1] - rp[1], pivot[2] - rp[2]] }
}

export function translation(t: Vec3): Transform {
  return { r: [...IDENTITY.r], t }
}

// ---------------------------------------------------------------------------
// The pose
// ---------------------------------------------------------------------------

/**
 * One limb's joint angles, in degrees. Signs are chosen so a positive number is
 * always the direction the joint actually travels, which keeps the pose tables
 * readable: a knee only flexes, so `knee: 90` is a right angle and there is never
 * a reason to write a negative one.
 */
export interface LimbPose {
  /** Upper arm swung forward. Negative reaches behind. */
  shoulderFlex?: number
  /** Upper arm lifted away from the body, out to the side. */
  shoulderAbduct?: number
  /** Upper arm twisted about its own length. */
  shoulderRotate?: number
  /** Elbow bend. Always positive. */
  elbow?: number
  /** Thigh swung forward. Negative extends it behind. */
  hipFlex?: number
  /** Thigh taken out to the side. */
  hipAbduct?: number
  /** Knee bend. Always positive. */
  knee?: number
  /** Toes pulled up toward the shin. Negative points them away. */
  ankle?: number
}

export interface Pose {
  /**
   * Pitch of the whole figure. -90 lays it on its back, which is how the bench
   * and lying movements are built: pose the limbs as if standing, then tip the
   * result over.
   */
  rootPitch?: number
  /** Yaw of the whole figure, for a three-quarter presentation. */
  rootYaw?: number
  /** Torso tilt at the hip. Positive folds it forward over the legs. */
  torsoPitch?: number
  /** Torso twist at the hip. */
  torsoYaw?: number
  /**
   * What holds the body in place.
   *
   * Forward kinematics rotates the limbs about a *fixed pelvis*, so bending the
   * hips and knees for a squat sends the feet up into the air instead of dropping
   * the hips — which does not read as a squat at all. Anchoring puts the contact
   * point back where it belongs: `feet` drops the figure until its lowest point is
   * on the floor, `hands` hangs it from its highest.
   */
  anchor?: 'feet' | 'hands' | 'none'
  /** Applied to both limbs; `left`/`right` override per side. */
  both?: LimbPose
  left?: LimbPose
  right?: LimbPose
}

function limbFor(pose: Pose, side: 'left' | 'right'): LimbPose {
  return { ...(pose.both ?? {}), ...(pose[side] ?? {}) }
}

// ---------------------------------------------------------------------------
// Which bone each belly rides on
// ---------------------------------------------------------------------------

export type Segment = 'torso' | 'upperArm' | 'forearm' | 'thigh' | 'shank' | 'foot'

/**
 * Bellies grouped by the bone they move with.
 *
 * The deltoids and the long head of the triceps both actually cross the shoulder,
 * so neither is purely upper-arm — but they visually belong to the arm, and
 * leaving them on the torso detaches the shoulder from the limb as soon as it
 * lifts. The glutes cross the hip the same way and stay with the pelvis, which is
 * the right call for the opposite reason: they read as part of the trunk.
 */
const SEGMENT_OF: { match: string; segment: Segment }[] = [
  // Muscle bellies.
  { match: 'brachioradialis', segment: 'forearm' },
  { match: 'forearm-extensors', segment: 'forearm' },
  { match: 'forearm-flexors', segment: 'forearm' },
  { match: 'biceps-long', segment: 'upperArm' },
  { match: 'biceps-short', segment: 'upperArm' },
  { match: 'triceps-long', segment: 'upperArm' },
  { match: 'triceps-lateral', segment: 'upperArm' },
  { match: 'deltoid', segment: 'upperArm' },
  { match: 'rectus-femoris', segment: 'thigh' },
  { match: 'vastus', segment: 'thigh' },
  { match: 'biceps-femoris', segment: 'thigh' },
  { match: 'semitendinosus', segment: 'thigh' },
  { match: 'adductor', segment: 'thigh' },
  { match: 'gastrocnemius', segment: 'shank' },
  { match: 'soleus', segment: 'shank' },
  { match: 'tibialis', segment: 'shank' },
  // Bones, so the skeleton can be posed alongside the muscles. Without it the
  // bellies float: each one tapers to nothing at its joint, so with no bone
  // spanning the gap a posed limb reads as a row of detached strips rather than
  // an arm. The skeleton is what makes the figure legible as a person.
  { match: 'humerus', segment: 'upperArm' },
  { match: 'radius', segment: 'forearm' },
  { match: 'ulna', segment: 'forearm' },
  { match: 'palm', segment: 'forearm' },
  { match: 'finger', segment: 'forearm' },
  { match: 'femur', segment: 'thigh' },
  { match: 'patella', segment: 'shank' },
  { match: 'tibia', segment: 'shank' },
  { match: 'fibula', segment: 'shank' },
  { match: 'heel', segment: 'foot' },
  { match: 'metatarsal', segment: 'foot' },
]

/** The bone a belly rides on, and which side of the body it is on. */
export function segmentOf(name: string): { segment: Segment; side: 'left' | 'right' | null } {
  const hit = SEGMENT_OF.find((s) => name.includes(s.match))
  if (!hit) return { segment: 'torso', side: null }
  // Limb parts are suffixed -R / -L, sometimes with an index after it — and the
  // index may be hyphenated: `heel-R` but `metatarsal-R-1`, `finger-L-3`. Matching
  // only the un-hyphenated form left every metatarsal on the torso transform, so
  // the feet stayed by the pelvis while the legs moved and the diagram had a pair
  // of toes floating in mid-air.
  const m = /-([RL])(?:-?\d+)?$/.exec(name)
  const side = m ? (m[1] === 'L' ? 'left' : 'right') : null
  return { segment: hit.segment, side }
}

// ---------------------------------------------------------------------------
// Building the transforms
// ---------------------------------------------------------------------------

/**
 * A transform per segment per side, composed down the skeleton so a child joint
 * inherits its parent's movement — bend the hip and the shank follows the thigh.
 *
 * Legs deliberately do NOT inherit the torso tilt. Folding at the hip is the torso
 * moving over stationary legs, which is the whole point of a hinge; carrying the
 * legs with it would rotate the entire body instead.
 */
export function segmentTransforms(f: BodyFrame, pose: Pose): Record<string, Transform> {
  const hipCentre: Vec3 = [
    (f.hip[0][0] + f.hip[1][0]) / 2,
    (f.hip[0][1] + f.hip[1][1]) / 2,
    (f.hip[0][2] + f.hip[1][2]) / 2,
  ]

  const root = compose(
    rotateAbout(hipCentre, 'y', pose.rootYaw ?? 0),
    rotateAbout(hipCentre, 'x', pose.rootPitch ?? 0),
  )

  const torso = compose(
    root,
    compose(rotateAbout(hipCentre, 'y', pose.torsoYaw ?? 0), rotateAbout(hipCentre, 'x', pose.torsoPitch ?? 0)),
  )

  const out: Record<string, Transform> = { torso }

  for (const side of ['right', 'left'] as const) {
    const idx = side === 'right' ? 0 : 1
    const sign = side === 'right' ? 1 : -1
    const L = limbFor(pose, side)

    // Arms hang from the shoulder, which the torso carries.
    //
    // The negated pitch angles below are not arbitrary. A positive x-rotation
    // carries a point *above* the pivot forward, but every limb hangs *below* its
    // joint, so the same rotation carries it backward. Flexion is forward, so the
    // pitch angles are negated to make `shoulderFlex: 90` mean "arm out in front"
    // rather than "arm behind you". Verified against joint positions in
    // test-pose.mjs, which is the only reason the signs are trustworthy.
    const shoulder = f.shoulder[idx]
    const upperArm = compose(
      torso,
      compose(
        compose(
          rotateAbout(shoulder, 'x', -(L.shoulderFlex ?? 0)),
          // Abduction takes the arm away from the midline, so the sign follows the
          // side: `shoulderAbduct: 90` is "out sideways" on both arms.
          rotateAbout(shoulder, 'z', sign * (L.shoulderAbduct ?? 0)),
        ),
        rotateAbout(shoulder, 'y', sign * (L.shoulderRotate ?? 0)),
      ),
    )
    // The elbow only ever bends one way, and its pivot has to be the rest elbow
    // because the parent transform is applied after this one.
    const forearm = compose(upperArm, rotateAbout(f.elbow[idx], 'x', -(L.elbow ?? 0)))

    const thigh = compose(
      root,
      compose(
        rotateAbout(f.hip[idx], 'x', -(L.hipFlex ?? 0)),
        rotateAbout(f.hip[idx], 'z', sign * (L.hipAbduct ?? 0)),
      ),
    )
    // A knee travels the opposite way to a hip — the heel goes behind you — so
    // this one is NOT negated.
    const shank = compose(thigh, rotateAbout(f.knee[idx], 'x', L.knee ?? 0))
    // The foot, so calf raises have something to actually raise.
    const foot = compose(shank, rotateAbout(f.ankle[idx], 'x', -(L.ankle ?? 0)))

    out[`upperArm:${side}`] = upperArm
    out[`forearm:${side}`] = forearm
    out[`thigh:${side}`] = thigh
    out[`shank:${side}`] = shank
    out[`foot:${side}`] = foot
  }
  return out
}

/** The transform that applies to a given belly. */
function transformFor(name: string, transforms: Record<string, Transform>): Transform {
  const { segment, side } = segmentOf(name)
  if (segment === 'torso' || !side) return transforms.torso
  return transforms[`${segment}:${side}`] ?? transforms.torso
}

/**
 * Moves rest-pose geometry into a pose.
 *
 * Takes the grids already built and fitted, so posing costs one matrix multiply
 * per vertex rather than a rebuild — which is what makes three or four frames of
 * the same exercise cheap enough to show side by side.
 */
export function poseGrids(grids: MeshGrid[], dims: BodyDims, pose: Pose): MeshGrid[] {
  const f = bodyFrame(dims)
  const transforms = segmentTransforms(f, pose)
  return grids.map((g) => {
    const m = transformFor(g.name, transforms)
    return {
      name: g.name,
      closedRings: g.closedRings,
      rows: g.rows.map((row) => row.map((p) => applyTransform(m, p))),
    }
  })
}

// ---------------------------------------------------------------------------
// Framing
// ---------------------------------------------------------------------------

export interface Bounds {
  min: Vec3
  max: Vec3
  centre: Vec3
  /** Radius of the enclosing sphere, for choosing a camera distance. */
  radius: number
}

export function boundsOf(gridSets: MeshGrid[][]): Bounds {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const grids of gridSets) {
    for (const g of grids) {
      for (const row of g.rows) {
        for (const p of row) {
          for (let i = 0; i < 3; i++) {
            if (p[i] < min[i]) min[i] = p[i]
            if (p[i] > max[i]) max[i] = p[i]
          }
        }
      }
    }
  }
  if (!Number.isFinite(min[0])) {
    return { min: [0, 0, 0], max: [0, 0, 0], centre: [0, 0, 0], radius: 1 }
  }
  const centre: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
  // The largest single half-extent, not the diagonal. A body is long and thin, so
  // its bounding diagonal is much bigger than anything actually visible from a
  // given angle — using it framed every figure noticeably smaller than it needed
  // to be. The widest axis is the one that has to fit.
  const radius = Math.max(max[0] - centre[0], max[1] - centre[1], max[2] - centre[2], 1)
  return { min, max, centre, radius }
}

/**
 * One framing shared by every frame of an exercise.
 *
 * Framing each pose to its own extents would make the figure jump in size between
 * frames, which reads as three different bodies rather than one body moving. The
 * union of all the poses fixes the camera once.
 */
export function sharedFit(gridSets: MeshGrid[][]): { centreY: number; radius: number } {
  const b = boundsOf(gridSets)
  return { centreY: b.centre[1], radius: b.radius }
}

/**
 * Puts a posed figure back in contact with the world.
 *
 * Every grid set passed in moves by the *same* offset, so the muscles and the
 * skeleton of one frame stay registered with each other — measuring them
 * separately would slide the bones out of the bellies.
 *
 * `hands` hangs the figure from a fixed bar height rather than from zero, so a
 * pull-up's bar sits in the same place in every frame of the sequence instead of
 * the body appearing to grow.
 */
export function anchorGrids(
  gridSets: MeshGrid[][],
  anchor: Pose['anchor'],
  hangHeight = 0,
): MeshGrid[][] {
  if (anchor === 'none') return gridSets
  const b = boundsOf(gridSets)
  const dy = anchor === 'hands' ? hangHeight - b.max[1] : -b.min[1]
  if (Math.abs(dy) < 1e-9) return gridSets
  return gridSets.map((grids) =>
    grids.map((g) => ({
      name: g.name,
      closedRings: g.closedRings,
      rows: g.rows.map((row) => row.map((p): Vec3 => [p[0], p[1] + dy, p[2]])),
    })),
  )
}
