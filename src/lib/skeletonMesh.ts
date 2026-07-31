import { LEVELS, type BodyDims } from './physique'
import {
  add,
  block,
  bodyFrame,
  bone,
  lerp3,
  plate,
  scale,
  skull,
  v,
  type MeshGrid,
  type Vec3,
} from './anatomy'

/**
 * The frame layer: an actual skeleton, not a thin body.
 *
 * Everything here is straight, faceted and hard-edged — six-sided bone rods,
 * rectangular vertebrae, flat plates for the scapulae and pelvis, open hoops for
 * ribs. No smooth curves and no soft silhouette, because the point of this layer
 * is to show the structure that muscle and fat sit on.
 */

/**
 * Bone regions, coloured on the same principle as the muscles: touching regions
 * never share a hue, so the skeleton reads as parts rather than one tangle.
 */
export const BONE_GROUPS = [
  { key: 'skull', label: 'Skull & jaw', color: 0x9bb4c9, match: ['skull', 'jaw'] },
  { key: 'spine', label: 'Spine', color: 0x3987e5, match: ['vertebra', 'sacrum'] },
  { key: 'ribs', label: 'Ribcage', color: 0x2ee6a8, match: ['rib-', 'sternum'] },
  { key: 'girdle', label: 'Shoulder girdle', color: 0xd95926, match: ['clavicle', 'scapula'] },
  { key: 'pelvis', label: 'Pelvis', color: 0xd55181, match: ['ilium'] },
  { key: 'arms', label: 'Arm bones', color: 0xc98500, match: ['humerus', 'radius', 'ulna', 'palm', 'finger'] },
  { key: 'legs', label: 'Leg bones', color: 0x9085e9, match: ['femur', 'patella', 'tibia', 'fibula', 'heel', 'metatarsal'] },
]

export function boneColorOf(name: string, fallback: number): number {
  for (const g of BONE_GROUPS) if (g.match.some((m) => name.includes(m))) return g.color
  return fallback
}

/** An open hoop sweeping from the spine round to the sternum. */
function rib(name: string, y: number, halfWidth: number, depth: number, drop: number): MeshGrid {
  const steps = 14
  const rows: Vec3[][] = []
  // Two offset passes give the rib visible thickness in wireframe.
  for (const off of [-0.16, 0.16]) {
    const row: Vec3[] = []
    for (let i = 0; i <= steps; i++) {
      const f = i / steps
      // Sweep back-to-front through 170°, so the hoop stays open at the spine.
      const theta = -Math.PI * 0.94 + Math.PI * 1.88 * f
      row.push(
        v(
          Math.sin(theta) * halfWidth,
          y + off - drop * Math.cos(theta * 0.5) ** 2,
          -Math.cos(theta) * depth,
        ),
      )
    }
    rows.push(row)
  }
  return { name, rows, closedRings: false }
}

export function buildFrameGrids(frame: BodyDims): MeshGrid[] {
  const f = bodyFrame(frame)
  const H = f.H
  const out: MeshGrid[] = []
  const push = (m: MeshGrid) => out.push(m)
  const boneR = H * 0.0075

  // ---- Skull and jaw ----------------------------------------------------
  push(skull('skull', f.headCentre, frame.headR * 0.92, (LEVELS.crown - LEVELS.chin) * H * 0.5, frame.headR * 1.12))
  push(
    block(
      'jaw',
      v(0, (LEVELS.chin + 0.006) * H, frame.headR * 0.42),
      frame.headR * 0.62,
      H * 0.008,
      frame.headR * 0.5,
    ),
  )

  // ---- Spine: a stack of vertebral blocks -------------------------------
  const spineTop = LEVELS.neck + 0.012
  const spineBottom = LEVELS.hip - 0.01
  const vertebrae = 19
  for (let i = 0; i < vertebrae; i++) {
    const t = i / (vertebrae - 1)
    const y = (spineBottom + (spineTop - spineBottom) * t) * H
    // The spine sits well back, and the lumbar curve is shallower than thoracic.
    const z = -frame.waist.b * (0.42 + 0.26 * Math.sin(Math.PI * t))
    const w = H * (0.011 - 0.003 * t)
    push(block(`vertebra-${i + 1}`, v(0, y, z), w, H * 0.0085, w * 0.9))
  }

  // ---- Ribcage ----------------------------------------------------------
  const ribCount = 9
  for (let i = 0; i < ribCount; i++) {
    const t = i / (ribCount - 1)
    const y = (LEVELS.chest + 0.075 - 0.155 * t) * H
    // Widest through the middle of the cage, narrowing top and bottom.
    const bulge = Math.sin(Math.PI * (0.18 + 0.72 * t))
    push(
      rib(
        `rib-${i + 1}`,
        y,
        frame.chest.a * (0.62 + 0.38 * bulge),
        frame.chest.b * (0.6 + 0.4 * bulge),
        H * 0.012 * t,
      ),
    )
  }
  push(
    block(
      'sternum',
      v(0, (LEVELS.chest + 0.01) * H, frame.chest.b * 0.94),
      H * 0.011,
      (LEVELS.shoulder - LEVELS.chest) * H * 0.55,
      H * 0.004,
    ),
  )

  // ---- Pelvis: two iliac plates plus the sacrum -------------------------
  for (const idx of [0, 1] as const) {
    const s = idx === 0 ? 1 : -1
    push(
      plate(
        `ilium-${s > 0 ? 'R' : 'L'}`,
        [
          v(s * frame.hip.a * 0.14, (LEVELS.hip + 0.03) * H, -frame.hip.b * 0.5),
          v(s * frame.hip.a * 0.98, (LEVELS.hip + 0.022) * H, -frame.hip.b * 0.1),
          v(s * frame.hip.a * 0.86, (LEVELS.crotch + 0.01) * H, frame.hip.b * 0.35),
          v(s * frame.hip.a * 0.2, (LEVELS.crotch - 0.005) * H, frame.hip.b * 0.15),
        ],
        H * 0.006,
        3,
      ),
    )
  }
  push(
    block(
      'sacrum',
      v(0, (LEVELS.hip - 0.005) * H, -frame.hip.b * 0.45),
      frame.hip.a * 0.16,
      H * 0.022,
      H * 0.01,
    ),
  )

  // ---- Shoulder girdle and limbs ----------------------------------------
  for (const idx of [0, 1] as const) {
    const s = idx === 0 ? 1 : -1
    const tag = s > 0 ? 'R' : 'L'

    // Clavicle: sternum out to the acromion.
    push(bone(`clavicle-${tag}`, v(s * H * 0.008, LEVELS.shoulder * H, frame.chest.b * 0.8), f.acromion[idx], boneR * 0.7))
    // Scapula: a flat plate on the back of the ribcage.
    push(
      plate(
        `scapula-${tag}`,
        [
          v(s * frame.chest.a * 0.2, (LEVELS.shoulder - 0.012) * H, -frame.chest.b * 0.72),
          v(s * frame.chest.a * 0.86, (LEVELS.shoulder - 0.008) * H, -frame.chest.b * 0.42),
          v(s * frame.chest.a * 0.66, (LEVELS.chest - 0.005) * H, -frame.chest.b * 0.5),
          v(s * frame.chest.a * 0.24, (LEVELS.chest + 0.015) * H, -frame.chest.b * 0.66),
        ],
        H * 0.005,
        3,
      ),
    )

    // Humerus, then the two forearm bones side by side.
    push(bone(`humerus-${tag}`, f.shoulder[idx], f.elbow[idx], boneR))
    const rad: Vec3 = [s * boneR * 0.9, 0, boneR * 0.5]
    push(bone(`radius-${tag}`, add(f.elbow[idx], rad), add(f.wrist[idx], rad), boneR * 0.62))
    push(bone(`ulna-${tag}`, add(f.elbow[idx], scale(rad, -1)), add(f.wrist[idx], scale(rad, -1)), boneR * 0.6))

    // Hand: a small palm block and four short finger rods.
    const palm = lerp3(f.wrist[idx], f.handEnd[idx], 0.4)
    push(block(`palm-${tag}`, palm, frame.wristR * 0.95, H * 0.011, frame.wristR * 0.42))
    for (let k = 0; k < 4; k++) {
      const offX = (k - 1.5) * frame.wristR * 0.45
      push(
        bone(
          `finger-${tag}-${k + 1}`,
          add(palm, v(offX, -H * 0.012, 0)),
          add(f.handEnd[idx], v(offX * 0.8, 0, 0)),
          boneR * 0.3,
          4,
        ),
      )
    }

    // Femur, then tibia and fibula.
    push(bone(`femur-${tag}`, f.hip[idx], f.knee[idx], boneR * 1.25))
    push(block(`patella-${tag}`, add(f.knee[idx], v(0, H * 0.004, frame.kneeR * 0.6)), boneR * 1.3, H * 0.011, boneR * 0.7))
    const tib: Vec3 = [s * boneR * 0.85, 0, 0]
    push(bone(`tibia-${tag}`, add(f.knee[idx], scale(tib, -1)), add(f.ankle[idx], scale(tib, -0.6)), boneR * 1.05))
    push(bone(`fibula-${tag}`, add(f.knee[idx], tib), add(f.ankle[idx], scale(tib, 0.8)), boneR * 0.5))

    // Foot: heel block, then metatarsal rods forward to the toes.
    push(
      block(
        `heel-${tag}`,
        add(f.ankle[idx], v(0, -H * 0.012, -frame.ankleR * 0.5)),
        frame.ankleR * 0.85,
        H * 0.012,
        frame.ankleR * 0.8,
      ),
    )
    for (let k = 0; k < 3; k++) {
      const offX = (k - 1) * frame.ankleR * 0.6
      push(
        bone(
          `metatarsal-${tag}-${k + 1}`,
          add(f.ankle[idx], v(offX * 0.5, -H * 0.016, 0)),
          add(f.toe[idx], v(offX, 0, 0)),
          boneR * 0.32,
          4,
        ),
      )
    }
  }

  return out
}
