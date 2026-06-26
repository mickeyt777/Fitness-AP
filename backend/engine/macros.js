/**
 * Fitness GLP — Macro Calculator (GLP-1 Edition)
 *
 * Standard macro calculators are wrong for GLP users. They subtract a
 * 500-calorie deficit from TDEE — but the drug is already creating a 700–1,200
 * calorie deficit by suppressing appetite. The user's problem isn't "eat less."
 * It's "hit protein while barely being able to eat at all."
 *
 * Our approach:
 *   1. Estimate goal lean body mass (LBM) using the U.S. Navy body-fat formula.
 *   2. Set protein at 1.2–1.6 g per lb of goal LBM (higher end early in treatment).
 *   3. Set fat at a floor of 0.3 g per lb of current bodyweight (hormonal health).
 *   4. Set a calorie FLOOR at BMR × 1.1 — the app is a brake on undereating,
 *      not a gas pedal toward a deeper deficit.
 *   5. Carbs fill the remainder. No upper carb limit — they're training fuel.
 */

'use strict';

// ── Body-fat estimation ────────────────────────────────────────────────────

/**
 * estimateBodyFatPct(profile)
 * Uses the U.S. Navy circumference formula to estimate body fat percentage.
 * Requires waist_cm, hip_cm (females only), height_cm, and sex.
 *
 * Returns a number between 0 and 1 (e.g. 0.28 = 28% body fat).
 * Returns null if insufficient measurements are available.
 */
function estimateBodyFatPct({ sex, height_cm, waist_cm, hip_cm, neck_cm }) {
  if (!height_cm || !waist_cm) return null;

  // The Navy formula requires measurements in centimetres.
  // It's an approximation — good enough for weekly trend tracking.
  if (sex === 'male') {
    if (!neck_cm) return null;
    const bf = 495 / (1.0324 - 0.19077 * Math.log10(waist_cm - neck_cm) + 0.15456 * Math.log10(height_cm)) - 450;
    return Math.max(0, Math.min(bf / 100, 1));
  }

  if (sex === 'female') {
    if (!neck_cm || !hip_cm) return null;
    const bf = 495 / (1.29579 - 0.35004 * Math.log10(waist_cm + hip_cm - neck_cm) + 0.22100 * Math.log10(height_cm)) - 450;
    return Math.max(0, Math.min(bf / 100, 1));
  }

  return null;
}

// ── BMR calculation ────────────────────────────────────────────────────────

/**
 * calcBmr(params)
 * Mifflin-St Jeor equation — the most validated BMR formula for adults.
 * weight in kg, height in cm, age in years.
 * Returns BMR in calories/day.
 */
function calcBmr({ sex, weight_kg, height_cm, age }) {
  const base = 10 * weight_kg + 6.25 * height_cm - 5 * age;
  return sex === 'male' ? base + 5 : base - 161;
}

// ── Main export ────────────────────────────────────────────────────────────

/**
 * calculateMacros(profile, options)
 *
 * profile fields used:
 *   sex, age, height_cm, current_weight_kg, goal_body_fat_pct,
 *   waist_cm, hip_cm (for BF estimation if goal_body_fat_pct not set)
 *
 * options:
 *   monthsOnDrug  — integer. Higher end of protein range (1.6 g/lb) for
 *                   first 6 months; steps down to 1.4 g/lb after that.
 *   activityLevel — 'sedentary' | 'light' | 'moderate' (default: 'light')
 *
 * Returns:
 *   {
 *     protein_g,       — daily protein target in grams
 *     fat_g,           — daily fat floor in grams
 *     calories_floor,  — minimum daily calories (BMR × 1.1)
 *     carbs_g,         — grams of carbs to reach calorie floor
 *     goal_lbm_kg,     — estimated goal lean body mass in kg
 *     goal_lbm_lbs,    — same in pounds
 *     body_fat_pct,    — estimated current body fat % (0–1), or null
 *     notes            — array of plain-English explanation strings
 *   }
 */
function calculateMacros(profile, options = {}) {
  const {
    sex,
    age,
    height_cm,
    current_weight_kg,
    goal_body_fat_pct,
    waist_cm,
    hip_cm,
    neck_cm,
  } = profile;

  const monthsOnDrug  = options.monthsOnDrug  ?? 0;
  const activityLevel = options.activityLevel ?? 'light';

  const notes = [];

  // ── 1. Goal lean body mass ───────────────────────────────────────────────

  // Body fat % at goal — user can set this explicitly; we fall back to a
  // sensible default based on sex (18% women, 12% men) if not provided.
  let targetBfPct = goal_body_fat_pct ?? (sex === 'female' ? 0.22 : 0.15);

  // Estimate current body fat using Navy formula (if measurements are available).
  const currentBfPct = estimateBodyFatPct({ sex, height_cm, waist_cm, hip_cm, neck_cm });
  if (currentBfPct !== null) {
    notes.push(`Estimated current body fat: ${Math.round(currentBfPct * 100)}%`);
  }

  // Current lean body mass = weight × (1 − body fat %)
  const currentLbmKg = current_weight_kg * (1 - (currentBfPct ?? targetBfPct));

  // Goal LBM: we assume the user wants to arrive at their goal weight while
  // maintaining (or slightly building) their current lean mass.
  // Goal weight = current LBM / (1 − target BF%)
  const goalWeightKg = currentLbmKg / (1 - targetBfPct);
  const goalLbmKg    = goalWeightKg * (1 - targetBfPct);
  const goalLbmLbs   = goalLbmKg * 2.20462;

  notes.push(`Goal lean body mass: ${goalLbmLbs.toFixed(1)} lbs (${goalLbmKg.toFixed(1)} kg)`);

  // ── 2. Protein target ────────────────────────────────────────────────────

  // Higher protein range in the first 6 months on the drug (lean-mass risk is
  // highest during rapid weight loss).
  let proteinPerLbLbm;
  if (monthsOnDrug < 6) {
    proteinPerLbLbm = 1.6;
    notes.push('Protein set to 1.6 g/lb LBM — first 6 months on the drug, lean-mass risk is highest.');
  } else if (monthsOnDrug < 12) {
    proteinPerLbLbm = 1.4;
    notes.push('Protein set to 1.4 g/lb LBM — months 6–12 on the drug.');
  } else {
    proteinPerLbLbm = 1.2;
    notes.push('Protein set to 1.2 g/lb LBM — stable long-term maintenance range.');
  }

  const proteinG = Math.round(goalLbmLbs * proteinPerLbLbm);

  // ── 3. Fat floor ─────────────────────────────────────────────────────────

  const currentWeightLbs = current_weight_kg * 2.20462;
  const fatG = Math.round(currentWeightLbs * 0.3);
  notes.push(`Fat floor set to 0.3 g/lb bodyweight (${fatG} g) for hormonal health.`);

  // ── 4. Calorie floor (BMR × 1.1) ─────────────────────────────────────────

  const bmr = calcBmr({ sex, weight_kg: current_weight_kg, height_cm, age });

  // Activity multiplier — deliberately conservative because GLP users have
  // reduced energy. We are NOT trying to engineer a deeper deficit.
  const activityMultiplier = {
    sedentary: 1.1,
    light:     1.2,
    moderate:  1.35,
  }[activityLevel] ?? 1.2;

  const caloriesFloor = Math.round(bmr * activityMultiplier);
  notes.push(`Calorie floor: ${caloriesFloor} kcal/day (BMR ${Math.round(bmr)} × ${activityMultiplier}). The drug is already creating a deficit — this is the minimum, not a target.`);

  // ── 5. Carbs fill the remainder ──────────────────────────────────────────

  const caloriesFromProtein = proteinG * 4;
  const caloriesFromFat     = fatG * 9;
  const caloriesForCarbs    = Math.max(0, caloriesFloor - caloriesFromProtein - caloriesFromFat);
  const carbsG              = Math.round(caloriesForCarbs / 4);

  notes.push(`Carbs: ${carbsG} g to reach the calorie floor. If appetite allows more, encourage it — carbs are training fuel.`);

  return {
    protein_g:      proteinG,
    fat_g:          fatG,
    carbs_g:        carbsG,
    calories_floor: caloriesFloor,
    goal_lbm_kg:    parseFloat(goalLbmKg.toFixed(1)),
    goal_lbm_lbs:   parseFloat(goalLbmLbs.toFixed(1)),
    body_fat_pct:   currentBfPct !== null ? parseFloat((currentBfPct * 100).toFixed(1)) : null,
    notes,
  };
}

// ── Protein food rankings ──────────────────────────────────────────────────

/**
 * getProteinLeaderboard()
 * Returns foods ranked by grams of protein per 100 calories.
 * This powers the "practical coaching" section of the macro screen —
 * for GLP users whose real constraint is stomach volume, not willpower.
 */
function getProteinLeaderboard() {
  return [
    { food: 'Whey isolate powder',       protein_g_per_100_kcal: 24.0, notes: 'Mix in water or unsweetened almond milk' },
    { food: 'Nonfat Greek yogurt',        protein_g_per_100_kcal: 17.0, notes: '¾ cup ≈ 100 kcal, 17 g protein' },
    { food: 'Nonfat cottage cheese',      protein_g_per_100_kcal: 14.5, notes: 'High protein, mild flavour, easy to eat' },
    { food: 'Egg whites (cooked)',         protein_g_per_100_kcal: 21.5, notes: 'Liquid carton is the easiest form' },
    { food: 'Canned tuna in water',        protein_g_per_100_kcal: 23.0, notes: 'Check sodium if that\'s a concern' },
    { food: 'Shrimp (cooked)',             protein_g_per_100_kcal: 20.5, notes: 'Very low calorie density' },
    { food: 'Chicken breast (skinless)',   protein_g_per_100_kcal: 19.0, notes: 'Classic; brine before cooking to keep moist' },
    { food: 'Lean ground turkey (93/7)',   protein_g_per_100_kcal: 14.0, notes: 'Versatile; higher fat than chicken' },
    { food: 'Edamame (shelled)',           protein_g_per_100_kcal: 9.5,  notes: 'Plant-based; comes with fibre and fat' },
    { food: 'Low-fat string cheese',       protein_g_per_100_kcal: 10.0, notes: 'Convenient; easy to eat when nauseous' },
  ].sort((a, b) => b.protein_g_per_100_kcal - a.protein_g_per_100_kcal);
}

module.exports = { calculateMacros, estimateBodyFatPct, calcBmr, getProteinLeaderboard };
