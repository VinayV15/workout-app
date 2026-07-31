import { useMemo } from 'react'
import { startPlannedSession, useStore } from '../lib/store'
import { Button, Card, Meter, SectionTitle, SeverityBadge, Stat, severityColor } from '../components/ui'
import { ChartFrame, SERIES, TimeSeries, niceDomain } from '../components/charts'
import { generateRecommendations, suggestToday, weeklyScore } from '../lib/recommend'
import {
  bmi,
  currentStreak,
  dispDistance,
  dispWeight,
  distanceUnit,
  ema,
  fmtDate,
  latestBodyFat,
  latestWeight,
  round,
  todayISO,
  weekStart,
  weightRateLbPerWeek,
  weightUnit,
  withinDays,
} from '../lib/calc'
import { MUSCLE_LABEL } from '../lib/types'

export default function Dashboard({
  onNavigate,
}: {
  onNavigate: (t: 'lift' | 'run' | 'body' | 'coach' | 'settings') => void
}) {
  const { data, sync, pendingChanges } = useStore()
  const units = data.profile.units
  const wu = weightUnit(units)

  const suggestion = useMemo(() => suggestToday(data), [data])
  const recs = useMemo(() => generateRecommendations(data), [data])
  const score = useMemo(() => weeklyScore(data), [data])

  // Resolved from the suggestion rather than recomputed, so the card can only ever
  // start the session it is actually displaying.
  const plan = suggestion.plan
  const block = plan ? data.programs.find((b) => b.id === plan.blockId) : undefined
  const day = block?.days.find((d) => d.id === plan?.dayId)

  const weight = latestWeight(data.body)
  const bf = latestBodyFat(data.body, data.profile)
  const rate = weightRateLbPerWeek(data.body)
  const streak = currentStreak(data)
  const bmiValue = weight && data.profile.heightIn ? bmi(weight.weightLb, data.profile.heightIn) : null

  // Weight series with an EMA trend overlay — the daily numbers are noisy,
  // the trend is the thing to act on.
  const weightSeries = useMemo(() => {
    const pts = data.body
      .filter((b) => b.weightLb)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-60)
    const trend = ema(pts, (p) => p.weightLb!, 0.25)
    return pts.map((p, i) => ({
      date: p.date,
      weight: round(dispWeight(p.weightLb!, units), 1),
      trend: round(dispWeight(trend[i], units), 1),
    }))
  }, [data.body, units])

  const topRecs = recs.filter((r) => r.severity !== 'good').slice(0, 3)
  const wins = recs.filter((r) => r.severity === 'good').slice(0, 2)

  const weekLifts = new Set(data.workouts.filter((w) => w.date >= weekStart(todayISO())).map((w) => w.date)).size
  const weekRuns = data.runs.filter((r) => r.date >= weekStart(todayISO())).length
  const weekMiles = withinDays(data.runs, 7).reduce((a, r) => a + r.distanceMi, 0)

  return (
    <div className="space-y-6">
      {/* Offline is expected in a basement gym — say so calmly, and confirm the
          work is saved and queued rather than implying something is broken. */}
      {sync.phase === 'offline' && (
        <div className="flex items-start gap-2 rounded-xl border border-line bg-surface-1 px-3 py-2.5 text-xs">
          <span aria-hidden className="text-ink-3">
            ◌
          </span>
          <span className="text-ink-2">
            <span className="font-medium text-ink">Offline.</span> Everything you log is saved on this device
            {pendingChanges > 0
              ? ` — ${pendingChanges} change${pendingChanges === 1 ? '' : 's'} will sync when you are back online.`
              : ' and will sync when you are back online.'}
          </span>
        </div>
      )}

      {/* A sync that has been failing quietly is worth surfacing — otherwise you
          carry on believing your devices are in step when they are not. */}
      {sync.phase === 'error' && (
        <button
          onClick={() => onNavigate('settings')}
          className="flex w-full items-start gap-2 rounded-xl border px-3 py-2.5 text-left text-xs"
          style={{ borderColor: 'color-mix(in oklab, var(--critical) 40%, transparent)' }}
        >
          <span aria-hidden style={{ color: 'var(--critical)' }}>
            ⚠
          </span>
          <span>
            <span className="font-medium">Sync is not working.</span>{' '}
            <span className="text-ink-2">
              Your log is safe on this device but is not reaching your others. Tap to see why.
            </span>
          </span>
        </button>
      )}

      {/* Today's session */}
      <section>
        <SectionTitle sub={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}>
          Today
        </SectionTitle>
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-[10px] font-semibold tracking-wider uppercase" style={{ color: 'var(--series-1)' }}>
                  {plan ? plan.blockName : suggestion.kind === 'rest' ? 'Recovery' : suggestion.kind === 'lift' ? 'Strength' : 'Running'}
                </span>
                {plan && (
                  <span className="text-[10px] text-ink-3">
                    week {plan.week}/{plan.weeks}
                  </span>
                )}
                {plan?.deload && (
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[9px] font-semibold tracking-wide uppercase"
                    style={{ color: 'var(--series-4)', background: 'color-mix(in oklab, var(--series-4) 14%, transparent)' }}
                  >
                    Deload
                  </span>
                )}
              </div>
              <h3 className="text-lg leading-snug font-semibold tracking-tight">{suggestion.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-2">{suggestion.detail}</p>

              {/* With a plan running, the prescribed loads are the point of the
                  card — a bare exercise list would send you to the Coach tab to
                  find the numbers you are about to lift. */}
              {plan && plan.prescriptions.length > 0 ? (
                <ul className="mt-3 space-y-1">
                  {plan.prescriptions.map((p) => (
                    <li key={p.slot.exerciseId} className="flex items-baseline justify-between gap-3 text-xs">
                      <span className="min-w-0 truncate text-ink-2">{p.exercise?.name ?? p.slot.exerciseId}</span>
                      <span className="tabular shrink-0 text-ink">
                        {p.sets} × {p.targetReps}
                        {p.loadLb != null && p.loadLb > 0 && (
                          <span className="text-ink-3">
                            {' '}
                            @ {round(dispWeight(p.loadLb, units), 1)} {wu}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                suggestion.exercises && (
                  <ul className="mt-3 grid gap-1 sm:grid-cols-2">
                    {suggestion.exercises.map((e) => (
                      <li key={e} className="flex items-center gap-1.5 text-xs text-ink-2">
                        <span aria-hidden className="text-ink-3">
                          ·
                        </span>
                        {e}
                      </li>
                    ))}
                  </ul>
                )
              )}

              {suggestion.run && (
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
                  {suggestion.run.distanceMi && (
                    <span>
                      <span className="text-ink-3">Distance </span>
                      {round(dispDistance(suggestion.run.distanceMi, units), 1)} {distanceUnit(units)}
                    </span>
                  )}
                  {suggestion.run.minutes && (
                    <span>
                      <span className="text-ink-3">Duration </span>
                      {suggestion.run.minutes} min
                    </span>
                  )}
                  {suggestion.run.paceHint && (
                    <span>
                      <span className="text-ink-3">Pace </span>
                      {suggestion.run.paceHint}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Everything stays available — the suggestion is a recommendation, not
              a restriction on what you can log. A plan adds a pre-filled shortcut
              in front of the usual buttons; it never removes one. */}
          <div className="mt-4 flex flex-wrap gap-2">
            {plan && block && day && (
              <Button
                variant="primary"
                // Its own row on a phone: a fourth button makes the row wrap, and
                // the ghost-styled one that lands alone underneath reads as a
                // stray link rather than an action.
                className="w-full sm:w-auto"
                onClick={() => {
                  const dest = startPlannedSession(data, block, day, plan.week)
                  if (dest) onNavigate(dest)
                }}
              >
                Start {suggestion.kind === 'run' ? 'this run' : 'this session'}
              </Button>
            )}
            <Button
              variant={!plan && suggestion.kind === 'lift' ? 'primary' : 'secondary'}
              onClick={() => onNavigate('lift')}
            >
              Log a lift
            </Button>
            <Button
              variant={!plan && suggestion.kind === 'run' ? 'primary' : 'secondary'}
              onClick={() => onNavigate('run')}
            >
              Log a run
            </Button>
            <Button variant="ghost" onClick={() => onNavigate('body')}>
              Log weight
            </Button>
          </div>

          {suggestion.muscles && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {suggestion.muscles.map((m) => (
                <span key={m} className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-ink-2">
                  {MUSCLE_LABEL[m]}
                </span>
              ))}
            </div>
          )}
        </Card>
      </section>

      {/* This week */}
      <section>
        <SectionTitle sub="Monday to today">This week</SectionTitle>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {score.map((s) => (
            <Stat key={s.label} label={s.label} value={s.value} sub={s.sub} />
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Card className="space-y-2">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-ink-2">Lifting days</span>
              <span className="tabular text-ink-3">
                {weekLifts} / {data.goals.liftDaysPerWeek}
              </span>
            </div>
            <Meter value={weekLifts} target={data.goals.liftDaysPerWeek} color={SERIES.s1} />
            <div className="flex items-baseline justify-between pt-1 text-xs">
              <span className="text-ink-2">Runs</span>
              <span className="tabular text-ink-3">
                {weekRuns} / {data.goals.runDaysPerWeek} · {round(dispDistance(weekMiles, units), 1)} {distanceUnit(units)}
              </span>
            </div>
            <Meter value={weekRuns} target={Math.max(1, data.goals.runDaysPerWeek)} color={SERIES.s3} />
          </Card>

          <div className="grid grid-cols-2 gap-2.5">
            <Stat
              label="Weight"
              value={weight ? round(dispWeight(weight.weightLb, units), 1) : '—'}
              unit={weight ? wu : undefined}
              delta={
                rate != null
                  ? `${rate > 0 ? '+' : ''}${round(dispWeight(rate, units), 2)} ${wu}/wk`
                  : undefined
              }
              deltaGood={
                rate == null
                  ? undefined
                  : data.goals.primary === 'muscle_gain'
                    ? rate > 0
                    : rate < 0
              }
              sub={weight ? fmtDate(weight.date) : 'not logged'}
            />
            <Stat
              label="Body fat"
              value={bf ? round(bf.pct, 1) : '—'}
              unit={bf ? '%' : undefined}
              sub={
                data.goals.targetBodyFatPct != null
                  ? `target ${data.goals.targetBodyFatPct}%`
                  : bf
                    ? fmtDate(bf.date)
                    : 'not logged'
              }
            />
            <Stat label="Streak" value={streak} unit={streak === 1 ? 'day' : 'days'} sub="with a session" />
            <Stat label="BMI" value={bmiValue ? round(bmiValue, 1) : '—'} sub={bmiValue ? 'from weight + height' : 'add height'} />
          </div>
        </div>
      </section>

      {/* Weight trend */}
      {weightSeries.length >= 2 && (
        <section>
          <ChartFrame
            title={`Bodyweight (${wu})`}
            sub="Individual weigh-ins with a smoothed trend. Judge progress by the trend line, never a single day."
            legend={[
              { label: 'Weigh-in', color: SERIES.muted },
              { label: 'Trend', color: SERIES.s1 },
            ]}
            table={{
              head: ['Date', `Weight (${wu})`, `Trend (${wu})`],
              rows: [...weightSeries].reverse().map((p) => [fmtDate(p.date), p.weight, p.trend]),
            }}
          >
            <TimeSeries
              data={weightSeries}
              xKey="date"
              xTickFormatter={fmtDate}
              series={[
                { key: 'weight', label: 'Weigh-in', color: SERIES.muted },
                { key: 'trend', label: 'Trend', color: SERIES.s1, area: true },
              ]}
              yDomain={niceDomain([
                ...weightSeries.map((p) => p.weight),
                ...weightSeries.map((p) => p.trend),
                data.goals.targetWeightLb ? dispWeight(data.goals.targetWeightLb, units) : null,
              ])}
              refLines={
                data.goals.targetWeightLb
                  ? [{ y: round(dispWeight(data.goals.targetWeightLb, units), 1), color: SERIES.good, label: 'Target' }]
                  : undefined
              }
            />
          </ChartFrame>
        </section>
      )}

      {/* Coach highlights */}
      <section>
        <SectionTitle
          sub="The highest-leverage changes right now"
          action={
            <button onClick={() => onNavigate('coach')} className="text-xs text-ink-3 hover:text-ink">
              All {recs.length} →
            </button>
          }
        >
          Focus
        </SectionTitle>
        {topRecs.length === 0 && wins.length === 0 ? (
          <Card>
            <p className="text-xs text-ink-2">
              Log a few sessions and a weigh-in and the coach will start telling you what to change.
            </p>
          </Card>
        ) : (
          <div className="space-y-2.5">
            {topRecs.map((r) => (
              <Card key={r.id} className="border-l-2" >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm leading-snug font-semibold">{r.title}</h3>
                  <SeverityBadge severity={r.severity} />
                </div>
                <p className="mt-1 text-xs text-ink-2">{r.detail}</p>
                {r.action && (
                  <p className="mt-2 text-xs" style={{ color: severityColor(r.severity) }}>
                    → {r.action}
                  </p>
                )}
              </Card>
            ))}
            {wins.map((r) => (
              <div key={r.id} className="flex items-start gap-2 px-1 text-xs text-ink-2">
                <span aria-hidden style={{ color: 'var(--good)' }}>
                  ✓
                </span>
                <span>
                  <span className="font-medium text-ink">{r.title}.</span> {r.detail}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
