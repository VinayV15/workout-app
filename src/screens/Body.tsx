import { useMemo, useState } from 'react'
import { uid, useStore } from '../lib/store'
import type { BodyEntry } from '../lib/types'
import { Button, Card, Empty, Field, Row, SectionTitle, Segmented, Sheet, Stat } from '../components/ui'
import { ChartFrame, SERIES, TimeSeries, niceDomain } from '../components/charts'
import Physique from './Physique'
import {
  bmi,
  bmiCategory,
  bodyFatCategory,
  dispLength,
  dispWeight,
  ema,
  fatMass,
  fmtDate,
  fmtDateFull,
  latestBodyFat,
  latestWeight,
  leanMass,
  leanRateLbPerWeek,
  lengthUnit,
  navyBodyFat,
  nutritionTargets,
  round,
  storeLength,
  storeWeight,
  targetWeeklyRate,
  todayISO,
  weightRateLbPerWeek,
  weightUnit,
} from '../lib/calc'

type SubTab = 'log' | 'physique' | 'trends' | 'history'

export default function Body() {
  const [tab, setTab] = useState<SubTab>('log')
  return (
    <div className="space-y-5">
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: 'log', label: 'Log' },
          { value: 'physique', label: 'Physique' },
          { value: 'trends', label: 'Trends' },
          { value: 'history', label: 'History' },
        ]}
      />
      {tab === 'log' && <LogBody onSaved={() => setTab('physique')} />}
      {tab === 'physique' && <Physique />}
      {tab === 'trends' && <Trends />}
      {tab === 'history' && <History />}
    </div>
  )
}

function LogBody({ onSaved }: { onSaved: () => void }) {
  const { data, saveBody } = useStore()
  const units = data.profile.units
  const wu = weightUnit(units)
  const lu = lengthUnit(units)

  const [date, setDate] = useState(todayISO())
  const [weight, setWeight] = useState('')
  const [bodyFat, setBodyFat] = useState('')
  const [waist, setWaist] = useState('')
  const [neck, setNeck] = useState('')
  const [hips, setHips] = useState('')
  const [chest, setChest] = useState('')
  const [arm, setArm] = useState('')
  const [thigh, setThigh] = useState('')
  const [shoulders, setShoulders] = useState('')
  const [calf, setCalf] = useState('')
  const [forearm, setForearm] = useState('')
  const [restingHr, setRestingHr] = useState('')
  const [note, setNote] = useState('')

  const num = (v: string) => (v ? Number(v) : undefined)
  const len = (v: string) => (v ? storeLength(Number(v), units) : undefined)

  const draft: BodyEntry = {
    id: 'preview',
    date,
    weightLb: weight ? storeWeight(Number(weight), units) : undefined,
    bodyFatPct: num(bodyFat),
    waistIn: len(waist),
    neckIn: len(neck),
    hipsIn: len(hips),
  }
  const estimated = navyBodyFat(draft, data.profile)

  function save() {
    saveBody({
      id: uid('body'),
      date,
      weightLb: weight ? storeWeight(Number(weight), units) : undefined,
      bodyFatPct: num(bodyFat),
      waistIn: len(waist),
      neckIn: len(neck),
      hipsIn: len(hips),
      chestIn: len(chest),
      armIn: len(arm),
      thighIn: len(thigh),
      shouldersIn: len(shoulders),
      calfIn: len(calf),
      forearmIn: len(forearm),
      restingHr: num(restingHr),
      note: note.trim() || undefined,
    })
    setWeight('')
    setBodyFat('')
    setNote('')
    onSaved()
  }

  const valid = !!weight || !!bodyFat || !!waist

  return (
    <div className="space-y-4">
      <Card className="space-y-3">
        <Field label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Weight"
            type="number"
            inputMode="decimal"
            step="0.1"
            suffix={wu}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            autoFocus
          />
          <Field
            label="Body fat"
            type="number"
            inputMode="decimal"
            step="0.1"
            suffix="%"
            value={bodyFat}
            onChange={(e) => setBodyFat(e.target.value)}
            hint={estimated && !bodyFat ? `Estimate from tape: ${round(estimated, 1)}%` : 'From a scale, calipers or DEXA'}
          />
        </div>

        <div>
          <span className="label">Tape measurements ({lu})</span>
          <div className="grid grid-cols-3 gap-2">
            <Field placeholder="Waist" type="number" inputMode="decimal" step="0.1" value={waist} onChange={(e) => setWaist(e.target.value)} />
            <Field placeholder="Neck" type="number" inputMode="decimal" step="0.1" value={neck} onChange={(e) => setNeck(e.target.value)} />
            <Field placeholder="Hips" type="number" inputMode="decimal" step="0.1" value={hips} onChange={(e) => setHips(e.target.value)} />
            <Field placeholder="Chest" type="number" inputMode="decimal" step="0.1" value={chest} onChange={(e) => setChest(e.target.value)} />
            <Field placeholder="Arm" type="number" inputMode="decimal" step="0.1" value={arm} onChange={(e) => setArm(e.target.value)} />
            <Field placeholder="Thigh" type="number" inputMode="decimal" step="0.1" value={thigh} onChange={(e) => setThigh(e.target.value)} />
            <Field placeholder="Shoulders" type="number" inputMode="decimal" step="0.1" value={shoulders} onChange={(e) => setShoulders(e.target.value)} />
            <Field placeholder="Calf" type="number" inputMode="decimal" step="0.1" value={calf} onChange={(e) => setCalf(e.target.value)} />
            <Field placeholder="Forearm" type="number" inputMode="decimal" step="0.1" value={forearm} onChange={(e) => setForearm(e.target.value)} />
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">
            Waist and neck are enough for a body-fat estimate{data.profile.sex === 'female' ? ' along with hips' : ''}. Measure
            first thing in the morning, same spots each time — consistency matters far more than absolute accuracy.
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-ink-3">
            <span className="text-ink">Shoulders</span> is a width, not a girth — straight across your back from the
            bony point of one shoulder to the other. It is the single biggest driver of the physique model, and anything
            you leave blank is estimated from your height and lean mass instead.
          </p>
        </div>

        <details className="text-xs">
          <summary className="cursor-pointer text-ink-3">Optional</summary>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Resting HR" type="number" inputMode="numeric" suffix="bpm" value={restingHr} onChange={(e) => setRestingHr(e.target.value)} />
            <Field label="Note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Poor sleep, salty meal" />
          </div>
        </details>

        <Button variant="primary" className="w-full" disabled={!valid} onClick={save}>
          Save entry
        </Button>
      </Card>

      <Card>
        <SectionTitle>How to weigh yourself</SectionTitle>
        <p className="text-xs leading-relaxed text-ink-2">
          First thing in the morning, after the bathroom, before eating or drinking, wearing the same amount of clothing.
          Weight can swing three or four pounds day to day from water, salt and food volume alone — that is why this app
          fits a trend line through your entries and bases every recommendation on that instead of your latest number.
          Two to four weigh-ins a week gives a reliable trend.
        </p>
      </Card>
    </div>
  )
}

function Trends() {
  const { data } = useStore()
  const units = data.profile.units
  const wu = weightUnit(units)
  const profile = data.profile

  const weight = latestWeight(data.body)
  const bf = latestBodyFat(data.body, profile)
  const rate = weightRateLbPerWeek(data.body)
  const leanRate = leanRateLbPerWeek(data.body, profile)
  const targetRate = targetWeeklyRate(data)
  const nut = nutritionTargets(data)
  const bmiValue = weight && profile.heightIn ? bmi(weight.weightLb, profile.heightIn) : null

  const series = useMemo(() => {
    const pts = data.body.filter((b) => b.weightLb).sort((a, b) => a.date.localeCompare(b.date))
    const trend = ema(pts, (p) => p.weightLb!, 0.25)
    return pts.map((p, i) => {
      const pct = p.bodyFatPct ?? navyBodyFat(p, profile)
      return {
        date: p.date,
        weight: round(dispWeight(p.weightLb!, units), 1),
        trend: round(dispWeight(trend[i], units), 1),
        bodyFat: pct != null ? round(pct, 1) : null,
        lean: pct != null ? round(dispWeight(leanMass(p.weightLb!, pct), units), 1) : null,
        fat: pct != null ? round(dispWeight(fatMass(p.weightLb!, pct), units), 1) : null,
        waist: p.waistIn ? round(dispLength(p.waistIn, units), 1) : null,
      }
    })
  }, [data.body, profile, units])

  if (series.length === 0) {
    return <Empty title="No body data yet" body="Log a weight entry and this tab fills in with your trend line, body-composition split and rate of change against the target for your goal." />
  }

  const hasComposition = series.some((s) => s.lean != null)
  const hasWaist = series.some((s) => s.waist != null)
  const bfCat = bf ? bodyFatCategory(bf.pct, profile.sex) : null
  const bmiCat = bmiValue ? bmiCategory(bmiValue) : null

  const rateGood =
    rate == null || !targetRate
      ? undefined
      : rate >= Math.min(targetRate.min, targetRate.max) - 0.15 && rate <= Math.max(targetRate.min, targetRate.max) + 0.15

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat
          label="Weight"
          value={weight ? round(dispWeight(weight.weightLb, units), 1) : '—'}
          unit={wu}
          delta={rate != null ? `${rate > 0 ? '+' : ''}${round(dispWeight(rate, units), 2)}/wk` : undefined}
          deltaGood={rateGood}
          sub={weight ? fmtDate(weight.date) : undefined}
        />
        <Stat
          label="Body fat"
          value={bf ? round(bf.pct, 1) : '—'}
          unit="%"
          sub={bfCat ? bfCat.label.toLowerCase() : 'add waist + neck'}
        />
        <Stat
          label="Lean mass"
          value={weight && bf ? round(dispWeight(leanMass(weight.weightLb, bf.pct), units), 1) : '—'}
          unit={wu}
          delta={leanRate != null ? `${leanRate > 0 ? '+' : ''}${round(dispWeight(leanRate, units), 2)}/wk` : undefined}
          deltaGood={leanRate == null ? undefined : leanRate > -0.15}
          sub="muscle, bone, water"
        />
        <Stat
          label="Fat mass"
          value={weight && bf ? round(dispWeight(fatMass(weight.weightLb, bf.pct), units), 1) : '—'}
          unit={wu}
          sub={bmiCat ? `BMI ${round(bmiValue!, 1)} · ${bmiCat.label.toLowerCase()}` : undefined}
        />
      </div>

      {rate != null && targetRate && (
        <Card>
          <SectionTitle sub="Trailing 4 weeks, fitted through all your weigh-ins">Rate of change</SectionTitle>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold tracking-tight" style={{ color: rateGood ? 'var(--delta-good)' : 'var(--warning)' }}>
              {rate > 0 ? '+' : ''}
              {round(dispWeight(rate, units), 2)}
            </span>
            <span className="text-xs text-ink-3">{wu} per week</span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-ink-2">
            Target band for your goal is{' '}
            <span className="tabular font-medium text-ink">
              {round(dispWeight(Math.min(targetRate.min, targetRate.max), units), 2)} to{' '}
              {round(dispWeight(Math.max(targetRate.min, targetRate.max), units), 2)} {wu}/week
            </span>
            . {rateGood
              ? 'You are inside it — this is the pace that strips fat while holding onto muscle.'
              : 'Adjust intake in one step, then hold it for two weeks before judging again.'}
          </p>
          {nut && (
            <p className="mt-2 text-xs text-ink-3">
              Current targets: {nut.target.toLocaleString()} kcal · {nut.proteinG}g protein · {nut.fatG}g fat ·{' '}
              {nut.carbG}g carbs.
            </p>
          )}
        </Card>
      )}

      <ChartFrame
        title={`Bodyweight (${wu})`}
        sub="Weigh-ins with a smoothed trend line. Day-to-day noise is water and food, not fat."
        legend={[
          { label: 'Weigh-in', color: SERIES.muted },
          { label: 'Trend', color: SERIES.s1 },
        ]}
        height={220}
        table={{
          head: ['Date', `Weight (${wu})`, `Trend (${wu})`],
          rows: [...series].reverse().map((s) => [fmtDate(s.date), s.weight, s.trend]),
        }}
      >
        <TimeSeries
          data={series}
          xKey="date"
          xTickFormatter={fmtDate}
          series={[
            { key: 'weight', label: 'Weigh-in', color: SERIES.muted },
            { key: 'trend', label: 'Trend', color: SERIES.s1, area: true },
          ]}
          yDomain={niceDomain([
            ...series.map((s) => s.weight),
            ...series.map((s) => s.trend),
            data.goals.targetWeightLb ? dispWeight(data.goals.targetWeightLb, units) : null,
          ])}
          refLines={
            data.goals.targetWeightLb
              ? [{ y: round(dispWeight(data.goals.targetWeightLb, units), 1), color: SERIES.good, label: 'Target' }]
              : undefined
          }
        />
      </ChartFrame>

      {hasComposition && (
        <>
          <ChartFrame
            title="Body fat (%)"
            sub="Measured entries and tape estimates combined."
            table={{
              head: ['Date', 'Body fat %'],
              rows: [...series].reverse().filter((s) => s.bodyFat != null).map((s) => [fmtDate(s.date), s.bodyFat!]),
            }}
          >
            <TimeSeries
              data={series.filter((s) => s.bodyFat != null)}
              xKey="date"
              xTickFormatter={fmtDate}
              series={[{ key: 'bodyFat', label: 'Body fat %', color: SERIES.s2, area: true }]}
              yDomain={niceDomain([...series.map((s) => s.bodyFat), data.goals.targetBodyFatPct ?? null])}
              refLines={
                data.goals.targetBodyFatPct != null
                  ? [{ y: data.goals.targetBodyFatPct, color: SERIES.good, label: 'Target' }]
                  : undefined
              }
            />
          </ChartFrame>

          <ChartFrame
            title={`Lean mass vs fat mass (${wu})`}
            sub="The chart that actually answers whether a diet is working: fat down, lean flat or up."
            legend={[
              { label: 'Lean mass', color: SERIES.s3 },
              { label: 'Fat mass', color: SERIES.s2 },
            ]}
            height={220}
            table={{
              head: ['Date', `Lean (${wu})`, `Fat (${wu})`],
              rows: [...series].reverse().filter((s) => s.lean != null).map((s) => [fmtDate(s.date), s.lean!, s.fat!]),
            }}
          >
            <TimeSeries
              data={series.filter((s) => s.lean != null)}
              xKey="date"
              xTickFormatter={fmtDate}
              series={[
                { key: 'lean', label: 'Lean mass', color: SERIES.s3 },
                { key: 'fat', label: 'Fat mass', color: SERIES.s2 },
              ]}
            />
          </ChartFrame>
        </>
      )}

      {hasWaist && (
        <ChartFrame
          title={`Waist (${lengthUnit(units)})`}
          sub="Often the clearest signal of fat loss when the scale stalls."
          table={{
            head: ['Date', `Waist (${lengthUnit(units)})`],
            rows: [...series].reverse().filter((s) => s.waist != null).map((s) => [fmtDate(s.date), s.waist!]),
          }}
        >
          <TimeSeries
            data={series.filter((s) => s.waist != null)}
            xKey="date"
            xTickFormatter={fmtDate}
            series={[{ key: 'waist', label: 'Waist', color: SERIES.s5, area: true }]}
            yDomain={niceDomain(series.map((s) => s.waist))}
          />
        </ChartFrame>
      )}
    </div>
  )
}

function History() {
  const { data, deleteBody } = useStore()
  const units = data.profile.units
  const wu = weightUnit(units)
  const lu = lengthUnit(units)
  const [open, setOpen] = useState<string | null>(null)
  const sorted = [...data.body].sort((a, b) => b.date.localeCompare(a.date))
  const selected = sorted.find((b) => b.id === open)

  if (sorted.length === 0) return <Empty title="No entries" body="Saved body metrics appear here." />

  return (
    <div className="space-y-2">
      {sorted.map((b) => {
        const est = b.bodyFatPct ?? navyBodyFat(b, data.profile)
        return (
          <button
            key={b.id}
            onClick={() => setOpen(b.id)}
            className="card w-full p-3.5 text-left transition hover:border-line-strong"
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="tabular text-sm font-medium">
                {b.weightLb ? `${round(dispWeight(b.weightLb, units), 1)} ${wu}` : '—'}
              </span>
              <span className="text-[11px] text-ink-3">{fmtDateFull(b.date)}</span>
            </div>
            <div className="tabular mt-1 flex flex-wrap gap-x-4 text-[11px] text-ink-2">
              {est != null && (
                <span>
                  {round(est, 1)}% fat{b.bodyFatPct == null ? ' (est.)' : ''}
                </span>
              )}
              {b.waistIn && (
                <span>
                  waist {round(dispLength(b.waistIn, units), 1)} {lu}
                </span>
              )}
              {b.restingHr && <span>{b.restingHr} bpm rest</span>}
            </div>
          </button>
        )
      })}

      <Sheet
        open={!!selected}
        onClose={() => setOpen(null)}
        title={selected ? fmtDateFull(selected.date) : ''}
        footer={
          selected && (
            <Button
              variant="danger"
              onClick={() => {
                if (confirm('Delete this entry?')) {
                  deleteBody(selected.id)
                  setOpen(null)
                }
              }}
            >
              Delete entry
            </Button>
          )
        }
      >
        {selected && (
          <div className="space-y-1">
            {selected.weightLb && <Row label="Weight" value={`${round(dispWeight(selected.weightLb, units), 1)} ${wu}`} />}
            {selected.bodyFatPct != null && <Row label="Body fat (measured)" value={`${round(selected.bodyFatPct, 1)}%`} />}
            {navyBodyFat(selected, data.profile) != null && (
              <Row label="Body fat (tape estimate)" value={`${round(navyBodyFat(selected, data.profile)!, 1)}%`} />
            )}
            {(['waistIn', 'neckIn', 'hipsIn', 'chestIn', 'armIn', 'thighIn', 'shouldersIn', 'calfIn', 'forearmIn'] as const).map((k) =>
              selected[k] ? (
                <Row
                  key={k}
                  label={k.replace('In', '').replace(/^./, (c) => c.toUpperCase())}
                  value={`${round(dispLength(selected[k]!, units), 1)} ${lu}`}
                />
              ) : null,
            )}
            {selected.restingHr && <Row label="Resting HR" value={`${selected.restingHr} bpm`} />}
            {selected.note && <p className="pt-2 text-xs text-ink-2 italic">{selected.note}</p>}
          </div>
        )}
      </Sheet>
    </div>
  )
}
