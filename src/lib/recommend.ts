import type { AppData, Muscle, Run } from './types'
import { HARD_RUN_TYPES, MUSCLE_LABEL, MUSCLES } from './types'
import { EXERCISES, exerciseMap } from './exercises'
import {
  activeBlock,
  blockEndDate,
  blockWeek,
  dayMuscles,
  isDeload,
  nextDay,
  prescribeDay,
  weekProgress,
  type Prescription,
} from './program'
import {
  acwr,
  addDays,
  bestVdot,
  bodyweightOn,
  consecutiveTrainingDays,
  daysAgo,
  dispDistance,
  dispWeight,
  distanceUnit,
  exerciseHistory,
  fmtDuration,
  intensityDistribution,
  lastTrained,
  latestBodyFat,
  latestWeight,
  longestRun,
  muscleFrequency,
  muscleSetVolume,
  nutritionTargets,
  patternBalance,
  projectGoal,
  riegel,
  round,
  describeWindow,
  leanTrend,
  strengthTrendFit,
  targetWeeklyRate,
  todayISO,
  trainingPaces,
  vdot,
  volumeLoad,
  weekStart,
  weightTrend,
  weeklyMileage,
  weightUnit,
  withinDays,
  workingSets,
} from './calc'

export type Severity = 'critical' | 'serious' | 'warning' | 'info' | 'good'
export type RecTag = 'strength' | 'running' | 'body' | 'nutrition' | 'recovery' | 'habit'

export interface Recommendation {
  id: string
  tag: RecTag
  severity: Severity
  /** The headline instruction. */
  title: string
  /** What the data says. */
  detail: string
  /** Why it matters — the coaching rationale. */
  why: string
  /** Concrete next action. */
  action?: string
  /** Sort weight; higher first. */
  priority: number
}

const SEVERITY_WEIGHT: Record<Severity, number> = {
  critical: 500,
  serious: 400,
  warning: 300,
  info: 150,
  good: 100,
}

// ---------------------------------------------------------------------------
// Weekly volume targets
// ---------------------------------------------------------------------------

/** Baseline weekly working-set targets for a hypertrophy-focused block. */
const BASE_TARGETS: Record<Muscle, number> = {
  chest: 14,
  lats: 14,
  upper_back: 12,
  shoulders: 12,
  rear_delts: 8,
  biceps: 10,
  triceps: 10,
  quads: 14,
  hamstrings: 12,
  glutes: 10,
  calves: 8,
  core: 8,
}

/** Goal multipliers applied to the baseline. */
const GOAL_VOLUME_FACTOR: Record<AppData['goals']['primary'], number> = {
  muscle_gain: 1.0,
  recomp: 0.95,
  // In a deficit, recovery is limited: hold enough volume to keep muscle
  // (the "maintenance" end of the range) rather than chase growth.
  fat_loss: 0.8,
  strength: 0.85,
  endurance: 0.6,
}

export interface VolumeTarget {
  muscle: Muscle
  actual: number
  target: number
  deficit: number
  frequency: number
  lastTrainedDays: number | null
}

/**
 * Weekly set targets per muscle for the current goal, scaled so the total is
 * achievable in the number of lifting days the user actually trains — advice
 * that needs 6 sessions is useless to someone who trains 3.
 */
export function volumeTargets(data: AppData): VolumeTarget[] {
  const factor = GOAL_VOLUME_FACTOR[data.goals.primary]
  const focus = new Set(data.goals.focusMuscles)
  const raw = MUSCLES.reduce((acc, m) => {
    acc[m] = BASE_TARGETS[m] * factor * (focus.has(m) ? 1.25 : 1)
    return acc
  }, {} as Record<Muscle, number>)

  // Capacity ceiling. About 19 hard sets a session is the practical limit, and
  // those sets also generate roughly 40% again in assisting-muscle credit — so
  // in the fractional units used on both sides of this comparison, a session is
  // worth around 27 counted sets. Without that conversion the targets would sit
  // on a different scale from the measured volume they are compared against.
  const capacity = Math.max(1, data.goals.liftDaysPerWeek) * 27
  const totalRaw = MUSCLES.reduce((a, m) => a + raw[m], 0)
  const scale = totalRaw > capacity ? capacity / totalRaw : 1

  // Average of the last 2 complete-ish weeks, so a single missed day doesn't
  // read as a collapse in volume.
  const recent = withinDays(data.workouts, 14)
  const vol = muscleSetVolume(recent, data.customExercises)
  const freq = muscleFrequency(withinDays(data.workouts, 7), data.customExercises)
  const last = lastTrained(data.workouts, data.customExercises)

  return MUSCLES.map((m) => {
    const target = round(raw[m] * scale, 1)
    const actual = round(vol[m] / 2, 1) // per-week average over the 14-day window
    return {
      muscle: m,
      actual,
      target,
      deficit: round(target - actual, 1),
      frequency: freq[m],
      lastTrainedDays: last[m] ? daysAgo(last[m]!) : null,
    }
  })
}

/**
 * Presentation of one volume target: colour plus a short text note, so the
 * state never rides on colour alone.
 */
export function volumeBar(t: VolumeTarget): {
  label: string
  value: number
  target: number
  color: string
  note?: string
} {
  const short = t.deficit >= 3
  const high = t.actual >= t.target * 1.6 && t.actual >= 18
  return {
    label: MUSCLE_LABEL[t.muscle],
    value: t.actual,
    target: t.target,
    color: short ? 'var(--warning)' : high ? 'var(--series-2)' : 'var(--series-1)',
    note: short
      ? `${Math.ceil(t.deficit)} short`
      : high
        ? 'above target'
        : t.lastTrainedDays != null && t.lastTrainedDays > 9
          ? `${t.lastTrainedDays}d ago`
          : t.lastTrainedDays == null
            ? 'never'
            : undefined,
  }
}

/** Two or three exercise suggestions that hit a given muscle directly. */
export function suggestExercisesFor(muscle: Muscle, n = 3): string[] {
  const direct = EXERCISES.filter((e) => e.primary.includes(muscle))
  // Prefer isolation/machine work for lagging muscles — easier to add without
  // adding systemic fatigue.
  const ranked = [
    ...direct.filter((e) => e.pattern === 'isolation'),
    ...direct.filter((e) => e.pattern !== 'isolation'),
  ]
  return ranked.slice(0, n).map((e) => e.name)
}

// ---------------------------------------------------------------------------
// The engine
// ---------------------------------------------------------------------------

export function generateRecommendations(data: AppData): Recommendation[] {
  const recs: Recommendation[] = []
  const push = (r: Recommendation) => recs.push(r)
  const units = data.profile.units
  const du = distanceUnit(units)
  const goal = data.goals.primary
  const cuttingGoal = goal === 'fat_loss' || goal === 'recomp'

  const weight = latestWeight(data.body)
  const bf = latestBodyFat(data.body, data.profile)
  const rateFit = weightTrend(data.body)
  const rate = rateFit?.perWeek ?? null
  const targetRate = targetWeeklyRate(data)
  const nut = nutritionTargets(data)

  const lifts28 = withinDays(data.workouts, 28)
  const vols = volumeTargets(data)
  const balance = patternBalance(withinDays(data.workouts, 21), data.customExercises)
  const load = acwr(data.runs)
  const dist = intensityDistribution(data.runs)
  const weekly = weeklyMileage(data.runs, 6)

  // ---- Setup & data hygiene ---------------------------------------------
  if (!data.profile.heightIn || !data.profile.birthDate) {
    push({
      id: 'profile_incomplete',
      tag: 'habit',
      severity: 'warning',
      title: 'Finish your profile',
      detail: 'Height and date of birth are missing.',
      why: 'BMI, the Navy body-fat estimate and your calorie targets all depend on height, age and sex. Without them the coach is working half blind.',
      action: 'Open Settings and fill in height and birth date.',
      priority: 320,
    })
  }

  if (data.body.length === 0) {
    push({
      id: 'no_body_data',
      tag: 'body',
      severity: 'serious',
      title: 'Log your starting body metrics',
      detail: 'No weight or body-fat entries yet.',
      why: 'Fat loss is the primary goal, and it is the one thing you cannot manage without measuring. A weekly weigh-in plus a monthly tape measurement is enough.',
      action: 'Add an entry on the Body tab: weight, and waist + neck for a body-fat estimate.',
      priority: 450,
    })
  } else if (weight && daysAgo(weight.date) > 10) {
    push({
      id: 'stale_weigh_in',
      tag: 'body',
      severity: 'warning',
      title: 'Weigh in again',
      detail: `Last weigh-in was ${daysAgo(weight.date)} days ago.`,
      why: 'Rate of change is what drives every nutrition decision here, and it needs at least three data points a month to be trustworthy.',
      action: 'Weigh yourself first thing tomorrow morning and log it.',
      priority: 300,
    })
  }

  const anySessions = data.workouts.length + data.runs.length
  const daysSinceAnything = (() => {
    const dates = [...data.workouts.map((w) => w.date), ...data.runs.map((r) => r.date)].sort()
    return dates.length ? daysAgo(dates[dates.length - 1]) : null
  })()

  if (anySessions > 0 && daysSinceAnything !== null && daysSinceAnything >= 7) {
    push({
      id: 'inactive',
      tag: 'habit',
      severity: 'serious',
      title: 'Get one session in today',
      detail: `Nothing logged for ${daysSinceAnything} days.`,
      why: 'Layoffs cost strength and aerobic fitness within about two weeks, and the hardest session of any block is the one that restarts it. Make the return deliberately easy so it happens.',
      action: 'Do a short full-body session at 70% of your usual loads, or an easy 20-minute run. Ignore the numbers; just restart the habit.',
      priority: 430,
    })
  }

  // ---- Nutrition & rate of change ---------------------------------------
  if (nut) {
    push({
      id: 'nutrition_targets',
      tag: 'nutrition',
      severity: 'info',
      title: `Eat about ${nut.target.toLocaleString()} kcal and ${nut.proteinG}g protein per day`,
      detail: `Estimated maintenance ${nut.maintenance.toLocaleString()} kcal (${nut.deficitSurplus >= 0 ? '+' : ''}${nut.deficitSurplus} adjustment). Suggested split: ${nut.proteinG}g protein · ${nut.fatG}g fat · ${nut.carbG}g carbs.`,
      why: nut.rationale,
      action: 'Treat the protein number as the non-negotiable one — hit it every day, and let calories average out across the week.',
      priority: 200,
    })
  }

  if (rate != null && targetRate && weight) {
    const pctPerWeek = (rate / weight.weightLb) * 100
    const tooFast = rate < targetRate.min - 0.15
    const tooSlow = rate > targetRate.max + 0.15
    const fmtRate = `${rate > 0 ? '+' : ''}${round(rate, 2)} lb/week (${round(pctPerWeek, 2)}% of bodyweight)`
    // Naming the window matters when it is not the standard one: a rate quoted as a
    // 4-week trend that was actually fitted over 11 weeks is a lie, and refusing to
    // report anything because 4 weeks held two weigh-ins throws away a good answer.
    const over = rateFit ? `Trailing ${describeWindow(rateFit)}` : 'Recent trend'
    const sparse = rateFit?.widened
      ? ` Fitted over ${describeWindow(rateFit)} rather than the usual 4 — there were not enough weigh-ins in the last month to trust a shorter fit.`
      : ''

    if (cuttingGoal && tooFast) {
      push({
        id: 'losing_too_fast',
        tag: 'nutrition',
        severity: 'serious',
        title: 'Slow the weight loss down',
        detail: `You are losing ${fmtRate}. The productive range for you is ${round(Math.abs(targetRate.max), 2)}–${round(Math.abs(targetRate.min), 2)} lb/week.`,
        why: 'Past roughly 1% of bodyweight per week, an increasing share of what you lose is muscle rather than fat, and training performance drops off — which then costs you more muscle. You want to arrive at your goal weight with your lifts intact.',
        action: `Add roughly ${Math.min(400, Math.round(Math.abs(rate - targetRate.min) * 500))} kcal a day, mostly carbohydrate around training.`,
        priority: 420,
      })
    } else if (cuttingGoal && tooSlow) {
      const flat = Math.abs(pctPerWeek) < 0.15
      push({
        id: flat ? 'fat_loss_stalled' : 'losing_too_slow',
        tag: 'nutrition',
        severity: 'warning',
        title: flat ? 'Fat loss has stalled' : 'Fat loss is slower than target',
        detail: `${over} trend is ${fmtRate}.${sparse}`,
        why: 'A stall almost always means intake has crept up to meet the new, lower maintenance of a lighter body — not that metabolism is broken. Energy expenditure also falls as you lose weight, so the deficit has to be re-set periodically.',
        action: `Drop about ${Math.round((nut?.target ?? 2200) * 0.1)} kcal a day, or add 2,000–3,000 daily steps. Change one lever, then hold it for two weeks before judging.`,
        priority: 340,
      })
    } else if (goal === 'muscle_gain' && rate < targetRate.min - 0.1) {
      push({
        id: 'not_gaining',
        tag: 'nutrition',
        severity: 'warning',
        title: 'Eat more to keep gaining',
        detail: `Weight trend is ${fmtRate}; target is +${round(targetRate.min, 2)} to +${round(targetRate.max, 2)} lb/week.`,
        why: 'Muscle needs a small energy surplus. Without weight moving up over months, new tissue is being built slowly at best.',
        action: 'Add roughly 250 kcal a day and re-check in two weeks.',
        priority: 330,
      })
    } else {
      push({
        id: 'rate_on_track',
        tag: 'nutrition',
        severity: 'good',
        title: 'Rate of change is right where it should be',
        detail: `${over} trend is ${fmtRate}, inside the target band.${sparse}`,
        why: 'This is the pace that maximises fat loss while protecting lean mass. The only correct move is to keep doing exactly this.',
        action: 'Change nothing. Re-evaluate in two weeks.',
        priority: 120,
      })
    }
  }

  const leanFit = leanTrend(data.body, data.profile)
  const leanRate = leanFit?.perWeek ?? null
  if (leanRate != null && leanRate < -0.2 && cuttingGoal) {
    push({
      id: 'losing_lean_mass',
      tag: 'nutrition',
      severity: 'serious',
      title: 'You are losing lean mass, not just fat',
      detail: `Estimated lean mass is trending ${round(leanRate, 2)} lb/week, fitted over ${describeWindow(leanFit!)}.`,
      why: 'Losing lean tissue in a deficit means one of three things is short: protein, resistance-training stimulus, or the deficit is too aggressive. Muscle is what keeps your metabolic rate up and defines how you look at the finish — it is much harder to rebuild than fat is to re-lose.',
      action: `Hit ${nut?.proteinG ?? 180}g protein daily, keep at least two heavy sets (5–8 reps) per major lift each week, and ease the deficit by ~200 kcal.`,
      priority: 410,
    })
  }

  if (bf && data.goals.targetBodyFatPct != null && bf.pct <= data.goals.targetBodyFatPct + 0.5) {
    push({
      id: 'bf_goal_reached',
      tag: 'body',
      severity: 'good',
      title: 'Body-fat goal reached',
      detail: `You are at ${round(bf.pct, 1)}% against a target of ${data.goals.targetBodyFatPct}%.`,
      why: 'Holding a new leaner bodyweight for a few months before the next phase is what makes it stick. This is also the best possible moment to shift into a muscle-gain phase.',
      action: 'Set a new goal in Settings — either maintain, or switch to muscle gain at a small surplus.',
      priority: 380,
    })
  }

  const proj = projectGoal(data)
  if (proj) {
    push({
      id: 'projection',
      tag: 'body',
      severity: 'info',
      title: `On pace to hit your target in about ${Math.round(proj.weeks)} weeks`,
      detail: `At the current trend that lands around ${new Date(proj.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })}.`,
      why: 'Projections assume the current rate holds. It usually will not — expenditure drops as you get lighter — so expect to re-set the deficit once or twice along the way.',
      priority: 160,
    })
  }

  // ---- Strength volume --------------------------------------------------
  if (lifts28.length > 0) {
    const lagging = vols
      .filter((v) => v.deficit >= 3 && v.target >= 4)
      .sort((a, b) => b.deficit - a.deficit)
      .slice(0, 3)

    for (const v of lagging) {
      const neglected = v.lastTrainedDays == null || v.lastTrainedDays > 14
      push({
        id: `low_volume_${v.muscle}`,
        tag: 'strength',
        severity: neglected ? 'serious' : 'warning',
        title: `Add ${Math.ceil(v.deficit)} weekly sets for ${MUSCLE_LABEL[v.muscle].toLowerCase()}`,
        detail: neglected
          ? `${MUSCLE_LABEL[v.muscle]} has had no direct work in ${v.lastTrainedDays == null ? 'your logged history' : `${v.lastTrainedDays} days`}. Target is ${v.target} sets/week.`
          : `Averaging ${v.actual} sets/week against a target of ${v.target}.`,
        why: `Around ${Math.round(v.target)} hard sets a week is the productive range for ${MUSCLE_LABEL[v.muscle].toLowerCase()} at your current goal and training frequency. Under about 6 sets is maintenance at best, and a muscle that gets no direct work at all is the one that visibly falls behind.`,
        action: `Add 2 sets of ${suggestExercisesFor(v.muscle, 2).join(' or ')} to your next two sessions, then hold it there.`,
        priority: (neglected ? 400 : 300) + v.deficit,
      })
    }

    const overVolume = vols.filter((v) => v.actual > v.target * 1.6 && v.actual >= 18)
    if (overVolume.length >= 2) {
      push({
        id: 'volume_too_high',
        tag: 'recovery',
        severity: 'warning',
        title: 'Volume is running ahead of what you can recover from',
        detail: `${overVolume.map((v) => MUSCLE_LABEL[v.muscle]).slice(0, 3).join(', ')} are all well above target set counts.`,
        why: cuttingGoal
          ? 'In a calorie deficit your recovery capacity is reduced, so extra sets stop paying and start interfering. Junk volume costs sleep, joints and the quality of the sets that matter.'
          : 'Past a certain point extra sets add fatigue faster than stimulus. Quality of the hard sets beats quantity.',
        action: 'Cut the least productive 20% of sets — usually the third and fourth isolation movement at the end of a session — and push harder on what remains.',
        priority: 290,
      })
    }

    const splitCandidates = vols.filter((v) => v.actual >= 9 && v.frequency <= 1)
    if (splitCandidates.length) {
      push({
        id: 'frequency_low',
        tag: 'strength',
        severity: 'warning',
        title: 'Spread your volume across more days',
        detail: `${splitCandidates.map((v) => MUSCLE_LABEL[v.muscle]).slice(0, 3).join(', ')} get all their sets in a single session.`,
        why: 'Muscle protein synthesis stays elevated for roughly 48 hours after training a muscle. Training each group twice a week produces more growth than the same total sets crammed into one day, and the later sets in a long session are lower quality anyway.',
        action: 'Split those sets across two sessions — an upper/lower or push/pull/legs rotation does this automatically.',
        priority: 285,
      })
    }

    if (balance.push > 0 && balance.pull > 0) {
      const ratio = balance.push / balance.pull
      if (ratio > 1.3) {
        push({
          id: 'push_pull_imbalance',
          tag: 'strength',
          severity: 'warning',
          title: 'Add pulling volume',
          detail: `Last 3 weeks: ${Math.round(balance.push)} pushing sets vs ${Math.round(balance.pull)} pulling sets (${round(ratio, 2)}:1).`,
          why: 'A press-heavy diet of training pulls the shoulders forward and is the most common route to cranky shoulders and a stalled bench. Pulling at least as much as you press keeps the shoulder joint balanced, and back thickness is what makes a lean physique look built.',
          action: 'Add one row or pulldown movement, 3 sets, to each upper-body session until the ratio is at least 1:1.',
          priority: 295,
        })
      } else if (ratio < 0.7) {
        push({
          id: 'pull_push_imbalance',
          tag: 'strength',
          severity: 'info',
          title: 'Pressing volume is low relative to pulling',
          detail: `Last 3 weeks: ${Math.round(balance.push)} pushing sets vs ${Math.round(balance.pull)} pulling sets.`,
          why: 'Pull-dominant training is a much smaller problem than the reverse, but chest and shoulders need direct work to develop.',
          action: 'Add 2–3 sets of a horizontal press to your next upper session.',
          priority: 210,
        })
      }
    }

    if (balance.lower > 0 && balance.upper > 0) {
      const ratio = balance.upper / balance.lower
      if (ratio > 2.5) {
        push({
          id: 'legs_neglected',
          tag: 'strength',
          severity: 'warning',
          title: 'Train legs harder',
          detail: `Upper-body sets outnumber lower-body sets ${round(ratio, 1)}:1 over the last 3 weeks.`,
          why: 'Your legs and glutes are the largest muscle mass you own. Training them drives the biggest total energy expenditure and the biggest hormonal and metabolic response, which is exactly what a fat-loss phase needs. Skipping them is the most common way to leave results on the table.',
          action: 'Commit to one dedicated lower-body session per week: a squat pattern, a hinge pattern, and one single-leg movement.',
          priority: 310,
        })
      } else if (ratio < 0.5) {
        push({
          id: 'upper_neglected',
          tag: 'strength',
          severity: 'info',
          title: 'Upper-body volume is light',
          detail: `Lower-body sets outnumber upper-body sets ${round(1 / ratio, 1)}:1.`,
          why: 'Balanced development needs comparable attention above and below the waist.',
          action: 'Add an upper-body push and pull session this week.',
          priority: 205,
        })
      }
    }

    // Rep-range distribution
    const allSets = lifts28.flatMap((w) => w.exercises.flatMap((e) => workingSets(e.sets)))
    if (allSets.length >= 20) {
      const heavy = allSets.filter((s) => s.reps <= 5).length / allSets.length
      const light = allSets.filter((s) => s.reps >= 16).length / allSets.length
      if (heavy > 0.6 && goal !== 'strength') {
        push({
          id: 'rep_range_heavy',
          tag: 'strength',
          severity: 'info',
          title: 'Add some moderate-rep work',
          detail: `${Math.round(heavy * 100)}% of your sets are 5 reps or fewer.`,
          why: 'Growth happens across a wide rep range, but accumulating enough hard sets purely in the 1–5 range is punishing on joints and connective tissue — especially in a deficit. Sets of 8–15 buy volume much more cheaply.',
          action: 'Keep your first movement heavy, then run everything after it in the 8–15 range.',
          priority: 215,
        })
      } else if (light > 0.6 && (goal === 'muscle_gain' || goal === 'strength' || goal === 'recomp')) {
        push({
          id: 'rep_range_light',
          tag: 'strength',
          severity: 'info',
          title: 'Add heavier sets',
          detail: `${Math.round(light * 100)}% of your sets are 16+ reps.`,
          why: 'High-rep work grows muscle when taken close to failure, but heavier sets of 5–8 build the strength that lets you add load over months, and they are the clearest signal that you are keeping muscle in a deficit.',
          action: 'Open each session with a compound lift for 3 sets of 5–8 at a hard but clean load.',
          priority: 215,
        })
      }
    }

    // Session RPE trend
    const rpes = lifts28
      .filter((w) => w.rpe != null)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 6)
      .map((w) => w.rpe!)
    if (rpes.length >= 4) {
      const avg = rpes.reduce((a, b) => a + b, 0) / rpes.length
      if (avg >= 9) {
        push({
          id: 'deload',
          tag: 'recovery',
          severity: 'warning',
          title: 'Take a deload week',
          detail: `Your last ${rpes.length} sessions averaged RPE ${round(avg, 1)}.`,
          why: 'Sustained maximal effort with no easy weeks accumulates fatigue faster than it builds fitness, and the first symptom is a plateau that looks like a programming problem. A planned light week resolves it in seven days; an injury takes months.',
          action: 'This week: same exercises, same loads, but two-thirds of the sets and stop every set 3 reps short of failure.',
          priority: 305,
        })
      }
    }

    // Consistency vs the goal
    const liftWeeks = 3
    const liftDays = new Set(withinDays(data.workouts, liftWeeks * 7).map((w) => w.date)).size
    const perWeek = liftDays / liftWeeks
    if (perWeek < data.goals.liftDaysPerWeek - 0.7) {
      push({
        id: 'lift_consistency',
        tag: 'habit',
        severity: 'warning',
        title: 'Hit your lifting days',
        detail: `Averaging ${round(perWeek, 1)} lifting days a week against a target of ${data.goals.liftDaysPerWeek}.`,
        why: 'Resistance training is the single strongest signal telling your body to keep muscle while you lose fat. Frequency matters more than any individual session being perfect.',
        action: `Put ${data.goals.liftDaysPerWeek} fixed slots in your calendar this week and treat a 25-minute abbreviated session as a success rather than a skip.`,
        priority: 315,
      })
    }
  }

  // ---- Per-lift progression --------------------------------------------
  const trackedIds = new Set(data.workouts.flatMap((w) => w.exercises.map((e) => e.exerciseId)))
  const stalled: { name: string; trend: number; days: number }[] = []
  const improving: { name: string; trend: number }[] = []
  for (const id of trackedIds) {
    const hist = exerciseHistory(id, data)
    const recentSessions = hist.filter((h) => h.date >= addDays(todayISO(), -42))
    if (recentSessions.length < 3) continue
    const fit = strengthTrendFit(hist)
    if (fit == null) continue
    const trend = fit.perWeek
    const name = EXERCISES.find((e) => e.id === id)?.name ?? data.customExercises.find((e) => e.id === id)?.name ?? id
    if (trend <= 0.05) stalled.push({ name, trend, days: fit.days })
    else if (trend >= 0.6) improving.push({ name, trend })
  }

  if (stalled.length) {
    const worst = stalled.sort((a, b) => a.trend - b.trend).slice(0, 3)
    const window = Math.max(...stalled.map((s) => s.days))
    push({
      id: 'stalled_lifts',
      tag: 'strength',
      severity: cuttingGoal ? 'info' : 'warning',
      title: cuttingGoal ? 'Strength is flat — acceptable in a deficit, but watch it' : 'Break through a stall',
      detail: `No estimated-1RM progress in ${Math.round(window / 7)} weeks on ${worst.map((s) => s.name).join(', ')}.`,
      why: cuttingGoal
        ? 'Maintaining strength while losing fat is a win, not a failure — you are getting stronger per pound. What is not acceptable is strength actually falling, which means muscle is going with the fat.'
        : 'A stall on a lift for six weeks usually means the same load, the same rep target and the same order every session. Progress needs one variable to move: load, reps, or how close to failure the last set gets.',
      action: cuttingGoal
        ? 'Hold your top-set loads and let reps fluctuate. If loads start dropping, ease the deficit before adjusting training.'
        : 'For each stalled lift: drop to 85% of your top load for a week, then rebuild adding 1 rep per set each session until you exceed the old top set.',
      priority: cuttingGoal ? 190 : 300,
    })
  }

  if (improving.length) {
    const best = improving.sort((a, b) => b.trend - a.trend)[0]
    push({
      id: 'progressing',
      tag: 'strength',
      severity: 'good',
      title: `${best.name} is climbing about ${round(best.trend, 1)}% a week`,
      detail: `${improving.length} lift${improving.length > 1 ? 's are' : ' is'} on a clear upward trend.`,
      why: 'This is the strongest evidence you are keeping — and likely adding — muscle. Keep the progression scheme that is producing it and resist the urge to change the program.',
      priority: 130,
    })
  }

  // ---- Running ----------------------------------------------------------
  const runDaysPerWeek = data.goals.runDaysPerWeek
  if (data.runs.length === 0 && runDaysPerWeek > 0) {
    push({
      id: 'no_runs',
      tag: 'running',
      severity: 'warning',
      title: 'Start logging runs',
      detail: 'No runs recorded yet.',
      why: 'Running is the cheapest way to add energy expenditure to a fat-loss phase, and easy aerobic work improves recovery between lifting sessions rather than competing with it.',
      action: 'Log two easy 20–30 minute runs this week at a pace where you can hold a conversation.',
      priority: 280,
    })
  }

  if (load.ratio != null && load.chronic > 3) {
    if (load.ratio > 1.35) {
      push({
        id: 'acwr_high',
        tag: 'recovery',
        severity: 'serious',
        title: 'Hold your mileage flat this week',
        detail: `Last 7 days: ${round(dispDistance(load.acute, units), 1)} ${du} against a 4-week average of ${round(dispDistance(load.chronic, units), 1)} ${du} (ratio ${load.ratio}).`,
        why: 'When a week\'s running load runs more than about 30% above your recent average, soft-tissue injury risk rises sharply. Tendons and bone adapt more slowly than the cardiovascular system, so the legs feel fine right up until they do not.',
        action: `Cap this week at ${round(dispDistance(load.chronic * 1.1, units), 1)} ${du} and keep all of it easy.`,
        priority: 415,
      })
    } else if (load.ratio < 0.8) {
      push({
        id: 'acwr_low',
        tag: 'running',
        severity: 'info',
        title: 'Room to add mileage',
        detail: `Last 7 days: ${round(dispDistance(load.acute, units), 1)} ${du} vs a 4-week average of ${round(dispDistance(load.chronic, units), 1)} ${du}.`,
        why: 'Your recent training has built more tolerance than you are currently using. Building volume from here is low risk as long as the increase stays inside about 10% a week.',
        action: `Target ${round(dispDistance(load.chronic * 1.1, units), 1)} ${du} next week, all of the added distance easy.`,
        priority: 195,
      })
    } else {
      push({
        id: 'acwr_ok',
        tag: 'running',
        severity: 'good',
        title: 'Running load is well balanced',
        detail: `Acute-to-chronic workload ratio is ${load.ratio} — inside the 0.8–1.3 sweet spot.`,
        why: 'This is the band where you are building fitness without accumulating injury risk.',
        priority: 110,
      })
    }
  }

  if (dist.total > 8) {
    if (dist.hardPct > 32) {
      push({
        id: 'too_much_intensity',
        tag: 'running',
        severity: 'warning',
        title: 'Make more of your running easy',
        detail: `${dist.hardPct}% of your last 4 weeks of mileage was hard running.`,
        why: 'The 80/20 rule holds across every level of runner: most volume easy, a small slice genuinely hard. Running the middle — moderately hard all the time — costs real recovery while producing less adaptation than either end. It also directly competes with your lifting.',
        action: 'Cap hard running at one, at most two sessions a week. Everything else at a conversational pace.',
        priority: 300,
      })
    } else if (dist.hardPct < 8 && (goal === 'endurance' || data.goals.raceDistanceMi)) {
      push({
        id: 'no_intensity',
        tag: 'running',
        severity: 'warning',
        title: 'Add one quality session a week',
        detail: `Only ${dist.hardPct}% of recent mileage was above easy pace.`,
        why: 'Easy volume builds the aerobic base, but race pace and running economy need to be trained specifically. One threshold or interval session a week produces most of that benefit.',
        action: 'Try 4 × 5 minutes at threshold (comfortably hard, controlled breathing) with 1 minute jog recovery.',
        priority: 290,
      })
    }
  }

  // Weekly mileage jump
  if (weekly.length >= 3) {
    const thisWeek = weekly[weekly.length - 1]
    const prior = weekly.slice(-4, -1)
    const priorAvg = prior.reduce((a, w) => a + w.miles, 0) / Math.max(1, prior.length)
    if (priorAvg > 5 && thisWeek.miles > priorAvg * 1.25) {
      push({
        id: 'mileage_jump',
        tag: 'recovery',
        severity: 'warning',
        title: 'Mileage jumped sharply this week',
        detail: `${round(dispDistance(thisWeek.miles, units), 1)} ${du} this week against a recent average of ${round(dispDistance(priorAvg, units), 1)} ${du}.`,
        why: 'Roughly 10% a week is the ceiling most runners can absorb. Larger jumps are the classic setup for shin, calf and knee problems, which cost far more training time than the extra miles bought.',
        action: 'Keep next week at or below this level rather than building further.',
        priority: 295,
      })
    }
  }

  // Long-run development for a race goal
  if (data.goals.raceDistanceMi) {
    const target = data.goals.raceDistanceMi
    const longest = longestRun(data.runs, 28)
    const longestMi = longest?.distanceMi ?? 0
    if (longestMi < target * 0.65) {
      push({
        id: 'build_long_run',
        tag: 'running',
        severity: 'warning',
        title: 'Build your long run',
        detail: `Longest run in the last 4 weeks was ${round(dispDistance(longestMi, units), 1)} ${du}; your ${round(dispDistance(target, units), 1)} ${du} goal wants at least ${round(dispDistance(target * 0.7, units), 1)} ${du}.`,
        why: 'The long run is what develops the fat-oxidation, capillary density and structural durability that the back half of a race depends on. It is also the session that most reliably transfers to race day.',
        action: `Add ${round(dispDistance(1.5, units), 1)} ${du} to your long run every second week until you reach ${round(dispDistance(target * 0.8, units), 1)} ${du}, keeping the pace easy.`,
        priority: 300,
      })
    }
    const thisWeekMiles = weekly[weekly.length - 1]?.miles ?? 0
    if (longestMi > 0 && thisWeekMiles > 0 && longestMi / thisWeekMiles > 0.45 && thisWeekMiles > 8) {
      push({
        id: 'long_run_share',
        tag: 'running',
        severity: 'info',
        title: 'Your long run is a large share of weekly volume',
        detail: `The long run is ${Math.round((longestMi / thisWeekMiles) * 100)}% of the week's mileage.`,
        why: 'When one session dominates the week it carries all the injury risk and leaves the aerobic base thin. Under about 35% is the usual guideline.',
        action: 'Add a short midweek run rather than lengthening the long run further.',
        priority: 180,
      })
    }
  }

  // Race-goal feasibility
  if (data.goals.raceDistanceMi && data.goals.raceTimeSec) {
    const v = bestVdot(data.runs)
    if (v) {
      const predicted = riegel(v.run.seconds, v.run.distanceMi, data.goals.raceDistanceMi)
      const gap = predicted - data.goals.raceTimeSec
      const goalPacePerMi = data.goals.raceTimeSec / data.goals.raceDistanceMi
      const paceStr = `${fmtDuration(goalPacePerMi / (units === 'metric' ? 1 / 0.621371192 : 1))}/${du}`
      if (gap > 0) {
        push({
          id: 'race_gap',
          tag: 'running',
          severity: 'info',
          title: `You are about ${fmtDuration(gap)} off your goal time`,
          detail: `Current fitness predicts ${fmtDuration(predicted)} for ${round(dispDistance(data.goals.raceDistanceMi, units), 1)} ${du}; your goal is ${fmtDuration(data.goals.raceTimeSec)} (${paceStr}).`,
          why: 'Predictions from a recent hard effort are a good estimate of what you could run today. Closing a gap of this size comes from consistent easy volume plus specific work at goal pace — not from racing your training runs.',
          action: `Include one session a week with segments at ${paceStr} — start with 3 × 1 ${du} and build the total volume at that pace over time.`,
          priority: 220,
        })
      } else {
        push({
          id: 'race_ready',
          tag: 'running',
          severity: 'good',
          title: 'Current fitness already beats your goal time',
          detail: `Predicted ${fmtDuration(predicted)} vs a goal of ${fmtDuration(data.goals.raceTimeSec)}.`,
          why: 'Time to set a more ambitious target, or move the emphasis onto a different distance.',
          action: 'Update your race goal in Settings.',
          priority: 125,
        })
      }
    } else if (data.runs.length > 3) {
      push({
        id: 'need_time_trial',
        tag: 'running',
        severity: 'info',
        title: 'Run a time trial to calibrate your paces',
        detail: 'No hard effort logged, so training paces are unknown.',
        why: 'Every training pace here is derived from one recent hard performance. Without one, the coach cannot tell you what "easy" or "threshold" actually means for you.',
        action: `Warm up, then run a hard, evenly paced 1 ${du} or 5K and log it as a race/time trial.`,
        priority: 230,
      })
    }
  }

  // Cardio as a fat-loss lever
  if (goal === 'fat_loss' || goal === 'recomp') {
    const weekMi = weekly[weekly.length - 1]?.miles ?? 0
    const runCount = withinDays(data.runs, 7).length
    if (runCount < 2) {
      push({
        id: 'add_cardio_for_deficit',
        tag: 'running',
        severity: 'info',
        title: 'Use easy cardio to widen the deficit',
        detail: `${runCount} run${runCount === 1 ? '' : 's'} logged in the last 7 days (${round(dispDistance(weekMi, units), 1)} ${du}).`,
        why: 'Creating part of your deficit through activity rather than food means more food, better training quality and better recovery for the same rate of fat loss. Easy-paced running also improves the aerobic base that clears fatigue between lifting sessions.',
        action: 'Add two or three 30-minute easy runs or brisk walks a week, on non-leg-training days where possible.',
        priority: 240,
      })
    }
  }

  const runsPerWeekActual = withinDays(data.runs, 21).length / 3
  if (runDaysPerWeek > 0 && data.runs.length > 0 && runsPerWeekActual < runDaysPerWeek - 0.7) {
    push({
      id: 'run_consistency',
      tag: 'habit',
      severity: 'info',
      title: 'Hit your running days',
      detail: `Averaging ${round(runsPerWeekActual, 1)} runs a week against a target of ${runDaysPerWeek}.`,
      why: 'Aerobic fitness responds to frequency more than to any single long session. Three short runs beat one long one for both fitness and fat loss.',
      action: 'Schedule your runs on the days after lower-body lifting, keeping them genuinely easy.',
      priority: 200,
    })
  }

  // ---- Recovery ---------------------------------------------------------
  const consec = consecutiveTrainingDays(data)
  if (consec >= 7) {
    push({
      id: 'need_rest_day',
      tag: 'recovery',
      severity: 'warning',
      title: 'Take a rest day',
      detail: `${consec} consecutive days of training with no full rest day.`,
      why: 'Adaptation happens during recovery, not during the session. In a calorie deficit that recovery window is already narrower than usual, so an unbroken run of training days quietly erodes performance and raises injury risk.',
      action: 'Take a complete day off, or replace today with a 20-minute walk and some mobility work.',
      priority: 310,
    })
  }

  // ---- Training block ----------------------------------------------------
  // A block that has run out is invisible otherwise: the Today card silently
  // reverts to reactive suggestions, which looks like the plan was forgotten.
  const finished = (data.programs ?? [])
    .filter((b) => !b.archived && blockWeek(b) === null && b.startDate <= todayISO())
    .sort((a, b) => b.startDate.localeCompare(a.startDate))[0]
  if (finished && !activeBlock(data)) {
    push({
      id: 'block_finished',
      tag: 'strength',
      severity: 'warning',
      title: `${finished.name} has finished — start the next block`,
      detail: `The block ended ${daysAgo(blockEndDate(finished))} days ago, so sessions are being suggested reactively again.`,
      why: 'Training in blocks beats training indefinitely because progression needs a beginning and an end: you accumulate work, deload, then start the next block from the loads you finished on. Running the same week forever is how a plateau starts.',
      action: 'On the Coach tab, repeat this block (it restarts from your current loads) or pick a different structure.',
      priority: 335,
    })
  }

  // Deduplicate, apply dismissals, sort.
  const thisWeekKey = weekStart(todayISO())
  const seen = new Set<string>()
  return recs
    .filter((r) => {
      if (seen.has(r.id)) return false
      seen.add(r.id)
      return data.dismissed[r.id] !== thisWeekKey
    })
    .sort((a, b) => SEVERITY_WEIGHT[b.severity] + b.priority - (SEVERITY_WEIGHT[a.severity] + a.priority))
}

// ---------------------------------------------------------------------------
// Today's session suggestion
// ---------------------------------------------------------------------------

export interface SessionSuggestion {
  kind: 'lift' | 'run' | 'rest'
  title: string
  detail: string
  /** Muscles to prioritise, for a lifting day. */
  muscles?: Muscle[]
  exercises?: string[]
  /** Suggested run, when kind is 'run'. */
  run?: { type: Run['type']; distanceMi?: number; minutes?: number; paceHint?: string }
  /**
   * Set when the suggestion came from an active training block rather than from
   * the reactive logic below it. Carries enough for the caller to open the session
   * pre-filled with its prescribed loads.
   */
  plan?: {
    blockId: string
    blockName: string
    dayId: string
    week: number
    weeks: number
    deload: boolean
    prescriptions: Prescription[]
  }
}

/**
 * The next session from an active training block, or null when no block is
 * running — in which case the reactive logic below takes over unchanged.
 */
function plannedSession(data: AppData): SessionSuggestion | null {
  const block = activeBlock(data)
  if (!block) return null
  const week = blockWeek(block)
  if (week == null) return null
  const deload = isDeload(block, week)
  const { done, total } = weekProgress(data, block)
  const day = nextDay(data, block)

  if (!day) {
    return {
      kind: 'rest',
      title: `Week ${week} of ${block.name} is complete`,
      detail: `All ${total} sessions done. ${
        week >= block.weeks
          ? 'That finishes the block — review it on the Coach tab and start the next one.'
          : 'Extra work now costs more in recovery than it returns. Rest, walk, or do some mobility work, and the rotation restarts on Monday.'
      }`,
    }
  }

  const remaining = total - done
  const where = `Week ${week} of ${block.weeks}${deload ? ' — deload' : ''} · session ${done + 1} of ${total}`

  if (day.kind === 'run') {
    return {
      kind: 'run',
      title: day.name,
      detail: deload
        ? `${where}. Keep it genuinely easy — this week is for absorbing the last few weeks of work, not adding to it.`
        : `${where}. ${remaining} session${remaining === 1 ? '' : 's'} left in the rotation this week.`,
      run: {
        type: day.run?.type ?? 'easy',
        distanceMi: day.run?.distanceMi,
        minutes: day.run?.minutes,
        paceHint: runPaceHint(data, day.run?.type ?? 'easy'),
      },
      plan: {
        blockId: block.id,
        blockName: block.name,
        dayId: day.id,
        week,
        weeks: block.weeks,
        deload,
        prescriptions: [],
      },
    }
  }

  const prescriptions = prescribeDay(data, block, day, week)
  return {
    kind: 'lift',
    title: day.name,
    detail: deload
      ? `${where}. Same movements, two-thirds of the sets, 10% off the load, every set stopped well short of failure.`
      : `${where}. ${remaining} session${remaining === 1 ? '' : 's'} left in the rotation this week. Loads below come from your last session on each lift.`,
    muscles: dayMuscles(data, day),
    exercises: prescriptions.map((p) => p.exercise?.name ?? p.slot.exerciseId),
    plan: {
      blockId: block.id,
      blockName: block.name,
      dayId: day.id,
      week,
      weeks: block.weeks,
      deload,
      prescriptions,
    },
  }
}

/** Pace guidance for a prescribed run, when a hard effort has calibrated it. */
function runPaceHint(data: AppData, type: Run['type']): string {
  const v = bestVdot(data.runs)
  if (!v) return type === 'easy' || type === 'long' ? 'conversational pace' : 'comfortably hard, controlled breathing'
  const paces = trainingPaces(v.value)
  const factor = data.profile.units === 'metric' ? 0.621371192 : 1
  const du = distanceUnit(data.profile.units)
  const pace =
    type === 'tempo'
      ? paces.threshold
      : type === 'interval'
        ? paces.interval
        : type === 'race'
          ? paces.threshold
          : type === 'long'
            ? paces.easy
            : paces.easy
  return `${fmtDuration(pace * factor)}/${du}`
}

/**
 * What to do today. Rest wins if fatigue is high; then an active training block
 * decides; otherwise whichever of lifting or running is furthest behind the
 * week's plan, biased toward lifting because it is what protects muscle in a
 * deficit.
 */
export function suggestToday(data: AppData): SessionSuggestion {
  const consec = consecutiveTrainingDays(data)
  const load = acwr(data.runs)
  const week = weekStart(todayISO())
  const liftsThisWeek = new Set(data.workouts.filter((w) => w.date >= week).map((w) => w.date)).size
  const runsThisWeek = data.runs.filter((r) => r.date >= week).length
  const liftsLeft = data.goals.liftDaysPerWeek - liftsThisWeek
  const runsLeft = data.goals.runDaysPerWeek - runsThisWeek

  // Fatigue outranks the plan, deliberately. A block that talks over your own
  // recovery signals is worse than no block: it turns a missed session into an
  // injury. The plan is consulted immediately after this, and nowhere before it.
  if (consec >= 6) {
    return {
      kind: 'rest',
      title: 'Rest day',
      detail: `You have trained ${consec} days straight. Recovery is where the adaptation actually happens — take the day, or keep it to a walk and mobility work.`,
    }
  }

  const planned = plannedSession(data)
  if (planned) return planned

  const vols = volumeTargets(data)
  const lagging = vols
    .filter((v) => v.target >= 4)
    .sort((a, b) => {
      // Weight by both the set deficit and how long it has been.
      const score = (v: (typeof vols)[number]) => v.deficit + Math.min(v.lastTrainedDays ?? 14, 14) / 4
      return score(b) - score(a)
    })

  const wantLift = liftsLeft > 0 && (liftsLeft >= runsLeft || data.goals.primary !== 'endurance')

  if (wantLift) {
    const focus = lagging.slice(0, 3).map((v) => v.muscle)
    const exercises: string[] = []
    for (const m of focus) exercises.push(...suggestExercisesFor(m, 2))
    return {
      kind: 'lift',
      title: `Lift — ${focus.map((m) => MUSCLE_LABEL[m].toLowerCase()).join(', ')} priority`,
      detail: `${liftsLeft} of ${data.goals.liftDaysPerWeek} lifting days left this week. These groups are furthest below their weekly set target, so lead the session with them while you are fresh.`,
      muscles: focus,
      exercises: [...new Set(exercises)].slice(0, 6),
    }
  }

  if (runsLeft > 0) {
    const dist = intensityDistribution(data.runs)
    const chronic = load.chronic || 3
    const hardRecently = withinDays(data.runs, 4).some((r) => HARD_RUN_TYPES.includes(r.type))
    const needsQuality =
      !hardRecently && dist.hardPct < 20 && (data.goals.primary === 'endurance' || !!data.goals.raceDistanceMi)
    const v = bestVdot(data.runs)
    const paces = v ? trainingPaces(v.value) : null
    const unitFactor = data.profile.units === 'metric' ? 0.621371192 : 1

    if (load.ratio != null && load.ratio > 1.3) {
      return {
        kind: 'run',
        title: 'Easy run only',
        detail: `Your 7-day running load is ${load.ratio}× your 4-week average — this is the zone where injuries happen. Keep today short and easy.`,
        run: {
          type: 'easy',
          minutes: 30,
          paceHint: paces ? `${fmtDuration(paces.easy * unitFactor)}/${distanceUnit(data.profile.units)} or slower` : 'conversational pace',
        },
      }
    }

    if (needsQuality) {
      return {
        kind: 'run',
        title: 'Quality run — threshold intervals',
        detail: 'You have not run anything above easy pace recently. One hard session a week trains race pace and running economy without eating into recovery.',
        run: {
          type: 'tempo',
          minutes: 40,
          paceHint: paces
            ? `4 × 5 min at ${fmtDuration(paces.threshold * unitFactor)}/${distanceUnit(data.profile.units)}, 1 min jog between`
            : '4 × 5 min comfortably hard, 1 min jog between',
        },
      }
    }

    const isLongDay = runsLeft === 1 && data.goals.runDaysPerWeek >= 3
    const target = isLongDay ? chronic * 0.32 : chronic * 0.22
    return {
      kind: 'run',
      title: isLongDay ? 'Long easy run' : 'Easy run',
      detail: isLongDay
        ? 'Last run of the week — make it the longest one, entirely at an easy effort. This is the session that builds the aerobic base.'
        : 'Aerobic base work. If you cannot hold a conversation, you are running it too fast.',
      run: {
        type: isLongDay ? 'long' : 'easy',
        distanceMi: Math.max(2, round(target, 1)),
        paceHint: paces ? `${fmtDuration(paces.easy * unitFactor)}/${distanceUnit(data.profile.units)}` : 'conversational pace',
      },
    }
  }

  return {
    kind: 'rest',
    title: 'Plan complete — rest or move gently',
    detail: `You have hit ${liftsThisWeek} lifting session${liftsThisWeek === 1 ? '' : 's'} and ${runsThisWeek} run${runsThisWeek === 1 ? '' : 's'} this week, which is your full plan. Extra work now costs more in recovery than it returns. A walk, mobility, or genuine rest.`,
  }
}

/** A compact weekly scorecard for the dashboard. */
export function weeklyScore(data: AppData): { label: string; value: string; sub: string }[] {
  const week = weekStart(todayISO())
  const lifts = new Set(data.workouts.filter((w) => w.date >= week).map((w) => w.date)).size
  const runs = data.runs.filter((r) => r.date >= week)
  const miles = runs.reduce((a, r) => a + r.distanceMi, 0)
  const sets = data.workouts
    .filter((w) => w.date >= week)
    .reduce((a, w) => a + w.exercises.reduce((b, e) => b + workingSets(e.sets).length, 0), 0)
  // Through volumeLoad, so bodyweight movements are counted the same way the Lift
  // tab counts them. Reading `s.weight || bw` instead credited a weighted pull-up
  // with only the plate hanging off it.
  const map = exerciseMap(data.customExercises)
  const tonnage = data.workouts
    .filter((w) => w.date >= week)
    .reduce((a, w) => {
      const bw = bodyweightOn(data.body, w.date) ?? 0
      return (
        a + w.exercises.reduce((b, e) => b + volumeLoad(e.sets, bw, map.get(e.exerciseId)?.loadType), 0)
      )
    }, 0)
  const du = distanceUnit(data.profile.units)
  return [
    { label: 'Lifting days', value: `${lifts}`, sub: `of ${data.goals.liftDaysPerWeek} planned` },
    { label: 'Hard sets', value: `${sets}`, sub: 'this week' },
    { label: 'Tonnage', value: `${round(dispWeight(tonnage, data.profile.units) / 1000, 1)}k`, sub: `${weightUnit(data.profile.units)} lifted` },
    { label: 'Distance run', value: `${round(dispDistance(miles, data.profile.units), 1)}`, sub: `${du} · ${runs.length} of ${data.goals.runDaysPerWeek} runs` },
  ]
}

export { vdot }
