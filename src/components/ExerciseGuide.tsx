import { useMemo, useState } from 'react'
import type { Exercise, Muscle } from '../lib/types'
import { MUSCLE_LABEL } from '../lib/types'
import { computePhysique } from '../lib/physique'
import { MUSCLE_BELLIES, buildMuscleGrids, bellyInMuscles, muscleColorOf } from '../lib/muscles'
import { fitMusclesToSurface } from '../lib/bodyMesh'
import { buildFrameGrids } from '../lib/skeletonMesh'
import { anchorGrids, poseGrids, sharedFit } from '../lib/pose'
import { framesFor, guideFor } from '../lib/exerciseGuide'
import BodyScan, { SHELL_COLORS, type PresetView, type ShellSpec } from './BodyScan'
import { Sheet } from './ui'

/**
 * How to perform an exercise: the movement drawn as a sequence of positions on the
 * same wireframe figure as the physique view, plus the written cues.
 *
 * The figure is a fixed reference body rather than the user's own. The diagrams are
 * instructional art — every one should look the same from one exercise to the next,
 * and a lean reference reads far more clearly, because the whole point is seeing
 * which muscles are working.
 */

/**
 * The reference figure: 5'10", 175 lb, 12% body fat. Lean enough that the bellies
 * are distinct, built once at module scope because it never varies.
 */
const REFERENCE = computePhysique({ heightIn: 70, weightLb: 175, bodyFatPct: 12, sex: 'male' })

/**
 * Rest-pose muscle geometry, built and fitted once for every diagram in the app.
 *
 * Fitting has to happen here, in the rest pose, because it clamps each belly inside
 * the body's cross-section at that height — a notion that stops meaning anything
 * once a limb is out sideways. Posing then moves the fitted result.
 */
const REST_GRIDS = fitMusclesToSurface(buildMuscleGrids(REFERENCE.lean, REFERENCE.frame), REFERENCE.lean)

/**
 * The skeleton, posed alongside the muscles.
 *
 * Not decoration. Every belly tapers to nothing at its joint, so posed limbs made
 * of muscle alone read as a row of detached strips — the first version of this
 * looked more like a bird than someone benching. Bones span the joints and give
 * the figure its structure, which is also exactly how anatomical instruction art
 * is drawn.
 */
const REST_BONES = buildFrameGrids(REFERENCE.frame)

/** Bellies the exercise does not work, dimmed to near-background. */
const UNWORKED = 0x2a3444

export default function ExerciseGuide({
  exercise,
  open,
  onClose,
}: {
  exercise: Exercise
  open: boolean
  onClose: () => void
}) {
  const guide = guideFor(exercise.id)
  const frames = framesFor(exercise.id)
  const [enlarged, setEnlarged] = useState<number | null>(null)
  const [view, setView] = useState<PresetView>('side')

  /**
   * Every frame's geometry, plus one framing shared across all of them. Posing is a
   * matrix multiply over pre-built grids, so four positions cost about as much as
   * one — which is what makes a strip of them viable.
   */
  /**
   * Muscles and bones are posed then anchored *as a pair*, so the two stay
   * registered with each other — anchoring them separately would slide the bones
   * out of the bellies whenever the two had different lowest points.
   */
  const { posed, bones } = useMemo(() => {
    const muscleSets: ReturnType<typeof poseGrids>[] = []
    const boneSets: ReturnType<typeof poseGrids>[] = []
    for (const f of frames) {
      const [m, b] = anchorGrids(
        [poseGrids(REST_GRIDS, REFERENCE.lean, f.pose), poseGrids(REST_BONES, REFERENCE.lean, f.pose)],
        f.pose.anchor ?? 'feet',
        REFERENCE.heightIn * 1.28,
      )
      muscleSets.push(m)
      boneSets.push(b)
    }
    return { posed: muscleSets, bones: boneSets }
  }, [frames])

  // Framing spans muscles and bones across every frame, so a limb never leaves the
  // frame and the figure never changes size between positions.
  const fit = useMemo(
    () => (posed.length ? sharedFit([...posed, ...bones]) : undefined),
    [posed, bones],
  )

  /**
   * Worked muscles keep their group colour, everything else drops back. This is the
   * "which muscles to activate" half of the diagram — without it you are looking at
   * a posed figure with no idea where to feel the lift.
   */
  const colorOf = useMemo(() => {
    return (name: string) => {
      if (bellyInMuscles(name, exercise.primary)) return muscleColorOf(name, SHELL_COLORS.lean)
      if (bellyInMuscles(name, exercise.secondary)) return dim(muscleColorOf(name, SHELL_COLORS.lean), 0.45)
      return UNWORKED
    }
  }, [exercise.primary, exercise.secondary])

  /**
   * Bones first so they occupy the depth buffer, then muscles over them. The bones
   * are the only occluder: letting the muscles write depth too would have each
   * belly hide the bone it sits on, and the joints would go back to looking broken.
   */
  const shellFor = (index: number): ShellSpec[] => [
    {
      grids: bones[index],
      heightIn: REFERENCE.heightIn,
      color: SHELL_COLORS.frame,
      opacity: 0.85,
      occlude: true,
    },
    {
      grids: posed[index],
      heightIn: REFERENCE.heightIn,
      color: SHELL_COLORS.lean,
      opacity: 1,
      colorOf,
    },
  ]

  if (!guide) return null

  return (
    <Sheet open={open} onClose={onClose} title={exercise.name}>
      <div className="space-y-4">
        <p className="text-xs leading-relaxed text-ink-2">{guide.summary}</p>

        {/* --- The movement --------------------------------------------- */}
        {frames.length > 0 ? (
          <div>
            {/* Two columns even for four frames: a lying-down figure is wide, and a
                narrow column would frame it as a distant speck. */}
            <div className={`grid gap-2 ${frames.length >= 4 ? 'grid-cols-2' : frames.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {frames.map((f, i) => (
                <button
                  key={f.label}
                  onClick={() => {
                    setView(f.view)
                    setEnlarged(i)
                  }}
                  className="group text-left"
                  title={`${f.label} — tap to enlarge and rotate`}
                >
                  <BodyScan
                    shells={shellFor(i)}
                    view={f.view}
                    height={frames.length >= 4 ? 165 : 190}
                    fit={fit}
                    interactive={false}
                    hint=""
                  />
                  <div className="mt-1.5 px-0.5">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[10px] text-ink-3">{i + 1}</span>
                      <span className="text-[11px] font-medium">{f.label}</span>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-snug text-ink-3">{f.caption}</p>
                  </div>
                </button>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-ink-3">
              Tap a position to enlarge and rotate it. Lit muscles are the ones this lift trains —
              <span className="text-ink"> brightest are the primary movers</span>.
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-line bg-surface-2 px-3 py-2.5">
            <p className="text-[11px] leading-relaxed text-ink-2">
              <span className="font-medium text-ink">No diagram for this one.</span> {guide.noDiagram}
            </p>
          </div>
        )}

        {/* --- Muscles worked ------------------------------------------- */}
        {/* Swatches use each group's own colour, the same one the mesh is drawn in —
            a single highlight colour in the key would not match the figure. */}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line pt-3">
          {exercise.primary.map((m) => (
            <span key={m} className="flex items-center gap-1.5 text-[11px]">
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: hex(muscleHue(m)) }} />
              {MUSCLE_LABEL[m]}
            </span>
          ))}
          {exercise.secondary.map((m) => (
            <span key={m} className="flex items-center gap-1.5 text-[11px] text-ink-3">
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ background: hex(dim(muscleHue(m), 0.45)) }}
              />
              {MUSCLE_LABEL[m]}
              <span className="text-ink-3">assists</span>
            </span>
          ))}
        </div>

        <Section title="Set up" items={guide.setup} />
        <Section title="Perform it" items={guide.execution} ordered />

        {guide.cues.length > 0 && (
          <div>
            <h4 className="mb-1.5 text-[11px] font-semibold tracking-wider text-ink-3 uppercase">Think about</h4>
            <div className="flex flex-wrap gap-1.5">
              {guide.cues.map((c) => (
                <span key={c} className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] text-ink-2">
                  {c}
                </span>
              ))}
            </div>
          </div>
        )}

        <div>
          <h4 className="mb-1.5 text-[11px] font-semibold tracking-wider uppercase" style={{ color: 'var(--warning)' }}>
            Common mistakes
          </h4>
          <ul className="space-y-1">
            {guide.mistakes.map((m) => (
              <li key={m} className="flex gap-1.5 text-[11px] leading-relaxed text-ink-2">
                <span aria-hidden className="shrink-0" style={{ color: 'var(--warning)' }}>
                  ×
                </span>
                {m}
              </li>
            ))}
          </ul>
        </div>

        {frames.length > 0 && (
          <p className="border-t border-line pt-3 text-[11px] leading-relaxed text-ink-3">
            The figure is a reference body, not you, and it is drawn from the same muscle model as the Physique tab.
            Treat the positions as a guide to the shape of the movement — depth, stance width and grip all vary with
            your build.
          </p>
        )}
      </div>

      {/* Enlarged: one interactive canvas, so the position can be inspected. */}
      <Sheet
        open={enlarged !== null}
        onClose={() => setEnlarged(null)}
        title={enlarged !== null ? `${exercise.name} · ${frames[enlarged].label}` : ''}
      >
        {enlarged !== null && (
          <div className="space-y-3">
            <BodyScan shells={shellFor(enlarged)} view={view} onViewChange={setView} height={380} fit={fit} />
            <p className="text-xs leading-relaxed text-ink-2">{frames[enlarged].caption}</p>
            <div className="flex gap-2">
              {frames.map((f, i) => (
                <button
                  key={f.label}
                  onClick={() => {
                    setView(f.view)
                    setEnlarged(i)
                  }}
                  className="flex-1 rounded-lg border px-2 py-1.5 text-[11px] transition"
                  style={{
                    borderColor: i === enlarged ? 'var(--series-1)' : 'var(--border)',
                    color: i === enlarged ? 'var(--text-primary)' : 'var(--text-secondary)',
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </Sheet>
    </Sheet>
  )
}

function Section({ title, items, ordered }: { title: string; items: string[]; ordered?: boolean }) {
  if (items.length === 0) return null
  return (
    <div>
      <h4 className="mb-1.5 text-[11px] font-semibold tracking-wider text-ink-3 uppercase">{title}</h4>
      <ol className="space-y-1">
        {items.map((s, i) => (
          <li key={s} className="flex gap-2 text-xs leading-relaxed text-ink-2">
            <span aria-hidden className="shrink-0 text-ink-3">
              {ordered ? `${i + 1}.` : '·'}
            </span>
            {s}
          </li>
        ))}
      </ol>
    </div>
  )
}

/** The colour the mesh draws a tracked muscle group in. */
function muscleHue(m: Muscle): number {
  return muscleColorOf(MUSCLE_BELLIES[m][0], SHELL_COLORS.lean)
}

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`
}

/** Blends a colour toward the unworked tone, for the assisting muscles. */
function dim(color: number, amount: number): number {
  const mix = (shift: number, mask: number) => {
    const a = (color >> shift) & mask
    const b = (UNWORKED >> shift) & mask
    return Math.round(a * amount + b * (1 - amount)) & mask
  }
  return (mix(16, 0xff) << 16) | (mix(8, 0xff) << 8) | mix(0, 0xff)
}
