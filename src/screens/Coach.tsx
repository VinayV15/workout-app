import { useMemo, useState } from 'react'
import { useStore } from '../lib/store'
import { Button, Card, Chip, SectionTitle, SeverityBadge, severityColor } from '../components/ui'
import { TargetBars } from '../components/charts'
import { generateRecommendations, suggestToday, volumeBar, volumeTargets, type RecTag } from '../lib/recommend'
import { GOAL_LABEL } from '../lib/types'
import { nutritionTargets, todayISO, weekStart } from '../lib/calc'

const TAG_LABEL: Record<RecTag, string> = {
  strength: 'Strength',
  running: 'Running',
  body: 'Body comp',
  nutrition: 'Nutrition',
  recovery: 'Recovery',
  habit: 'Consistency',
}

export default function Coach() {
  const { data, dismiss } = useStore()
  const [filter, setFilter] = useState<RecTag | 'all'>('all')

  const recs = useMemo(() => generateRecommendations(data), [data])
  const targets = useMemo(() => volumeTargets(data), [data])
  const today = useMemo(() => suggestToday(data), [data])
  const nut = useMemo(() => nutritionTargets(data), [data])

  const filtered = filter === 'all' ? recs : recs.filter((r) => r.tag === filter)
  const counts = recs.reduce<Record<string, number>>((acc, r) => {
    acc[r.tag] = (acc[r.tag] ?? 0) + 1
    return acc
  }, {})

  const volumeRows = targets
    .filter((t) => t.target > 0)
    .sort((a, b) => b.deficit - a.deficit)
    .slice(0, 6)
    .map(volumeBar)

  return (
    <div className="space-y-6">
      <section>
        <SectionTitle sub={`Everything below is derived from your logs, weighed against your goal: ${GOAL_LABEL[data.goals.primary].toLowerCase()}`}>
          Coach
        </SectionTitle>

        <Card className="mb-4">
          <div className="mb-1 text-[10px] font-semibold tracking-wider uppercase" style={{ color: 'var(--series-1)' }}>
            Next session
          </div>
          <h3 className="text-base font-semibold tracking-tight">{today.title}</h3>
          <p className="mt-1 text-xs leading-relaxed text-ink-2">{today.detail}</p>
          {today.exercises && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {today.exercises.map((e) => (
                <span key={e} className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] text-ink-2">
                  {e}
                </span>
              ))}
            </div>
          )}
        </Card>

        <div className="no-scrollbar -mx-4 mb-3 flex gap-1.5 overflow-x-auto px-4">
          <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
            All {recs.length}
          </Chip>
          {(Object.keys(TAG_LABEL) as RecTag[]).map((t) => (
            <Chip key={t} active={filter === t} onClick={() => setFilter(t)}>
              {TAG_LABEL[t]} {counts[t] ?? 0}
            </Chip>
          ))}
        </div>

        {filtered.length === 0 ? (
          <Card>
            <p className="text-xs text-ink-2">
              Nothing flagged here. Keep logging — recommendations sharpen as more data accumulates.
            </p>
          </Card>
        ) : (
          <div className="space-y-2.5">
            {filtered.map((r) => (
              <Card key={r.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="mb-1 text-[10px] font-medium tracking-wider text-ink-3 uppercase">
                      {TAG_LABEL[r.tag]}
                    </div>
                    <h3 className="text-sm leading-snug font-semibold">{r.title}</h3>
                  </div>
                  <SeverityBadge severity={r.severity} />
                </div>

                <p className="mt-1.5 text-xs leading-relaxed text-ink-2">{r.detail}</p>

                <p className="mt-2 border-l-2 pl-2.5 text-xs leading-relaxed text-ink-2" style={{ borderColor: 'var(--border-strong)' }}>
                  {r.why}
                </p>

                {r.action && (
                  <p className="mt-2.5 text-xs leading-relaxed font-medium" style={{ color: severityColor(r.severity) }}>
                    → {r.action}
                  </p>
                )}

                {r.severity !== 'good' && (
                  <div className="mt-3 flex justify-end">
                    <Button variant="ghost" className="px-2 py-1 text-[11px]" onClick={() => dismiss(r.id, weekStart(todayISO()))}>
                      Hide for this week
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle sub="Weekly sets per muscle group against the target for your goal">Where to add work</SectionTitle>
        <Card>
          {volumeRows.length > 0 ? (
            <TargetBars rows={volumeRows} />
          ) : (
            <p className="text-xs text-ink-2">Log some lifting sessions and this fills in.</p>
          )}
        </Card>
      </section>

      {nut && (
        <section>
          <SectionTitle sub="Recalculated from your latest weight, body fat and training load">Daily nutrition</SectionTitle>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {[
              { label: 'Calories', value: nut.target.toLocaleString(), sub: `maintenance ${nut.maintenance.toLocaleString()}` },
              { label: 'Protein', value: `${nut.proteinG}g`, sub: 'the priority' },
              { label: 'Fat', value: `${nut.fatG}g`, sub: 'minimum for hormones' },
              { label: 'Carbs', value: `${nut.carbG}g`, sub: 'fuel around training' },
            ].map((s) => (
              <div key={s.label} className="card p-3">
                <div className="text-[11px] text-ink-3">{s.label}</div>
                <div className="mt-1 text-xl font-semibold tracking-tight">{s.value}</div>
                <div className="mt-0.5 text-[11px] text-ink-3">{s.sub}</div>
              </div>
            ))}
          </div>
          <p className="mt-2.5 px-1 text-[11px] leading-relaxed text-ink-3">
            {nut.rationale} These are estimates from your logged data — if the trend on the Body tab disagrees with the
            numbers here for two consecutive weeks, trust the trend and let the coach adjust.
          </p>
        </section>
      )}

      <section>
        <SectionTitle sub="How the coaching works">Method</SectionTitle>
        <Card>
          <div className="space-y-2 text-xs leading-relaxed text-ink-2">
            <p>
              <span className="font-medium text-ink">Volume targets</span> come from your goal and the number of lifting
              days you train, then get scaled so the total is something you can actually finish. Sets count fully for the
              muscles a lift trains directly and half for assisting muscles.
            </p>
            <p>
              <span className="font-medium text-ink">Strength progress</span> is tracked as estimated one-rep max from
              your best set each session, so a heavy triple and a set of ten are comparable. A flat six-week trend is read
              differently depending on whether you are in a deficit.
            </p>
            <p>
              <span className="font-medium text-ink">Running load</span> uses the acute-to-chronic workload ratio — this
              week's distance over your four-week average. Between 0.8 and 1.3 builds fitness; above that is where
              injuries cluster.
            </p>
            <p>
              <span className="font-medium text-ink">Body composition</span> decisions use a trend line fitted through all
              your weigh-ins rather than the latest number, and compare it to a target rate of 0.5–1% of bodyweight per
              week for fat loss.
            </p>
            <p>
              <span className="font-medium text-ink">Nutrition</span> starts from Mifflin–St Jeor plus your logged
              training, then adjusts on what your weight trend actually does.
            </p>
          </div>
        </Card>
      </section>
    </div>
  )
}
