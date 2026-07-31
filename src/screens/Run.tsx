import { useMemo, useState } from 'react'
import { uid, useStore } from '../lib/store'
import type { Run, RunType } from '../lib/types'
import { RUN_TYPE_LABEL } from '../lib/types'
import { Button, Card, Empty, Field, Row, SectionTitle, Segmented, SelectField, Sheet, Stat } from '../components/ui'
import { ChartFrame, SERIES, TimeSeries, niceDomain } from '../components/charts'
import {
  RACE_DISTANCES,
  acwr,
  addDays,
  bestEfforts,
  bestVdot,
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
  weeklyMileage,
  withinDays,
} from '../lib/calc'

type SubTab = 'log' | 'history' | 'analysis'

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
        ]}
      />
      {tab === 'log' && <LogRun onSaved={() => setTab('analysis')} />}
      {tab === 'history' && <RunHistory />}
      {tab === 'analysis' && <RunAnalysis />}
    </div>
  )
}

function LogRun({ onSaved }: { onSaved: () => void }) {
  const { data, saveRun } = useStore()
  const units = data.profile.units
  const du = distanceUnit(units)

  const [date, setDate] = useState(todayISO())
  const [distance, setDistance] = useState('')
  const [duration, setDuration] = useState('')
  const [type, setType] = useState<RunType>('easy')
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
    })
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

        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
          {quick.map((q) => (
            <button
              key={q}
              onClick={() => setDistance(String(q))}
              className="shrink-0 rounded-full border border-line bg-surface-2 px-2.5 py-1 text-[11px] text-ink-2"
            >
              {q} {du}
            </button>
          ))}
        </div>

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
  const sorted = [...data.runs].sort((a, b) => b.date.localeCompare(a.date))
  const selected = sorted.find((r) => r.id === open)

  if (sorted.length === 0) {
    return <Empty title="No runs logged" body="Every run you save shows up here with its pace, and feeds the weekly mileage and load charts." />
  }

  return (
    <div className="space-y-2">
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

  const weekly = useMemo(() => weeklyMileage(data.runs, 12), [data.runs])
  const load = useMemo(() => acwr(data.runs), [data.runs])
  const dist = useMemo(() => intensityDistribution(data.runs), [data.runs])
  const efforts = useMemo(() => bestEfforts(data.runs), [data.runs])
  const v = useMemo(() => bestVdot(data.runs), [data.runs])
  const paces = v ? trainingPaces(v.value) : null

  if (data.runs.length === 0) {
    return <Empty title="Nothing to analyse yet" body="Log a few runs — including one hard effort or time trial — and this tab will show your mileage trend, injury-risk load ratio, best times and personalised training paces." />
  }

  const weeklyChart = weekly.map((w) => ({
    week: w.week,
    total: round(dispDistance(w.miles, units), 1),
    hard: round(dispDistance(w.hard, units), 1),
  }))

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

  const thisWeek = weekly[weekly.length - 1]?.miles ?? 0
  const last4 = weekly.slice(-4).reduce((a, w) => a + w.miles, 0) / 4

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat
          label="This week"
          value={round(dispDistance(thisWeek, units), 1)}
          unit={du}
          sub={`4-week avg ${round(dispDistance(last4, units), 1)}`}
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
        <Stat label="VDOT" value={v ? round(v.value, 1) : '—'} sub={v ? `from ${fmtDate(v.run.date)}` : 'log a hard effort'} />
      </div>

      <ChartFrame
        title={`Weekly distance (${du})`}
        sub="Total distance per week with the hard-running portion shown separately."
        legend={[
          { label: 'Total', color: SERIES.s1 },
          { label: 'Hard running', color: SERIES.s2 },
        ]}
        table={{
          head: ['Week of', `Total (${du})`, `Hard (${du})`],
          rows: [...weeklyChart].reverse().map((w) => [fmtDate(w.week), w.total, w.hard]),
        }}
      >
        <TimeSeries
          data={weeklyChart}
          xKey="week"
          xTickFormatter={fmtDate}
          series={[
            { key: 'total', label: 'Total', color: SERIES.s1, bar: true },
            { key: 'hard', label: 'Hard running', color: SERIES.s2 },
          ]}
        />
      </ChartFrame>

      <ChartFrame
        title="Training load"
        sub="Your last 7 days of distance against your 4-week average. When the solid line runs far above the dashed one, injury risk climbs."
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
        <SectionTitle sub="Best actual time at each distance, and what your current fitness predicts">
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
        <SectionTitle sub="Last 4 weeks">Intensity distribution</SectionTitle>
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
