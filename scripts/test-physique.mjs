/**
 * Tests for the physique model and mesh generation. Run with `npm test`.
 *
 * The important invariants: the three shells must nest (frame inside lean inside
 * full), the fat shell must respond to body fat and to sex-specific
 * distribution, and — the real check — the modelled body's volume must agree
 * with the volume implied by bodyweight and body-fat percentage. If that last
 * one drifts, the drawing has stopped being about the numbers.
 */
import {
  computePhysique,
  approxVolumeIn3,
  volumeFromWeightIn3,
  estimateGirths,
  sectionGirth,
  SECTION_EXPONENT,
} from '../src/lib/physique.ts'
import {
  segmentsForDims,
  buildChains,
  bounds,
  surfaceGrids,
  fitMusclesToSurface,
  containment,
  sectionFor,
} from '../src/lib/bodyMesh.ts'
import { buildMuscleGrids, muscleGroupOf, MUSCLE_GROUPS } from '../src/lib/muscles.ts'
import { buildFrameGrids, boneColorOf, BONE_GROUPS } from '../src/lib/skeletonMesh.ts'
import { armHangX, gridsToSegments, gridsToTriangles, legPoints } from '../src/lib/anatomy.ts'
import { applyRelief, sampleMuscleField } from '../src/lib/relief.ts'
import { buildFatGrids, fatColorOf } from '../src/lib/fatDeposits.ts'
import { LEVELS } from '../src/lib/physique.ts'
const LEVELS_WAIST = LEVELS.waist

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

console.log('physique model')

const male = { heightIn: 70, weightLb: 210, bodyFatPct: 23, sex: 'male' }
const female = { heightIn: 65, weightLb: 150, bodyFatPct: 30, sex: 'female' }

// --- Shells nest --------------------------------------------------------
{
  const p = computePhysique(male)
  const sites = ['chest', 'waist', 'hip', 'neck']
  const scalars = ['headR', 'upperArmR', 'forearmR', 'thighR', 'calfR', 'shoulderHalfWidth']
  let leanInsideFull = true
  let frameInsideLean = true
  for (const s of sites) {
    if (p.lean[s].a > p.full[s].a + 1e-9 || p.lean[s].b > p.full[s].b + 1e-9) leanInsideFull = false
    if (p.frame[s].a > p.lean[s].a + 1e-9 || p.frame[s].b > p.lean[s].b + 1e-9) frameInsideLean = false
  }
  for (const k of scalars) {
    if (p.lean[k] > p.full[k] + 1e-9) leanInsideFull = false
    if (p.frame[k] > p.lean[k] + 1e-9) frameInsideLean = false
  }
  check('the lean shell fits inside the full shell everywhere', leanInsideFull)
  check('the frame fits inside the lean shell everywhere', frameInsideLean)
}

// --- Volume agrees with bodyweight -------------------------------------
for (const input of [male, female, { ...male, bodyFatPct: 12 }, { ...male, weightLb: 165, bodyFatPct: 12 }]) {
  const p = computePhysique(input)
  const modelled = approxVolumeIn3(p.full)
  const implied = volumeFromWeightIn3(input.weightLb, input.bodyFatPct)
  const err = Math.abs(modelled - implied) / implied
  check(
    `modelled volume matches bodyweight within 20% (${input.sex} ${input.weightLb}lb @ ${input.bodyFatPct}%)`,
    err < 0.2,
    `${Math.round(modelled)} vs ${Math.round(implied)} in³ (${Math.round(err * 100)}% off)`,
  )
}

// --- Fat responds to body fat ------------------------------------------
{
  const lean = computePhysique({ ...male, bodyFatPct: 12 })
  const fat = computePhysique({ ...male, bodyFatPct: 32 })
  check('a higher body fat gives a thicker fat shell', fat.fatThickness.waist > lean.fatThickness.waist * 1.5)
  check('at low body fat the lean and full shells nearly coincide', lean.full.waist.a - lean.lean.waist.a < 0.9)
}

// --- Sex-specific distribution -----------------------------------------
{
  const m = computePhysique({ ...male, bodyFatPct: 28 })
  const f = computePhysique({ ...female, bodyFatPct: 28 })
  check('male fat is distributed abdominally (waist over hip)', m.fatThickness.waist > m.fatThickness.hip)
  check('female fat is distributed at the hip and thigh (hip over waist)', f.fatThickness.hip > f.fatThickness.waist)
  check('female thigh carries more fat than male at equal body fat', f.fatThickness.thigh > m.fatThickness.thigh)
}

// --- Muscle responds to lean mass --------------------------------------
{
  const small = computePhysique({ heightIn: 70, weightLb: 160, bodyFatPct: 15, sex: 'male' })
  const big = computePhysique({ heightIn: 70, weightLb: 200, bodyFatPct: 15, sex: 'male' })
  check('more lean mass at the same body fat gives bigger arms', big.lean.upperArmR > small.lean.upperArmR)
  check('more lean mass at the same body fat gives wider shoulders', big.lean.shoulderHalfWidth > small.lean.shoulderHalfWidth)
}

// --- Measured girths are honoured verbatim -----------------------------
{
  const measured = { chest: 44, waist: 34, arm: 15.5, thigh: 24, shoulders: 20 }
  const p = computePhysique({ ...male, measured })
  // Measured with the same yardstick the model solves against: the perimeter of
  // the superellipse actually drawn, not an ellipse approximation of it.
  check(
    'a measured chest is reproduced exactly',
    Math.abs(sectionGirth(p.full.chest, SECTION_EXPONENT.chest) - 44) < 0.05,
    String(sectionGirth(p.full.chest, SECTION_EXPONENT.chest)),
  )
  check('a measured waist is reproduced exactly', Math.abs(sectionGirth(p.full.waist, SECTION_EXPONENT.waist) - 34) < 0.05)
  check('a measured shoulder width is reproduced exactly', Math.abs(p.full.shoulderHalfWidth * 2 - 20) < 0.05)
  check('measured fields are not listed as estimated', !p.estimated.includes('chest') && !p.estimated.includes('waist'))
  check('unmeasured fields are listed as estimated', p.estimated.includes('calf') && p.estimated.includes('neck'))
}

// --- Estimation is sane -------------------------------------------------
{
  const { girths } = estimateGirths(70, 210, 23, 'male', {})
  check('estimated waist is plausible for the input', girths.waist > 30 && girths.waist < 44, String(girths.waist))
  check('estimated chest exceeds estimated waist', girths.chest > girths.waist)
  const { girths: g2 } = estimateGirths(65, 150, 30, 'female', {})
  check('estimated female hips exceed waist', g2.hips > g2.waist)
}

// --- Degenerate inputs do not explode ----------------------------------
{
  for (const input of [
    { heightIn: 0, weightLb: 0, bodyFatPct: 0, sex: 'male' },
    { heightIn: 60, weightLb: 400, bodyFatPct: 60, sex: 'female' },
    { heightIn: 80, weightLb: 120, bodyFatPct: 3, sex: 'male' },
  ]) {
    const p = computePhysique(input)
    const dims = [p.full.chest.a, p.full.waist.b, p.lean.thighR, p.frame.headR, p.full.shoulderHalfWidth]
    check(
      `degenerate input keeps every dimension finite and positive (${input.heightIn}in ${input.weightLb}lb ${input.bodyFatPct}%)`,
      dims.every((n) => Number.isFinite(n) && n > 0),
      JSON.stringify(dims),
    )
    // At or below essential body fat the shell is legitimately zero thickness —
    // what must never happen is a negative or NaN one.
    const fats = Object.values(p.fatThickness)
    check(
      `degenerate input keeps fat thickness finite and non-negative (${input.bodyFatPct}%)`,
      fats.every((n) => Number.isFinite(n) && n >= 0),
      JSON.stringify(p.fatThickness),
    )
  }
}

console.log('\nbody mesh')

// --- Mesh geometry ------------------------------------------------------
{
  const p = computePhysique(male)
  const v = segmentsForDims(p.full)
  check('mesh produces vertices', v.length > 3000, `${v.length / 6} segments`)
  check('mesh vertices are whole line-segment pairs', v.length % 6 === 0)
  check('every mesh vertex is finite', v.every((n) => Number.isFinite(n)))

  const b = bounds(v)
  check('mesh stands on the floor', b.minY >= -0.5 && b.minY < 1.5, String(b.minY))
  check('mesh is as tall as the person', Math.abs(b.maxY - male.heightIn) < 1.5, `${b.maxY} vs ${male.heightIn}`)
  const width = b.maxX - b.minX
  check('mesh is wider than the shoulders but not absurd', width > p.full.shoulderHalfWidth * 2 && width < male.heightIn * 0.6, String(width))
  const depth = b.maxZ - b.minZ
  check('mesh has sensible front-to-back depth', depth > 4 && depth < male.heightIn * 0.4, String(depth))
}

// --- Chains -------------------------------------------------------------
{
  const p = computePhysique(male)
  const chains = buildChains(p.full)
  const names = chains.map((c) => c.name).sort()
  check(
    'mesh has torso, head, two arms and two legs',
    names.join(',') === 'armL,armR,head,legL,legR,torso',
    names.join(','),
  )
  check('every chain has rings and a radial count', chains.every((c) => c.rings.length > 3 && c.radial > 3))

  // Left and right must be exact mirrors, or the body looks subtly wrong.
  const byName = Object.fromEntries(chains.map((c) => [c.name, c]))
  for (const part of ['arm', 'leg']) {
    const r = byName[`${part}R`]
    const l = byName[`${part}L`]
    const mirrored = r.rings.every(
      (ring, i) => Math.abs(ring.cx + l.rings[i].cx) < 1e-9 && Math.abs(ring.y - l.rings[i].y) < 1e-9,
    )
    check(`the ${part}s are mirror images`, mirrored)
  }

  // The deltoids, not the torso, must reach the full shoulder width — this is
  // what keeps the silhouette from reading as a coat hanger.
  const torsoMaxA = Math.max(...byName.torso.rings.map((r) => r.a))
  // The deltoid is the top of the arm chain, not a separate part — and only the
  // top: below the elbow the arm is deliberately abducted clear of the torso, so
  // the forearm reaches wider than the shoulder and would mask this check.
  // Only the deltoid band itself: below it the arm is deliberately abducted clear
  // of the torso, so the upper arm and forearm reach wider by design.
  const deltBandY = (LEVELS.shoulder - 0.05) * male.heightIn
  const deltMaxX = Math.max(...byName.armR.rings.filter((r) => r.y > deltBandY).map((r) => r.cx + r.a))
  check(
    'the deltoid reaches wider than the torso',
    deltMaxX > torsoMaxA,
    `deltoid ${deltMaxX.toFixed(2)} vs torso ${torsoMaxA.toFixed(2)}`,
  )
  // The shoulder measurement is acromion to acromion — bone. Deltoid muscle sits
  // outside that, so the drawn width should exceed it by a little, but not by so
  // much that the shoulders stop matching what was measured.
  const overhang = deltMaxX - p.full.shoulderHalfWidth
  check(
    'the deltoid sits just outside the bony shoulder width',
    overhang > 0 && overhang < 1.2,
    `${overhang.toFixed(2)}in beyond the acromion`,
  )

  // The head must overlap the neck rather than float above it.
  const torsoTop = Math.max(...byName.torso.rings.map((r) => r.y))
  const headBottom = Math.min(...byName.head.rings.map((r) => r.y))
  const headBreadth = 2 * Math.max(...byName.head.rings.map((r) => r.a))
  const headHeight = Math.max(...byName.head.rings.map((r) => r.y)) - headBottom
  check(
    'the head is taller than it is wide',
    headHeight > headBreadth * 1.25,
    `${headHeight.toFixed(1)}in tall vs ${headBreadth.toFixed(1)}in wide`,
  )
  check(
    'the head is a plausible size for the body',
    headBreadth > male.heightIn * 0.07 && headBreadth < male.heightIn * 0.1,
    `${headBreadth.toFixed(1)}in across`,
  )
  check('the head overlaps the neck', headBottom < torsoTop, `head ${headBottom.toFixed(1)} vs torso ${torsoTop.toFixed(1)}`)

  /**
   * The thighs DO meet at the top, and must.
   *
   * This used to assert the inner edges never cross the midline, which turns out to
   * be geometrically incompatible with keeping the legs inside the pelvis: two
   * circular thighs only fit within the hip width if the thigh radius is under about
   * 2.9in, and a real one is 3.6in or more. The only way to satisfy the old rule was
   * to plant the legs outside the hips — which is precisely the "legs bolted on"
   * defect. Real adductors touch, so the overlap is right.
   *
   * What must still hold is that each leg stays on its own side, and that the crotch
   * reads as a separation rather than one fused block. The torso's tuck descending
   * between the thighs is what provides that, so it is asserted directly.
   */
  const thighRing = byName.legR.rings.reduce((best, r) => (r.a > best.a ? r : best))
  check(
    'each thigh stays on its own side of the body',
    thighRing.cx > p.full.thighR * 0.25,
    `axis at ${thighRing.cx.toFixed(2)}in`,
  )
  const torsoBottom = Math.min(...byName.torso.rings.map((r) => r.y))
  const thighTop = Math.max(...byName.legR.rings.map((r) => r.y))
  check(
    'the torso tucks down between the thighs to make a crotch',
    torsoBottom < thighTop - 4,
    `torso ends at ${torsoBottom.toFixed(1)}, thighs start at ${thighTop.toFixed(1)}`,
  )
  const tuck = byName.torso.rings.reduce((b, r) => (r.y < b.y ? r : b))
  check(
    'and that tuck is narrow, not a flat plate across the hips',
    tuck.a < p.full.hip.a * 0.45,
    `${tuck.a.toFixed(2)}in vs hip ${p.full.hip.a.toFixed(2)}in`,
  )

  // The arms must clear the torso at the waist so they read separately.
  const armAtWaist = byName.armR.rings.reduce((best, r) =>
    Math.abs(r.y - LEVELS_WAIST * male.heightIn) < Math.abs(best.y - LEVELS_WAIST * male.heightIn) ? r : best,
  )
  const torsoAtWaist = byName.torso.rings.reduce((best, r) =>
    Math.abs(r.y - LEVELS_WAIST * male.heightIn) < Math.abs(best.y - LEVELS_WAIST * male.heightIn) ? r : best,
  )
  check(
    'the arm hangs clear of the torso at the waist',
    armAtWaist.cx - armAtWaist.a > torsoAtWaist.a * 0.72,
    `arm inner edge ${(armAtWaist.cx - armAtWaist.a).toFixed(2)} vs torso ${torsoAtWaist.a.toFixed(2)}`,
  )
}

// --- Shell ordering in the mesh ----------------------------------------
{
  const p = computePhysique({ ...male, bodyFatPct: 30 })
  const full = bounds(segmentsForDims(p.full))
  const lean = bounds(segmentsForDims(p.lean))
  const frame = bounds(segmentsForDims(p.frame))
  check('the drawn full shell is wider than the drawn lean shell', full.maxX - full.minX > lean.maxX - lean.minX)
  check('the drawn lean shell is wider than the drawn frame', lean.maxX - lean.minX > frame.maxX - frame.minX)
  check('all three shells are the same height', Math.abs(full.maxY - frame.maxY) < 1.5)
}

console.log('\nmuscle layer')

// --- Individual muscle groups exist and are identifiable ----------------
{
  const p = computePhysique(male)
  const m = buildMuscleGrids(p.lean, p.frame)
  const names = m.map((x) => x.name)
  const has = (frag) => names.some((n) => n.includes(frag))
  const required = [
    'pectoral', 'rectus-abdominis', 'oblique', 'latissimus', 'trapezius',
    'deltoid', 'biceps-', 'triceps', 'forearm', 'gluteus',
    'rectus-femoris', 'vastus-lateralis', 'vastus-medialis',
    'biceps-femoris', 'semitendinosus', 'gastrocnemius', 'soleus',
    'adductor', 'serratus', 'erector', 'sternocleidomastoid', 'tibialis',
  ]
  const missing = required.filter((r) => !has(r))
  check('every named muscle group is present', missing.length === 0, missing.join(', '))
  check('there are enough distinct bellies to read as anatomy', m.length >= 50, `${m.length} bellies`)

  // Abs must be a paired grid with gaps, not one slab.
  const abs = names.filter((n) => n.startsWith('rectus-abdominis'))
  check('abs are a paired grid of pads', abs.length >= 8, `${abs.length} pads`)
  const absL = m.filter((x) => x.name.endsWith('L') && x.name.startsWith('rectus-abdominis'))
  const absR = m.filter((x) => x.name.endsWith('R') && x.name.startsWith('rectus-abdominis'))
  check('abs are mirrored left and right', absL.length === absR.length && absL.length >= 4)
  // A real gap must separate the two columns, or they read as one block.
  const rightMinX = Math.min(...absR.flatMap((g) => g.rows.flat().map((pt) => pt[0])))
  check('a groove separates the two ab columns', rightMinX > 0.05, `nearest pad edge at x=${rightMinX.toFixed(2)}`)

  // Muscles must be bellies, not slivers: width comparable to the limb.
  const bicep = m.find((x) => x.name === 'biceps-long-R')
  const bicepWidth = Math.max(...bicep.rows.flat().map((pt) => pt[0])) - Math.min(...bicep.rows.flat().map((pt) => pt[0]))
  check(
    'a biceps belly is a substantial fraction of the arm, not a sliver',
    bicepWidth > p.lean.upperArmR * 0.5,
    `${bicepWidth.toFixed(2)}in across vs arm radius ${p.lean.upperArmR.toFixed(2)}in`,
  )

  // And they must grow with lean mass.
  const small = computePhysique({ heightIn: 70, weightLb: 155, bodyFatPct: 15, sex: 'male' })
  const big = computePhysique({ heightIn: 70, weightLb: 205, bodyFatPct: 15, sex: 'male' })
  const spanOf = (ph) => {
    const g = buildMuscleGrids(ph.lean, ph.frame).find((x) => x.name === 'vastus-lateralis-R')
    const xs = g.rows.flat().map((pt) => pt[0])
    return Math.max(...xs) - Math.min(...xs)
  }
  check('muscle bellies grow with lean mass', spanOf(big) > spanOf(small) * 1.05)

  const seg = gridsToSegments(m)
  check('the muscle layer produces finite geometry', seg.length > 6000 && seg.every((n) => Number.isFinite(n)), `${seg.length / 6} segments`)
}

console.log('\nframe layer')

// --- The frame is a skeleton, not a thin body ---------------------------
{
  const p = computePhysique(male)
  const fr = buildFrameGrids(p.frame)
  const names = fr.map((x) => x.name)
  const has = (frag) => names.some((n) => n.includes(frag))
  const required = ['skull', 'jaw', 'vertebra', 'rib-', 'sternum', 'ilium', 'sacrum', 'clavicle', 'scapula',
    'humerus', 'radius', 'ulna', 'palm', 'finger', 'femur', 'patella', 'tibia', 'fibula', 'heel', 'metatarsal']
  const missing = required.filter((r) => !has(r))
  check('the frame contains actual named bones', missing.length === 0, missing.join(', '))
  check('the spine is a stack of vertebrae', names.filter((n) => n.startsWith('vertebra')).length >= 12)
  check('the ribcage has multiple ribs', names.filter((n) => n.startsWith('rib-')).length >= 8)

  // Bones must be far thinner than the body they sit inside.
  const femur = fr.find((x) => x.name === 'femur-R')
  const xs = femur.rows.flat().map((pt) => pt[0])
  const femurWidth = Math.max(...xs) - Math.min(...xs)
  check(
    'a bone is much thinner than the limb around it',
    femurWidth < p.lean.thighR * 0.7,
    `femur ${femurWidth.toFixed(2)}in vs thigh radius ${p.lean.thighR.toFixed(2)}in`,
  )

  // The frame must be dramatically slimmer overall than the fleshed body.
  const frameB = bounds(gridsToSegments(fr))
  const fullB = bounds(gridsToSegments(surfaceGrids(p.full)))
  check(
    'the skeleton is far narrower than the body',
    frameB.maxX - frameB.minX < (fullB.maxX - fullB.minX) * 0.92,
    `${(frameB.maxX - frameB.minX).toFixed(1)}in vs ${(fullB.maxX - fullB.minX).toFixed(1)}in`,
  )
  check('the skeleton spans the full height', Math.abs(frameB.maxY - male.heightIn) < 2.5, String(frameB.maxY))
}

console.log('\npart identification')

// --- Every part must be colourable, and touching parts must differ ------
{
  const p = computePhysique(male)
  const m = buildMuscleGrids(p.lean, p.frame)
  const unmapped = m.map((x) => x.name).filter((n) => !muscleGroupOf(n))
  check('every muscle belly maps to a labelled group', unmapped.length === 0, unmapped.slice(0, 5).join(', '))

  const fr = buildFrameGrids(p.frame)
  const FALLBACK = 0x123456
  const unmappedBones = fr.map((x) => x.name).filter((n) => boneColorOf(n, FALLBACK) === FALLBACK)
  check('every bone maps to a labelled region', unmappedBones.length === 0, unmappedBones.slice(0, 5).join(', '))

  // Colour is only useful if neighbours differ. These are the pairs that
  // actually touch on the body, so these are the ones that must not collide.
  const ADJACENT = [
    ['chest', 'shoulders'], ['chest', 'abs'], ['chest', 'neck'],
    ['abs', 'obliques'], ['abs', 'quads'], ['obliques', 'back'], ['obliques', 'glutes'],
    ['back', 'shoulders'], ['back', 'triceps'], ['back', 'neck'],
    ['shoulders', 'biceps'], ['shoulders', 'triceps'], ['shoulders', 'neck'],
    ['biceps', 'forearms'], ['biceps', 'triceps'], ['triceps', 'forearms'],
    ['glutes', 'hamstrings'], ['quads', 'hamstrings'], ['quads', 'calves'], ['hamstrings', 'calves'],
  ]
  const colorOfKey = (k) => MUSCLE_GROUPS.find((g) => g.key === k)?.color
  const collisions = ADJACENT.filter(([a, b]) => colorOfKey(a) === colorOfKey(b)).map(([a, b]) => `${a}/${b}`)
  check('no two touching muscle groups share a colour', collisions.length === 0, collisions.join(', '))

  // Orange and yellow are the weakest pair in the palette, so they must never
  // land on parts that touch.
  const ORANGE = 0xd95926
  const YELLOW = 0xc98500
  const weak = ADJACENT.filter(([a, b]) => {
    const ca = colorOfKey(a)
    const cb = colorOfKey(b)
    return (ca === ORANGE && cb === YELLOW) || (ca === YELLOW && cb === ORANGE)
  })
  check('the weak orange/yellow pair never lands on touching parts', weak.length === 0, weak.map((x) => x.join('/')).join(', '))

  check('bone regions are all distinctly labelled', new Set(BONE_GROUPS.map((g) => g.label)).size === BONE_GROUPS.length)
}

console.log('\nsilhouette')

// --- The shape has to read as the body it claims to be -------------------
// A lean body that looks heavy was the bug these pin down: the torso tapered
// correctly but the arms hung so close that arm and trunk read as one mass, and
// fat was added sideways instead of forward.
{
  const tape = { chest: 43.5, shoulders: 19.5, arm: 15.2, thigh: 24.5, calf: 16.4, forearm: 12.3, neck: 16.2 }
  const leanBody = computePhysique({ heightIn: 70, weightLb: 190, bodyFatPct: 10, sex: 'male', measured: { ...tape, waist: 31.5, hips: 40 } })
  const fatBody = computePhysique({ heightIn: 70, weightLb: 250, bodyFatPct: 40, sex: 'male', measured: { ...tape, waist: 46, hips: 48 } })

  const torsoRingAt = (ph, frac) => {
    const torso = buildChains(ph.full).find((c) => c.name === 'torso')
    const y = frac * 70
    let best = null
    for (const r of torso.rings) if (!best || Math.abs(r.y - y) < Math.abs(best.y - y)) best = r
    return best
  }
  const narrowestTorso = (ph) => {
    const torso = buildChains(ph.full).find((c) => c.name === 'torso')
    return Math.min(...torso.rings.filter((r) => r.y > 0.55 * 70 && r.y < 0.68 * 70).map((r) => r.a))
  }

  // V-taper: shoulders must be far wider than the narrowest point of the trunk.
  const ratio = (leanBody.full.shoulderHalfWidth * 2) / (narrowestTorso(leanBody) * 2)
  check('a lean body has a clear V-taper', ratio >= 1.55, `shoulder:waist ${ratio.toFixed(2)}`)

  // The waist must be narrower than BOTH the chest and the hip, or there is no
  // waist — just a barrel.
  const w = narrowestTorso(leanBody)
  check(
    'the lean waist is narrower than the chest and the hip',
    w < torsoRingAt(leanBody, 0.72).a * 0.92 && w < torsoRingAt(leanBody, 0.53).a * 0.92,
    `waist ${w.toFixed(2)} vs chest ${torsoRingAt(leanBody, 0.72).a.toFixed(2)} hip ${torsoRingAt(leanBody, 0.53).a.toFixed(2)}`,
  )

  // Negative space between arm and trunk at waist height, which is what makes the
  // taper legible.
  const armGapAt = (ph, frac) => {
    const arm = buildChains(ph.full).find((c) => c.name === 'armR')
    const y = frac * 70
    let best = null
    for (const r of arm.rings) if (!best || Math.abs(r.y - y) < Math.abs(best.y - y)) best = r
    return best.cx - best.a - torsoRingAt(ph, frac).a
  }
  // Arms at rest touch the lats and open only slightly at the waist. What must
  // NOT happen is the arm sinking into the trunk, or swinging out past the
  // shoulders — the latter is what made the arms read as separate floating strips
  // rather than limbs hanging from a body.
  check(
    'the arm rests against the trunk without sinking into it',
    armGapAt(leanBody, 0.62) > -0.5 && armGapAt(leanBody, 0.62) < 1.2,
    `${armGapAt(leanBody, 0.62).toFixed(2)}in at the waist`,
  )
  const widestArm = (ph) => {
    const arm = buildChains(ph.full).find((c) => c.name === 'armR')
    return Math.max(...arm.rings.map((r) => r.cx + r.a))
  }
  check(
    'the shoulder is the widest point of the body, not the hand',
    widestArm(leanBody) <= leanBody.full.shoulderHalfWidth + 0.35,
    `arm reaches ${widestArm(leanBody).toFixed(2)} vs shoulder ${leanBody.full.shoulderHalfWidth.toFixed(2)}`,
  )
  check(
    'a heavy body does not hold its arms out to the side',
    armGapAt(fatBody, 0.62) <= armGapAt(leanBody, 0.62) + 0.05,
    `heavy ${armGapAt(fatBody, 0.62).toFixed(2)}in vs lean ${armGapAt(leanBody, 0.62).toFixed(2)}in`,
  )

  // Fat goes forward. A heavy abdomen is deeper than it is wide, protrudes past
  // the chest, and its centre sits forward of the spine.
  const fatWaist = torsoRingAt(fatBody, 0.6)
  check('a heavy abdomen is deeper than it is wide', fatWaist.b >= fatWaist.a * 0.98, `depth ${fatWaist.b.toFixed(1)} vs width ${fatWaist.a.toFixed(1)}`)
  check('a heavy abdomen protrudes past the chest', fatWaist.b > torsoRingAt(fatBody, 0.72).b * 1.15, `${fatWaist.b.toFixed(1)} vs chest ${torsoRingAt(fatBody, 0.72).b.toFixed(1)}`)
  check('a heavy abdomen is carried forward', fatWaist.cz > 0.8, `centre ${fatWaist.cz.toFixed(2)}in forward`)

  // A lean abdomen must NOT do any of that.
  const leanWaist = torsoRingAt(leanBody, 0.6)
  check('a lean abdomen stays flatter than it is wide', leanWaist.b < leanWaist.a * 0.9, `depth ${leanWaist.b.toFixed(1)} vs width ${leanWaist.a.toFixed(1)}`)
  check('a lean abdomen is not carried forward', Math.abs(leanWaist.cz) < 0.35, `centre ${leanWaist.cz.toFixed(2)}in`)
}

console.log('\nmuscle alignment')

// --- Every belly must sit inside the body section it belongs to ----------
// This is the invariant behind "the obliques are overlapping the arms": a muscle
// that strays outside its own section is what produces that. Checked precisely
// against the section's cross-section rather than by comparing x extents, since
// arms hang beside the torso and their widths legitimately overlap.
{
  const p = computePhysique(male)
  const raw = buildMuscleGrids(p.lean, p.frame)
  const fitted = fitMusclesToSurface(raw, p.lean)
  const chains = Object.fromEntries(buildChains(p.lean).map((c) => [c.name, c]))

  const worstOutside = (grids) => {
    let worst = 0
    let where = ''
    for (const g of grids) {
      const chain = chains[sectionFor(g.name)]
      if (!chain) continue
      for (const row of g.rows) {
        for (const pt of row) {
          const c = containment(pt, chain)
          if (c > worst) {
            worst = c
            where = g.name
          }
        }
      }
    }
    return { worst, where }
  }

  // Unfitted geometry is expected to overflow — that is why fitting exists.
  const before = worstOutside(raw)
  check('the raw placement does overflow, so fitting is doing work', before.worst > 1.05, `worst ${before.worst.toFixed(2)} at ${before.where}`)

  const after = worstOutside(fitted)
  check(
    'every fitted belly sits inside its body section',
    after.worst <= 1.02,
    `worst ${after.worst.toFixed(2)} at ${after.where}`,
  )

  // Fitting must constrain, not gut.
  const spanOf = (grids, name) => {
    const g = grids.find((x) => x.name === name)
    const xs = g.rows.flat().map((q) => q[0])
    return Math.max(...xs) - Math.min(...xs)
  }
  for (const name of ['biceps-long-R', 'vastus-lateralis-R', 'pectoral-lower-R', 'oblique-R']) {
    check(
      `fitting keeps ${name} substantially intact`,
      spanOf(fitted, name) > spanOf(raw, name) * 0.7,
      `${spanOf(fitted, name).toFixed(2)} vs ${spanOf(raw, name).toFixed(2)}`,
    )
  }

  // Left and right must stay mirrored through fitting. Compared as geometry, not
  // index by index: a mirrored belly traverses its rings the opposite way round,
  // so point i on the left is not the mirror of point i on the right.
  const rowStats = (g) =>
    g.rows.map((row) => {
      const cx = row.reduce((a, q) => a + q[0], 0) / row.length
      const cy = row.reduce((a, q) => a + q[1], 0) / row.length
      const cz = row.reduce((a, q) => a + q[2], 0) / row.length
      let rad = 0
      for (const q of row) rad = Math.max(rad, Math.hypot(q[0] - cx, q[1] - cy, q[2] - cz))
      return { cx, cy, cz, rad }
    })
  const asym = []
  for (const base of ['oblique', 'biceps-long', 'vastus-lateralis', 'gastrocnemius-medial', 'pectoral-lower']) {
    const R = rowStats(fitted.find((x) => x.name === `${base}-R`))
    const L = rowStats(fitted.find((x) => x.name === `${base}-L`))
    for (let i = 0; i < R.length; i++) {
      if (
        Math.abs(R[i].cx + L[i].cx) > 1e-6 ||
        Math.abs(R[i].cy - L[i].cy) > 1e-6 ||
        Math.abs(R[i].cz - L[i].cz) > 1e-6 ||
        Math.abs(R[i].rad - L[i].rad) > 1e-6
      ) {
        asym.push(`${base} row ${i}`)
      }
    }
  }
  check('fitting preserves left/right symmetry', asym.length === 0, asym.slice(0, 3).join(', '))
}

console.log('\nsingle-surface relief')

// --- The combined view is one surface, shaped by the muscle beneath -----
{
  const p = computePhysique(male)
  const field = sampleMuscleField(buildMuscleGrids(p.lean, p.frame))
  check('the muscle field samples the bellies', field.length > 100, `${field.length} samples`)

  const base = surfaceGrids(p.full)
  const amplitude = 0.7

  // No definition means no change: a fat body's skin is the measured surface.
  const flat = applyRelief(base, field, { definition: 0, amplitude })
  const same = flat.every((g, gi) =>
    g.rows.every((row, ri) => row.every((pt, pi) => pt.every((c, ci) => c === base[gi].rows[ri][pi][ci]))),
  )
  check('at zero definition the surface is untouched', same)

  // Radial spread of a torso ring, as a proxy for how much relief shows.
  const ringSpread = (grids, defn) => {
    const g = applyRelief(grids, field, { definition: defn, amplitude }).find((x) => x.name === 'torso')
    // Pick a ring around chest height, where pecs and lats sit.
    const ring = g.rows[Math.floor(g.rows.length * 0.62)]
    const cx = ring.reduce((a, q) => a + q[0], 0) / ring.length
    const cz = ring.reduce((a, q) => a + q[2], 0) / ring.length
    const radii = ring.map((q) => Math.hypot(q[0] - cx, q[2] - cz))
    return Math.max(...radii) - Math.min(...radii)
  }
  const spreadFlat = ringSpread(base, 0)
  const spreadLean = ringSpread(base, 1)
  check(
    'a lean body shows more surface relief than a smooth one',
    spreadLean > spreadFlat * 1.05,
    `${spreadLean.toFixed(2)}in variation lean vs ${spreadFlat.toFixed(2)}in smooth`,
  )

  // Relief must not INFLATE the body: a tape measure bridges the grooves between
  // muscles, so a measured girth describes the outer envelope. Carving may lower
  // the mean radius — that is the definition — but the envelope must hold.
  const ringStats = (grids) => {
    const g = grids.find((x) => x.name === 'torso')
    let maxSum = 0
    let meanSum = 0
    let n = 0
    for (const row of g.rows) {
      const cx = row.reduce((a, q) => a + q[0], 0) / row.length
      const cz = row.reduce((a, q) => a + q[2], 0) / row.length
      let hi = 0
      for (const q of row) {
        const r = Math.hypot(q[0] - cx, q[2] - cz)
        hi = Math.max(hi, r)
        meanSum += r
        n++
      }
      maxSum += hi
    }
    return { envelope: maxSum / g.rows.length, mean: meanSum / n }
  }
  const before = ringStats(base)
  const after = ringStats(applyRelief(base, field, { definition: 1, amplitude }))
  check(
    'relief preserves the measured outer envelope',
    after.envelope > before.envelope * 0.96,
    `envelope ${before.envelope.toFixed(2)} -> ${after.envelope.toFixed(2)}in`,
  )
  check(
    'relief carves inward rather than inflating',
    after.mean < before.mean && after.mean > before.mean * 0.85,
    `mean ${before.mean.toFixed(2)} -> ${after.mean.toFixed(2)}in`,
  )

  // Intermediate definition must sit between the extremes.
  const spreadMid = ringSpread(base, 0.5)
  check('relief scales continuously with leanness', spreadMid > spreadFlat && spreadMid < spreadLean * 1.02)
}

// --- Abs must actually be visible on a lean body -----------------------
{
  // Ridge depth across the abdomen: the peak-to-trough spread of skin radius
  // over the ab region. If abs are visible this is large; if the surface is
  // smooth it is near zero.
  const absRidge = (bodyFatPct) => {
    const ph = computePhysique({ ...male, bodyFatPct })
    const field = sampleMuscleField(fitMusclesToSurface(buildMuscleGrids(ph.lean, ph.frame), ph.lean))
    const skin = applyRelief(surfaceGrids(ph.full), field, {
      definition: Math.max(0, Math.min(1, 1 - (ph.fatThickness.waist - 0.2) / 0.95)),
      amplitude: Math.min(1.1, (ph.lean.upperArmR - ph.frame.upperArmR) * 1.15),
      band: 0.42 + ph.fatThickness.waist * 1.15,
    })
    const torso = skin.find((g) => g.name === 'torso')
    // Rows across the abdomen, front-facing points only.
    const yLo = 0.55 * male.heightIn
    const yHi = 0.70 * male.heightIn
    let min = Infinity
    let max = -Infinity
    for (const row of torso.rows) {
      if (row[0][1] < yLo || row[0][1] > yHi) continue
      const cx = row.reduce((a, q) => a + q[0], 0) / row.length
      const cz = row.reduce((a, q) => a + q[2], 0) / row.length
      for (const q of row) {
        // Front of the body only.
        if (q[2] - cz <= 0) continue
        const r = Math.hypot(q[0] - cx, q[2] - cz)
        min = Math.min(min, r)
        max = Math.max(max, r)
      }
    }
    return max - min
  }

  const lean = absRidge(9)
  const mid = absRidge(20)
  const fat = absRidge(32)
  check('a lean body shows abdominal definition', lean > 0.35, `${lean.toFixed(2)}in of ridge at 9% body fat`)
  check('definition fades as body fat rises', lean > mid && mid > fat, `${lean.toFixed(2)} > ${mid.toFixed(2)} > ${fat.toFixed(2)}`)
  check('a high body fat abdomen is smooth', fat < lean * 0.55, `${fat.toFixed(2)}in at 32%`)
}

console.log('\nfat deposits')

// --- Fat must appear where each sex actually stores it -------------------
{
  const tape = { chest: 41.5, shoulders: 19.8, arm: 14.5, thigh: 23.5, calf: 15.8, forearm: 11.8, neck: 15.8 }
  const at = (bf, sex, extra = {}) =>
    computePhysique({ heightIn: 70, weightLb: sex === 'male' ? 190 : 150, bodyFatPct: bf, sex, measured: { ...tape, waist: 33, hips: 40, ...extra } })

  // Volume, not footprint. A ring is an ellipse, so its area is pi*a*b — using
  // the max radius alone measures how far a deposit spreads and ignores how far
  // it protrudes, which is the half that actually matters for fat.
  const extentOf = (grids, frag) => {
    const parts = grids.filter((g) => g.name.includes(frag))
    let vol = 0
    for (const g of parts) {
      for (const row of g.rows) {
        const cx = row.reduce((a, q) => a + q[0], 0) / row.length
        const cy = row.reduce((a, q) => a + q[1], 0) / row.length
        const cz = row.reduce((a, q) => a + q[2], 0) / row.length
        let hi = 0
        let lo = Infinity
        for (const q of row) {
          const d = Math.hypot(q[0] - cx, q[1] - cy, q[2] - cz)
          hi = Math.max(hi, d)
          lo = Math.min(lo, d)
        }
        vol += Math.PI * hi * lo
      }
    }
    return vol
  }

  const male25 = buildFatGrids(at(25, 'male'), at(25, 'male').full)
  const female25 = buildFatGrids(at(25, 'female'), at(25, 'female').full)

  check('every deposit maps to a labelled site', male25.every((g) => fatColorOf(g.name, 0x123456) !== 0x123456),
    male25.filter((g) => fatColorOf(g.name, 0x123456) === 0x123456).map((g) => g.name).join(', '))

  // Male pattern: abdomen and flanks lead.
  check(
    'men store it at the abdomen ahead of the hips',
    extentOf(male25, 'belly') > extentOf(male25, 'hip-saddle'),
    `belly ${extentOf(male25, 'belly').toFixed(1)} vs hips ${extentOf(male25, 'hip-saddle').toFixed(1)}`,
  )
  check('men get love handles', extentOf(male25, 'love-handle') > 0.5)

  // Female pattern: hips, seat and thighs lead.
  check(
    'women store it at the hips ahead of the abdomen',
    extentOf(female25, 'hip-saddle') > extentOf(female25, 'belly') * 0.9,
    `hips ${extentOf(female25, 'hip-saddle').toFixed(1)} vs belly ${extentOf(female25, 'belly').toFixed(1)}`,
  )
  check(
    'women carry proportionally more on the hips than men do',
    extentOf(female25, 'hip-saddle') / extentOf(female25, 'belly') >
      extentOf(male25, 'hip-saddle') / extentOf(male25, 'belly'),
  )
  check('women show breast tissue rather than a male chest pad', female25.some((g) => g.name.includes('breast')) && male25.some((g) => g.name.includes('chest-fat')))

  // Deposits must scale with the fat actually present.
  const lean = at(8, 'male')
  const heavy = at(35, 'male', { waist: 44, hips: 45 })
  const leanVol = extentOf(buildFatGrids(lean, lean.full), '')
  const heavyVol = extentOf(buildFatGrids(heavy, heavy.full), '')
  check('deposits grow substantially with fat mass', heavyVol > leanVol * 2, `${leanVol.toFixed(0)} at 8% vs ${heavyVol.toFixed(0)} at 35%`)
  check('deposits nearly vanish at essential body fat', leanVol < heavyVol * 0.5)

  // Mirrored.
  const asym = []
  for (const base of ['love-handle', 'hip-saddle', 'triceps-fat', 'lower-back']) {
    const R = male25.find((g) => g.name === `${base}-R`)
    const L = male25.find((g) => g.name === `${base}-L`)
    if (!R || !L) { asym.push(`${base} missing`); continue }
    for (let i = 0; i < R.rows.length; i++) {
      const cxR = R.rows[i].reduce((a, q) => a + q[0], 0) / R.rows[i].length
      const cxL = L.rows[i].reduce((a, q) => a + q[0], 0) / L.rows[i].length
      if (Math.abs(cxR + cxL) > 1e-6) asym.push(`${base} row ${i}`)
    }
  }
  check('deposits are mirrored left and right', asym.length === 0, asym.slice(0, 3).join(', '))
}

console.log('\nocclusion')

// --- The solid form that hides the far side ----------------------------
{
  const p = computePhysique(male)
  const tris = gridsToTriangles(surfaceGrids(p.full))
  check('the occluder produces whole triangles', tris.length > 0 && tris.length % 9 === 0, `${tris.length / 9} triangles`)
  check('every occluder vertex is finite', tris.every((n) => Number.isFinite(n)))
  const b = bounds(tris)
  const lineB = bounds(gridsToSegments(surfaceGrids(p.full)))
  check(
    'the occluder matches the wireframe it hides behind',
    Math.abs(b.maxY - lineB.maxY) < 0.01 && Math.abs(b.maxX - lineB.maxX) < 0.01,
  )
  // Muscles and bones must be solid too, or a front view shows the far side.
  check('the muscle layer can be occluded', gridsToTriangles(buildMuscleGrids(p.lean, p.frame)).length % 9 === 0)
  check('the frame layer can be occluded', gridsToTriangles(buildFrameGrids(p.frame)).length % 9 === 0)
}

// ---------------------------------------------------------------------------
// Legs vs pelvis vs arms.
//
// The thigh used to be planted at `max(thighR * 1.12, hip.a * 0.42)`, where the
// thigh term won — so the bigger the legs, the further out they went, with nothing
// tying them to the pelvis. Across body types that put the thigh's outer surface
// 1.3-2.9in OUTSIDE the hips and 2-3in into the forearm, and it got worse the
// heavier the body, which is backwards. Placement is now solved from the hip inward,
// so these hold for every shape rather than the one the numbers were tuned on.
// ---------------------------------------------------------------------------
console.log('\nlegs hang from the pelvis')
{
  const BODIES = [
    ['lean', { heightIn: 70, weightLb: 175, bodyFatPct: 12, sex: 'male' }],
    ['average', { heightIn: 70, weightLb: 195, bodyFatPct: 20, sex: 'male' }],
    ['heavy', { heightIn: 70, weightLb: 260, bodyFatPct: 34, sex: 'male' }],
    ['obese', { heightIn: 70, weightLb: 320, bodyFatPct: 45, sex: 'male' }],
    ['huge legs', { heightIn: 70, weightLb: 230, bodyFatPct: 10, sex: 'male', measured: { thigh: 31, hips: 40 } }],
    ['narrow hips', { heightIn: 72, weightLb: 200, bodyFatPct: 12, sex: 'male', measured: { hips: 33, thigh: 26 } }],
    ['female', { heightIn: 65, weightLb: 145, bodyFatPct: 26, sex: 'female' }],
    ['female pear', { heightIn: 65, weightLb: 190, bodyFatPct: 38, sex: 'female', measured: { hips: 48, shoulders: 15 } }],
    ['short', { heightIn: 60, weightLb: 130, bodyFatPct: 22, sex: 'female' }],
    ['tall', { heightIn: 80, weightLb: 240, bodyFatPct: 15, sex: 'male' }],
  ]
  const layers = []
  for (const [label, input] of BODIES) {
    const ph = computePhysique(input)
    for (const [layer, d] of [['lean', ph.lean], ['full', ph.full]]) {
      const lg = legPoints(d, 1)
      layers.push({
        who: `${label}/${layer}`,
        d,
        thighOuter: lg.hip[0] + d.thighR,
        calfOuter: lg.calf[0] + d.calfR,
        hipX: lg.hip[0],
        armInner: armHangX(d) - d.forearmR,
      })
    }
  }

  const over = layers.filter((x) => x.thighOuter > x.d.hip.a + 0.02)
  check(
    'no thigh is wider than the hips it hangs from',
    over.length === 0,
    over.map((x) => `${x.who} by ${(x.thighOuter - x.d.hip.a).toFixed(2)}in`).join(' '),
  )

  const calfOver = layers.filter((x) => x.calfOuter > x.d.hip.a + 0.02)
  check('nor is any calf', calfOver.length === 0, calfOver.map((x) => x.who).join(' '))

  // Contact is correct — arms at rest touch the outer thigh. Sinking half a forearm
  // into the leg is not.
  const sunk = layers.filter((x) => x.armInner < x.thighOuter - 0.5)
  check(
    'no forearm sinks into the thigh',
    sunk.length === 0,
    sunk.map((x) => `${x.who} by ${(x.thighOuter - x.armInner).toFixed(2)}in`).join(' '),
  )

  // The old failure mode scaled the wrong way: heavier bodies were worse. Whatever
  // the remaining overlap is, it must not grow as the body does.
  const worstBy = (name) => {
    const l = layers.find((x) => x.who === name)
    return l.thighOuter - l.armInner
  }
  check(
    'the fit does not get worse as the body gets heavier',
    worstBy('obese/full') <= worstBy('lean/full') + 0.3,
    `obese ${worstBy('obese/full').toFixed(2)} vs lean ${worstBy('lean/full').toFixed(2)}`,
  )

  const crossed = layers.filter((x) => x.hipX <= 0)
  check('no thigh centre crosses the midline', crossed.length === 0, crossed.map((x) => x.who).join(' '))

  // Legs should stand roughly under the hips, not splay out or knock together.
  const splayed = layers.filter((x) => {
    const lg = legPoints(x.d, 1)
    return Math.abs(lg.ankle[0] - lg.hip[0]) > x.d.heightIn * 0.05
  })
  check('the ankle sits roughly under the hip', splayed.length === 0, splayed.map((x) => x.who).join(' '))

  // And the reason the old code failed: placement must follow the pelvis, not the
  // thigh. Doubling thigh girth on fixed hips must not push the leg outward.
  /**
   * The junction with the pelvis, on the SURFACE layer.
   *
   * The shell kept a private copy of the leg placement and it drifted, so correcting
   * the muscle and skeleton layers left the outer shell's legs planted 2-3in outside
   * the pelvis. The tube caps sat in plain silhouette and the legs read as dowels
   * pressed into a flat-bottomed torso. The junction is overlap-and-hide, so two
   * things have to hold, and neither is visible to a typechecker.
   */
  for (const [label, input] of BODIES) {
    const ph = computePhysique(input)
    const chains = buildChains(ph.full)
    const torso = chains.find((c) => c.name === 'torso')
    const leg = chains.find((c) => c.name === 'legR')
    const H = ph.full.heightIn
    const torsoWidest = Math.max(...torso.rings.map((r) => r.cx + r.a))
    const torsoAt = (y) => torso.rings.reduce((b, r) => (!b || Math.abs(r.y - y) < Math.abs(b.y - y) ? r : b), null)

    // 1. The topmost ring must be enclosed, or its cap is drawn in mid-air.
    const top = leg.rings.reduce((b, r) => (r.y > b.y ? r : b), leg.rings[0])
    const cover = torsoAt(top.y)
    check(
      `${label}: the top of the leg is hidden inside the pelvis`,
      top.cx + top.a <= cover.cx + cover.a - 0.2,
      `leg reaches ${(top.cx + top.a).toFixed(2)} vs pelvis ${(cover.cx + cover.a).toFixed(2)} at y ${top.y.toFixed(1)}`,
    )

    // 2. Above the crotch the silhouette must never step OUTWARD from pelvis to
    //    thigh. A step is the seam, however much the parts overlap vertically.
    const above = leg.rings.filter((r) => r.y >= LEVELS.crotch * H)
    const worst = above.reduce((m, r) => Math.max(m, r.cx + r.a), 0)
    check(
      `${label}: the thigh never steps outside the widest point of the pelvis`,
      worst <= torsoWidest + 0.02,
      `thigh ${worst.toFixed(2)} vs pelvis ${torsoWidest.toFixed(2)}`,
    )
  }

  // Both layers must agree on where the leg is, or they visibly separate — which is
  // exactly what a duplicated copy of the placement maths caused.
  for (const [label, input] of BODIES) {
    const ph = computePhysique(input)
    const shellHipX = buildChains(ph.full)
      .find((c) => c.name === 'legR')
      .rings.reduce((b, r) => (r.y > b.y ? r : b)).cx
    const boneHipX = legPoints(ph.full, 1).hip[0]
    check(
      `${label}: surface and skeleton agree on the leg axis`,
      Math.abs(shellHipX - boneHipX) < ph.full.thighR,
      `shell ${shellHipX.toFixed(2)} vs bones ${boneHipX.toFixed(2)}`,
    )
  }

  const thin = computePhysique({ heightIn: 70, weightLb: 190, bodyFatPct: 15, sex: 'male', measured: { hips: 38, thigh: 20 } })
  const thick = computePhysique({ heightIn: 70, weightLb: 190, bodyFatPct: 15, sex: 'male', measured: { hips: 38, thigh: 30 } })
  const outerOf = (ph) => legPoints(ph.full, 1).hip[0] + ph.full.thighR
  check(
    'a much thicker thigh on the same hips does not reach further out',
    outerOf(thick) <= outerOf(thin) + 0.1,
    `thin ${outerOf(thin).toFixed(2)} vs thick ${outerOf(thick).toFixed(2)}`,
  )
}

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed === 0 ? 0 : 1)
