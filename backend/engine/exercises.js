/**
 * Exercise library
 *
 * Each exercise has:
 *   id           -- slug used in the database
 *   name         -- display name
 *   pattern      -- movement category (squat, hinge, push_h, push_v, pull_h, pull_v)
 *   tier         -- 1 (easiest) to 3 (most demanding). New users start at tier 1.
 *   muscle_groups -- primary muscles targeted
 *   notes        -- coaching cue shown to the user
 *   progressesTo -- id of the tier-above exercise (null if top tier)
 *   regressesTo  -- id of the tier-below exercise (null if bottom tier)
 *   equipment    -- what's needed: bodyweight | dumbbells | barbell | cables | machine
 *
 * GLP defaults:
 *   - All sessions start at tier 1 unless the user reports >= intermediate experience.
 *   - Slow eccentrics (3-4 seconds down) are the default for all exercises.
 *   - No barbell back squats or conventional deadlifts in tier 1.
 */

'use strict';

const EXERCISES = [

  // -- SQUAT PATTERN ---------------------------------------------------------
  {
    id: 'goblet_squat',
    name: 'Goblet Squat',
    pattern: 'squat',
    tier: 1,
    muscle_groups: ['quads', 'glutes', 'core'],
    notes: 'Hold dumbbell at chest. Sit into your heels. 3-second descent.',
    progressesTo: 'db_front_squat',
    regressesTo: null,
    equipment: 'dumbbells',
  },
  {
    id: 'db_front_squat',
    name: 'Dumbbell Front Squat',
    pattern: 'squat',
    tier: 2,
    muscle_groups: ['quads', 'glutes', 'core'],
    notes: 'Dumbbells on shoulders. Elbows forward. 3-second descent.',
    progressesTo: 'barbell_front_squat',
    regressesTo: 'goblet_squat',
    equipment: 'dumbbells',
  },
  {
    id: 'barbell_front_squat',
    name: 'Barbell Front Squat',
    pattern: 'squat',
    tier: 3,
    muscle_groups: ['quads', 'glutes', 'core'],
    notes: 'Clean grip or crossed-arm. Elbows high throughout.',
    progressesTo: null,
    regressesTo: 'db_front_squat',
    equipment: 'barbell',
  },
  {
    id: 'leg_press',
    name: 'Leg Press (machine)',
    pattern: 'squat',
    tier: 2,
    muscle_groups: ['quads', 'glutes'],
    notes: "Foot placement mid-platform. 3-second descent. Don't lock out at top.",
    progressesTo: null,
    regressesTo: 'goblet_squat',
    equipment: 'machine',
  },

  // -- HINGE PATTERN ---------------------------------------------------------
  {
    id: 'db_romanian_deadlift',
    name: 'Dumbbell Romanian Deadlift',
    pattern: 'hinge',
    tier: 1,
    muscle_groups: ['hamstrings', 'glutes', 'lower_back'],
    notes: 'Soft knees. Push hips back. 3-second descent. Feel the hamstring stretch.',
    progressesTo: 'trap_bar_deadlift',
    regressesTo: null,
    equipment: 'dumbbells',
  },
  {
    id: 'hip_thrust',
    name: 'Hip Thrust',
    pattern: 'hinge',
    tier: 1,
    muscle_groups: ['glutes', 'hamstrings'],
    notes: 'Upper back on bench. Squeeze at the top. 2-second hold.',
    progressesTo: null,
    regressesTo: null,
    equipment: 'dumbbells',
  },
  {
    id: 'trap_bar_deadlift',
    name: 'Trap-Bar Deadlift',
    pattern: 'hinge',
    tier: 2,
    muscle_groups: ['hamstrings', 'glutes', 'quads', 'lower_back'],
    notes: 'Neutral spine. Drive the floor away. One of the safest deadlift variations.',
    progressesTo: 'barbell_deadlift',
    regressesTo: 'db_romanian_deadlift',
    equipment: 'barbell',
  },
  {
    id: 'barbell_deadlift',
    name: 'Conventional Deadlift',
    pattern: 'hinge',
    tier: 3,
    muscle_groups: ['hamstrings', 'glutes', 'lower_back', 'traps'],
    notes: 'Bar over mid-foot. Lat engagement before the pull.',
    progressesTo: null,
    regressesTo: 'trap_bar_deadlift',
    equipment: 'barbell',
  },

  // -- HORIZONTAL PUSH -------------------------------------------------------
  {
    id: 'push_up',
    name: 'Push-Up',
    pattern: 'push_h',
    tier: 1,
    muscle_groups: ['chest', 'triceps', 'front_delt', 'core'],
    notes: 'Hands shoulder-width. 3-second descent. Incline (hands elevated) reduces difficulty.',
    progressesTo: 'db_bench_press',
    regressesTo: null,
    equipment: 'bodyweight',
  },
  {
    id: 'db_bench_press',
    name: 'Dumbbell Bench Press',
    pattern: 'push_h',
    tier: 1,
    muscle_groups: ['chest', 'triceps', 'front_delt'],
    notes: '3-second descent to chest. Safer than barbell for solo trainers.',
    progressesTo: 'barbell_bench_press',
    regressesTo: 'push_up',
    equipment: 'dumbbells',
  },
  {
    id: 'incline_db_press',
    name: 'Incline Dumbbell Press',
    pattern: 'push_h',
    tier: 2,
    muscle_groups: ['upper_chest', 'front_delt', 'triceps'],
    notes: '30-45 degree incline. 3-second descent.',
    progressesTo: null,
    regressesTo: 'push_up',
    equipment: 'dumbbells',
  },
  {
    id: 'barbell_bench_press',
    name: 'Barbell Bench Press',
    pattern: 'push_h',
    tier: 3,
    muscle_groups: ['chest', 'triceps', 'front_delt'],
    notes: '3-second descent. Spotter or safety pins recommended.',
    progressesTo: null,
    regressesTo: 'db_bench_press',
    equipment: 'barbell',
  },

  // -- VERTICAL PUSH ---------------------------------------------------------
  {
    id: 'db_shoulder_press',
    name: 'Dumbbell Shoulder Press',
    pattern: 'push_v',
    tier: 1,
    muscle_groups: ['front_delt', 'side_delt', 'triceps'],
    notes: "Seated for stability. 3-second descent. Don't lock out elbows.",
    progressesTo: 'barbell_ohp',
    regressesTo: null,
    equipment: 'dumbbells',
  },
  {
    id: 'barbell_ohp',
    name: 'Barbell Overhead Press',
    pattern: 'push_v',
    tier: 3,
    muscle_groups: ['front_delt', 'side_delt', 'triceps', 'upper_back'],
    notes: 'Standing. Brace hard. Press over the forehead.',
    progressesTo: null,
    regressesTo: 'db_shoulder_press',
    equipment: 'barbell',
  },

  // -- HORIZONTAL PULL -------------------------------------------------------
  {
    id: 'chest_supported_row',
    name: 'Chest-Supported Row',
    pattern: 'pull_h',
    tier: 1,
    muscle_groups: ['mid_back', 'rear_delt', 'biceps'],
    notes: 'Chest on incline pad. No lower back involvement. Great for beginners.',
    progressesTo: 'db_row',
    regressesTo: null,
    equipment: 'dumbbells',
  },
  {
    id: 'db_row',
    name: 'Single-Arm Dumbbell Row',
    pattern: 'pull_h',
    tier: 1,
    muscle_groups: ['lats', 'mid_back', 'biceps'],
    notes: 'Knee on bench. Pull elbow to hip. 3-second descent. Full stretch at bottom.',
    progressesTo: 'barbell_row',
    regressesTo: null,
    equipment: 'dumbbells',
  },
  {
    id: 'cable_row',
    name: 'Seated Cable Row',
    pattern: 'pull_h',
    tier: 1,
    muscle_groups: ['lats', 'mid_back', 'biceps'],
    notes: "Sit tall. Pull to lower chest. 3-second return. Don't lean back excessively.",
    progressesTo: 'barbell_row',
    regressesTo: null,
    equipment: 'cables',
  },
  {
    id: 'barbell_row',
    name: 'Barbell Row',
    pattern: 'pull_h',
    tier: 3,
    muscle_groups: ['lats', 'mid_back', 'biceps', 'lower_back'],
    notes: 'Hinge forward 45 degrees. Pull to belly button.',
    progressesTo: null,
    regressesTo: 'db_row',
    equipment: 'barbell',
  },

  // -- VERTICAL PULL ---------------------------------------------------------
  {
    id: 'lat_pulldown',
    name: 'Lat Pulldown',
    pattern: 'pull_v',
    tier: 1,
    muscle_groups: ['lats', 'biceps', 'rear_delt'],
    notes: 'Wide overhand grip. Pull bar to upper chest. 3-second return.',
    progressesTo: 'assisted_pull_up',
    regressesTo: null,
    equipment: 'cables',
  },
  {
    id: 'assisted_pull_up',
    name: 'Assisted Pull-Up (band or machine)',
    pattern: 'pull_v',
    tier: 2,
    muscle_groups: ['lats', 'biceps'],
    notes: 'Dead hang at bottom. Full range. 3-second descent.',
    progressesTo: 'pull_up',
    regressesTo: 'lat_pulldown',
    equipment: 'bodyweight',
  },
  {
    id: 'pull_up',
    name: 'Pull-Up',
    pattern: 'pull_v',
    tier: 3,
    muscle_groups: ['lats', 'biceps'],
    notes: 'Dead hang start. Chest to bar. 3-second descent.',
    progressesTo: null,
    regressesTo: 'assisted_pull_up',
    equipment: 'bodyweight',
  },
];

// Build a lookup map for fast access by id.
const EXERCISE_BY_ID = Object.fromEntries(EXERCISES.map(e => [e.id, e]));

/**
 * getExercise(id) - Returns the exercise object, or throws if not found.
 */
function getExercise(id) {
  const ex = EXERCISE_BY_ID[id];
  if (!ex) throw new Error('Unknown exercise id: ' + id);
  return ex;
}

/**
 * getByPattern(pattern, tier, equipment)
 * Returns exercises matching a given movement pattern, tier, and available equipment.
 * Tier is treated as a maximum -- tier 1 only returns tier-1 exercises.
 */
function getByPattern(pattern, tier, availableEquipment) {
  tier = tier || 1;
  availableEquipment = availableEquipment || ['dumbbells', 'bodyweight'];
  return EXERCISES.filter(function(e) {
    return e.pattern === pattern &&
      e.tier <= tier &&
      availableEquipment.includes(e.equipment);
  });
}

/**
 * pickExercise(pattern, tier, equipment, sessionVariant, weekNumber)
 *
 * Selects one exercise for a given pattern, deterministically rotating across
 * the available options based on session variant (a/b/c) and week number.
 *
 * sessionVariant: 'a' | 'b' | 'c' | 'upper_1' | 'lower_1' etc.
 * weekNumber: integer -- rotates the starting exercise each week for variety.
 */
function pickExercise(pattern, tier, availableEquipment, sessionVariant, weekNumber) {
  tier = tier || 1;
  availableEquipment = availableEquipment || ['dumbbells', 'bodyweight'];
  sessionVariant = sessionVariant || 'a';
  weekNumber = weekNumber || 1;

  var options = getByPattern(pattern, tier, availableEquipment);
  if (!options.length) return null;
  if (options.length === 1) return options[0];

  var variantOffset = { a: 0, b: 1, c: 2, upper_1: 0, upper_2: 1, lower_1: 0, lower_2: 1 };
  var offset = variantOffset[sessionVariant] !== undefined ? variantOffset[sessionVariant] : 0;
  var weekOffset = (weekNumber - 1) % options.length;
  var index = (weekOffset + offset) % options.length;
  return options[index];
}

/**
 * getCurrentWeekNumber()
 * Returns the ISO week number of the current date (1-53).
 */
function getCurrentWeekNumber() {
  var now  = new Date();
  var jan1 = new Date(now.getFullYear(), 0, 1);
  return Math.ceil(((now - jan1) / 86400000 + jan1.getDay() + 1) / 7);
}

module.exports = { EXERCISES, EXERCISE_BY_ID, getExercise, getByPattern, pickExercise, getCurrentWeekNumber };
