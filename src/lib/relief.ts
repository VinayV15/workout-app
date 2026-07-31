import { add, len, norm, scale, sub, type MeshGrid, type Vec3 } from './anatomy'

/**
 * Muscle relief on a single skin surface.
 *
 * The combined view is ONE surface, not stacked shells: the skin is displaced
 * outward where a muscle belly sits under it and left alone in the grooves
 * between them, so the wireframe bends over the muscles exactly the way it would
 * on a real body. How strongly that shows is scaled by leanness — at low body fat
 * the relief is pronounced, and as fat accumulates it flattens out and the fat
 * curves of the underlying shell are all that remain.
 *
 * This replaces drawing the muscle layer separately, which read as an anatomy
 * diagram rather than a body.
 */

/** A sampled blob of muscle: a centre and the radius it fills. */
export interface FieldSample {
  c: Vec3
  r: number
}

/**
 * Reduces the muscle meshes to a field of spheres. Sampling the built geometry
 * rather than re-deriving the spindle parameters keeps this correct if the muscle
 * definitions change.
 */
/**
 * Reduces the muscle meshes to a field of sample points.
 *
 * Sampling the SURFACE vertices, not the ring centres. An earlier version placed
 * one sphere per ring with a radius equal to the ring's widest extent — which
 * turns a wide, flat belly like a pectoral into a three-inch ball that swallows
 * every groove around it. The field then had no idea where one muscle ended and
 * the next began, so the skin came out smooth however lean the body was.
 *
 * With a small radius per vertex the field's surface follows the muscle's own
 * surface, and the gaps between bellies are genuinely further from anything.
 */
export function sampleMuscleField(muscles: MeshGrid[], stride = 2): FieldSample[] {
  const out: FieldSample[] = []
  for (const m of muscles) {
    for (const row of m.rows) {
      for (let i = 0; i < row.length; i += stride) out.push({ c: row[i], r: 0.1 })
    }
  }
  return out
}

/** Row centroid, used as the reference point for the outward direction. */
function centroid(row: Vec3[]): Vec3 {
  let x = 0
  let y = 0
  let z = 0
  for (const p of row) {
    x += p[0]
    y += p[1]
    z += p[2]
  }
  return [x / row.length, y / row.length, z / row.length]
}

/**
 * Strength of the muscle field at a point: how far the point is from the nearest
 * belly's *surface*, not its centre.
 *
 * Measuring to the surface is what makes this work through a fat layer. An
 * earlier version compared distance-to-centre against a fixed reach, so a small
 * belly like an ab pad simply could not influence skin sitting half an inch
 * further out — abs were invisible at every body fat. Distance-to-surface is
 * scale-free: a point directly over any belly reads high whatever that belly's
 * size, and `band` sets how far the relief carries outward through fat.
 *
 * Uses the nearest single belly rather than a sum, so two adjacent muscles do
 * not merge into one mound — the dip between them is the separation we want.
 */
/**
 * Height-bucketed index over the field. A body is tall and thin, so restricting
 * the search to samples at a similar height cuts the work by more than an order
 * of magnitude — which is what makes a fine mesh affordable, since the cost is
 * vertices times samples.
 */
interface FieldIndex {
  buckets: FieldSample[][]
  minY: number
  step: number
  span: number
}

const BUCKET_HEIGHT = 2

export function indexField(field: FieldSample[], band: number): FieldIndex {
  let minY = Infinity
  let maxY = -Infinity
  let maxR = 0
  for (const s of field) {
    minY = Math.min(minY, s.c[1])
    maxY = Math.max(maxY, s.c[1])
    maxR = Math.max(maxR, s.r)
  }
  if (!Number.isFinite(minY)) return { buckets: [], minY: 0, step: BUCKET_HEIGHT, span: maxR + band }
  const count = Math.max(1, Math.ceil((maxY - minY) / BUCKET_HEIGHT) + 1)
  const buckets: FieldSample[][] = Array.from({ length: count }, () => [])
  for (const s of field) buckets[Math.floor((s.c[1] - minY) / BUCKET_HEIGHT)].push(s)
  return { buckets, minY, step: BUCKET_HEIGHT, span: maxR + band }
}

function fieldAtIndexed(p: Vec3, idx: FieldIndex, band: number): number {
  if (idx.buckets.length === 0) return 0
  const reach = Math.ceil(idx.span / idx.step) + 1
  const centre = Math.floor((p[1] - idx.minY) / idx.step)
  let nearest = Infinity
  for (let b = Math.max(0, centre - reach); b <= Math.min(idx.buckets.length - 1, centre + reach); b++) {
    for (const s of idx.buckets[b]) {
      const d = len(sub(p, s.c)) - s.r
      if (d < nearest) nearest = d
      if (nearest <= 0) return 1
    }
  }
  if (!Number.isFinite(nearest)) return 0
  const t = 1 - nearest / band
  if (t <= 0) return 0
  if (t >= 1) return 1
  // A concave falloff, not a smoothstep. Smoothstep spreads the transition
  // evenly, which blurs the separations between muscles into gentle undulation;
  // this saturates quickly so the surface sits flush over a belly and drops away
  // sharply at its edge. That edge IS the visible definition.
  return t ** 0.45
}

export interface ReliefOptions {
  /** 0 = no relief (smooth, fat), 1 = full muscle definition (lean). */
  definition: number
  /** Peak outward displacement in inches at full definition. */
  amplitude: number
  /**
   * How far outward a belly's shape still reads. Should span the fat layer, or
   * the muscle relief never reaches the skin.
   */
  band?: number
}

/**
 * Carves a skin surface with the muscle field beneath it.
 *
 * Displacement is almost entirely INWARD. A tape measure bridges the grooves
 * between muscles, so a measured girth describes the body's outer envelope, not
 * its average radius: the surface over a belly should stay where the measurement
 * put it, and the separations between bellies should recess below it.
 *
 * Centring the displacement instead — pushing out over bellies and in between
 * them — inflated the whole body, because the bellies are fitted just under the
 * skin and therefore almost every point on the surface sits over one. The result
 * was a body a full inch wider than its own measurements, and lumpy with it.
 */
export function applyRelief(surface: MeshGrid[], field: FieldSample[], o: ReliefOptions): MeshGrid[] {
  const strength = Math.max(0, Math.min(1, o.definition)) * o.amplitude
  if (strength <= 0.001 || field.length === 0) return surface
  const band = Math.max(0.25, o.band ?? 0.6)
  const idx = indexField(field, band)

  return surface.map((g) => ({
    ...g,
    rows: g.rows.map((row) => {
      const c = centroid(row)
      return row.map((p) => {
        // Outward direction from the section's own centre — reliable for the
        // tubes this surface is made of, unlike a cross-product normal whose
        // sign depends on winding.
        const dirOut = norm(sub(p, c))
        // Baseline near 1: over a belly this is ~0 (skin stays on the measured
        // surface) and in a groove it goes negative (the separation recesses).
        const influence = fieldAtIndexed(p, idx, band) - 0.72
        return add(p, scale(dirOut, influence * strength))
      })
    }),
  }))
}
