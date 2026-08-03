import { useMemo, useState } from 'react'
import { getRunDraft, setRunDraft, uid, useStore } from '../lib/store'
import RangePicker, { useDateRange } from '../components/RangePicker'
import { bucketFor, bucketLabel, bucketStart, withinRange } from '../lib/dateRange'
import {
  METHOD_LABEL,
  distanceSeries,
  summarise,
  volumeByPeriod,
  type EquivalentMethod,
} from '../lib/runDistance'
import type { Run, RunType } from '../lib/types'
import { HARD_RUN_TYPES, RUN_TYPE_LABEL } from '../lib/types'
import { Button, Card, Chip, Empty, Field, Row, ScrollRow, SectionTitle, Segmented, SelectField, Sheet, Stat } from '../components/ui'
import { ChartFrame, SERIES, TimeSeries, niceDomain } from '../components/charts'
import {
  RACE_DISTANCES,
  acwr,
  addDays,
  bestEfforts,
  bestVdot,
  daysBetween,
  dispDistance,
  dispElevation,
  distanceUnit,
  elevationUnit,
  fmtDate,
  fmtDateFull,
  fmtDuration,
  intensityDistribution,
  parseDuration,
  paceSecPerUnit,
  round,
  storeDistance,
  storeElevation,
  todayISO,
  trainingPaces,
  withinDays,
} from '../lib/calc'

type SubTab = 'log' | 'history' | 'analysis' | 'distances'

export default function RunScreen() {
  const [tab, setTab] = useState<SubTab>('log')
  return (
    <div className="space-y-5">
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'log', label: 'Log a run' },
          { value: 'history', label: 'History' },
          { value: 'analysis', label: 'Analysis' },
          { value: 'distances', label: 'Distances' },
        ]}
      />
      {tab === 'log' && <LogRun onSaved={() => setTab('analysis')} />}
      {tab === 'history' && <RunHistory />}
      {tab === 'analysis' && <RunAnalysis />}
      {tab === 'distances' && <RunDistances />}
    </div>
  )
}

function LogRun({ onSaved }: { onSaved: () => void }) {
  const { data, saveRun } = useStore()
  const units = data.profile.units
  const du = distanceUnit(units)

  // A run started from the plan arrives with its type and target already chosen.
  // Read once on mount: after that the form is the user's, and re-reading would
  // fight their edits.
  const [prescribed] = useState(getRunDraft)
  const planBlock = prescribed ? data.programs.find((b) => b.id === prescribed.programBlockId) : undefined

  const [date, setDate] = useState(todayISO())
  const [distance, setDistance] = useState(
    prescribed?.distanceMi ? String(round(dispDistance(prescribed.distanceMi, units), 2)) : '',
  )
  const [duration, setDuration] = useState(prescribed?.minutes ? `${prescribed.minutes}:00` : '')
  const [type, setType] = useState<RunType>(prescribed?.type ?? 'easy')
  const [hr, setHr] = useState('')
  const [elev, setElev] = useState('')
  const [rpe, setRpe] = useState('')
  const [note, setNote] = useState('')

  const seconds = parseDuration(duration)
  const dist = Number(distance)
  const valid = dist > 0 && seconds != null && seconds > 0
  const pace = valid ? seconds! / dist : null

  function save() {
    if (!valid) return
    saveRun({
      id: uid('run'),
      date,
      distanceMi: storeDistance(dist, units),
      seconds: seconds!,
      type,
      avgHr: hr ? Number(hr) : undefined,
      elevationFt: elev ? storeElevation(Number(elev), units) : undefined,
      rpe: rpe ? Number(rpe) : undefined,
      note: note.trim() || undefined,
      // Stamps the run as satisfying the block's rotation slot, which is what
      // advances the plan to the next session.
      programBlockId: prescribed?.programBlockId,
      programDayId: prescribed?.programDayId,
    })
    setRunDraft(null)
    setDistance('')
    setDuration('')
    setHr('')
    setElev('')
    setRpe('')
    setNote('')
    onSaved()
  }

  const quick = units === 'metric' ? [3, 5, 8, 10, 15, 21.1] : [1, 3.1, 5, 6.2, 10, 13.1]

  return (
    <div className="space-y-4">
      {prescribed && (
        <div className="flex items-start justify-between gap-3 rounded-xl border px-3 py-2.5 text-xs" style={{ borderColor: 'color-mix(in oklab, var(--accent) 40%, transparent)' }}>
          <span className="min-w-0">
            <span className="font-medium">Prescribed run</span>
            <span className="mt-0.5 block text-[11px] text-ink-2">
              {RUN_TYPE_LABEL[prescribed.type]}
              {prescribed.minutes ? ` · ${prescribed.minutes} min` : ''}
              {planBlock ? ` · ${planBlock.name}` : ''}. Saving it advances your plan.
            </span>
          </span>
          <button
            onClick={() => {
              setRunDraft(null)
              onSaved()
            }}
            className="shrink-0 rounded-lg px-2 py-1 text-[11px] text-ink-3 hover:text-ink"
            title="Log this run without linking it to the plan"
          >
            Unlink
          </button>
        </div>
      )}

      <Card className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <SelectField label="Type" value={type} onChange={(e) => setType(e.target.value as RunType)}>
            {(Object.keys(RUN_TYPE_LABEL) as RunType[]).map((t) => (
              <option key={t} value={t}>
                {RUN_TYPE_LABEL[t]}
              </option>
            ))}
          </SelectField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Distance"
            type="number"
            inputMode="decimal"
            step="0.01"
            suffix={du}
            value={distance}
            onChange={(e) => setDistance(e.target.value)}
          />
          <Field
            label="Time"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            placeholder="42:30"
            hint="mm:ss or h:mm:ss"
          />
        </div>

        <ScrollRow className="-mx-1 gap-1.5 px-1" label="Quick distances">
          {quick.map((q) => (
            <button
              key={q}
              onClick={() => setDistance(String(q))}
              className="shrink-0 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] text-ink-2"
            >
              {q} {du}
            </button>
          ))}
        </ScrollRow>

        {pace && (
          <div className="rounded-xl bg-surface-2 px-3 py-2 text-xs">
            <span className="text-ink-3">Pace </span>
            <span className="tabular font-medium">
              {fmtDuration(pace)}/{du}
            </span>
            {type === 'race' && (
              <span className="ml-3 text-ink-3">
                This will be used to calibrate your training paces and race predictions.
              </span>
            )}
          </div>
        )}

        <details className="text-xs">
          <summary className="cursor-pointer text-ink-3">Optional details</summary>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Average HR" type="number" inputMode="numeric" suffix="bpm" value={hr} onChange={(e) => setHr(e.target.value)} />
            <Field
              label="Elevation gain"
              type="number"
              inputMode="numeric"
              suffix={elevationUnit(units)}
              value={elev}
              onChange={(e) => setElev(e.target.value)}
            />
            <SelectField label="Effort (RPE)" value={rpe} onChange={(e) => setRpe(e.target.value)}>
              <option value="">—</option>
              {[3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </SelectField>
            <Field label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Hot, felt heavy" />
          </div>
        </details>

        <Button variant="primary" className="w-full" disabled={!valid} onClick={save}>
          Save run
        </Button>
      </Card>

      <Card>
        <SectionTitle sub="What each type means for your training">Run types</SectionTitle>
        <div className="space-y-2 text-xs text-ink-2">
          <p>
            <span className="font-medium text-ink">Easy</span> — conversational. Should feel like you could go further.
            This is where most of your mileage belongs.
          </p>
          <p>
            <span className="font-medium text-ink">Long</span> — the week's longest run, still easy. Builds the
            fat-burning aerobic base that matters most for both endurance and body composition.
          </p>
          <p>
            <span className="font-medium text-ink">Tempo / threshold</span> — comfortably hard, sustainable for about an
            hour in a race. Roughly the pace where breathing becomes rhythmic but controlled.
          </p>
          <p>
            <span className="font-medium text-ink">Intervals</span> — hard repeats with recovery. Trains the top end of
            aerobic capacity.
          </p>
          <p>
            <span className="font-medium text-ink">Race / time trial</span> — an all-out effort. Log at least one and the
            app can derive every training pace and predict your times at other distances.
          </p>
        </div>
      </Card>
    </div>
  )
}

function RunHistory() {
  const { data, deleteRun } = useStore()
  const units = data.profile.units
  const du = distanceUnit(units)
  const [open, setOpen] = useState<string | null>(null)
  const { range, resolved, setRange } = useDateRange('run')
  const earliest = useMemo(() => [...data.runs].map((r) => r.date).sort()[0] ?? null, [data.runs])
  const sorted = useMemo(
    () => withinRange(data.runs, resolved).sort((a, b) => b.date.localeCompare(a.date)),
    [data.runs, resolved],
  )
  const selected = sorted.find((r) => r.id === open)

  return (
    <div className="space-y-2">
      <RangePicker range={range} resolved={resolved} onChange={setRange} earliest={earliest} />
      {sorted.length === 0 && (
        <Empty
          title={data.runs.length ? 'No runs in this range' : 'No runs logged'}
          body={
            data.runs.length
              ? 'Widen the range or choose All time to see the runs you have logged.'
              : 'Every run you save shows up here with its pace, and feeds the weekly mileage and load charts.'
          }
        />
      )}
      {sorted.map((r) => (
        <button
          key={r.id}
          onClick={() => setOpen(r.id)}
          className="card w-full p-3.5 text-left transition hover:border-line-strong"
        >
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium">
              {round(dispDistance(r.distanceMi, units), 2)} {du}
              <span className="ml-2 text-[11px] font-normal text-ink-3">{RUN_TYPE_LABEL[r.type]}</span>
            </span>
            <span className="text-[11px] text-ink-3">{fmtDateFull(r.date)}</span>
          </div>
          <div className="tabular mt-1.5 flex gap-4 text-[11px] text-ink-2">
            <span>{fmtDuration(r.seconds)}</span>
            <span>
              {fmtDuration(paceSecPerUnit(r, units))}/{du}
            </span>
            {r.avgHr && <span>{r.avgHr} bpm</span>}
            {r.rpe && <span>RPE {r.rpe}</span>}
          </div>
        </button>
      ))}

      <Sheet
        open={!!selected}
        onClose={() => setOpen(null)}
        title={selected ? `${round(dispDistance(selected.distanceMi, units), 2)} ${du} · ${fmtDate(selected.date)}` : ''}
        footer={
          selected && (
            <Button
              variant="danger"
              onClick={() => {
                if (confirm('Delete this run?')) {
                  deleteRun(selected.id)
                  setOpen(null)
                }
              }}
            >
              Delete run
            </Button>
          )
        }
      >
        {selected && (
          <div className="space-y-1">
            <Row label="Type" value={RUN_TYPE_LABEL[selected.type]} />
            <Row label="Distance" value={`${round(dispDistance(selected.distanceMi, units), 2)} ${du}`} />
            <Row label="Time" value={fmtDuration(selected.seconds)} />
            <Row label="Pace" value={`${fmtDuration(paceSecPerUnit(selected, units))}/${du}`} />
            {selected.avgHr && <Row label="Average HR" value={`${selected.avgHr} bpm`} />}
            {selected.elevationFt && (
              <Row
                label="Elevation"
                value={`${round(dispElevation(selected.elevationFt, units), 0)} ${elevationUnit(units)}`}
              />
            )}
            {selected.rpe && <Row label="Effort" value={`RPE ${selected.rpe}`} />}
            {selected.note && <p className="pt-2 text-xs text-ink-2 italic">{selected.note}</p>}
          </div>
        )}
      </Sheet>
    </div>
  )
}

function RunAnalysis() {
  const { data } = useStore()
  const units = data.profile.units
  const du = distanceUnit(units)
  const paceFactor = units === 'metric' ? 0.621371192 : 1
  const { range, resolved, setRange } = useDateRange('run')
  const earliest = useMemo(() => [...data.runs].map((r) => r.date).sort()[0] ?? null, [data.runs])
  const runs = useMemo(() => withinRange(data.runs, resolved), [data.runs, resolved])

  // Distance bucketed to suit the window: daily bars over a fortnight, weekly over a
  // quarter, monthly over years. A year of daily bars is 365 slivers nobody can read.
  const bucket = bucketFor(resolved, earliest ? Math.abs(daysBetween(earliest, todayISO())) + 1 : 90)
  const buckets = useMemo(() => {
    const map = new Map<string, { miles: number; hard: number }>()
    for (const r of runs) {
      const k = bucketStart(r.date, bucket)
      const b = map.get(k) ?? { miles: 0, hard: 0 }
      b.miles += r.distanceMi
      if (HARD_RUN_TYPES.includes(r.type)) b.hard += r.distanceMi
      map.set(k, b)
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([k, b]) => ({ period: k, total: round(dispDistance(b.miles, units), 1), hard: round(dispDistance(b.hard, units), 1) }))
  }, [runs, bucket, units])

  // Best efforts, VDOT and paces come from the range too, so "what was my 5K pace
  // last spring" is answerable rather than always showing your all-time best.
  const efforts = useMemo(() => bestEfforts(runs), [runs])
  const v = useMemo(() => bestVdot(runs), [runs])
  const paces = v ? trainingPaces(v.value) : null
  const dist = useMemo(() => intensityDistribution(runs, resolved.days ?? 3650), [runs, resolved.days])
  // The load ratio is a fixed 7-over-28-day definition and always reads from today,
  // so it deliberately ignores the picker.
  const load = useMemo(() => acwr(data.runs), [data.runs])
  const totalMi = runs.reduce((a, r) => a + r.distanceMi, 0)
  const perWeek = resolved.days ? totalMi / (resolved.days / 7) : null

  if (data.runs.length === 0) {
    return <Empty title="Nothing to analyse yet" body="Log a few runs — including one hard effort or time trial — and this tab will show your mileage trend, injury-risk load ratio, best times and personalised training paces." />
  }

  // 28-day rolling acute vs chronic load, so the trend in the ratio is visible.
  const loadSeries = useMemo(() => {
    const out: { date: string; acute: number; chronic: number }[] = []
    for (let i = 41; i >= 0; i--) {
      const day = addDays(todayISO(), -i)
      const acute = withinDays(data.runs, 7, day).reduce((a, r) => a + r.distanceMi, 0)
      const chronic = withinDays(data.runs, 28, day).reduce((a, r) => a + r.distanceMi, 0) / 4
      out.push({
        date: day,
        acute: round(dispDistance(acute, units), 1),
        chronic: round(dispDistance(chronic, units), 1),
      })
    }
    return out
  }, [data.runs, units])

  return (
    <div className="space-y-4">
      <RangePicker range={range} resolved={resolved} onChange={setRange} earliest={earliest} />

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat
          label="Distance"
          value={round(dispDistance(totalMi, units), 1)}
          unit={du}
          sub={perWeek != null ? `${round(dispDistance(perWeek, units), 1)} ${du}/week average` : `${runs.length} runs`}
        />
        <Stat
          label="Load ratio"
          value={load.ratio ?? '—'}
          sub={
            load.ratio == null
              ? 'need 4 weeks'
              : load.ratio > 1.3
                ? 'above safe range'
                : load.ratio < 0.8
                  ? 'room to build'
                  : 'in the sweet spot'
          }
        />
        <Stat label="Easy running" value={`${dist.easyPct}%`} sub="target ~80%" />
        <Stat label="VDOT" value={v ? round(v.value, 1) : '—'} sub={v ? `best in range · ${fmtDate(v.run.date)}` : 'log a hard effort'} />
      </div>

      <ChartFrame
        title={`Distance per ${bucket} (${du})`}
        sub={`Total distance with the hard-running portion shown separately, bucketed by ${bucket} to suit the range.`}
        legend={[
          { label: 'Total', color: SERIES.s1 },
          { label: 'Hard running', color: SERIES.s2 },
        ]}
        table={{
          head: [bucketLabel(bucket), `Total (${du})`, `Hard (${du})`],
          rows: [...buckets].reverse().map((w) => [fmtDate(w.period), w.total, w.hard]),
        }}
      >
        <TimeSeries
          data={buckets}
          xKey="period"
          xTickFormatter={fmtDate}
          series={[
            { key: 'total', label: 'Total', color: SERIES.s1, bar: true },
            { key: 'hard', label: 'Hard running', color: SERIES.s2 },
          ]}
        />
      </ChartFrame>

      <ChartFrame
        title="Training load"
        sub="Your last 7 days of distance against your 4-week average — a fixed definition, so this one always reads from today whatever range is selected."
        legend={[
          { label: '7-day load', color: SERIES.s1 },
          { label: '4-week average', color: SERIES.muted, dashed: true },
        ]}
        table={{
          head: ['Date', `7-day (${du})`, `4-week avg (${du})`],
          rows: [...loadSeries].reverse().slice(0, 21).map((d) => [fmtDate(d.date), d.acute, d.chronic]),
        }}
      >
        <TimeSeries
          data={loadSeries}
          xKey="date"
          xTickFormatter={fmtDate}
          // Filled area, so the baseline has to be zero to read honestly.
          yDomain={[0, niceDomain(loadSeries.flatMap((d) => [d.acute, d.chronic]))[1]]}
          series={[
            { key: 'acute', label: '7-day load', color: SERIES.s1, area: true },
            { key: 'chronic', label: '4-week average', color: SERIES.muted, dashed: true },
          ]}
        />
      </ChartFrame>

      <Card>
        <SectionTitle sub={`Best time at each distance within ${resolved.label.toLowerCase()}, and what that fitness predicts`}>
          Distance benchmarks
        </SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-ink-3">
              <tr>
                <th className="border-b border-line py-2 pr-3 font-medium">Distance</th>
                <th className="border-b border-line py-2 pr-3 font-medium">Best</th>
                <th className="border-b border-line py-2 pr-3 font-medium">Pace</th>
                <th className="border-b border-line py-2 font-medium">Predicted</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {efforts.map((e) => (
                <tr key={e.name}>
                  <td className="border-b border-line py-2 pr-3">{e.name}</td>
                  <td className="border-b border-line py-2 pr-3">
                    {e.seconds ? fmtDuration(e.seconds) : <span className="text-ink-3">—</span>}
                  </td>
                  <td className="border-b border-line py-2 pr-3 text-ink-2">
                    {e.seconds ? `${fmtDuration((e.seconds / e.mi) * paceFactor)}/${du}` : ''}
                  </td>
                  <td className="border-b border-line py-2 text-ink-2">
                    {e.predictedSec ? fmtDuration(e.predictedSec) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
          Predictions use Riegel's formula from your single strongest performance, and assume you have trained
          appropriately for the distance — a marathon prediction from a 5K is optimistic unless you have done the long
          runs.
        </p>
      </Card>

      {paces ? (
        <Card>
          <SectionTitle sub={`Derived from your best effort: ${round(dispDistance(v!.run.distanceMi, units), 2)} ${du} in ${fmtDuration(v!.run.seconds)}`}>
            Your training paces
          </SectionTitle>
          <Row label="Easy / recovery" value={`${fmtDuration(paces.easy * paceFactor)}/${du}`} sub="Most of your weekly distance" />
          <Row label="Marathon pace" value={`${fmtDuration(paces.marathon * paceFactor)}/${du}`} sub="Steady long-effort pace" />
          <Row label="Threshold / tempo" value={`${fmtDuration(paces.threshold * paceFactor)}/${du}`} sub="20–40 min of work, comfortably hard" />
          <Row label="Interval" value={`${fmtDuration(paces.interval * paceFactor)}/${du}`} sub="3–5 min repeats at aerobic max" />
          <Row label="Repetition" value={`${fmtDuration(paces.repetition * paceFactor)}/${du}`} sub="Short, fast reps for speed and economy" />
          <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
            Easy pace is deliberately slow — running it faster is the most common mistake in distance training, because
            it adds fatigue without adding much fitness.
          </p>
        </Card>
      ) : (
        <Card>
          <p className="text-xs text-ink-2">
            Log a hard effort or time trial (any distance) as type <span className="font-medium">Race / time trial</span>{' '}
            and this section will fill in with your personalised easy, tempo and interval paces.
          </p>
        </Card>
      )}

      <Card>
        <SectionTitle sub={resolved.label}>Intensity distribution</SectionTitle>
        <div className="flex h-3 overflow-hidden rounded-full">
          <div style={{ width: `${dist.easyPct}%`, background: SERIES.s1 }} />
          <div style={{ width: '2px', background: 'var(--surface-1)' }} />
          <div style={{ width: `${dist.hardPct}%`, background: SERIES.s2 }} />
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-ink-2">
          <span>
            <span aria-hidden className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: SERIES.s1 }} />
            Easy {dist.easyPct}%
          </span>
          <span>
            <span aria-hidden className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle" style={{ background: SERIES.s2 }} />
            Hard {dist.hardPct}%
          </span>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-ink-3">
          Roughly 80% easy and 20% hard produces more fitness than running everything at a moderate effort, and it leaves
          enough recovery for your lifting to keep progressing.
        </p>
      </Card>

      {data.goals.raceDistanceMi && (
        <Card>
          <SectionTitle sub="Against the race goal set in Settings">Goal check</SectionTitle>
          {(() => {
            const target = data.goals.raceDistanceMi!
            const goalTime = data.goals.raceTimeSec
            const nearest = RACE_DISTANCES.reduce((a, b) => (Math.abs(b.mi - target) < Math.abs(a.mi - target) ? b : a))
            const predicted = efforts.find((e) => e.name === nearest.name)?.predictedSec
            return (
              <div className="space-y-1">
                <Row label="Goal distance" value={`${round(dispDistance(target, units), 2)} ${du}`} />
                {goalTime && <Row label="Goal time" value={fmtDuration(goalTime)} />}
                <Row label="Predicted now" value={predicted ? fmtDuration(predicted) : '—'} />
                {goalTime && predicted && (
                  <Row
                    label="Gap"
                    value={
                      <span style={{ color: predicted <= goalTime ? 'var(--delta-good)' : 'var(--warning)' }}>
                        {predicted <= goalTime ? 'ahead of goal' : `${fmtDuration(predicted - goalTime)} to find`}
                      </span>
                    }
                  />
                )}
              </div>
            )
          })()}
        </Card>
      )}
    </div>
  )
}

export type { Run }

// ---------------------------------------------------------------------------
// Per-distance trends
// ---------------------------------------------------------------------------

/**
 * One distance at a time, trended from every run.
 *
 * The problem it solves: you have hundreds of runs and almost none of them are exactly
 * 5K, so a chart of your 5K times has three points on it. Converting each run to an
 * equivalent effort at the chosen distance turns all of them into one dense line.
 */
function RunDistances() {
  const { data } = useStore()
  const units = data.profile.units
  const du = distanceUnit(units)
  const paceFactor = units === 'metric' ? 0.621371192 : 1
  const { range, resolved, setRange } = useDateRange('run')
  const earliest = useMemo(() => [...data.runs].map((r) => r.date).sort()[0] ?? null, [data.runs])

  const [targetMi, setTargetMi] = useState(RACE_DISTANCES[0].mi)
  const [custom, setCustom] = useState('')
  const [method, setMethod] = useState<EquivalentMethod>('pace')

  const runs = useMemo(() => withinRange(data.runs, resolved), [data.runs, resolved])
  const series = useMemo(() => distanceSeries(runs, targetMi, method), [runs, targetMi, method])
  const stats = useMemo(() => summarise(series), [series])

  const bucket = bucketFor(resolved, earliest ? Math.abs(daysBetween(earliest, todayISO())) + 1 : 90)
  const volume = useMemo(() => volumeByPeriod(runs, (iso) => bucketStart(iso, bucket)), [runs, bucket])

  if (data.runs.length === 0) {
    return (
      <Empty
        title="No runs logged"
        body="Log a few runs at any distance and this tab will trend your time and pace at whichever distance you pick — every run counts toward it, not just the ones at that exact distance."
      />
    )
  }

  const name = RACE_DISTANCES.find((d) => Math.abs(d.mi - targetMi) < 0.001)?.name ?? `${round(dispDistance(targetMi, units), 2)} ${du}`
  const chart = series.map((p) => ({
    date: p.date,
    seconds: Math.round(p.seconds),
    pace: Math.round(p.paceSecPerMi * paceFactor),
  }))

  return (
    <div className="space-y-4">
      <RangePicker range={range} resolved={resolved} onChange={setRange} earliest={earliest} />

      <Card className="space-y-3">
        <SectionTitle sub="Every run is converted to this distance, so the trend uses all of them">
          Distance
        </SectionTitle>
        <ScrollRow className="-mx-4 gap-1.5 px-4" label="Distance">
          {RACE_DISTANCES.map((d) => (
            <Chip
              key={d.name}
              active={Math.abs(d.mi - targetMi) < 0.001}
              onClick={() => {
                setTargetMi(d.mi)
                setCustom('')
              }}
            >
              {d.name}
            </Chip>
          ))}
        </ScrollRow>
        <Field
          label={`Or any distance you like (${du})`}
          type="number"
          inputMode="decimal"
          step="0.1"
          className="w-44"
          value={custom}
          onChange={(e) => {
            setCustom(e.target.value)
            const v = Number(e.target.value)
            if (v > 0) setTargetMi(storeDistance(v, units))
          }}
        />
        <div>
          <span className="label">How to convert</span>
          <Segmented
            value={method}
            onChange={(m: EquivalentMethod) => setMethod(m)}
            options={[
              { value: 'pace', label: METHOD_LABEL.pace },
              { value: 'riegel', label: METHOD_LABEL.riegel },
            ]}
          />
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">
            {method === 'pace' ? (
              <>
                Holds each run&rsquo;s average pace and scales it to {name}: 2 {du} in 20:00 is a 10:00 pace, so it
                reports a 10:00 mile and a 30:00 three-miler. Not a race prediction — you would run a mile faster
                than your 2-mile pace — but the distortion is the same for every run, so the{' '}
                <span className="text-ink">trend and your improvement are exact</span>.
              </>
            ) : (
              <>
                Applies the standard endurance exponent, so longer distances come out slower than pure pace
                scaling. Use this when the number itself matters — what you could actually run today — rather
                than the shape of the trend.
              </>
            )}
          </p>
        </div>
      </Card>

      {series.length === 0 ? (
        <Empty title="No runs in this range" body="Widen the date range or choose All time." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <Stat
              label={`${name} now`}
              value={stats.latest ? fmtDuration(stats.latest.seconds) : '—'}
              sub={stats.latest ? fmtDate(stats.latest.date) : undefined}
            />
            <Stat
              label="Best in range"
              value={stats.best ? fmtDuration(stats.best.seconds) : '—'}
              sub={stats.best ? fmtDate(stats.best.date) : undefined}
            />
            <Stat
              label="Change"
              value={stats.changeSec == null ? '—' : `${stats.changeSec < 0 ? '−' : '+'}${fmtDuration(Math.abs(stats.changeSec))}`}
              // Faster is a smaller time, so a negative change is the good direction.
              deltaGood={stats.changeSec == null ? undefined : stats.changeSec < 0}
              delta={stats.changeSec == null ? undefined : stats.changeSec < 0 ? 'faster' : 'slower'}
              sub="first to last"
            />
            <Stat
              label="Runs used"
              value={stats.total}
              sub={`${stats.actualCount} actually at ${name}`}
            />
          </div>

          <ChartFrame
            title={`Equivalent ${name} time`}
            sub={`Lower is faster. Every run in range converted to ${name}${stats.actualCount > 0 ? `; ${stats.actualCount} of them were run at that distance` : ''}.`}
            table={{
              head: ['Date', `Actual run (${du})`, `Equivalent ${name}`, 'At this distance'],
              rows: [...series].reverse().map((p) => [
                fmtDate(p.date),
                round(dispDistance(p.run.distanceMi, units), 2),
                fmtDuration(p.seconds),
                p.actual ? 'yes' : '',
              ]),
            }}
          >
            <TimeSeries
              data={chart}
              xKey="date"
              xTickFormatter={fmtDate}
              yTickFormatter={(v) => fmtDuration(v)}
              tooltipFormatter={(v) => [fmtDuration(v), name]}
              series={[{ key: 'seconds', label: `Equivalent ${name}`, color: SERIES.s1, area: true }]}
              yDomain={niceDomain(chart.map((c) => c.seconds))}
            />
          </ChartFrame>

          <ChartFrame
            title={`Pace (/${du})`}
            sub="Your actual pace on each run. Distance-independent, so every run is directly comparable."
            table={{
              head: ['Date', `Pace (/${du})`],
              rows: [...chart].reverse().map((c) => [fmtDate(c.date), fmtDuration(c.pace)]),
            }}
          >
            <TimeSeries
              data={chart}
              xKey="date"
              xTickFormatter={fmtDate}
              yTickFormatter={(v) => fmtDuration(v)}
              tooltipFormatter={(v) => [`${fmtDuration(v)}/${du}`, 'Pace']}
              series={[{ key: 'pace', label: 'Pace', color: SERIES.s3, area: true }]}
              yDomain={niceDomain(chart.map((c) => c.pace))}
            />
          </ChartFrame>

          <ChartFrame
            title={`Volume per ${bucket}`}
            sub="Distance covered and time spent. Time is the honest measure of load when paces vary — an easy hour and a hard hour cost the same time but very different distance."
            legend={[
              { label: `Distance (${du})`, color: SERIES.s1 },
              { label: 'Hours', color: SERIES.s4 },
            ]}
            table={{
              head: [bucketLabel(bucket), `Distance (${du})`, 'Time', 'Runs'],
              rows: [...volume].reverse().map((v) => [
                fmtDate(v.period),
                round(dispDistance(v.miles, units), 1),
                fmtDuration(v.seconds),
                v.runs,
              ]),
            }}
          >
            <TimeSeries
              data={volume.map((v) => ({
                period: v.period,
                distance: round(dispDistance(v.miles, units), 1),
                hours: round(v.seconds / 3600, 2),
              }))}
              xKey="period"
              xTickFormatter={fmtDate}
              series={[
                { key: 'distance', label: `Distance (${du})`, color: SERIES.s1, bar: true },
                { key: 'hours', label: 'Hours', color: SERIES.s4 },
              ]}
            />
          </ChartFrame>

          <Card>
            <SectionTitle sub={`Every run in range, converted to ${name}`}>Runs</SectionTitle>
            {[...series].reverse().slice(0, 24).map((p) => (
              <Row
                key={p.run.id}
                label={fmtDate(p.date)}
                sub={`${round(dispDistance(p.run.distanceMi, units), 2)} ${du} in ${fmtDuration(p.run.seconds)}${p.actual ? ` · at ${name}` : ''}`}
                value={fmtDuration(p.seconds)}
              />
            ))}
          </Card>
        </>
      )}
    </div>
  )
}
