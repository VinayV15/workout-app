import type { LimbPose, Pose } from './pose'
import type { PresetView } from '../components/BodyScan'

/**
 * Pose archetypes for the exercise diagrams.
 *
 * Sixty exercises do not need sixty movements. A dumbbell bench press and a
 * machine chest press are the same shape with a different handle, so the poses are
 * defined once per *movement* and referenced by name. That keeps the angles in one
 * place to correct, and it is why fixing the way a squat looks fixes the front
 * squat, the goblet squat and the hack squat at the same time.
 *
 * Angles are body-local: pose the figure as if standing, then `rootPitch` tips the
 * whole thing over. -90 lays it on its back (a bench press), +90 face down (a
 * plank). So a bench press is authored as "press straight out in front of the
 * chest", which is what it is once you are lying down.
 */

export interface GuideFrame {
  /** Short label under the frame. */
  label: string
  /** One sentence on what is happening, and what to feel. */
  caption: string
  pose: Pose
  /** Camera angle. Side reads best for anything hinging or squatting. */
  view: PresetView
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

/**
 * Arm angles for a torso pitched `pitch` degrees, with `lift` measured from
 * straight-down in WORLD space: 0 hangs vertically, 90 reaches forward level, 180
 * is straight overhead.
 *
 * This exists because the arms are children of the torso, so pitching the torso
 * forward carries them backward with it. A weight in your hands does not care about
 * your torso angle — it hangs straight down — so a bent-over row authored with the
 * arms "down" relative to the torso put them out behind the body, which reads as
 * the bar being *behind* the lifter. On a deadlift that is not a cosmetic problem:
 * it shows the wrong exercise.
 *
 * `shoulderFlex` is applied as a rotation opposite the torso pitch, so the net
 * world angle is `flex - pitch` — hence `pitch + lift` to land on `lift`.
 */
const arms = (pitch: number, lift = 0, extra: LimbPose = {}): LimbPose => ({
  elbow: 6,
  ...extra,
  shoulderFlex: pitch + lift,
})

/** Human limit on pulling the toes up. Past this a real heel leaves the floor. */
const MAX_DORSIFLEX = 30

/**
 * A leg standing on a flat floor.
 *
 * The sole has to stay level, and it does not do that on its own: the foot is a
 * child of the shank, so the shank's angle carries it. Net shank rotation is
 * `knee - hipFlex`, so the ankle has to cancel exactly that. Authoring the ankle by
 * hand had feet pointing into the floor at odd angles in half the squat frames.
 *
 * Note which way round the joints go in a hinge: `knee` larger than `hipFlex` tilts
 * the shin *back*, putting the knee in front of the ankle — which is the deadlift
 * setup. Getting that pair backwards is what made the first version's legs reach out
 * in front like a chair.
 */
const leg = (hipFlex: number, knee: number, extra: LimbPose = {}): LimbPose => ({
  hipFlex,
  knee,
  ankle: Math.min(MAX_DORSIFLEX, knee - hipFlex),
  ...extra,
})

/** Arms holding a bar across the upper back. Fixed to the torso, so it travels with it. */
const BAR_ON_BACK = { shoulderAbduct: 42, shoulderFlex: -12, elbow: 105 }
/** Arms holding a bar at the shoulders, elbows in front. Also fixed to the torso. */
const BAR_AT_FRONT = { shoulderFlex: 55, shoulderAbduct: 18, elbow: 130 }
/** Arms hanging straight from an upright torso, holding something. */
const ARMS_HANGING = arms(0)
/** Seated: hips and knees folded so the figure reads as sitting. */
const SEATED = { hipFlex: 88, knee: 88 }
/** Lying on a bench with the feet planted. */
const ON_BENCH = { hipFlex: 72, knee: 88 }

export const POSE_ARCHETYPES: Record<string, GuideFrame[]> = {
  // --- Squat patterns ----------------------------------------------------
  squat_back: [
    {
      label: 'Set up',
      caption: 'Bar on your upper back, feet shoulder-width, chest up and braced.',
      pose: { both: { ...BAR_ON_BACK } },
      view: 'side',
    },
    {
      label: 'Descend',
      caption: 'Break at the hips and knees together, knees tracking out over your feet.',
      pose: { torsoPitch: 30, both: { ...BAR_ON_BACK, ...leg(62, 84) } },
      view: 'side',
    },
    {
      label: 'Bottom',
      caption: 'Hip crease below the knee, weight through the middle of the foot, spine still neutral.',
      pose: { torsoPitch: 32, both: { ...BAR_ON_BACK, ...leg(100, 125) } },
      view: 'side',
    },
    {
      label: 'Drive up',
      caption: 'Push the floor away and lead with the chest — hips and shoulders rise together.',
      pose: { torsoPitch: 15, both: { ...BAR_ON_BACK, ...leg(30, 42) } },
      view: 'side',
    },
  ],

  squat_front: [
    {
      label: 'Set up',
      caption: 'Bar across the front of the shoulders, elbows high, torso vertical.',
      pose: { both: { ...BAR_AT_FRONT } },
      view: 'side',
    },
    {
      label: 'Descend',
      caption: 'Straight down with an upright torso — the front rack punishes any forward lean.',
      pose: { torsoPitch: 12, both: { ...BAR_AT_FRONT, ...leg(64, 86) } },
      view: 'side',
    },
    {
      label: 'Bottom',
      caption: 'Deep, knees forward, elbows still pointing up so the bar stays on the shelf.',
      pose: { torsoPitch: 15, both: { ...BAR_AT_FRONT, ...leg(102, 126) } },
      view: 'side',
    },
    {
      label: 'Stand',
      caption: 'Drive straight up, keeping the elbows high all the way.',
      pose: { torsoPitch: 8, both: { ...BAR_AT_FRONT, ...leg(28, 40) } },
      view: 'side',
    },
  ],

  squat_machine: [
    {
      label: 'Set up',
      caption: 'Back and hips supported, feet planted on the platform, knees soft.',
      pose: { rootPitch: -32, both: { ...ARMS_HANGING, shoulderAbduct: 45, elbow: 90, hipFlex: 30, knee: 25 } },
      view: 'side',
    },
    {
      label: 'Bottom',
      caption: 'Knees to about 90°, lower back flat against the pad — never let it round off.',
      pose: { rootPitch: -32, both: { ...ARMS_HANGING, shoulderAbduct: 45, elbow: 90, hipFlex: 95, knee: 100 } },
      view: 'side',
    },
    {
      label: 'Press',
      caption: 'Push through the whole foot and stop just short of locking the knees.',
      pose: { rootPitch: -32, both: { ...ARMS_HANGING, shoulderAbduct: 45, elbow: 90, hipFlex: 35, knee: 28 } },
      view: 'side',
    },
  ],

  // --- Hinge patterns ----------------------------------------------------
  hinge_deadlift: [
    {
      label: 'Set up',
      caption: 'Bar over mid-foot, shins close, hips high, back flat and braced.',
      pose: { torsoPitch: 44, both: { ...arms(44), ...leg(51, 62) } },
      view: 'side',
    },
    {
      label: 'Break the floor',
      caption: 'Push the floor away — the bar leaves the ground before the hips rise.',
      pose: { torsoPitch: 41, both: { ...arms(41), ...leg(44, 50) } },
      view: 'side',
    },
    {
      label: 'Knees back',
      caption: 'Bar past the knees, torso still angled, hips and shoulders rising together.',
      pose: { torsoPitch: 27, both: { ...arms(27), ...leg(26, 29) } },
      view: 'side',
    },
    {
      label: 'Lock out',
      caption: 'Stand tall, glutes squeezed. Do not lean back or shrug at the top.',
      pose: { both: { ...ARMS_HANGING } },
      view: 'side',
    },
  ],

  hinge_rdl: [
    {
      label: 'Set up',
      caption: 'Standing tall, bar against your thighs, knees unlocked but not bent.',
      pose: { both: { ...ARMS_HANGING, ...leg(0, 8) } },
      view: 'side',
    },
    {
      label: 'Hinge',
      caption: 'Push the hips back and slide the bar down your legs — this is a hinge, not a squat.',
      pose: { torsoPitch: 34, both: { ...arms(34), ...leg(32, 35) } },
      view: 'side',
    },
    {
      label: 'Stretch',
      caption: 'Stop where the hamstrings run out of length, back still flat. Usually mid-shin.',
      pose: { torsoPitch: 49, both: { ...arms(49), ...leg(54, 57) } },
      view: 'side',
    },
    {
      label: 'Stand',
      caption: 'Drive the hips forward to stand, finishing with the glutes locked.',
      pose: { torsoPitch: 20, both: { ...arms(20), ...leg(18, 22) } },
      view: 'side',
    },
  ],

  hinge_thrust: [
    {
      label: 'Set up',
      caption: 'Upper back on the bench, feet planted, hips low and bar across the hips.',
      pose: { rootPitch: -68, both: { ...ARMS_HANGING, shoulderAbduct: 40, elbow: 40, hipFlex: 62, knee: 92 } },
      view: 'side',
    },
    {
      label: 'Drive',
      caption: 'Push through the heels and squeeze the glutes to lift the hips.',
      pose: { rootPitch: -80, both: { ...ARMS_HANGING, shoulderAbduct: 40, elbow: 40, hipFlex: 80, knee: 90 } },
      view: 'side',
    },
    {
      label: 'Top',
      caption: 'Shins vertical, ribs down, glutes hard. Do not arch your lower back to get higher.',
      pose: { rootPitch: -90, both: { ...ARMS_HANGING, shoulderAbduct: 40, elbow: 40, hipFlex: 92, knee: 88 } },
      view: 'side',
    },
  ],

  hinge_back_extension: [
    {
      label: 'Set up',
      caption: 'Hips on the pad, body in a straight line, arms crossed or behind your head.',
      pose: { rootPitch: 90, both: { shoulderFlex: 30, shoulderAbduct: 55, elbow: 120 } },
      view: 'side',
    },
    {
      label: 'Lower',
      caption: 'Fold at the hips only, keeping the spine neutral all the way down.',
      pose: { rootPitch: 90, torsoPitch: 60, both: { shoulderFlex: 30, shoulderAbduct: 55, elbow: 120 } },
      view: 'side',
    },
    {
      label: 'Extend',
      caption: 'Squeeze the glutes to return to a straight line. Do not swing past it.',
      pose: { rootPitch: 90, torsoPitch: 6, both: { shoulderFlex: 30, shoulderAbduct: 55, elbow: 120 } },
      view: 'side',
    },
  ],

  // --- Horizontal press --------------------------------------------------
  press_bench: [
    {
      label: 'Set up',
      caption: 'Flat on the bench, feet planted, shoulder blades pulled back and down.',
      pose: { rootPitch: -90, both: { ...ON_BENCH, shoulderFlex: 86, shoulderAbduct: 22, elbow: 5 } },
      view: 'side',
    },
    {
      label: 'Lower',
      caption: 'Bar down to the lower chest under control, elbows tucked to about 45°.',
      pose: { rootPitch: -90, both: { ...ON_BENCH, shoulderFlex: 55, shoulderAbduct: 40, elbow: 60 } },
      view: 'side',
    },
    {
      label: 'Chest',
      caption: 'Light touch on the chest with the forearms vertical — no bounce.',
      pose: { rootPitch: -90, both: { ...ON_BENCH, shoulderFlex: 26, shoulderAbduct: 52, elbow: 96 } },
      view: 'side',
    },
    {
      label: 'Press',
      caption: 'Drive back up and slightly back toward your face, finishing over the shoulders.',
      pose: { rootPitch: -90, both: { ...ON_BENCH, shoulderFlex: 86, shoulderAbduct: 22, elbow: 5 } },
      view: 'side',
    },
  ],

  press_incline: [
    {
      label: 'Set up',
      caption: 'Bench at about 30°, shoulder blades set, arms locked out over the collarbones.',
      pose: { rootPitch: -58, both: { ...ON_BENCH, shoulderFlex: 88, shoulderAbduct: 22, elbow: 5 } },
      view: 'side',
    },
    {
      label: 'Lower',
      caption: 'Down to the upper chest — higher than a flat press, because the angle changed.',
      pose: { rootPitch: -58, both: { ...ON_BENCH, shoulderFlex: 50, shoulderAbduct: 44, elbow: 70 } },
      view: 'side',
    },
    {
      label: 'Press',
      caption: 'Press back up along the same line. The upper chest does the work at this angle.',
      pose: { rootPitch: -58, both: { ...ON_BENCH, shoulderFlex: 88, shoulderAbduct: 22, elbow: 5 } },
      view: 'side',
    },
  ],

  press_pushup: [
    {
      label: 'Set up',
      caption: 'Hands under the shoulders, body one straight line from head to heels.',
      pose: { rootPitch: 90, both: { shoulderFlex: 92, shoulderAbduct: 14, elbow: 8 } },
      view: 'side',
    },
    {
      label: 'Lower',
      caption: 'Down as one piece, elbows back at about 45°, hips level with the shoulders.',
      pose: { rootPitch: 90, both: { shoulderFlex: 50, shoulderAbduct: 40, elbow: 70 } },
      view: 'side',
    },
    {
      label: 'Press',
      caption: 'Push the floor away and finish with the ribs down — do not let the hips sag.',
      pose: { rootPitch: 90, both: { shoulderFlex: 92, shoulderAbduct: 14, elbow: 8 } },
      view: 'side',
    },
  ],

  press_dip: [
    {
      label: 'Set up',
      caption: 'Supported on straight arms, chest slightly forward, legs steady beneath you.',
      pose: { torsoPitch: 14, both: { ...arms(14, -6, { shoulderAbduct: 10, elbow: 6 }), hipFlex: -8, knee: 30 } },
      view: 'side',
    },
    {
      label: 'Lower',
      caption: 'Bend the elbows and let the chest travel forward until the upper arms are level.',
      pose: { torsoPitch: 26, both: { ...arms(26, -34, { shoulderAbduct: 18, elbow: 92 }), hipFlex: -8, knee: 40 } },
      view: 'side',
    },
    {
      label: 'Press',
      caption: 'Drive back up to straight arms. More forward lean means more chest, less triceps.',
      pose: { torsoPitch: 14, both: { ...arms(14, -6, { shoulderAbduct: 10, elbow: 6 }), hipFlex: -8, knee: 30 } },
      view: 'side',
    },
  ],

  press_fly: [
    {
      label: 'Set up',
      caption: 'Arms out wide with a soft, fixed elbow bend — this is one arc, not a press.',
      pose: { both: { shoulderFlex: 82, shoulderAbduct: 62, elbow: 22 } },
      view: 'front',
    },
    {
      label: 'Squeeze',
      caption: 'Bring the hands together in front of the chest, keeping that elbow angle fixed.',
      pose: { both: { shoulderFlex: 88, shoulderAbduct: 12, elbow: 22 } },
      view: 'front',
    },
    {
      label: 'Stretch',
      caption: 'Open back out until you feel the chest stretch, then stop. No further.',
      pose: { both: { shoulderFlex: 76, shoulderAbduct: 74, elbow: 22 } },
      view: 'front',
    },
  ],

  // --- Vertical press ----------------------------------------------------
  press_overhead: [
    {
      label: 'Set up',
      caption: 'Bar on the front of the shoulders, elbows just in front of it, ribs down.',
      pose: { both: { shoulderFlex: 26, shoulderAbduct: 34, elbow: 122 } },
      view: 'side',
    },
    {
      label: 'Press',
      caption: 'Push straight up past your face — move your head back, not the bar forward.',
      pose: { both: { shoulderFlex: 20, shoulderAbduct: 78, elbow: 68 } },
      view: 'side',
    },
    {
      label: 'Lock out',
      caption: 'Finish with the bar over the middle of your feet, biceps beside your ears.',
      pose: { both: { shoulderFlex: 10, shoulderAbduct: 168, elbow: 6 } },
      view: 'side',
    },
  ],

  press_overhead_seated: [
    {
      label: 'Set up',
      caption: 'Seated and braced, weights at shoulder height, elbows under the hands.',
      pose: { both: { ...SEATED, shoulderFlex: 14, shoulderAbduct: 58, elbow: 108 } },
      view: 'front',
    },
    {
      label: 'Press',
      caption: 'Drive up and slightly in, so the hands converge as they rise.',
      pose: { both: { ...SEATED, shoulderFlex: 10, shoulderAbduct: 110, elbow: 54 } },
      view: 'front',
    },
    {
      label: 'Lock out',
      caption: 'Arms straight overhead without shrugging or arching the lower back.',
      pose: { both: { ...SEATED, shoulderFlex: 6, shoulderAbduct: 166, elbow: 6 } },
      view: 'front',
    },
  ],

  // --- Vertical pull -----------------------------------------------------
  pull_up: [
    {
      label: 'Hang',
      caption: 'Full hang from straight arms, shoulders active rather than loose.',
      pose: { anchor: 'hands', both: { shoulderFlex: 8, shoulderAbduct: 158, elbow: 6, hipFlex: -6, knee: 26 } },
      view: 'front',
    },
    {
      label: 'Initiate',
      caption: 'Pull the shoulder blades down first — the elbows follow, they do not lead.',
      pose: { anchor: 'hands', both: { shoulderFlex: 8, shoulderAbduct: 128, elbow: 44, hipFlex: -6, knee: 26 } },
      view: 'front',
    },
    {
      label: 'Top',
      caption: 'Chin over the bar, chest toward it, elbows driven down to your sides.',
      pose: { anchor: 'hands', both: { shoulderFlex: 10, shoulderAbduct: 62, elbow: 118, hipFlex: -6, knee: 26 } },
      view: 'front',
    },
    {
      label: 'Lower',
      caption: 'Control the way down to a full hang. Half the growth is in the descent.',
      pose: { anchor: 'hands', both: { shoulderFlex: 8, shoulderAbduct: 142, elbow: 22, hipFlex: -6, knee: 26 } },
      view: 'front',
    },
  ],

  pull_down: [
    {
      label: 'Set up',
      caption: 'Seated with the thighs secured, arms overhead, torso just off vertical.',
      pose: { torsoPitch: -8, both: { ...SEATED, ...arms(-8, 8, { shoulderAbduct: 150, elbow: 8 }) } },
      view: 'front',
    },
    {
      label: 'Pull',
      caption: 'Drive the elbows down and back, leading with the shoulder blades.',
      pose: { torsoPitch: -12, both: { ...SEATED, ...arms(-12, 8, { shoulderAbduct: 96, elbow: 68 }) } },
      view: 'front',
    },
    {
      label: 'Bottom',
      caption: 'Bar to the upper chest, chest lifted, lats fully shortened.',
      pose: { torsoPitch: -16, both: { ...SEATED, ...arms(-16, 8, { shoulderAbduct: 44, elbow: 112 }) } },
      view: 'front',
    },
  ],

  pull_straight_arm: [
    {
      label: 'Set up',
      caption: 'Cable high, arms extended overhead, a fixed slight bend in the elbows.',
      pose: { torsoPitch: 18, both: arms(18, 148, { shoulderAbduct: 14, elbow: 14 }) },
      view: 'side',
    },
    {
      label: 'Sweep',
      caption: 'Sweep the arms down in one arc, elbow angle never changing.',
      pose: { torsoPitch: 18, both: arms(18, 74, { shoulderAbduct: 12, elbow: 14 }) },
      view: 'side',
    },
    {
      label: 'Finish',
      caption: 'Hands to your thighs, lats fully shortened. All shoulder, no elbow.',
      pose: { torsoPitch: 18, both: arms(18, 4, { shoulderAbduct: 10, elbow: 14 }) },
      view: 'side',
    },
  ],

  // --- Horizontal pull ---------------------------------------------------
  row_bent: [
    {
      label: 'Set up',
      caption: 'Hinged to about 45°, back flat and braced, bar hanging at arms’ length.',
      pose: { torsoPitch: 44, both: { ...arms(44), ...leg(44, 52) } },
      view: 'side',
    },
    {
      label: 'Pull',
      caption: 'Row toward the bottom of your ribs, elbows back rather than out.',
      pose: { torsoPitch: 44, both: { ...arms(44, -14, { shoulderAbduct: 20, elbow: 54 }), ...leg(44, 52) } },
      view: 'side',
    },
    {
      label: 'Squeeze',
      caption: 'Shoulder blades together at the top. The torso angle must not change.',
      pose: { torsoPitch: 44, both: { ...arms(44, -28, { shoulderAbduct: 24, elbow: 96 }), ...leg(44, 52) } },
      view: 'side',
    },
  ],

  row_seated: [
    {
      label: 'Set up',
      caption: 'Seated tall, knees soft, arms extended with the shoulder blades relaxed forward.',
      pose: { both: { ...SEATED, shoulderFlex: 78, shoulderAbduct: 12, elbow: 8 } },
      view: 'side',
    },
    {
      label: 'Pull',
      caption: 'Retract the shoulder blades, then bend the elbows to bring the handle to your navel.',
      pose: { both: { ...SEATED, shoulderFlex: 40, shoulderAbduct: 12, elbow: 62 } },
      view: 'side',
    },
    {
      label: 'Squeeze',
      caption: 'Handle at the abdomen, chest proud, torso still upright — no rowing with the back.',
      pose: { both: { ...SEATED, shoulderFlex: 4, shoulderAbduct: 14, elbow: 104 } },
      view: 'side',
    },
  ],

  row_supported: [
    {
      label: 'Set up',
      caption: 'Chest on the pad so the torso cannot help, arms hanging straight down.',
      pose: { torsoPitch: 68, both: { ...arms(68), ...leg(28, 34) } },
      view: 'side',
    },
    {
      label: 'Pull',
      caption: 'Elbows back and down, squeezing the shoulder blades toward each other.',
      pose: { torsoPitch: 68, both: { ...arms(68, -16, { shoulderAbduct: 26, elbow: 62 }), ...leg(28, 34) } },
      view: 'side',
    },
    {
      label: 'Squeeze',
      caption: 'Hold the top for a beat. Chest support is what makes this all back and no cheating.',
      pose: { torsoPitch: 68, both: { ...arms(68, -30, { shoulderAbduct: 28, elbow: 100 }), ...leg(28, 34) } },
      view: 'side',
    },
  ],

  row_inverted: [
    {
      label: 'Set up',
      caption: 'Hanging under the bar, body straight from head to heels, arms extended.',
      pose: { rootPitch: -78, both: { shoulderFlex: 88, shoulderAbduct: 20, elbow: 6 } },
      view: 'side',
    },
    {
      label: 'Pull',
      caption: 'Pull your chest to the bar as one rigid piece, elbows tracking back.',
      pose: { rootPitch: -78, both: { shoulderFlex: 44, shoulderAbduct: 34, elbow: 66 } },
      view: 'side',
    },
    {
      label: 'Top',
      caption: 'Chest to the bar, shoulder blades pinched, hips still in line.',
      pose: { rootPitch: -78, both: { shoulderFlex: 8, shoulderAbduct: 38, elbow: 108 } },
      view: 'side',
    },
  ],

  row_face_pull: [
    {
      label: 'Set up',
      caption: 'Cable at head height, arms extended toward it, shoulder blades relaxed.',
      pose: { both: { shoulderFlex: 84, shoulderAbduct: 40, elbow: 10 } },
      view: 'front',
    },
    {
      label: 'Pull',
      caption: 'Pull toward your forehead, splitting the hands apart as they come.',
      pose: { both: { shoulderFlex: 44, shoulderAbduct: 72, elbow: 72 } },
      view: 'front',
    },
    {
      label: 'Top',
      caption: 'Hands beside your ears, upper arms level, rear delts and mid-back squeezed.',
      pose: { both: { shoulderFlex: 14, shoulderAbduct: 92, elbow: 118 } },
      view: 'front',
    },
  ],

  row_rear_delt: [
    {
      label: 'Set up',
      caption: 'Hinged forward with the arms hanging straight below the shoulders.',
      pose: { torsoPitch: 70, both: { ...arms(70), ...leg(30, 36) } },
      view: 'side',
    },
    {
      label: 'Raise',
      caption: 'Sweep the arms out to the sides with only a slight elbow bend.',
      pose: { torsoPitch: 70, both: { ...arms(70, 0, { shoulderAbduct: 50, elbow: 18 }), ...leg(30, 36) } },
      view: 'front',
    },
    {
      label: 'Top',
      caption: 'Arms level with the torso. Lead with the elbows, not the hands.',
      pose: { torsoPitch: 70, both: { ...arms(70, 0, { shoulderAbduct: 88, elbow: 18 }), ...leg(30, 36) } },
      view: 'front',
    },
  ],

  shrug: [
    {
      label: 'Set up',
      caption: 'Standing tall, arms hanging straight, shoulders relaxed down.',
      pose: { both: { ...ARMS_HANGING } },
      view: 'front',
    },
    {
      label: 'Shrug',
      caption: 'Lift the shoulders straight up toward your ears. Elbows stay straight.',
      pose: { both: { ...ARMS_HANGING, shoulderAbduct: 8 } },
      view: 'front',
    },
    {
      label: 'Lower',
      caption: 'Control the way down to a full stretch. Do not roll the shoulders.',
      pose: { both: { ...ARMS_HANGING } },
      view: 'front',
    },
  ],

  // --- Shoulders ---------------------------------------------------------
  raise_lateral: [
    {
      label: 'Set up',
      caption: 'Standing tall, weights at your sides, a slight bend held in the elbows.',
      pose: { both: { shoulderAbduct: 6, elbow: 12 } },
      view: 'front',
    },
    {
      label: 'Raise',
      caption: 'Lead with the elbows and lift out to the side, not forward.',
      pose: { both: { shoulderAbduct: 52, elbow: 14 } },
      view: 'front',
    },
    {
      label: 'Top',
      caption: 'Stop at shoulder height. Higher brings the traps in and takes the delts out.',
      pose: { both: { shoulderAbduct: 88, elbow: 14 } },
      view: 'front',
    },
  ],

  // --- Arms --------------------------------------------------------------
  curl: [
    {
      label: 'Set up',
      caption: 'Standing tall, arms straight, elbows pinned at your sides.',
      pose: { both: { ...ARMS_HANGING } },
      view: 'side',
    },
    {
      label: 'Curl',
      caption: 'Bend the elbow only. The upper arm should not swing forward.',
      pose: { both: { shoulderFlex: 6, elbow: 62 } },
      view: 'side',
    },
    {
      label: 'Top',
      caption: 'Squeeze at the top, then lower all the way to straight — the stretch matters.',
      pose: { both: { shoulderFlex: 10, elbow: 128 } },
      view: 'side',
    },
  ],

  curl_incline: [
    {
      label: 'Set up',
      caption: 'Chest against the pad so the upper arms cannot swing at all.',
      pose: { torsoPitch: 55, both: { ...arms(55), ...leg(12, 16) } },
      view: 'side',
    },
    {
      label: 'Curl',
      caption: 'Bend the elbows with the upper arms fixed and hanging.',
      pose: { torsoPitch: 55, both: { ...arms(55, 0, { elbow: 66 }), ...leg(12, 16) } },
      view: 'side',
    },
    {
      label: 'Top',
      caption: 'Squeeze, then lower under control to a dead-straight arm.',
      pose: { torsoPitch: 55, both: { ...arms(55, 0, { elbow: 126 }), ...leg(12, 16) } },
      view: 'side',
    },
  ],

  extension_pushdown: [
    {
      label: 'Set up',
      caption: 'Upper arms at your sides, elbows bent, forearms up against the cable.',
      pose: { both: { shoulderFlex: 2, elbow: 96 } },
      view: 'side',
    },
    {
      label: 'Extend',
      caption: 'Straighten the elbow, driving the hands down. Upper arms do not move.',
      pose: { both: { shoulderFlex: 2, elbow: 46 } },
      view: 'side',
    },
    {
      label: 'Lock out',
      caption: 'Fully straight with a hard squeeze, then let the elbow bend back under control.',
      pose: { both: { shoulderFlex: 2, elbow: 4 } },
      view: 'side',
    },
  ],

  extension_overhead: [
    {
      label: 'Set up',
      caption: 'Upper arms vertical beside your head, weight behind you, elbows bent.',
      pose: { both: { shoulderAbduct: 160, shoulderFlex: 10, elbow: 110 } },
      view: 'side',
    },
    {
      label: 'Extend',
      caption: 'Straighten the elbows while the upper arms stay put beside your ears.',
      pose: { both: { shoulderAbduct: 162, shoulderFlex: 8, elbow: 56 } },
      view: 'side',
    },
    {
      label: 'Lock out',
      caption: 'Arms straight overhead. Overhead is where the long head gets its stretch.',
      pose: { both: { shoulderAbduct: 166, shoulderFlex: 6, elbow: 6 } },
      view: 'side',
    },
  ],

  extension_lying: [
    {
      label: 'Set up',
      caption: 'Lying flat, upper arms angled back slightly, elbows bent.',
      pose: { rootPitch: -90, both: { ...ON_BENCH, shoulderFlex: 96, shoulderAbduct: 16, elbow: 104 } },
      view: 'side',
    },
    {
      label: 'Extend',
      caption: 'Straighten the elbows only — the upper arms hold their angle.',
      pose: { rootPitch: -90, both: { ...ON_BENCH, shoulderFlex: 94, shoulderAbduct: 16, elbow: 52 } },
      view: 'side',
    },
    {
      label: 'Lock out',
      caption: 'Locked out over the chest, then lower back toward your forehead under control.',
      pose: { rootPitch: -90, both: { ...ON_BENCH, shoulderFlex: 92, shoulderAbduct: 16, elbow: 6 } },
      view: 'side',
    },
  ],

  // --- Legs, isolation ---------------------------------------------------
  leg_extension: [
    {
      label: 'Set up',
      caption: 'Seated with the pad on your shins and the knees bent to about 90°.',
      pose: { both: { ...SEATED, shoulderAbduct: 30, shoulderFlex: 30, elbow: 60 } },
      view: 'side',
    },
    {
      label: 'Extend',
      caption: 'Straighten the knees smoothly — no kicking, no using momentum.',
      pose: { both: { hipFlex: 88, knee: 42, shoulderAbduct: 30, shoulderFlex: 30, elbow: 60 } },
      view: 'side',
    },
    {
      label: 'Squeeze',
      caption: 'Pause with the legs straight and the quads hard, then lower slowly.',
      pose: { both: { hipFlex: 88, knee: 4, shoulderAbduct: 30, shoulderFlex: 30, elbow: 60 } },
      view: 'side',
    },
  ],

  leg_curl: [
    {
      label: 'Set up',
      caption: 'Face down with the pad above your heels and the legs straight.',
      pose: { rootPitch: 90, both: { shoulderFlex: 30, shoulderAbduct: 45, elbow: 100, knee: 6 } },
      view: 'side',
    },
    {
      label: 'Curl',
      caption: 'Bend the knees to bring the heels toward your glutes. Hips stay down.',
      pose: { rootPitch: 90, both: { shoulderFlex: 30, shoulderAbduct: 45, elbow: 100, knee: 62 } },
      view: 'side',
    },
    {
      label: 'Top',
      caption: 'Squeeze the hamstrings at the top, then lower all the way under control.',
      pose: { rootPitch: 90, both: { shoulderFlex: 30, shoulderAbduct: 45, elbow: 100, knee: 118 } },
      view: 'side',
    },
  ],

  calf_raise: [
    {
      label: 'Set up',
      caption: 'Balls of the feet on the step, heels dropped below them for a full stretch.',
      pose: { both: { ...ARMS_HANGING, ankle: 24 } },
      view: 'side',
    },
    {
      label: 'Raise',
      caption: 'Push through the balls of the feet, driving the heels up.',
      pose: { both: { ...ARMS_HANGING, ankle: -10 } },
      view: 'side',
    },
    {
      label: 'Top',
      caption: 'All the way onto the toes, hold, then lower slowly back into the stretch.',
      pose: { both: { ...ARMS_HANGING, ankle: -34 } },
      view: 'side',
    },
  ],

  calf_raise_seated: [
    {
      label: 'Set up',
      caption: 'Seated with the pad on your thighs and the heels dropped below the platform.',
      pose: { both: { ...SEATED, ankle: 24, shoulderFlex: 40, shoulderAbduct: 24, elbow: 70 } },
      view: 'side',
    },
    {
      label: 'Raise',
      caption: 'Drive the heels up through the balls of the feet.',
      pose: { both: { ...SEATED, ankle: -12, shoulderFlex: 40, shoulderAbduct: 24, elbow: 70 } },
      view: 'side',
    },
    {
      label: 'Top',
      caption: 'Squeeze hard at the top. The bent knee here targets the soleus underneath.',
      pose: { both: { ...SEATED, ankle: -34, shoulderFlex: 40, shoulderAbduct: 24, elbow: 70 } },
      view: 'side',
    },
  ],

  // --- Single-leg --------------------------------------------------------
  lunge: [
    {
      label: 'Set up',
      caption: 'Standing tall with the weights at your sides, core braced.',
      pose: { both: { ...ARMS_HANGING } },
      view: 'side',
    },
    {
      label: 'Step',
      caption: 'Step forward and let both knees bend, torso staying upright.',
      pose: {
        both: { ...ARMS_HANGING },
        right: { ...ARMS_HANGING, ...leg(42, 56) },
        left: { ...ARMS_HANGING, hipFlex: -14, knee: 40, ankle: -20 },
      },
      view: 'side',
    },
    {
      label: 'Bottom',
      caption: 'Front thigh parallel, back knee just off the floor, weight through the front foot.',
      pose: {
        both: { ...ARMS_HANGING },
        right: { ...ARMS_HANGING, ...leg(80, 100) },
        left: { ...ARMS_HANGING, hipFlex: -22, knee: 100, ankle: -28 },
      },
      view: 'side',
    },
    {
      label: 'Drive',
      caption: 'Push through the front foot to stand, keeping the torso vertical.',
      pose: {
        both: { ...ARMS_HANGING },
        right: { ...ARMS_HANGING, ...leg(34, 46) },
        left: { ...ARMS_HANGING, hipFlex: -12, knee: 34, ankle: -18 },
      },
      view: 'side',
    },
  ],

  split_squat: [
    {
      label: 'Set up',
      caption: 'Back foot elevated behind you, front foot planted, torso upright.',
      pose: {
        right: { ...ARMS_HANGING, ...leg(16, 24) },
        left: { ...ARMS_HANGING, hipFlex: -30, knee: 58, ankle: -26 },
      },
      view: 'side',
    },
    {
      label: 'Descend',
      caption: 'Drop straight down, letting the front knee travel forward over the foot.',
      pose: {
        right: { ...ARMS_HANGING, ...leg(54, 66) },
        left: { ...ARMS_HANGING, hipFlex: -34, knee: 90, ankle: -30 },
      },
      view: 'side',
    },
    {
      label: 'Bottom',
      caption: 'Front thigh at or below parallel, back knee low, hips square.',
      pose: {
        right: { ...ARMS_HANGING, ...leg(88, 106) },
        left: { ...ARMS_HANGING, hipFlex: -38, knee: 120, ankle: -32 },
      },
      view: 'side',
    },
  ],

  step_up: [
    {
      label: 'Set up',
      caption: 'One foot planted on the box, the other on the floor behind you.',
      pose: {
        right: { ...ARMS_HANGING, ...leg(74, 86) },
        left: { ...ARMS_HANGING, ...leg(0, 8) },
      },
      view: 'side',
    },
    {
      label: 'Drive',
      caption: 'Push through the top foot only — resist pushing off the trailing leg.',
      pose: {
        right: { ...ARMS_HANGING, ...leg(38, 50) },
        left: { ...ARMS_HANGING, hipFlex: -10, knee: 26, ankle: -14 },
      },
      view: 'side',
    },
    {
      label: 'Top',
      caption: 'Stand tall on the box, then lower back down under control.',
      pose: {
        right: { ...ARMS_HANGING, ...leg(6, 8) },
        left: { ...ARMS_HANGING, hipFlex: -18, knee: 32, ankle: -20 },
      },
      view: 'side',
    },
  ],

  // --- Core --------------------------------------------------------------
  core_plank: [
    {
      label: 'Set up',
      caption: 'Forearms down, elbows under the shoulders, feet together.',
      pose: { rootPitch: 90, both: { shoulderFlex: 88, shoulderAbduct: 12, elbow: 92 } },
      view: 'side',
    },
    {
      label: 'Brace',
      caption: 'One straight line from head to heels: ribs down, glutes squeezed, hips level.',
      pose: { rootPitch: 90, both: { shoulderFlex: 88, shoulderAbduct: 12, elbow: 92 } },
      view: 'side',
    },
  ],

  core_leg_raise: [
    {
      label: 'Hang',
      caption: 'Full hang from the bar, legs straight, shoulders active.',
      pose: { anchor: 'hands', both: { shoulderFlex: 8, shoulderAbduct: 158, elbow: 6 } },
      view: 'side',
    },
    {
      label: 'Raise',
      caption: 'Lift the legs by curling the pelvis up — no swinging.',
      pose: { anchor: 'hands', both: { shoulderFlex: 8, shoulderAbduct: 158, elbow: 6, hipFlex: 55, knee: 12 } },
      view: 'side',
    },
    {
      label: 'Top',
      caption: 'Legs to about horizontal or higher, then lower slowly all the way down.',
      pose: { anchor: 'hands', both: { shoulderFlex: 8, shoulderAbduct: 158, elbow: 6, hipFlex: 95, knee: 10 } },
      view: 'side',
    },
  ],

  core_pallof: [
    {
      label: 'Set up',
      caption: 'Cable at chest height beside you, hands at the sternum, feet planted.',
      pose: { both: { shoulderFlex: 42, shoulderAbduct: 22, elbow: 108 } },
      view: 'front',
    },
    {
      label: 'Press',
      caption: 'Press straight out and resist the cable pulling you into a twist.',
      pose: { both: { shoulderFlex: 84, shoulderAbduct: 14, elbow: 10 } },
      view: 'front',
    },
    {
      label: 'Return',
      caption: 'Hold, then bring the hands back to your chest without letting the hips turn.',
      pose: { both: { shoulderFlex: 42, shoulderAbduct: 22, elbow: 108 } },
      view: 'front',
    },
  ],

  carry: [
    {
      label: 'Pick up',
      caption: 'Hinge down, take the handles, and stand up with a flat back.',
      pose: { torsoPitch: 44, both: { ...arms(44), ...leg(51, 62) } },
      view: 'side',
    },
    {
      label: 'Stand tall',
      caption: 'Shoulders back and down, ribs stacked over the hips, weights hanging heavy.',
      pose: { both: { ...ARMS_HANGING } },
      view: 'front',
    },
    {
      label: 'Walk',
      caption: 'Short, controlled steps. Do not lean away from the load or let a shoulder drop.',
      pose: { right: { ...ARMS_HANGING, ...leg(26, 30) }, left: { ...ARMS_HANGING, hipFlex: -12, knee: 20, ankle: -8 } },
      view: 'side',
    },
  ],
}

export const ARCHETYPE_KEYS = Object.keys(POSE_ARCHETYPES)
