import { useMemo, useState } from 'react'
import { startPlannedSession, uid, useStore } from '../lib/store'
import { Button, Card, Empty, Meter, Row, SectionTitle, Sheet } from '../components/ui'
import { SERIES, TargetBars } from '../components/charts'
import { GOAL_LABEL, MUSCLE_LABEL, MUSCLES, RUN_TYPE_LABEL, type ProgramBlock, type ProgramDay } from '../lib/types'
import {
  activeBlock,
  adherence,
  blockEndDate,
  blockFromPreset,
  blockWeek,
  dayMuscleLabel,
  isDeload,
  nextDay,
  plannedVolume,
  prescribeDay,
  presetsForGoal,
  repeatBlock,
  weekProgress,
  type Prescription,
} from '../lib/program'
import { volumeTargets } from '../lib/recommend'
import { addDays, dispWeight, fmtDate, round, todayISO, weekStart as weekStartOf, weightUnit } from '../lib/calc'

/**
 * Training blocks: the prescriptive counterpart to the advice list.
 *
 * The screen is deliberately short on configuration. A block that takes an hour
 * to enter never gets entered, so the flow is: pick a structure, and from then on
 * the only interaction is "start this session" — the loads are read out of your
 * log rather than typed in.
 */
export default function Plan({ onNavigate }: { onNavigate: (t: 'lift' | 'run') => void }) {
  const { data } = useStore()
  const block = useMemo(() => activeBlock(data), [data])
  return block ? <ActiveBlock block={block} onNavigate={onNavigate} /> : <ChooseBlock />
}

// ---------------------------------------------------------------------------
// Running block
// ---------------------------------------------------------------------------

function ActiveBlock({
  block,
  onNavigate,
}: {
  block: ProgramBlock
  onNavigate: (t: 'lift' | 'run') => void
}) {
  const { data, saveProgram } = useStore()
  const units = data.profile.units
  const wu = weightUnit(units)

  const week = blockWeek(block) ?? 1
  const deload = isDeload(block, week)
  const { done, total, completed } = weekProgress(data, block)
  const upNext = nextDay(data, block)
  const rows = useMemo(() => adherence(data, block), [data, block])
  const [openDay, setOpenDay] = useState<ProgramDay | null>(null)
  // A block already waiting to start, so the button cannot queue a second one.
  const queuedNext = data.programs.some((b) => !b.archived && b.startDate > blockEndDate(block))

  function start(day: ProgramDay) {
    const dest = startPlannedSession(data, block, day, week)
    if (dest) onNavigate(dest)
  }

  // What the block prescribes per muscle each week, against the targets the coach
  // derives from the same goal — so a structural gap is visible before six weeks
  // have been spent on it.
  const volumeRows = useMemo(() => {
    const planned = plannedVolume(data, block)
    const targets = volumeTargets(data)
    return MUSCLES.filter((m) => (planned[m] ?? 0) > 0 || (targets.find((t) => t.muscle === m)?.target ?? 0) >= 6)
      .map((m) => {
        const target = round(targets.find((t) => t.muscle === m)?.target ?? 0, 1)
        const value = round(planned[m] ?? 0, 1)
        const short = target - value >= 3
        return {
          label: MUSCLE_LABEL[m],
          value,
          target,
          color: short ? 'var(--warning)' : 'var(--accent)',
          note: short ? `${Math.ceil(target - value)} short` : undefined,
        }
      })
      .sort((a, b) => b.target - b.value - (a.target - a.value))
  }, [data, block])

  return (
    <div className="space-y-4">
      {/* Where you are */}
      <Card className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1 text-[10px] font-semibold tracking-wider uppercase" style={{ color: 'var(--accent)' }}>
              Current block
            </div>
            <h3 className="text-base leading-snug font-semibold tracking-tight">{block.name}</h3>
            <p className="mt-0.5 text-[11px] text-ink-3">
              Week {week} of {block.weeks} · {block.days.length} sessions a week · built for{' '}
              {GOAL_LABEL[block.goal].toLowerCase()}
            </p>
          </div>
          {deload && (
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
              style={{ color: 'var(--series-4)', background: 'color-mix(in oklab, var(--series-4) 14%, transparent)' }}
            >
              Deload
            </span>
          )}
        </div>

        <div>
          <div className="mb-1 flex items-baseline justify-between text-xs">
            <span className="text-ink-2">This week</span>
            <span className="tabular text-ink-3">
              {done} / {total} sessions
            </span>
          </div>
          <Meter value={done} target={total} color="var(--accent)" />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {block.days.map((d) => {
            const isDone = completed.has(d.id)
            const isNext = upNext?.id === d.id
            return (
              <button
                key={d.id}
                onClick={() => setOpenDay(d)}
                className="rounded-full border px-2.5 py-1 text-[11px] transition"
                style={{
                  borderColor: isDone
                    ? 'color-mix(in oklab, var(--good) 45%, transparent)'
                    : isNext
                      ? 'var(--accent)'
                      : 'var(--border)',
                  color: isDone ? 'var(--good)' : isNext ? 'var(--text-primary)' : 'var(--text-secondary)',
                  background: isNext ? 'color-mix(in oklab, var(--accent) 12%, transparent)' : 'var(--surface-2)',
                }}
              >
                {isDone && <span aria-hidden>✓ </span>}
                {d.name}
              </button>
            )
          })}
        </div>
        <p className="text-[11px] leading-relaxed text-ink-3">
          Sessions advance when you train, not when the week does — miss one and it is still waiting, rather than
          putting you behind. Tap any session to see its prescription.
        </p>
      </Card>

      {/* Up next */}
      {upNext ? (
        <SessionCard
          day={upNext}
          block={block}
          week={week}
          heading="Up next"
          onStart={() => start(upNext)}
        />
      ) : (
        <Card>
          <SectionTitle sub={week >= block.weeks ? 'And that is the whole block' : 'The rotation restarts on Monday'}>
            Week {week} complete
          </SectionTitle>
          <p className="text-xs leading-relaxed text-ink-2">
            All {total} sessions done.{' '}
            {week >= block.weeks
              ? 'Start the next block below — repeating this one picks up from the loads you finished on.'
              : 'Extra work now costs more in recovery than it returns. Rest, walk, or do some mobility work.'}
          </p>
        </Card>
      )}

      {/* Adherence */}
      <Card>
        <SectionTitle sub="Sessions completed each week of the block">Adherence</SectionTitle>
        <div className="space-y-1.5">
          {rows.map((r) => {
            const isNow = r.week === week
            const isFuture = r.week > week
            return (
              <div key={r.week} className="flex items-center gap-2.5">
                <span
                  className="tabular w-14 shrink-0 text-[11px]"
                  style={{ color: isNow ? 'var(--text-primary)' : 'var(--text-muted)' }}
                >
                  Week {r.week}
                </span>
                <div className="min-w-0 flex-1">
                  <Meter
                    value={isFuture ? 0 : r.done}
                    target={r.total}
                    // The meter tints its own track from the fill colour, so the
                    // colour has to be neutral for a week that has not happened:
                    // amber at 18% across an empty bar reads as a missed week, not
                    // a future one.
                    color={
                      isFuture
                        ? 'var(--text-muted)'
                        : isDeload(block, r.week)
                          ? 'var(--series-4)'
                          : r.done >= r.total
                            ? 'var(--good)'
                            : isNow
                              ? SERIES.s1
                              : 'var(--warning)'
                    }
                  />
                </div>
                <span className="tabular w-10 shrink-0 text-right text-[11px] text-ink-3">
                  {isFuture ? '—' : `${r.done}/${r.total}`}
                </span>
              </div>
            )
          })}
        </div>
        <p className="mt-2.5 text-[11px] leading-relaxed text-ink-3">
          Amber weeks are ones you did not finish. Perfect adherence is not the goal — a block you complete four
          sessions out of five on, for six weeks, beats a perfect fortnight followed by abandoning it.
        </p>
      </Card>

      {/* Planned volume against the coach's own targets */}
      <Card>
        <SectionTitle sub="What this block prescribes each week, against the target for your goal">
          Weekly volume as planned
        </SectionTitle>
        {volumeRows.length > 0 ? (
          <TargetBars rows={volumeRows} />
        ) : (
          <p className="text-xs text-ink-2">This block has no lifting sessions.</p>
        )}
        <p className="mt-2.5 text-[11px] leading-relaxed text-ink-3">
          This is the plan on paper, not what you have done — the Volume tab under Lift shows that. A muscle short
          here will stay short all block, so it is worth fixing now rather than in six weeks.
        </p>
      </Card>

      {/* Ending it */}
      <Card className="space-y-3">
        <SectionTitle sub={`Started ${fmtDate(block.startDate)}, ends ${fmtDate(blockEndDate(block))}`}>
          Block
        </SectionTitle>
        <div className="flex flex-wrap gap-2">
          {/* Queued, not started: the new block begins the Monday after this one
              ends, and `activeBlock` ignores a block whose start date has not
              arrived. Archiving the current block here instead would stop it
              prescribing today, which is the opposite of "after this one". */}
          <Button
            disabled={queuedNext}
            onClick={() => saveProgram(repeatBlock(block, () => uid('pb'), addDays(blockEndDate(block), 1)))}
          >
            {queuedNext ? 'Repeat already queued' : 'Repeat after this one'}
          </Button>
          <Button
            variant="ghost"
            onClick={() => {
              if (confirm('End this block now? Your logged sessions are kept.')) {
                saveProgram({ ...block, archived: true })
              }
            }}
          >
            End block
          </Button>
        </div>
        <p className="text-[11px] leading-relaxed text-ink-3">
          Ending a block keeps every session you logged — it only stops the plan from prescribing. Your loads carry
          into the next block automatically, because prescriptions are read from your log rather than stored.
        </p>
      </Card>

      <Sheet open={!!openDay} onClose={() => setOpenDay(null)} title={openDay?.name ?? ''}>
        {openDay && (
          <PrescriptionList
            prescriptions={prescribeDay(data, block, openDay, week)}
            day={openDay}
            units={units}
            wu={wu}
          />
        )}
      </Sheet>
    </div>
  )
}

// ---------------------------------------------------------------------------
// One session
// ---------------------------------------------------------------------------

function SessionCard({
  day,
  block,
  week,
  heading,
  onStart,
}: {
  day: ProgramDay
  block: ProgramBlock
  week: number
  heading: string
  onStart: () => void
}) {
  const { data } = useStore()
  const units = data.profile.units
  const wu = weightUnit(units)
  const pres = useMemo(() => prescribeDay(data, block, day, week), [data, block, day, week])

  return (
    <Card className="space-y-3">
      <div>
        <div className="mb-1 text-[10px] font-semibold tracking-wider uppercase" style={{ color: 'var(--accent)' }}>
          {heading}
        </div>
        <h3 className="text-base leading-snug font-semibold tracking-tight">{day.name}</h3>
        <p className="mt-0.5 text-[11px] text-ink-3">
          {day.kind === 'run'
            ? `${RUN_TYPE_LABEL[day.run?.type ?? 'easy']}${day.run?.minutes ? ` · ${day.run.minutes} min` : ''}`
            : dayMuscleLabel(data, day)}
        </p>
      </div>

      <PrescriptionList prescriptions={pres} day={day} units={units} wu={wu} />

      <Button variant="primary" className="w-full" onClick={onStart}>
        {day.kind === 'run' ? 'Log this run' : 'Start this session'}
      </Button>
      {day.kind === 'lift' && (
        <p className="text-[11px] leading-relaxed text-ink-3">
          Starting it fills the log with these sets and loads already entered — correct what actually happened and
          save.
        </p>
      )}
    </Card>
  )
}

function PrescriptionList({
  prescriptions,
  day,
  units,
  wu,
}: {
  prescriptions: Prescription[]
  day: ProgramDay
  units: 'imperial' | 'metric'
  wu: string
}) {
  const [why, setWhy] = useState<string | null>(null)

  if (day.kind === 'run') {
    return (
      <div className="space-y-1">
        <Row label="Type" value={RUN_TYPE_LABEL[day.run?.type ?? 'easy']} />
        {day.run?.minutes && <Row label="Duration" value={`${day.run.minutes} min`} />}
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {prescriptions.map((p) => (
        <div key={p.slot.exerciseId} className="border-b border-line py-2 last:border-0">
          <button
            onClick={() => setWhy(why === p.slot.exerciseId ? null : p.slot.exerciseId)}
            className="flex w-full items-baseline justify-between gap-3 text-left"
          >
            <span className="min-w-0">
              <span className="block truncate text-sm">{p.exercise?.name ?? p.slot.exerciseId}</span>
              <span className="mt-0.5 block text-[11px] text-ink-3">
                {p.lastDate ? `last done ${fmtDate(p.lastDate)}` : 'no history yet'}
              </span>
            </span>
            <span className="tabular shrink-0 text-right text-sm font-medium">
              {p.sets} × {p.targetReps}
              {p.loadLb != null && p.loadLb > 0 && (
                <span className="block text-[11px] font-normal text-ink-2">
                  {round(dispWeight(p.loadLb, units), 1)} {wu}
                </span>
              )}
            </span>
          </button>
          {why === p.slot.exerciseId && (
            <p className="mt-1.5 border-l-2 pl-2.5 text-[11px] leading-relaxed text-ink-2" style={{ borderColor: 'var(--border-strong)' }}>
              {p.reason}
            </p>
          )}
        </div>
      ))}
      <p className="pt-1 text-[11px] text-ink-3">Tap a lift to see where its target came from.</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Starting a block
// ---------------------------------------------------------------------------

function ChooseBlock() {
  const { data, saveProgram, deleteProgram } = useStore()
  const today = todayISO()
  const presets = useMemo(() => presetsForGoal(data.goals.primary), [data.goals.primary])

  // A block waiting to start is neither running nor finished, and putting it in
  // either list reads as a mistake — one looks like it should be prescribing, the
  // other like it already ran.
  const queued = useMemo(
    () => (data.programs ?? []).filter((b) => !b.archived && b.startDate > today).sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [data.programs, today],
  )
  const past = useMemo(
    () =>
      (data.programs ?? [])
        .filter((b) => b.startDate <= today && (b.archived || blockWeek(b) === null))
        .sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [data.programs, today],
  )

  return (
    <div className="space-y-4">
      {queued.map((b) => (
        <Card key={b.id} className="space-y-2.5">
          <div className="mb-1 text-[10px] font-semibold tracking-wider uppercase" style={{ color: 'var(--series-4)' }}>
            Starts {fmtDate(b.startDate)}
          </div>
          <h3 className="text-base leading-snug font-semibold tracking-tight">{b.name}</h3>
          <p className="text-xs leading-relaxed text-ink-2">
            Queued and waiting. Until it starts, sessions are suggested reactively — or start it now and it will run
            from this week.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => saveProgram({ ...b, startDate: weekStartOf(today) })}>
              Start it now
            </Button>
            <Button variant="ghost" onClick={() => deleteProgram(b.id)}>
              Cancel it
            </Button>
          </div>
        </Card>
      ))}

      {past.length === 0 && queued.length === 0 && (
        <Empty
          title="No training block running"
          body="Sessions are being suggested reactively — whichever muscle group is furthest below its weekly target. That catches problems, but progressive overload needs a decision made in advance about what load to attempt next. A block is that decision, written down."
        />
      )}

      <section>
        <SectionTitle sub={`Ordered for your goal: ${GOAL_LABEL[data.goals.primary].toLowerCase()}`}>
          Start a block
        </SectionTitle>
        <div className="space-y-2.5">
          {presets.map((preset) => {
            const suited = preset.suits.includes(data.goals.primary)
            return (
              <Card key={preset.key} className="space-y-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm leading-snug font-semibold">{preset.name}</h3>
                    <p className="mt-0.5 text-[11px] text-ink-3">
                      {preset.weeks} weeks
                      {preset.deloadWeek ? `, deload in week ${preset.deloadWeek}` : ''} · {preset.perWeek} sessions a
                      week
                    </p>
                  </div>
                  {suited && (
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase"
                      style={{ color: 'var(--good)', background: 'color-mix(in oklab, var(--good) 14%, transparent)' }}
                    >
                      Suits your goal
                    </span>
                  )}
                </div>
                <p className="text-xs leading-relaxed text-ink-2">{preset.summary}</p>
                <p className="text-[11px] text-ink-3">{preset.days.map((d) => d.name).join(' · ')}</p>
                {preset.perWeek > data.goals.liftDaysPerWeek + data.goals.runDaysPerWeek && (
                  <p className="text-[11px] leading-relaxed" style={{ color: 'var(--warning)' }}>
                    This asks for {preset.perWeek} sessions a week; your settings say you train{' '}
                    {data.goals.liftDaysPerWeek + data.goals.runDaysPerWeek}. Pick a smaller block, or raise the days
                    in Settings — a plan you cannot keep is worse than a smaller one you can.
                  </p>
                )}
                <Button
                  variant="primary"
                  onClick={() => saveProgram(blockFromPreset(preset, data.goals.primary, () => uid('pb')))}
                >
                  Start this block
                </Button>
              </Card>
            )
          })}
        </div>
      </section>

      {past.length > 0 && (
        <section>
          <SectionTitle sub="Repeating one restarts it from the loads you finished on">Finished blocks</SectionTitle>
          <div className="space-y-2">
            {past.map((b) => (
              <Card key={b.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{b.name}</div>
                  <div className="mt-0.5 text-[11px] text-ink-3">
                    {fmtDate(b.startDate)} – {fmtDate(blockEndDate(b))} · {b.weeks} weeks
                  </div>
                </div>
                <Button
                  className="shrink-0"
                  onClick={() => saveProgram(repeatBlock(b, () => uid('pb'), todayISO()))}
                >
                  Repeat
                </Button>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
