import { useEffect, useRef, useState } from 'react'
import { gridVertexCounts, gridsToSegments, gridsToTriangles, type MeshGrid } from '../lib/anatomy'

/**
 * Renders the wireframe body. three.js is imported on demand so the ~150KB only
 * loads for people who open this tab.
 *
 * Style is fixed to the reference: cyan quad mesh on a dark field, no surfaces,
 * no shading, no skin, hair or nails. The mesh is drawn as explicit rings and
 * longitudes rather than a triangulated surface, because a triangulated
 * wireframe shows diagonals and the reference is pure quads.
 */

export interface ShellSpec {
  /** Pre-built geometry, so each layer can use a different construction. */
  grids: MeshGrid[]
  /** Standing height, for framing the camera. */
  heightIn: number
  color: number
  opacity: number
  /** Drawn with additive blending — the layer that represents "you". */
  emphasis?: boolean
  /**
   * Per-part colour. When present each body part is tinted individually so it can
   * be told apart; when absent the whole layer uses `color`, which is what makes
   * blended layers read as one material.
   */
  colorOf?: (name: string) => number
  /**
   * Fill the form solidly so it hides whatever is behind it. Without this the
   * body reads as a transparent cage and a front view shows the back too.
   */
  occlude?: boolean
}

export type PresetView = 'front' | 'side' | 'back' | 'threequarter'

const PRESET_AZIMUTH: Record<PresetView, number> = {
  front: 0,
  side: Math.PI / 2,
  back: Math.PI,
  threequarter: Math.PI / 5,
}

export default function BodyScan({
  shells,
  view,
  onViewChange,
  height = 420,
  fit,
  interactive = true,
  hint,
}: {
  shells: ShellSpec[]
  view: PresetView
  onViewChange?: (v: PresetView) => void
  height?: number
  /**
   * Explicit framing, overriding the height-based default. The exercise diagrams
   * need every frame of a movement framed identically — a posed figure is shorter
   * than a standing one, and framing each pose to its own extents makes the body
   * jump size between frames.
   */
  fit?: { centreY: number; radius: number }
  /**
   * False for a thumbnail: no orbit, no zoom, no cursor. A strip of small frames
   * should scroll the page under a finger rather than each one grabbing the drag.
   */
  interactive?: boolean
  /** Overrides the drag/zoom hint. Empty string hides it. */
  hint?: string
}) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  // Read inside the setup effect, which runs once — a ref keeps it out of the
  // dependency list without the effect going stale on a value that never changes
  // for a given mounted canvas.
  const interactiveRef = useRef(interactive)
  interactiveRef.current = interactive

  // The three.js objects live outside React state: they are mutable, and
  // recreating them on every render would be both wrong and slow.
  const sceneRef = useRef<{
    THREE: typeof import('three')
    renderer: import('three').WebGLRenderer
    scene: import('three').Scene
    camera: import('three').PerspectiveCamera
    group: import('three').Group
    lines: import('three').LineSegments[]
    solids: import('three').Mesh[]
    azimuth: number
    polar: number
    distance: number
    target: number
    fitRadius: number | null
    applyFit: () => void
    dispose: () => void
  } | null>(null)

  // --- Set up once ------------------------------------------------------
  useEffect(() => {
    let cancelled = false
    let cleanup: (() => void) | undefined

    void (async () => {
      try {
        const THREE = await import('three')
        if (cancelled || !mountRef.current) return

        const mount = mountRef.current
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.setSize(mount.clientWidth, mount.clientHeight)
        mount.appendChild(renderer.domElement)

        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(30, mount.clientWidth / mount.clientHeight, 0.1, 1000)
        const group = new THREE.Group()
        scene.add(group)

        const state = {
          THREE,
          renderer,
          scene,
          camera,
          group,
          lines: [] as import('three').LineSegments[],
          solids: [] as import('three').Mesh[],
          azimuth: PRESET_AZIMUTH[view],
          polar: Math.PI / 2,
          distance: 200,
          target: 0,
          /** Radius to frame, when the caller supplied explicit framing. */
          fitRadius: null as number | null,
          applyFit: () => {},
          dispose: () => {},
        }

        /**
         * Distance that fits a sphere of `fitRadius` in BOTH axes.
         *
         * Fitting on height alone is wrong the moment the subject is wider than it
         * is tall, which a lying-down figure always is: in a portrait frame the
         * horizontal field of view is the narrow one, so the body has to be pushed
         * further back than the vertical calculation suggests. Getting this wrong
         * rendered a bench press as a distant speck.
         */
        state.applyFit = () => {
          if (state.fitRadius == null) return
          const halfV = Math.tan(((camera.fov / 2) * Math.PI) / 180)
          const halfH = halfV * Math.max(camera.aspect, 0.01)
          // A small margin so nothing clips the edge as the figure rotates.
          state.distance = Math.max(30, (state.fitRadius / Math.min(halfV, halfH)) * 1.08)
        }

        let frame = 0
        const render = () => {
          const { azimuth, polar, distance, target } = state
          camera.position.set(
            Math.sin(azimuth) * Math.sin(polar) * distance,
            Math.cos(polar) * distance + target,
            Math.cos(azimuth) * Math.sin(polar) * distance,
          )
          camera.lookAt(0, target, 0)
          renderer.render(scene, camera)
        }
        const loop = () => {
          frame = requestAnimationFrame(loop)
          render()
        }
        loop()

        // --- Pointer orbit, written directly rather than pulling in
        // OrbitControls, so touch behaviour stays predictable on a phone.
        const pointers = new Map<number, { x: number; y: number }>()
        let pinchStart = 0
        let startDistance = 0

        const onDown = (e: PointerEvent) => {
          pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
          if (pointers.size === 2) {
            const [p1, p2] = [...pointers.values()]
            pinchStart = Math.hypot(p1.x - p2.x, p1.y - p2.y)
            startDistance = state.distance
          }
          renderer.domElement.setPointerCapture(e.pointerId)
        }
        const onMove = (e: PointerEvent) => {
          const prev = pointers.get(e.pointerId)
          if (!prev) return
          const dx = e.clientX - prev.x
          const dy = e.clientY - prev.y
          pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

          if (pointers.size === 2 && pinchStart > 0) {
            const [p1, p2] = [...pointers.values()]
            const spread = Math.hypot(p1.x - p2.x, p1.y - p2.y)
            state.distance = clamp(startDistance * (pinchStart / Math.max(spread, 1)), 70, 420)
            return
          }
          state.azimuth -= dx * 0.008
          // Clamp the polar angle so the body never flips upside down.
          state.polar = clamp(state.polar - dy * 0.006, 0.6, Math.PI - 0.6)
        }
        const onUp = (e: PointerEvent) => {
          pointers.delete(e.pointerId)
          if (pointers.size < 2) pinchStart = 0
        }
        const onWheel = (e: WheelEvent) => {
          e.preventDefault()
          state.distance = clamp(state.distance * (1 + e.deltaY * 0.001), 70, 420)
        }

        const el = renderer.domElement
        // A static thumbnail must not capture the drag, or scrolling a strip of
        // frames on a phone rotates a figure instead of moving the page.
        if (interactiveRef.current) {
          el.style.touchAction = 'none'
          el.style.cursor = 'grab'
          el.addEventListener('pointerdown', onDown)
          el.addEventListener('pointermove', onMove)
          el.addEventListener('pointerup', onUp)
          el.addEventListener('pointercancel', onUp)
          el.addEventListener('wheel', onWheel, { passive: false })
        } else {
          el.style.pointerEvents = 'none'
        }

        const onResize = () => {
          if (!mount.clientWidth) return
          renderer.setSize(mount.clientWidth, mount.clientHeight)
          camera.aspect = mount.clientWidth / mount.clientHeight
          camera.updateProjectionMatrix()
          // The aspect just changed, so the fitted distance has to be re-derived —
          // otherwise rotating a phone leaves the figure cropped or tiny.
          state.applyFit()
        }
        const observer = new ResizeObserver(onResize)
        observer.observe(mount)

        state.dispose = () => {
          cancelAnimationFrame(frame)
          observer.disconnect()
          el.removeEventListener('pointerdown', onDown)
          el.removeEventListener('pointermove', onMove)
          el.removeEventListener('pointerup', onUp)
          el.removeEventListener('pointercancel', onUp)
          el.removeEventListener('wheel', onWheel)
          for (const line of state.lines) {
            line.geometry.dispose()
            ;(line.material as import('three').Material).dispose()
          }
          for (const solid of state.solids) {
            solid.geometry.dispose()
            ;(solid.material as import('three').Material).dispose()
          }
          renderer.dispose()
          if (el.parentNode) el.parentNode.removeChild(el)
        }

        sceneRef.current = state
        cleanup = state.dispose
        setStatus('ready')
      } catch (err) {
        console.error('Could not start the 3D view.', err)
        if (!cancelled) setStatus('error')
      }
    })()

    return () => {
      cancelled = true
      cleanup?.()
      sceneRef.current = null
    }
    // Set up once; shells and view are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // --- Rebuild the meshes when the shells change ------------------------
  useEffect(() => {
    const state = sceneRef.current
    if (!state || status !== 'ready') return
    const { THREE, group } = state

    for (const line of state.lines) {
      group.remove(line)
      line.geometry.dispose()
      ;(line.material as import('three').Material).dispose()
    }
    state.lines = []
    for (const solid of state.solids) {
      group.remove(solid)
      solid.geometry.dispose()
      ;(solid.material as import('three').Material).dispose()
    }
    state.solids = []

    let tallest = 70
    for (const shell of shells) {
      const positions = gridsToSegments(shell.grids)
      tallest = Math.max(tallest, shell.heightIn)
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

      // Per-part colours ride on the geometry as vertex colours, so colouring
      // 60 muscles costs one draw call rather than sixty.
      let vertexColors = false
      if (shell.colorOf) {
        const colors = new Float32Array(positions.length)
        const tmp = new THREE.Color()
        let at = 0
        for (const { name, count } of gridVertexCounts(shell.grids)) {
          // setHex applies the sRGB-to-linear conversion three.js expects.
          tmp.setHex(shell.colorOf(name))
          for (let i = 0; i < count; i++) {
            colors[at * 3] = tmp.r
            colors[at * 3 + 1] = tmp.g
            colors[at * 3 + 2] = tmp.b
            at++
          }
        }
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
        vertexColors = true
      }

      const material = new THREE.LineBasicMaterial({
        vertexColors,
        color: vertexColors ? 0xffffff : shell.color,
        transparent: true,
        opacity: shell.opacity,
        // Additive keeps overlapping lines glowing like the reference — but it
        // sums to white where marks cross, which would destroy per-part colour
        // coding, so it is only used on single-colour layers.
        blending: shell.emphasis && !vertexColors ? THREE.AdditiveBlending : THREE.NormalBlending,
        // Depth testing is what lets the occluder hide the far side.
        depthTest: true,
        depthWrite: false,
      })
      // The occluder goes in first: a solid form filled with the backdrop, so it
      // is invisible but claims the depth buffer and hides the far side.
      if (shell.occlude) {
        const solidGeom = new THREE.BufferGeometry()
        solidGeom.setAttribute('position', new THREE.BufferAttribute(gridsToTriangles(shell.grids), 3))
        const solidMat = new THREE.MeshBasicMaterial({
          color: OCCLUDER_FILL,
          side: THREE.DoubleSide,
          // Nudged away from the camera so it never z-fights with its own lines.
          polygonOffset: true,
          polygonOffsetFactor: 1.5,
          polygonOffsetUnits: 1.5,
        })
        const solid = new THREE.Mesh(solidGeom, solidMat)
        solid.renderOrder = -1
        group.add(solid)
        state.solids.push(solid)
      }

      const line = new THREE.LineSegments(geometry, material)
      // Lines must respect depth for the occluder to do anything.
      line.renderOrder = 1
      group.add(line)
      state.lines.push(line)
    }

    // Frame the body so it fills the view. With a 30° vertical field of view the
    // visible height at the subject is 2·d·tan(15°) ≈ 0.536·d, so this distance
    // leaves a small margin above the head and below the feet.
    group.position.set(0, 0, 0)
    if (fit) {
      // Explicit framing: the caller has measured the geometry, usually across
      // several poses at once so they all sit at the same scale.
      state.target = fit.centreY
      state.fitRadius = fit.radius
      state.applyFit()
    } else {
      state.fitRadius = null
      state.target = tallest / 2
      state.distance = tallest * 2.15
    }
  }, [shells, status, fit])

  // --- Preset views -----------------------------------------------------
  useEffect(() => {
    const state = sceneRef.current
    if (!state) return
    state.azimuth = PRESET_AZIMUTH[view]
    state.polar = Math.PI / 2
  }, [view])

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line" style={{ background: BACKDROP }}>
      <div ref={mountRef} style={{ height }} className="w-full" />

      {status === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center text-xs text-ink-3">Preparing model…</div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-ink-3">
          This device could not start the 3D view (WebGL unavailable). Everything else on this page still works.
        </div>
      )}

      {status === 'ready' && (
        <>
          {(hint ?? 'Drag to rotate · pinch or scroll to zoom') !== '' && (
            <div className="pointer-events-none absolute top-3 left-3 text-[10px] tracking-wider text-ink-3 uppercase">
              {hint ?? 'Drag to rotate · pinch or scroll to zoom'}
            </div>
          )}
          {onViewChange && (
            <div className="absolute right-3 bottom-3 flex gap-1">
              {(['front', 'side', 'back', 'threequarter'] as PresetView[]).map((v) => (
                <button
                  key={v}
                  onClick={() => onViewChange(v)}
                  className="rounded-lg px-2 py-1 text-[10px] font-medium backdrop-blur transition"
                  style={{
                    background: view === v ? 'rgba(57,135,229,0.9)' : 'rgba(255,255,255,0.08)',
                    color: view === v ? '#fff' : 'rgba(255,255,255,0.7)',
                  }}
                >
                  {v === 'threequarter' ? '¾' : v[0].toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/**
 * The occluder's fill. Slightly lighter than the backdrop so the body still
 * reads as a solid form rather than a hole, but dark enough that the wireframe
 * stays the subject.
 */
const OCCLUDER_FILL = 0x0d1520

/** The reference's dark field: a near-black navy with a soft centre glow. */
const BACKDROP = 'radial-gradient(ellipse at 50% 45%, #16202e 0%, #0b0f16 55%, #06080c 100%)'

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

/** Shell colours, fixed so the visual language never shifts between screens. */
export const SHELL_COLORS = {
  /** The outer surface — "you now". Cyan, as in the reference. */
  full: 0x38bdf8,
  /** Frame + muscle. */
  lean: 0x2ee6a8,
  /** Skeletal frame. */
  frame: 0x64748b,
  /** Frame + fat, shown when muscle is switched off. */
  frameFat: 0xf0a850,
} as const
