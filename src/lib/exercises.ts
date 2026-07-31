import type { Exercise, WorkoutTemplate } from './types'

/**
 * Exercise library. `primary` muscles count as one full working set toward
 * weekly volume; `secondary` muscles count as half a set — the convention used
 * in most volume-landmark literature (a chest press grows triceps, but not as
 * much as a triceps extension does).
 */
export const EXERCISES: Exercise[] = [
  // ---- Horizontal push -------------------------------------------------
  { id: 'bench_press', name: 'Barbell Bench Press', pattern: 'horizontal_push', loadType: 'weight', equipment: 'barbell', primary: ['chest'], secondary: ['triceps', 'shoulders'], benchmark: true },
  { id: 'incline_bench', name: 'Incline Barbell Bench Press', pattern: 'horizontal_push', loadType: 'weight', equipment: 'barbell', primary: ['chest', 'shoulders'], secondary: ['triceps'] },
  { id: 'db_bench', name: 'Dumbbell Bench Press', pattern: 'horizontal_push', loadType: 'weight', equipment: 'dumbbell', primary: ['chest'], secondary: ['triceps', 'shoulders'] },
  { id: 'incline_db_press', name: 'Incline Dumbbell Press', pattern: 'horizontal_push', loadType: 'weight', equipment: 'dumbbell', primary: ['chest', 'shoulders'], secondary: ['triceps'] },
  { id: 'machine_chest_press', name: 'Machine Chest Press', pattern: 'horizontal_push', loadType: 'weight', equipment: 'machine', primary: ['chest'], secondary: ['triceps', 'shoulders'] },
  { id: 'pushup', name: 'Push-up', pattern: 'horizontal_push', loadType: 'weighted_bodyweight', equipment: 'bodyweight', primary: ['chest'], secondary: ['triceps', 'shoulders', 'core'] },
  { id: 'dip', name: 'Dip', pattern: 'horizontal_push', loadType: 'weighted_bodyweight', equipment: 'bodyweight', primary: ['chest', 'triceps'], secondary: ['shoulders'] },
  { id: 'cable_fly', name: 'Cable Fly', pattern: 'isolation', loadType: 'weight', equipment: 'cable', primary: ['chest'], secondary: [] },
  { id: 'pec_deck', name: 'Pec Deck / Machine Fly', pattern: 'isolation', loadType: 'weight', equipment: 'machine', primary: ['chest'], secondary: [] },

  // ---- Vertical push ---------------------------------------------------
  { id: 'ohp', name: 'Overhead Press', pattern: 'vertical_push', loadType: 'weight', equipment: 'barbell', primary: ['shoulders'], secondary: ['triceps', 'core'], benchmark: true },
  { id: 'db_shoulder_press', name: 'Dumbbell Shoulder Press', pattern: 'vertical_push', loadType: 'weight', equipment: 'dumbbell', primary: ['shoulders'], secondary: ['triceps'] },
  { id: 'machine_shoulder_press', name: 'Machine Shoulder Press', pattern: 'vertical_push', loadType: 'weight', equipment: 'machine', primary: ['shoulders'], secondary: ['triceps'] },
  { id: 'lateral_raise', name: 'Lateral Raise', pattern: 'isolation', loadType: 'weight', equipment: 'dumbbell', primary: ['shoulders'], secondary: [] },
  { id: 'cable_lateral_raise', name: 'Cable Lateral Raise', pattern: 'isolation', loadType: 'weight', equipment: 'cable', primary: ['shoulders'], secondary: [] },

  // ---- Horizontal pull -------------------------------------------------
  { id: 'barbell_row', name: 'Barbell Row', pattern: 'horizontal_pull', loadType: 'weight', equipment: 'barbell', primary: ['lats', 'upper_back'], secondary: ['biceps', 'rear_delts'], benchmark: true },
  { id: 'db_row', name: 'One-Arm Dumbbell Row', pattern: 'horizontal_pull', loadType: 'weight', equipment: 'dumbbell', primary: ['lats', 'upper_back'], secondary: ['biceps'] },
  { id: 'seated_cable_row', name: 'Seated Cable Row', pattern: 'horizontal_pull', loadType: 'weight', equipment: 'cable', primary: ['lats', 'upper_back'], secondary: ['biceps', 'rear_delts'] },
  { id: 'chest_supported_row', name: 'Chest-Supported Row', pattern: 'horizontal_pull', loadType: 'weight', equipment: 'machine', primary: ['upper_back', 'lats'], secondary: ['biceps', 'rear_delts'] },
  { id: 'inverted_row', name: 'Inverted Row', pattern: 'horizontal_pull', loadType: 'weighted_bodyweight', equipment: 'bodyweight', primary: ['upper_back', 'lats'], secondary: ['biceps', 'core'] },
  { id: 'face_pull', name: 'Face Pull', pattern: 'isolation', loadType: 'weight', equipment: 'cable', primary: ['rear_delts', 'upper_back'], secondary: [] },
  { id: 'rear_delt_fly', name: 'Rear Delt Fly', pattern: 'isolation', loadType: 'weight', equipment: 'dumbbell', primary: ['rear_delts'], secondary: ['upper_back'] },
  { id: 'shrug', name: 'Shrug', pattern: 'isolation', loadType: 'weight', equipment: 'barbell', primary: ['upper_back'], secondary: [] },

  // ---- Vertical pull ---------------------------------------------------
  { id: 'pullup', name: 'Pull-up', pattern: 'vertical_pull', loadType: 'weighted_bodyweight', equipment: 'bodyweight', primary: ['lats'], secondary: ['biceps', 'upper_back', 'core'], benchmark: true },
  { id: 'chinup', name: 'Chin-up', pattern: 'vertical_pull', loadType: 'weighted_bodyweight', equipment: 'bodyweight', primary: ['lats', 'biceps'], secondary: ['upper_back'] },
  { id: 'lat_pulldown', name: 'Lat Pulldown', pattern: 'vertical_pull', loadType: 'weight', equipment: 'cable', primary: ['lats'], secondary: ['biceps', 'upper_back'] },
  { id: 'straight_arm_pulldown', name: 'Straight-Arm Pulldown', pattern: 'isolation', loadType: 'weight', equipment: 'cable', primary: ['lats'], secondary: [] },

  // ---- Squat -----------------------------------------------------------
  { id: 'back_squat', name: 'Barbell Back Squat', pattern: 'squat', loadType: 'weight', equipment: 'barbell', primary: ['quads', 'glutes'], secondary: ['hamstrings', 'core'], benchmark: true },
  { id: 'front_squat', name: 'Front Squat', pattern: 'squat', loadType: 'weight', equipment: 'barbell', primary: ['quads'], secondary: ['glutes', 'core'] },
  { id: 'goblet_squat', name: 'Goblet Squat', pattern: 'squat', loadType: 'weight', equipment: 'dumbbell', primary: ['quads', 'glutes'], secondary: ['core'] },
  { id: 'hack_squat', name: 'Hack Squat', pattern: 'squat', loadType: 'weight', equipment: 'machine', primary: ['quads'], secondary: ['glutes'] },
  { id: 'leg_press', name: 'Leg Press', pattern: 'squat', loadType: 'weight', equipment: 'machine', primary: ['quads', 'glutes'], secondary: ['hamstrings'] },
  { id: 'leg_extension', name: 'Leg Extension', pattern: 'isolation', loadType: 'weight', equipment: 'machine', primary: ['quads'], secondary: [] },

  // ---- Hinge -----------------------------------------------------------
  { id: 'deadlift', name: 'Barbell Deadlift', pattern: 'hinge', loadType: 'weight', equipment: 'barbell', primary: ['hamstrings', 'glutes'], secondary: ['upper_back', 'lats', 'core', 'quads'], benchmark: true },
  { id: 'rdl', name: 'Romanian Deadlift', pattern: 'hinge', loadType: 'weight', equipment: 'barbell', primary: ['hamstrings', 'glutes'], secondary: ['upper_back', 'core'] },
  { id: 'trap_bar_deadlift', name: 'Trap Bar Deadlift', pattern: 'hinge', loadType: 'weight', equipment: 'barbell', primary: ['glutes', 'quads'], secondary: ['hamstrings', 'upper_back', 'core'] },
  { id: 'hip_thrust', name: 'Hip Thrust', pattern: 'hinge', loadType: 'weight', equipment: 'barbell', primary: ['glutes'], secondary: ['hamstrings'] },
  { id: 'back_extension', name: 'Back Extension', pattern: 'hinge', loadType: 'weighted_bodyweight', equipment: 'bodyweight', primary: ['hamstrings', 'glutes'], secondary: ['core'] },
  { id: 'leg_curl', name: 'Leg Curl', pattern: 'isolation', loadType: 'weight', equipment: 'machine', primary: ['hamstrings'], secondary: [] },
  { id: 'cable_pull_through', name: 'Cable Pull-Through', pattern: 'hinge', loadType: 'weight', equipment: 'cable', primary: ['glutes'], secondary: ['hamstrings'] },

  // ---- Lunge / unilateral ---------------------------------------------
  { id: 'lunge', name: 'Walking Lunge', pattern: 'lunge', loadType: 'weight', equipment: 'dumbbell', primary: ['quads', 'glutes'], secondary: ['hamstrings', 'core'] },
  { id: 'split_squat', name: 'Bulgarian Split Squat', pattern: 'lunge', loadType: 'weight', equipment: 'dumbbell', primary: ['quads', 'glutes'], secondary: ['hamstrings'] },
  { id: 'step_up', name: 'Step-up', pattern: 'lunge', loadType: 'weight', equipment: 'dumbbell', primary: ['quads', 'glutes'], secondary: ['hamstrings', 'core'] },

  // ---- Arms ------------------------------------------------------------
  { id: 'barbell_curl', name: 'Barbell Curl', pattern: 'isolation', loadType: 'weight', equipment: 'barbell', primary: ['biceps'], secondary: [] },
  { id: 'db_curl', name: 'Dumbbell Curl', pattern: 'isolation', loadType: 'weight', equipment: 'dumbbell', primary: ['biceps'], secondary: [] },
  { id: 'hammer_curl', name: 'Hammer Curl', pattern: 'isolation', loadType: 'weight', equipment: 'dumbbell', primary: ['biceps'], secondary: [] },
  { id: 'cable_curl', name: 'Cable Curl', pattern: 'isolation', loadType: 'weight', equipment: 'cable', primary: ['biceps'], secondary: [] },
  { id: 'preacher_curl', name: 'Preacher Curl', pattern: 'isolation', loadType: 'weight', equipment: 'other', primary: ['biceps'], secondary: [] },
  { id: 'tricep_pushdown', name: 'Triceps Pushdown', pattern: 'isolation', loadType: 'weight', equipment: 'cable', primary: ['triceps'], secondary: [] },
  { id: 'overhead_extension', name: 'Overhead Triceps Extension', pattern: 'isolation', loadType: 'weight', equipment: 'dumbbell', primary: ['triceps'], secondary: [] },
  { id: 'skullcrusher', name: 'Skullcrusher', pattern: 'isolation', loadType: 'weight', equipment: 'barbell', primary: ['triceps'], secondary: [] },
  { id: 'close_grip_bench', name: 'Close-Grip Bench Press', pattern: 'horizontal_push', loadType: 'weight', equipment: 'barbell', primary: ['triceps', 'chest'], secondary: ['shoulders'] },

  // ---- Calves & core ---------------------------------------------------
  { id: 'standing_calf_raise', name: 'Standing Calf Raise', pattern: 'isolation', loadType: 'weight', equipment: 'machine', primary: ['calves'], secondary: [] },
  { id: 'seated_calf_raise', name: 'Seated Calf Raise', pattern: 'isolation', loadType: 'weight', equipment: 'machine', primary: ['calves'], secondary: [] },
  { id: 'plank', name: 'Plank', pattern: 'core', loadType: 'time', equipment: 'bodyweight', primary: ['core'], secondary: [] },
  { id: 'hanging_leg_raise', name: 'Hanging Leg Raise', pattern: 'core', loadType: 'weighted_bodyweight', equipment: 'bodyweight', primary: ['core'], secondary: [] },
  { id: 'cable_crunch', name: 'Cable Crunch', pattern: 'core', loadType: 'weight', equipment: 'cable', primary: ['core'], secondary: [] },
  { id: 'ab_wheel', name: 'Ab Wheel Rollout', pattern: 'core', loadType: 'weighted_bodyweight', equipment: 'other', primary: ['core'], secondary: [] },
  { id: 'pallof_press', name: 'Pallof Press', pattern: 'core', loadType: 'weight', equipment: 'cable', primary: ['core'], secondary: [] },
  { id: 'farmer_carry', name: 'Farmer Carry', pattern: 'carry', loadType: 'time', equipment: 'dumbbell', primary: ['core', 'upper_back'], secondary: ['calves'] },
]

export const DEFAULT_TEMPLATES: WorkoutTemplate[] = [
  {
    id: 'tpl_upper_a',
    name: 'Upper A — push emphasis',
    exerciseIds: ['bench_press', 'lat_pulldown', 'db_shoulder_press', 'seated_cable_row', 'lateral_raise', 'tricep_pushdown', 'db_curl'],
  },
  {
    id: 'tpl_lower_a',
    name: 'Lower A — squat emphasis',
    exerciseIds: ['back_squat', 'rdl', 'leg_press', 'leg_curl', 'standing_calf_raise', 'hanging_leg_raise'],
  },
  {
    id: 'tpl_upper_b',
    name: 'Upper B — pull emphasis',
    exerciseIds: ['pullup', 'incline_db_press', 'chest_supported_row', 'ohp', 'face_pull', 'hammer_curl', 'overhead_extension'],
  },
  {
    id: 'tpl_lower_b',
    name: 'Lower B — hinge emphasis',
    exerciseIds: ['deadlift', 'split_squat', 'leg_extension', 'hip_thrust', 'seated_calf_raise', 'cable_crunch'],
  },
  {
    id: 'tpl_push',
    name: 'Push',
    exerciseIds: ['bench_press', 'db_shoulder_press', 'incline_db_press', 'lateral_raise', 'tricep_pushdown', 'overhead_extension'],
  },
  {
    id: 'tpl_pull',
    name: 'Pull',
    exerciseIds: ['pullup', 'barbell_row', 'lat_pulldown', 'face_pull', 'barbell_curl', 'hammer_curl'],
  },
  {
    id: 'tpl_legs',
    name: 'Legs',
    exerciseIds: ['back_squat', 'rdl', 'leg_press', 'leg_curl', 'standing_calf_raise', 'plank'],
  },
  {
    id: 'tpl_full',
    name: 'Full body',
    exerciseIds: ['back_squat', 'bench_press', 'barbell_row', 'rdl', 'db_shoulder_press', 'cable_curl', 'plank'],
  },
]

/** Combined lookup over built-in + user-created exercises. */
export function exerciseMap(custom: Exercise[] = []): Map<string, Exercise> {
  const m = new Map<string, Exercise>()
  for (const e of EXERCISES) m.set(e.id, e)
  for (const e of custom) m.set(e.id, e)
  return m
}

export function allExercises(custom: Exercise[] = []): Exercise[] {
  return [...EXERCISES, ...custom].sort((a, b) => a.name.localeCompare(b.name))
}

export const PUSH_PATTERNS = new Set<Exercise['pattern']>(['horizontal_push', 'vertical_push'])
export const PULL_PATTERNS = new Set<Exercise['pattern']>(['horizontal_pull', 'vertical_pull'])
export const LOWER_PATTERNS = new Set<Exercise['pattern']>(['squat', 'hinge', 'lunge'])
