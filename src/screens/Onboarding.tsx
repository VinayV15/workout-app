import { useState } from 'react'
import { useStore, uid } from '../lib/store'
import { Button, Card, Field, Segmented, SelectField } from '../components/ui'
import { GOAL_LABEL, type GoalPrimary, type Sex, type Units } from '../lib/types'
import { storeWeight, todayISO, weightUnit } from '../lib/calc'

/**
 * First-run setup. Only asks for what the coaching math genuinely needs —
 * everything else can be filled in later from Settings.
 */
export default function Onboarding() {
  const { setProfile, setGoals, saveBody } = useStore()
  const [step, setStep] = useState(0)

  const [units, setUnits] = useState<Units>('imperial')
  const [name, setName] = useState('')
  const [sex, setSex] = useState<Sex>('male')
  const [birthDate, setBirthDate] = useState('')
  const [heightFt, setHeightFt] = useState('')
  const [heightIn, setHeightIn] = useState('')
  const [heightCm, setHeightCm] = useState('')
  const [activity, setActivity] = useState<'sedentary' | 'light' | 'moderate' | 'high'>('light')

  const [weight, setWeight] = useState('')
  const [bodyFat, setBodyFat] = useState('')
  const [waist, setWaist] = useState('')
  const [neck, setNeck] = useState('')

  const [goal, setGoal] = useState<GoalPrimary>('fat_loss')
  const [targetWeight, setTargetWeight] = useState('')
  const [targetBf, setTargetBf] = useState('')
  const [liftDays, setLiftDays] = useState('4')
  const [runDays, setRunDays] = useState('3')

  const wu = weightUnit(units)
  const heightTotalIn = units === 'metric' ? Number(heightCm) / 2.54 : Number(heightFt) * 12 + Number(heightIn || 0)

  function finish() {
    setProfile({
      name: name.trim() || undefined,
      sex,
      birthDate: birthDate || undefined,
      heightIn: heightTotalIn > 0 ? heightTotalIn : undefined,
      units,
      activity,
    })
    setGoals({
      primary: goal,
      liftDaysPerWeek: Number(liftDays) || 3,
      runDaysPerWeek: Number(runDays) || 0,
      targetWeightLb: targetWeight ? storeWeight(Number(targetWeight), units) : undefined,
      targetBodyFatPct: targetBf ? Number(targetBf) : undefined,
      focusMuscles: [],
    })
    if (weight || bodyFat || waist) {
      saveBody({
        id: uid('body'),
        date: todayISO(),
        weightLb: weight ? storeWeight(Number(weight), units) : undefined,
        bodyFatPct: bodyFat ? Number(bodyFat) : undefined,
        waistIn: waist ? (units === 'metric' ? Number(waist) / 2.54 : Number(waist)) : undefined,
        neckIn: neck ? (units === 'metric' ? Number(neck) / 2.54 : Number(neck)) : undefined,
      })
    }
  }

  const canContinue = step === 0 ? heightTotalIn > 0 : step === 1 ? !!weight : true

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-5 py-10">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Forge</h1>
        <p className="mt-1 text-sm text-ink-2">
          Three questions and you are set up. Your data stays on this device unless you switch on sync yourself.
        </p>
      </div>

      <div className="mb-5 flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full"
            style={{ background: i <= step ? 'var(--series-1)' : 'var(--surface-2)' }}
          />
        ))}
      </div>

      {step === 0 && (
        <Card className="space-y-4">
          <h2 className="text-sm font-semibold">About you</h2>
          <div>
            <span className="label">Units</span>
            <Segmented
              value={units}
              onChange={setUnits}
              options={[
                { value: 'imperial', label: 'lb / miles' },
                { value: 'metric', label: 'kg / km' },
              ]}
            />
          </div>
          <Field label="Name (optional)" value={name} onChange={(e) => setName(e.target.value)} placeholder="Vinay" />
          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Sex" value={sex} onChange={(e) => setSex(e.target.value as Sex)}>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </SelectField>
            <Field label="Date of birth" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
          </div>
          {units === 'metric' ? (
            <Field
              label="Height"
              type="number"
              inputMode="decimal"
              suffix="cm"
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value)}
            />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Height" type="number" inputMode="numeric" suffix="ft" value={heightFt} onChange={(e) => setHeightFt(e.target.value)} />
              <Field label="&nbsp;" type="number" inputMode="numeric" suffix="in" value={heightIn} onChange={(e) => setHeightIn(e.target.value)} />
            </div>
          )}
          <SelectField
            label="Daily activity outside training"
            value={activity}
            onChange={(e) => setActivity(e.target.value as typeof activity)}
          >
            <option value="sedentary">Sedentary — desk job, little walking</option>
            <option value="light">Lightly active — some walking daily</option>
            <option value="moderate">Moderately active — on your feet a lot</option>
            <option value="high">Very active — physical job</option>
          </SelectField>
          <p className="text-[11px] leading-relaxed text-ink-3">
            Sex, age and height feed the calorie and body-fat estimates.
          </p>
        </Card>
      )}

      {step === 1 && (
        <Card className="space-y-4">
          <h2 className="text-sm font-semibold">Where you are now</h2>
          <Field
            label="Current weight"
            type="number"
            inputMode="decimal"
            suffix={wu}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
          <Field
            label="Body fat % (if you know it)"
            type="number"
            inputMode="decimal"
            suffix="%"
            value={bodyFat}
            onChange={(e) => setBodyFat(e.target.value)}
            hint="Leave blank and the app will estimate it from your waist and neck measurements."
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Waist"
              type="number"
              inputMode="decimal"
              suffix={units === 'metric' ? 'cm' : 'in'}
              value={waist}
              onChange={(e) => setWaist(e.target.value)}
              hint="At the navel."
            />
            <Field
              label="Neck"
              type="number"
              inputMode="decimal"
              suffix={units === 'metric' ? 'cm' : 'in'}
              value={neck}
              onChange={(e) => setNeck(e.target.value)}
              hint="Below the Adam's apple."
            />
          </div>
        </Card>
      )}

      {step === 2 && (
        <Card className="space-y-4">
          <h2 className="text-sm font-semibold">What you are training for</h2>
          <SelectField label="Primary goal" value={goal} onChange={(e) => setGoal(e.target.value as GoalPrimary)}>
            {(Object.keys(GOAL_LABEL) as GoalPrimary[]).map((g) => (
              <option key={g} value={g}>
                {GOAL_LABEL[g]}
              </option>
            ))}
          </SelectField>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Target weight"
              type="number"
              inputMode="decimal"
              suffix={wu}
              value={targetWeight}
              onChange={(e) => setTargetWeight(e.target.value)}
            />
            <Field
              label="Target body fat"
              type="number"
              inputMode="decimal"
              suffix="%"
              value={targetBf}
              onChange={(e) => setTargetBf(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Lifting days per week"
              type="number"
              inputMode="numeric"
              value={liftDays}
              onChange={(e) => setLiftDays(e.target.value)}
            />
            <Field
              label="Running days per week"
              type="number"
              inputMode="numeric"
              value={runDays}
              onChange={(e) => setRunDays(e.target.value)}
            />
          </div>
          <p className="text-[11px] leading-relaxed text-ink-3">
            Be honest about the days — every recommendation is scaled to the schedule you can actually keep. You can
            change all of this any time, and the coaching adjusts.
          </p>
        </Card>
      )}

      <div className="mt-5 flex gap-2">
        {step > 0 && (
          <Button onClick={() => setStep((s) => s - 1)} variant="ghost">
            Back
          </Button>
        )}
        <Button
          className="flex-1"
          variant="primary"
          disabled={!canContinue}
          onClick={() => (step < 2 ? setStep((s) => s + 1) : finish())}
        >
          {step < 2 ? 'Continue' : 'Start training'}
        </Button>
      </div>
    </div>
  )
}
