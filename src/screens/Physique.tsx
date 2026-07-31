import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { Card, Empty, SectionTitle } from '../components/ui'
import BodyScan, { SHELL_COLORS, type PresetView, type ShellSpec } from '../components/BodyScan'
import { fitMusclesToSurface, surfaceGrids } from '../lib/bodyMesh'
import { buildMuscleGrids, muscleColorOf, MUSCLE_GROUPS } from '../lib/muscles'
import { boneColorOf, BONE_GROUPS, buildFrameGrids } from '../lib/skeletonMesh'
import { applyRelief, sampleMuscleField } from '../lib/relief'
import { buildFatGrids, fatColorOf, FAT_GROUPS, fatSitesFor } from '../lib/fatDeposits'
import { basePhysique, snapshotAt, timelineRange } from '../lib/timeline'
import {
  addDays,
  bodyFatCategory,
  daysBetween,
  dispLength,
  dispWeight,
  fmtDateFull,
  lengthUnit,
  round,
  todayISO,
  weightUnit,
} from '../lib/calc'

/**
 * The wireframe physique view: three nested shells whose gaps are the actual
 * muscle and fat layers, scrubbable across your logged history and forward into
 * a projection.
 */
export default function Physique() {
  const { data } = useStore()
  const units = data.profile.units
  const wu = weightUnit(units)

  const base = useMemo(() => basePhysique(data), [data])
  const range = useMemo(() => timelineRange(data), [data])

  const [offset, setOffset] = useState(0) // days from today
  const [view, setView] = useState<PresetView>('front')
  const [showMuscle, setShowMuscle] = useState(true)
  const [showFat, setShowFat] = useState(true)
  const [showFrame, setShowFrame] = useState(false)

  const date = addDays(todayISO(), offset)
  const snapshot = useMemo(() => (base ? snapshotAt(data, date, base) : null), [data, date, base])

  const p = snapshot?.physique ?? null

  // Each layer is its own construction: bones for the frame, individual muscle
  // bellies for muscle, and the smooth shell for fat. Fat is the space between
  // the muscle layer and the outer shell, so switching fat off simply stops
  // drawing that shell.
  const H = p?.heightIn ?? 70

  /**
   * How much muscle detail shows through the skin. A lean body's muscles sit
   * right under the surface and their outlines are visible; fat smooths them
   * away. Driven off the modelled fat thickness at the waist, so it tracks the
   * real number rather than being a style choice.
   */
  const definition = p ? clamp01(1 - (p.fatThickness.waist - 0.2) / 0.95) : 1

  /** Muscle under skin is drawn as one surface, so nothing is colour-coded. */
  const blended = showFat && showMuscle

  // Built once per snapshot rather than per render: dragging the timeline slider
  // re-renders on every pixel, and rebuilding ~60 muscle bellies each time is the
  // difference between a smooth scrub and a stuttering one.
  const muscleGrids = useMemo(() => (p ? buildMuscleGrids(p.lean, p.frame) : []), [p])
  const fittedMuscles = useMemo(
    () => (p ? fitMusclesToSurface(muscleGrids, p.lean) : []),
    [muscleGrids, p],
  )

  const shells: ShellSpec[] = useMemo(() => {
    const list: ShellSpec[] = []
    if (!p) return list

    // --- Combined: ONE surface, shaped by everything underneath -----------
    // Not stacked shells. The skin is displaced outward over each muscle belly
    // and left in the grooves between them, with the strength of that relief set
    // by how lean you are. At low body fat it reads as a lean body with muscle
    // definition; as fat accumulates the relief flattens and the fat curves of
    // the measured surface are what remain.
    if (showFat && showMuscle) {
      const muscleField = sampleMuscleField(fittedMuscles)
      // Muscle carves the skin: ridges over bellies, grooves between them.
      let skin = applyRelief(surfaceGrids(p.full), muscleField, {
        definition,
        amplitude: Math.min(0.68, (p.lean.upperArmR - p.frame.upperArmR) * 0.72),
        // How far past the muscle surface its shape still reads. Must clear the
        // fat layer, but stay tight or neighbouring bellies merge into one mound
        // instead of showing the groove between them.
        band: 0.4 + p.fatThickness.waist * 1.1,
      })
      // Fat then swells the skin at the sites it is actually stored, so a heavier
      // body gets a belly and love handles rather than a uniformly wider ring.
      if (p.fatThickness.waist > 0.22) {
        const fatField = sampleMuscleField(buildFatGrids(p, p.full))
        skin = applyRelief(skin, fatField, {
          definition: 1,
          amplitude: Math.min(1.5, p.fatThickness.waist * 0.85),
          band: 0.5 + p.fatThickness.waist,
        })
      }
      list.push({
        grids: showFrame ? [...skin, ...buildFrameGrids(p.frame)] : skin,
        heightIn: H,
        color: SHELL_COLORS.full,
        opacity: 1,
        occlude: true,
      })
      return list
    }

    // --- Single layers: coloured by part, and solid ------------------------
    if (showMuscle) {
      if (showFrame) {
        list.push({
          grids: buildFrameGrids(p.frame),
          heightIn: H,
          color: SHELL_COLORS.frame,
          opacity: 1,
          occlude: true,
          colorOf: (n) => boneColorOf(n, SHELL_COLORS.frame),
        })
      }
      list.push({
        grids: fittedMuscles,
        heightIn: H,
        color: SHELL_COLORS.lean,
        opacity: 1,
        occlude: true,
        colorOf: (n) => muscleColorOf(n, SHELL_COLORS.lean),
      })
      return list
    }

    if (showFat) {
      // Fat on its own: the deposits themselves, drawn and coloured by site the
      // same way the muscles are, over a faint frame for reference.
      list.push({
        grids: buildFrameGrids(p.frame),
        heightIn: H,
        color: SHELL_COLORS.frame,
        opacity: showFrame ? 0.7 : 0.22,
        occlude: true,
      })
      list.push({
        grids: buildFatGrids(p, p.frameFat),
        heightIn: H,
        color: SHELL_COLORS.frameFat,
        opacity: 1,
        occlude: true,
        colorOf: (n) => fatColorOf(n, SHELL_COLORS.frameFat),
      })
      return list
    }

    list.push({
      grids: buildFrameGrids(p.frame),
      heightIn: H,
      color: SHELL_COLORS.frame,
      opacity: 1,
      occlude: true,
      colorOf: (n) => boneColorOf(n, SHELL_COLORS.frame),
    })
    return list
  }, [p, H, showFrame, showMuscle, showFat, definition, fittedMuscles])

  if (!base || !range || !snapshot) {
    return (
      <Empty
        title="Log your body metrics first"
        body="This view is built from your weight, body fat and tape measurements. Add an entry with your weight — plus waist and neck for a body-fat estimate, and shoulders for the biggest fidelity gain — and your physique appears here."
      />
    )
  }


  // Past the guard above, the snapshot and its physique are present.
  const physique = p!
  const minOffset = daysBetween(todayISO(), range.from)
  const maxOffset = daysBetween(todayISO(), range.to)
  const cat = bodyFatCategory(snapshot.bodyFatPct, data.profile.sex)
  const muscleGridCount = muscleGrids.length

  const kindLabel =
    snapshot.kind === 'projected' ? 'Projected' : snapshot.kind === 'logged' ? 'Measured' : 'Between measurements'
  const kindColor =
    snapshot.kind === 'projected'
      ? 'var(--series-4)'
      : snapshot.kind === 'logged'
        ? 'var(--good)'
        : 'var(--text-muted)'

  return (
    <div className="space-y-4">
      <BodyScan shells={shells} view={view} onViewChange={setView} />

      {/* Key to the colour-coded parts, when a layer is shown on its own */}
      {!blended && (showMuscle || showFrame || showFat) && (
        <Card>
          <SectionTitle
            sub={
              showMuscle
                ? 'Each belly is drawn and coloured separately'
                : showFat
                  ? `Where ${data.profile.sex === 'male' ? 'men' : 'women'} store it, in order: ${fatSitesFor(data.profile.sex).slice(0, 3).join(', ').toLowerCase()}`
                  : 'Bone regions'
            }
          >
            {showMuscle ? 'Muscle groups' : showFat ? 'Fat deposits' : 'Skeleton'}
          </SectionTitle>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {(showMuscle ? MUSCLE_GROUPS : showFat ? FAT_GROUPS : BONE_GROUPS).map((grp) => (
              <span key={grp.key} className="flex items-center gap-1.5 text-[11px] text-ink-2">
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ background: `#${grp.color.toString(16).padStart(6, '0')}` }}
                />
                {grp.label}
              </span>
            ))}
          </div>
          <p className="mt-2.5 text-[11px] leading-relaxed text-ink-3">
            Colours only appear when a layer is on its own. Turn on a second layer and everything merges into
            one material, the way a real body looks — the parts stay readable through their outlines.
          </p>
        </Card>
      )}

      {/* Layers */}
      <Card>
        <SectionTitle sub="Three different structures, not one shape at three sizes — switch a layer off to see what is underneath">
          Layers
        </SectionTitle>
        <div className="space-y-2">
          <LayerToggle
            label="Fat"
            sub={`${round(dispWeight(snapshot.fatLb, units), 1)} ${wu} · ${round(dispLength(physique.fatThickness.waist, units), 2)} ${lengthUnit(units)} thick at the waist`}
            color={SHELL_COLORS.full}
            on={showFat}
            onChange={setShowFat}
          />
          <LayerToggle
            label="Muscle"
            sub={`${round(dispWeight(snapshot.leanLb, units), 1)} ${wu} lean mass · ${muscleGridCount} individual muscle groups`}
            color={SHELL_COLORS.lean}
            on={showMuscle}
            onChange={setShowMuscle}
          />
          <LayerToggle
            label="Frame"
            sub="Bones only: skull, spine, ribcage, pelvis and limbs"
            color={SHELL_COLORS.frame}
            on={showFrame}
            onChange={setShowFrame}
          />
        </div>
        <p className="mt-3 border-t border-line pt-2 text-[11px] leading-relaxed text-ink-3">
          {!showFat && showMuscle
            ? `Every muscle at essentially no fat — completely stripped. Each belly is drawn separately along the bone it attaches to, so the grooves between them are real separations: ${MUSCLE_GROUPS.slice(0, 8).map((x) => x.label.toLowerCase()).join(', ')} and more.`
            : !showMuscle && showFat
              ? `Your fat on its own, sitting where ${data.profile.sex === 'male' ? 'men' : 'women'} actually store it — ${fatSitesFor(data.profile.sex).slice(0, 4).join(', ').toLowerCase()} — over the bare frame with no muscle at all. The deposits grow and shrink with your measured fat mass.`
              : showFat && showMuscle
                ? `One surface, shaped by everything underneath — no stacked layers. ${
                    definition > 0.6
                      ? 'You are lean enough that the muscle outlines read through the surface.'
                      : definition > 0.3
                        ? 'Some muscle outline shows through; fat is smoothing the rest.'
                        : 'Fat is covering the detail — the muscles are there, but the surface is smooth over them.'
                  } The space between the outline and the muscle underneath is the fat you are carrying.`
                : 'Bones only — the structure everything else is built on.'}
        </p>
      </Card>

      {/* Timeline */}
      <Card>
        <SectionTitle sub="Scrub back through your logs, or forward through the projection">Timeline</SectionTitle>

        <div className="mb-2 flex items-baseline justify-between gap-3">
          <div>
            <div className="text-sm font-medium">{fmtDateFull(snapshot.date)}</div>
            <div className="mt-0.5 text-[11px]" style={{ color: kindColor }}>
              {kindLabel}
              {offset === 0 ? ' · today' : offset > 0 ? ` · in ${Math.round(offset / 7)} weeks` : ` · ${Math.round(-offset / 7)} weeks ago`}
            </div>
          </div>
          <button
            onClick={() => setOffset(0)}
            className="rounded-lg border border-line px-2 py-1 text-[11px] text-ink-3 hover:text-ink"
          >
            Today
          </button>
        </div>

        <input
          type="range"
          min={minOffset}
          max={maxOffset}
          step={1}
          value={offset}
          onChange={(e) => setOffset(Number(e.target.value))}
          className="w-full accent-[var(--series-1)]"
          aria-label="Date"
        />
        <div className="mt-1 flex justify-between text-[10px] text-ink-3">
          <span>{Math.round(-minOffset / 7)}w ago</span>
          <span>today</span>
          <span>+{Math.round(maxOffset / 7)}w</span>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2.5">
          <Metric label="Weight" value={`${round(dispWeight(snapshot.weightLb, units), 1)}`} unit={wu} />
          <Metric label="Body fat" value={`${round(snapshot.bodyFatPct, 1)}`} unit="%" sub={cat.label.toLowerCase()} />
          <Metric label="Lean mass" value={`${round(dispWeight(snapshot.leanLb, units), 1)}`} unit={wu} />
        </div>

        {snapshot.basis && (
          <p className="mt-2 text-[11px] leading-relaxed text-ink-3">Projected {snapshot.basis}.</p>
        )}
      </Card>

      {/* Honesty about what this is */}
      <Card>
        <SectionTitle>What this is, and is not</SectionTitle>
        <div className="space-y-2 text-xs leading-relaxed text-ink-2">
          <p>
            This is a model driven by your numbers, not a scan of you. Tape measurements do not determine shape —
            many different bodies produce identical measurements — so treat it as a directional picture of your
            composition, and judge fine detail from the mirror.
          </p>
          <p>
            What it does get right is the arithmetic: the fat shell's volume is set to match your actual fat mass,
            distributed the way {data.profile.sex === 'male' ? 'men' : 'women'} store it, and the muscle layer scales
            with your measured lean mass. So the change you see between two dates is real change, at the right scale.
          </p>
          <p>
            {physique.estimated.length === 0 ? (
              <>Every girth here came from your own measurements.</>
            ) : (
              <>
                <span className="text-ink">{physique.estimated.length} measurement{physique.estimated.length === 1 ? '' : 's'}</span> were
                estimated from your height and lean mass rather than measured:{' '}
                {physique.estimated.join(', ')}. Logging them on the Body tab sharpens the model.
              </>
            )}
          </p>
        </div>
      </Card>
    </div>
  )
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

function LayerToggle({
  label,
  sub,
  color,
  on,
  onChange,
}: {
  label: string
  sub: string
  color: number
  on: boolean
  onChange: (v: boolean) => void
}) {
  const hex = `#${color.toString(16).padStart(6, '0')}`
  return (
    <label className="flex cursor-pointer items-start gap-2.5">
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0"
        style={{ accentColor: hex }}
      />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: hex }} />
          {label}
        </span>
        <span className="mt-0.5 block text-[11px] text-ink-3">{sub}</span>
      </span>
    </label>
  )
}

function Metric({ label, value, unit, sub }: { label: string; value: string; unit?: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-surface-2 px-3 py-2">
      <div className="text-[10px] text-ink-3">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-1">
        <span className="tabular text-lg font-semibold">{value}</span>
        {unit && <span className="text-[10px] text-ink-3">{unit}</span>}
      </div>
      {sub && <div className="text-[10px] text-ink-3">{sub}</div>}
    </div>
  )
}
