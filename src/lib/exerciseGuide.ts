import { EXERCISES } from './exercises'
import { POSE_ARCHETYPES, type GuideFrame } from './exercisePoses'

/**
 * How to perform every exercise in the library.
 *
 * The text is per-exercise because that is where the value is — the cues for a
 * front squat are genuinely different from a back squat, even though the movement
 * is the same shape. The *poses* are shared through an archetype, because a
 * dumbbell bench press and a machine chest press are one movement with a different
 * handle, and duplicating 240 keyframes to say so would mean 240 places to correct.
 *
 * `noDiagram` is set where an honest diagram is not possible. The figure's torso is
 * one rigid segment, so it can tilt but not curl — a movement whose whole point is
 * spinal flexion gets the written cues and no picture, rather than a picture that
 * is quietly wrong about the thing you are trying to learn.
 */

export interface ExerciseGuide {
  /** What the lift is for, in one line. */
  summary: string
  /** Getting into position. */
  setup: string[]
  /** Performing the rep. */
  execution: string[]
  /** Short things to think about mid-set. */
  cues: string[]
  /** The errors that actually cost people results or joints. */
  mistakes: string[]
  /** Key into POSE_ARCHETYPES. */
  archetype?: string
  /** Why there is no diagram, when there is not one. */
  noDiagram?: string
}

const G = (
  summary: string,
  archetype: string | null,
  setup: string[],
  execution: string[],
  cues: string[],
  mistakes: string[],
  noDiagram?: string,
): ExerciseGuide => ({ summary, archetype: archetype ?? undefined, setup, execution, cues, mistakes, noDiagram })

export const EXERCISE_GUIDES: Record<string, ExerciseGuide> = {
  // ---- Horizontal push ---------------------------------------------------
  bench_press: G(
    'The primary upper-body pressing lift, and the standard benchmark for chest strength.',
    'press_bench',
    [
      'Lie flat with your eyes under the bar. Plant both feet and keep them still.',
      'Pull your shoulder blades back and down into the bench and hold them there all set.',
      'Grip so that at the bottom your forearms are vertical — usually 1.5× shoulder width.',
    ],
    [
      'Unrack to arms’ length over your shoulders, not over your face.',
      'Lower under control to your lower chest, elbows tucked to roughly 45° from your torso.',
      'Touch lightly, then press up and slightly back so the bar finishes over the shoulders.',
    ],
    ['Chest up, shoulder blades pinned', 'Bend the bar apart', 'Push yourself away from the bar'],
    [
      'Flaring the elbows straight out — it puts the shoulder in its least stable position.',
      'Bouncing the bar off the chest, which skips the hardest part of the rep.',
      'Letting the shoulder blades come loose, which costs you both power and a stable shoulder.',
    ],
  ),
  incline_bench: G(
    'Shifts pressing emphasis to the upper chest and front delts.',
    'press_incline',
    [
      'Set the bench to about 30°. Steeper turns it into a shoulder press.',
      'Same setup as a flat press: shoulder blades back and down, feet planted.',
    ],
    [
      'Unrack over the collarbones and lower to the upper chest.',
      'Press back up along the same line, stopping just short of locking out.',
    ],
    ['Only 30°', 'Bar to the upper chest, not the throat'],
    ['Setting the bench too steep, which recruits the delts and lets the chest off.', 'Bouncing out of the bottom.'],
  ),
  db_bench: G(
    'A bench press with a longer range of motion and a harder stability demand.',
    'press_bench',
    [
      'Sit on the end of the bench with the dumbbells on your thighs, then kick them back as you lie down.',
      'Set your shoulder blades before the first rep.',
    ],
    [
      'Start with the dumbbells over your shoulders, palms facing forward.',
      'Lower until your upper arms are level with the bench, or slightly below.',
      'Press up and let the dumbbells converge slightly without clashing them.',
    ],
    ['Deeper than a barbell — use it', 'Wrists stacked over elbows'],
    [
      'Going so heavy that the shoulders roll forward at the bottom.',
      'Banging the dumbbells together at the top, which unloads the chest.',
    ],
  ),
  incline_db_press: G(
    'Upper-chest pressing with a deeper stretch than the barbell version.',
    'press_incline',
    ['Bench at about 30°, dumbbells kicked back into position as you lie down.'],
    [
      'Lower to the sides of your upper chest until you feel the stretch.',
      'Press up and slightly together, keeping the elbows under the hands.',
    ],
    ['Feel the stretch at the bottom', 'Elbows under the wrists'],
    ['Letting the elbows drift behind the shoulders under load.', 'Cutting the range of motion short.'],
  ),
  machine_chest_press: G(
    'Chest pressing with the stability handled for you — good for adding volume cheaply.',
    'press_bench',
    ['Set the seat so the handles line up with the middle of your chest.', 'Back flat against the pad.'],
    ['Press out until the arms are almost straight.', 'Return under control until you feel a chest stretch.'],
    ['Handles at mid-chest height', 'Control the return'],
    ['Setting the seat too high, which turns it into a shoulder press.', 'Letting the weight slam back.'],
  ),
  pushup: G(
    'Bodyweight horizontal pressing, and a genuine test of whether your core holds a line.',
    'press_pushup',
    ['Hands under the shoulders, slightly wider than them.', 'Squeeze your glutes and brace so the body is one line.'],
    [
      'Lower as one rigid piece until your chest is just off the floor.',
      'Elbows back at about 45°, not straight out.',
      'Press the floor away and finish with the ribs down.',
    ],
    ['One straight line', 'Elbows back, not out', 'Squeeze the glutes'],
    ['Hips sagging or piking up.', 'Head reaching for the floor ahead of the chest.'],
  ),
  dip: G(
    'The heaviest bodyweight pressing movement — chest and triceps together.',
    'press_dip',
    ['Support yourself on straight arms with the bars just outside your hips.', 'Lean the chest slightly forward.'],
    [
      'Bend the elbows and let the chest travel forward as you descend.',
      'Stop when the upper arms are about level with the floor.',
      'Drive back up to straight arms.',
    ],
    ['Lean forward for chest, stay upright for triceps', 'Shoulders down, away from your ears'],
    [
      'Going deeper than your shoulders can control, which is the fastest way to hurt them here.',
      'Shrugging up at the bottom instead of keeping the shoulders down.',
    ],
  ),
  cable_fly: G(
    'Chest isolation with constant tension through the whole arc.',
    'press_fly',
    ['Cables set at about chest height, one step forward so there is tension at the start.'],
    [
      'With a fixed slight elbow bend, bring the hands together in front of your chest.',
      'Open back out until you feel a chest stretch, then stop.',
    ],
    ['One arc, not a press', 'Fixed elbow angle'],
    ['Turning it into a press by bending and straightening the elbows.', 'Going so far back that the shoulder takes the stretch instead of the chest.'],
  ),
  pec_deck: G(
    'The most stable way to isolate the chest, with no balance demand at all.',
    'press_fly',
    ['Seat height so your upper arms rest level with your chest on the pads.', 'Back flat against the pad.'],
    ['Bring the pads together in front of your chest and squeeze.', 'Return under control to a stretch.'],
    ['Squeeze with the chest, not the hands', 'Elbows level with the shoulders'],
    ['Setting the seat too low, which makes it a front-delt exercise.', 'Rushing the return.'],
  ),
  close_grip_bench: G(
    'A press that loads the triceps hard while still letting you use real weight.',
    'press_bench',
    ['Grip about shoulder width. Narrower than that wrecks the wrists without adding triceps.'],
    ['Lower to the lower chest with the elbows tucked close to the body.', 'Press up, thinking about straightening the elbows.'],
    ['Elbows tucked', 'Shoulder-width grip, no narrower'],
    ['Gripping so narrow the wrists bend back painfully.', 'Letting the elbows flare, which hands the work back to the chest.'],
  ),

  // ---- Vertical push -----------------------------------------------------
  ohp: G(
    'Standing overhead pressing — the best measure of true shoulder strength.',
    'press_overhead',
    ['Bar on the front of your shoulders, hands just outside shoulder width.', 'Squeeze the glutes and brace so the lower back does not arch.'],
    [
      'Press straight up, moving your head back out of the way rather than pushing the bar forward.',
      'As the bar clears your face, push your head back through and lock out overhead.',
      'Finish with the bar over the middle of your feet, biceps beside your ears.',
    ],
    ['Ribs down, glutes tight', 'Head back, then through', 'Bar over mid-foot at the top'],
    [
      'Arching the lower back to get the weight up — that is a back exercise you did not intend.',
      'Pressing the bar forward around your head instead of moving your head.',
    ],
  ),
  db_shoulder_press: G(
    'Overhead pressing with a natural path and a hard stability requirement.',
    'press_overhead_seated',
    ['Seated with back support, dumbbells at shoulder height, elbows under the hands.'],
    ['Press up and slightly in so the dumbbells converge as they rise.', 'Lower under control to shoulder height.'],
    ['Elbows under wrists', 'Do not shrug at the top'],
    ['Pressing with the elbows flared straight out to the sides.', 'Arching the lower back off the pad.'],
  ),
  machine_shoulder_press: G(
    'Stable overhead pressing, useful when the free-weight version is limited by balance.',
    'press_overhead_seated',
    ['Seat set so the handles start at about shoulder height.'],
    ['Press up to almost straight, then lower under control.'],
    ['Handles at shoulder height to start', 'Ribs down'],
    ['Starting with the handles too low, which strains the shoulder at the bottom.'],
  ),
  lateral_raise: G(
    'The only movement that trains the side delt directly — which is what builds shoulder width.',
    'raise_lateral',
    ['Standing tall, weights at your sides, a slight bend held in the elbows.'],
    ['Lead with the elbows and lift out to the side.', 'Stop at shoulder height, then lower slowly.'],
    ['Lead with the elbows', 'Stop at shoulder height', 'Light weight, strict form'],
    [
      'Swinging the weights up with the whole body — this is one of the few lifts where going light is correct.',
      'Raising above shoulder height, which hands the work to the traps.',
    ],
  ),
  cable_lateral_raise: G(
    'A lateral raise with tension at the bottom, where dumbbells have almost none.',
    'raise_lateral',
    ['Cable set low, running across your body so it pulls from the opposite side.'],
    ['Raise out to shoulder height, leading with the elbow.', 'Lower slowly against the cable.'],
    ['Tension at the bottom is the point', 'Strict, slow, controlled'],
    ['Letting the torso swing to start the rep.'],
  ),

  // ---- Horizontal pull ---------------------------------------------------
  barbell_row: G(
    'The heaviest horizontal pull, and the main builder of back thickness.',
    'row_bent',
    ['Hinge to about 45° with a flat, braced back.', 'Bar hanging at arms’ length, hands just outside your knees.'],
    [
      'Row toward the bottom of your ribs, driving the elbows back rather than out.',
      'Squeeze the shoulder blades together at the top.',
      'Lower under control to a full stretch without letting the back round.',
    ],
    ['Elbows back, not out', 'Torso angle never changes', 'Squeeze the blades'],
    [
      'Standing up as you row, which turns it into a shrug and a deadlift.',
      'Rounding the lower back — the one thing that makes this lift risky.',
    ],
  ),
  db_row: G(
    'One-arm rowing with support, so the lat works without the lower back holding you up.',
    'row_supported',
    ['One hand and knee on the bench, or one hand on a rack. Back flat and level.'],
    ['Pull the dumbbell toward your hip, elbow tracking back close to your side.', 'Lower to a full stretch.'],
    ['Pull to the hip, not the armpit', 'No twisting to gain reach'],
    ['Rotating the torso to lift more weight.', 'Yanking with the arm instead of the back.'],
  ),
  seated_cable_row: G(
    'Constant-tension horizontal pulling that is easy to progress and easy on the back.',
    'row_seated',
    ['Feet braced, knees soft, sitting tall with the arms extended.'],
    [
      'Retract the shoulder blades first, then bend the elbows to bring the handle to your navel.',
      'Return by letting the arms extend and the blades travel forward — but not the lower back.',
    ],
    ['Blades first, then elbows', 'Chest proud', 'Torso still'],
    ['Rowing by rocking back and forth.', 'Shrugging the shoulders up as you pull.'],
  ),
  chest_supported_row: G(
    'Rowing with the torso removed from the equation — the strictest back builder there is.',
    'row_supported',
    ['Chest firmly on the pad, feet planted, arms hanging straight down.'],
    ['Pull the elbows back and down, squeezing the blades together.', 'Hold the top briefly, then lower to a full stretch.'],
    ['Chest stays on the pad', 'Pause at the top'],
    ['Pulling the chest off the pad to move more weight, which defeats the whole point.'],
  ),
  inverted_row: G(
    'Bodyweight horizontal pulling, and the best scalable pull for beginners.',
    'row_inverted',
    ['Bar set so you hang under it with straight arms.', 'Body in one straight line, heels on the floor.'],
    ['Pull your chest to the bar as a rigid piece.', 'Lower under control to straight arms.'],
    ['One straight line', 'Chest to the bar'],
    ['Letting the hips sag or leading with the chin.', 'Cutting the range short at the bottom.'],
  ),
  face_pull: G(
    'The best single exercise for shoulder health, and the direct fix for a press-heavy program.',
    'row_face_pull',
    ['Rope on a cable at about head height. Step back so there is tension at the start.'],
    ['Pull toward your forehead, splitting the hands apart as they arrive.', 'Finish with the hands beside your ears and the upper arms level.'],
    ['Pull apart as well as back', 'Upper arms level with the floor', 'High reps, light weight'],
    ['Going heavy and turning it into a row.', 'Pulling to the chest instead of the face.'],
  ),
  rear_delt_fly: G(
    'Direct rear-delt work — the muscle most commonly missing from a pressing-heavy program.',
    'row_rear_delt',
    ['Hinge forward until your torso is nearly parallel to the floor.', 'Arms hanging straight below your shoulders.'],
    ['Sweep the arms out to the sides with only a slight elbow bend.', 'Stop level with the torso, then lower slowly.'],
    ['Lead with the elbows', 'Light weight, strict form', 'No shrugging'],
    ['Using so much weight it becomes a row.', 'Letting the torso rise as you lift.'],
  ),
  shrug: G(
    'Direct upper-trap work, straight up and down.',
    'shrug',
    ['Standing tall with the weight hanging at arms’ length.'],
    ['Lift the shoulders straight up toward your ears.', 'Lower under control to a full stretch.'],
    ['Straight up, straight down', 'Elbows stay straight'],
    ['Rolling the shoulders, which does nothing extra and irritates the joint.', 'Bending the elbows to help.'],
  ),

  // ---- Vertical pull -----------------------------------------------------
  pullup: G(
    'The best upper-body pulling movement, and the benchmark for relative back strength.',
    'pull_up',
    ['Hands just outside shoulder width, palms facing away.', 'Start from a full hang with the shoulders active rather than loose.'],
    [
      'Pull your shoulder blades down first — the elbows follow, they never lead.',
      'Drive the elbows down to your sides until your chin clears the bar.',
      'Lower under control all the way to a full hang.',
    ],
    ['Blades down first', 'Chest to the bar', 'Full hang every rep'],
    [
      'Kipping or swinging to get the chin over.',
      'Stopping short of a full hang, which cuts out the hardest and most useful part.',
    ],
  ),
  chinup: G(
    'A pull-up with the palms toward you — more biceps, and usually a few more reps.',
    'pull_up',
    ['Palms facing you, hands about shoulder width.'],
    ['Pull until your chin clears the bar, driving the elbows down.', 'Lower to a full hang under control.'],
    ['Elbows down and in', 'Full range both ways'],
    ['Swinging.', 'Half reps at the bottom.'],
  ),
  lat_pulldown: G(
    'Vertical pulling you can load precisely — the best substitute while building to pull-ups.',
    'pull_down',
    ['Thighs secured under the pads, hands just outside shoulder width.', 'Sit tall with only a slight lean back.'],
    ['Drive the elbows down and back, leading with the shoulder blades.', 'Bar to the upper chest, then return to a full stretch overhead.'],
    ['Elbows down, not hands down', 'Chest up', 'Control the way up'],
    ['Leaning way back and turning it into a row.', 'Pulling behind the neck, which the shoulder does not thank you for.'],
  ),
  straight_arm_pulldown: G(
    'Lat isolation with the biceps taken out of it entirely.',
    'pull_straight_arm',
    ['Cable set high, standing back from it with a slight forward lean.', 'Fix a small bend in the elbows and keep it.'],
    ['Sweep the arms down in one arc until the hands reach your thighs.', 'Return overhead under control to a full lat stretch.'],
    ['All shoulder, no elbow', 'Feel the lats, not the triceps'],
    ['Bending and straightening the elbows, which makes it a pushdown.', 'Using the torso to drive the movement.'],
  ),

  // ---- Squat -------------------------------------------------------------
  back_squat: G(
    'The primary lower-body lift and the standard benchmark for leg strength.',
    'squat_back',
    [
      'Bar on your upper back, not your neck. Squeeze your shoulder blades to build the shelf.',
      'Feet about shoulder width, toes turned out slightly.',
      'Take a big breath, brace hard, and stand the bar out of the rack.',
    ],
    [
      'Break at the hips and knees together and descend under control.',
      'Push the knees out over your feet and keep your weight through the middle of the foot.',
      'Go until the hip crease is below the knee, then drive the floor away and lead with the chest.',
    ],
    ['Knees out', 'Chest up', 'Push the floor away', 'Brace before every rep'],
    [
      'Knees caving inward under load.',
      'Letting the hips shoot up first, which dumps the bar forward.',
      'Cutting depth — a half squat trains half the muscle.',
    ],
  ),
  front_squat: G(
    'A squat that forces an upright torso, loading the quads harder and the back less.',
    'squat_front',
    ['Bar across the front of your shoulders, fingertips under it, elbows pointed high.', 'Feet about shoulder width.'],
    ['Descend straight down with a vertical torso.', 'Keep the elbows high the whole way — if they drop, the bar rolls off.', 'Drive up out of the bottom.'],
    ['Elbows high', 'Torso vertical', 'Knees travel forward'],
    ['Letting the elbows drop, which dumps the bar.', 'Leaning forward, which this lift will not tolerate.'],
  ),
  goblet_squat: G(
    'The easiest way to learn a squat pattern, and a genuinely useful warm-up.',
    'squat_front',
    ['Hold a dumbbell or kettlebell at your chest with both hands, elbows tucked in.'],
    ['Squat straight down between your knees, keeping the chest up.', 'Drive up through the whole foot.'],
    ['Chest up', 'Elbows inside the knees at the bottom'],
    ['Letting the weight pull you forward.', 'Rounding the lower back at the bottom.'],
  ),
  hack_squat: G(
    'Machine squatting that loads the quads heavily with the back supported.',
    'squat_machine',
    ['Shoulders under the pads, back flat against the backrest, feet mid-platform.'],
    ['Lower until the knees reach about 90° or a little past.', 'Press back up without locking the knees hard.'],
    ['Back flat on the pad', 'Full foot on the platform'],
    ['Letting the lower back peel off the pad at the bottom.', 'Bouncing out of the bottom.'],
  ),
  leg_press: G(
    'High-volume quad and glute work with almost no systemic fatigue.',
    'squat_machine',
    ['Back and hips flat against the pad, feet about shoulder width on the platform.'],
    ['Lower until the knees reach about 90°.', 'Press through the whole foot and stop just short of locking out.'],
    ['Hips stay down on the pad', 'Knees track over the feet'],
    [
      'Going so deep the lower back rounds off the pad — the single most common way people hurt themselves here.',
      'Locking the knees hard at the top.',
    ],
  ),
  leg_extension: G(
    'Pure quad isolation, and the easiest way to add quad volume without fatigue.',
    'leg_extension',
    ['Seat set so the knees line up with the machine’s pivot and the pad sits on your lower shins.'],
    ['Straighten the knees smoothly.', 'Pause with the quads squeezed, then lower slowly.'],
    ['Squeeze at the top', 'No kicking'],
    ['Swinging the weight up with momentum.', 'Slamming the stack back down.'],
  ),

  // ---- Hinge -------------------------------------------------------------
  deadlift: G(
    'The heaviest lift there is — a full-body pull, and the benchmark for posterior-chain strength.',
    'hinge_deadlift',
    [
      'Bar over the middle of your foot, shins close to it.',
      'Hinge down and grip just outside your legs. Hips high, shoulders slightly ahead of the bar.',
      'Pull your chest up and brace hard before the bar moves. Take the slack out of the bar first.',
    ],
    [
      'Push the floor away. The bar leaves the ground before your hips rise.',
      'Keep the bar in contact with your legs the whole way up.',
      'Once past the knees, drive the hips forward and stand tall.',
    ],
    ['Take the slack out first', 'Push the floor away', 'Bar against the legs', 'Squeeze the glutes to finish'],
    [
      'Rounding the lower back, which is where deadlift injuries come from.',
      'Letting the hips shoot up so it becomes a stiff-legged pull.',
      'Leaning back or shrugging at the top — the rep is over when you are standing.',
    ],
  ),
  rdl: G(
    'The best hamstring and glute builder, and the lift that teaches hinging properly.',
    'hinge_rdl',
    ['Stand tall holding the bar against your thighs, knees unlocked but not bent.'],
    [
      'Push your hips back and slide the bar down your legs. This is a hinge, not a squat.',
      'Stop where the hamstrings run out of length with the back still flat — usually mid-shin.',
      'Drive the hips forward to stand, finishing with the glutes locked.',
    ],
    ['Hips back, not down', 'Bar against the legs', 'Stop where the stretch stops'],
    [
      'Bending the knees and turning it into a deadlift.',
      'Chasing the floor with the bar and rounding the back to get there.',
    ],
  ),
  trap_bar_deadlift: G(
    'A deadlift that is easier on the lower back and more forgiving to learn.',
    'hinge_deadlift',
    ['Stand in the middle of the bar, feet about hip width, and grip the handles at your sides.'],
    ['Hips back, chest up, then push the floor away and stand tall.', 'Lower under control, hips back first.'],
    ['Chest up, hips back', 'Push the floor away'],
    ['Squatting it up instead of hinging.', 'Rounding the back at the start.'],
  ),
  hip_thrust: G(
    'The most direct glute exercise, loadable heavily with no lower-back cost.',
    'hinge_thrust',
    ['Upper back on a bench, bar across the hips with a pad, feet planted about hip width.'],
    ['Push through the heels and squeeze the glutes to lift the hips.', 'Finish with the shins vertical and the ribs down.', 'Lower under control.'],
    ['Squeeze the glutes, not the back', 'Ribs down', 'Chin tucked'],
    [
      'Arching the lower back to get higher — this should be all glute.',
      'Pushing through the toes instead of the heels.',
    ],
  ),
  back_extension: G(
    'Trains the glutes, hamstrings and spinal erectors to hold a neutral spine under load.',
    'hinge_back_extension',
    ['Hips on the pad with room to fold, feet secured, arms crossed or behind your head.'],
    ['Fold at the hips only, keeping the spine neutral.', 'Squeeze the glutes to return to a straight line and stop there.'],
    ['Hinge, do not curl', 'Stop at a straight line'],
    ['Swinging past straight into extension, which compresses the lower back.', 'Rounding the back on the way down.'],
  ),
  leg_curl: G(
    'Direct hamstring work through knee flexion — the half of the hamstring a hinge misses.',
    'leg_curl',
    ['Lie face down with the pad just above your heels and your legs straight.'],
    ['Bend the knees to bring the heels toward your glutes.', 'Squeeze at the top, then lower all the way under control.'],
    ['Hips stay down', 'Full range both ways'],
    ['Lifting the hips off the pad to get more range.', 'Letting the weight drop back.'],
  ),
  cable_pull_through: G(
    'A hinge with the load pulling backward — the easiest way to feel the glutes doing it.',
    'hinge_rdl',
    ['Face away from a low cable with the rope between your legs, feet about shoulder width.'],
    ['Push your hips back to let the rope travel between your legs.', 'Drive the hips forward and squeeze the glutes to stand.'],
    ['Hips back and forward, not up and down', 'All glute at the finish'],
    ['Squatting instead of hinging.', 'Using the arms to pull the rope.'],
  ),

  // ---- Lunge / unilateral ------------------------------------------------
  lunge: G(
    'Single-leg work that builds the quads and glutes while exposing side-to-side differences.',
    'lunge',
    ['Stand tall with dumbbells at your sides, core braced.'],
    ['Step forward and let both knees bend, keeping the torso upright.', 'Front thigh to parallel, back knee just off the floor.', 'Push through the front foot to stand.'],
    ['Torso vertical', 'Weight through the front foot', 'Step long enough'],
    ['Stepping too short, which jams the front knee forward.', 'Leaning forward over the front leg.'],
  ),
  split_squat: G(
    'The hardest single-leg exercise, and one of the best quad and glute builders there is.',
    'split_squat',
    ['Back foot on a bench behind you, front foot far enough forward to be stable.'],
    ['Drop straight down, letting the front knee travel forward over the foot.', 'Front thigh to at or below parallel, then drive back up.'],
    ['Straight down, not forward', 'Hips square', 'Most of the weight on the front leg'],
    ['Pushing off the back foot.', 'Standing too upright and turning it into a hinge.'],
  ),
  step_up: G(
    'Single-leg pressing that is joint-friendly and very hard to cheat.',
    'step_up',
    ['Box at about knee height. Plant one whole foot on top of it.'],
    ['Push through the top foot only and stand tall on the box.', 'Lower back down under control — do not drop.'],
    ['Do not push off the bottom foot', 'Control the way down'],
    ['Bouncing off the trailing leg.', 'Using a box so high the hip has to hitch to reach it.'],
  ),

  // ---- Arms --------------------------------------------------------------
  barbell_curl: G(
    'The heaviest biceps movement, and the easiest to load progressively.',
    'curl',
    ['Standing tall, bar at arms’ length, elbows pinned at your sides.'],
    ['Bend the elbows to curl the bar up.', 'Squeeze at the top, then lower all the way to straight.'],
    ['Elbows pinned', 'No swinging', 'Full stretch at the bottom'],
    ['Swinging the hips to start the rep.', 'Stopping halfway down, which skips the stretched position where most growth happens.'],
  ),
  db_curl: G(
    'Biceps curling with a free wrist path and independent arms.',
    'curl',
    ['Standing or seated, dumbbells at your sides, palms forward.'],
    ['Curl one or both up, keeping the upper arms still.', 'Lower to a full stretch.'],
    ['Upper arms do not move', 'Turn the pinky up slightly at the top'],
    ['Swinging the upper arms forward.', 'Half reps.'],
  ),
  hammer_curl: G(
    'A neutral-grip curl that loads the brachialis and forearms as well as the biceps.',
    'curl',
    ['Dumbbells at your sides, palms facing each other, and keep them that way.'],
    ['Curl straight up without rotating the wrist.', 'Lower under control to straight.'],
    ['Neutral grip throughout', 'Elbows at your sides'],
    ['Letting the palms rotate, which turns it into a normal curl.'],
  ),
  cable_curl: G(
    'Curling with even tension through the whole range, including the top.',
    'curl',
    ['Low cable, standing far enough back that there is tension at the bottom.'],
    ['Curl up with the elbows fixed at your sides.', 'Resist the cable all the way down.'],
    ['Tension never drops', 'Slow on the way down'],
    ['Letting the elbows drift forward at the top.'],
  ),
  preacher_curl: G(
    'The strictest curl there is — the pad makes cheating impossible.',
    'curl_incline',
    ['Chest and upper arms flat on the pad, arms hanging down it.'],
    ['Curl up without lifting the upper arms off the pad.', 'Lower all the way to straight under control.'],
    ['Upper arms glued to the pad', 'Full extension at the bottom'],
    ['Coming off the pad to move more weight.', 'Stopping short at the bottom — this lift is about that stretch.'],
  ),
  tricep_pushdown: G(
    'The easiest way to add triceps volume, with constant tension and no setup cost.',
    'extension_pushdown',
    ['High cable, upper arms at your sides, elbows bent to about 90°.'],
    ['Straighten the elbows, driving the hands down.', 'Let the elbows bend back under control.'],
    ['Upper arms do not move', 'Lock out and squeeze'],
    ['Leaning over the cable and pressing with the chest.', 'Letting the elbows flare out and drift forward.'],
  ),
  overhead_extension: G(
    'The triceps exercise that trains the long head in its stretched position.',
    'extension_overhead',
    ['Weight overhead, upper arms vertical beside your head, elbows bent.'],
    ['Straighten the elbows while the upper arms stay beside your ears.', 'Lower under control into a deep stretch.'],
    ['Upper arms stay vertical', 'Deep stretch at the bottom'],
    ['Letting the elbows flare wide.', 'Letting the upper arms drift forward, which shortens the range that matters.'],
  ),
  skullcrusher: G(
    'Heavy triceps work with the upper arms fixed, so all the load goes through the elbow.',
    'extension_lying',
    ['Lying flat, arms angled slightly back over your head rather than straight up.'],
    ['Bend the elbows to lower the bar toward your forehead.', 'Straighten the elbows without moving the upper arms.'],
    ['Upper arms hold their angle', 'Control the descent'],
    ['Turning it into a press by moving the shoulders.', 'Going too heavy and hammering the elbows.'],
  ),

  // ---- Calves & core -----------------------------------------------------
  standing_calf_raise: G(
    'Straight-leg calf work, which is where the gastrocnemius does its job.',
    'calf_raise',
    ['Balls of the feet on the step, heels hanging free, legs straight.'],
    ['Drop the heels below the step for a full stretch.', 'Push up onto the toes as high as you can and hold.'],
    ['Full stretch at the bottom', 'Pause at the top', 'Slow — never bounce'],
    ['Bouncing through short reps on tendon rebound rather than muscle.', 'Bending the knees to help.'],
  ),
  seated_calf_raise: G(
    'Bent-knee calf work, which targets the soleus underneath the gastrocnemius.',
    'calf_raise_seated',
    ['Seated with the pad on your thighs and the balls of your feet on the platform.'],
    ['Drop the heels for a stretch, then drive up onto the toes.', 'Pause at the top and lower slowly.'],
    ['Bent knee is the point', 'Pause top and bottom'],
    ['Rushing the reps.', 'Short range at the bottom.'],
  ),
  plank: G(
    'Teaches the core to resist extension — holding a line under load, which is what it does in every lift.',
    'core_plank',
    ['Forearms down with the elbows under your shoulders, feet together.'],
    ['Build one straight line from head to heels.', 'Squeeze the glutes, pull the ribs down, and breathe.'],
    ['Ribs down', 'Glutes squeezed', 'Hips level'],
    [
      'Letting the hips sag, which loads the lower back instead of the core.',
      'Holding for minutes with poor position instead of 30 hard seconds with a good one.',
    ],
  ),
  hanging_leg_raise: G(
    'The hardest bodyweight core exercise, training the abs and hip flexors together.',
    'core_leg_raise',
    ['Hang from a bar with the shoulders active and the legs straight.'],
    ['Lift the legs by curling the pelvis up, not just by swinging the hips.', 'Raise to horizontal or higher, then lower slowly.'],
    ['Curl the pelvis', 'No swinging', 'Slow on the way down'],
    ['Using momentum and swinging between reps.', 'Only moving at the hip, which leaves the abs out.'],
  ),
  cable_crunch: G(
    'Loadable, progressable direct ab work — the abs respond to weight like any other muscle.',
    null,
    ['Kneel facing away from a high cable, rope held beside your head.'],
    ['Curl your spine down, bringing your elbows toward your thighs.', 'Return under control without letting the hips take over.'],
    ['Curl the spine, do not hinge', 'Hips stay fixed'],
    ['Hinging at the hips instead of flexing the spine.', 'Pulling with the arms.'],
    'This is spinal flexion, and the diagram figure has a rigid torso — it can tilt but not curl. A picture of it would show the wrong movement, so the cues stand on their own here.',
  ),
  ab_wheel: G(
    'A brutal anti-extension exercise — the core resists being pulled into an arch.',
    null,
    ['Kneel with the wheel under your shoulders, ribs down and glutes squeezed.'],
    ['Roll out only as far as you can go without the lower back arching.', 'Pull back with the abs, not the arms.'],
    ['Ribs down the whole time', 'Stop before the back arches'],
    ['Rolling out too far and arching, which is where the back gets hurt.', 'Pulling with the shoulders.'],
    'This one is defined by what the spine does not do, and the figure’s torso is a single rigid segment — so it cannot show the arch you are resisting. The cues carry it instead.',
  ),
  pallof_press: G(
    'Anti-rotation core work: the load tries to twist you and you refuse.',
    'core_pallof',
    ['Cable at chest height beside you, hands at your sternum, feet planted.'],
    ['Press straight out and hold, resisting the pull into a twist.', 'Return to your chest without letting the hips turn.'],
    ['Do not let the hips rotate', 'Hold the extended position'],
    ['Standing too close, so there is no rotational challenge.', 'Letting the torso turn toward the cable.'],
  ),
  farmer_carry: G(
    'Loaded carrying — grip, traps and a braced core all at once, and about as functional as it gets.',
    'carry',
    ['Hinge down, grip the handles, and stand up with a flat back.'],
    ['Walk with short controlled steps, shoulders back and down.', 'Set the weights down with a hinge, not a drop.'],
    ['Ribs stacked over hips', 'Do not lean away from the load', 'Breathe'],
    ['Letting one shoulder drop or the torso lean.', 'Dumping the weights from standing.'],
  ),
}

/** Guide for an exercise, including user-created ones (which have none). */
export function guideFor(exerciseId: string): ExerciseGuide | null {
  return EXERCISE_GUIDES[exerciseId] ?? null
}

/** The frames to draw for an exercise, or an empty list when there is no diagram. */
export function framesFor(exerciseId: string): GuideFrame[] {
  const guide = EXERCISE_GUIDES[exerciseId]
  if (!guide?.archetype) return []
  return POSE_ARCHETYPES[guide.archetype] ?? []
}

/** Built-in exercises with no guide written yet — asserted empty by the tests. */
export function missingGuides(): string[] {
  return EXERCISES.filter((e) => !EXERCISE_GUIDES[e.id]).map((e) => e.id)
}
