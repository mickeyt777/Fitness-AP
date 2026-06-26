/**
 * Fitness GLP — Weekly Report Aggregator
 *
 * Pulls together everything that happened in the past 7 days into a single
 * structured summary. This summary is then either:
 *   (a) returned directly to the iOS app for display, or
 *   (b) sent to the cloud LLM to generate the written narrative.
 *
 * Data collected:
 *   - Workouts completed vs planned, average RPE, total tonnage
 *   - Strength progression on the user's two most-trained exercises
 *   - Protein-target days hit (estimated from chat logs / future macro tracking)
 *   - Daily check-in averages (energy, nausea, GI, sleep)
 *   - Lean-mass proxy: waist vs arm/thigh change
 *   - Trend bodyweight (4-week trailing average)
 *   - Dose/titration context (was user in titration window this week?)
 */

'use strict';

const { decrypt } = require('../db/encrypt');

/**
 * aggregateWeeklyReport(db, userId, weekEndDate)
 *
 * weekEndDate: ISO date string 'YYYY-MM-DD'. Defaults to today.
 * Returns a structured summary object.
 */
function aggregateWeeklyReport(db, userId, weekEndDate = null) {
  const endDate   = weekEndDate ?? new Date().toISOString().slice(0, 10);
  const startDate = offsetDate(endDate, -6); // 7 days inclusive

  // ── Workouts ─────────────────────────────────────────────────────────────

  const workoutsPlanned = db.prepare(`
    SELECT * FROM workouts
    WHERE user_id = ? AND planned_date BETWEEN ? AND ?
    ORDER BY planned_date ASC
  `).all(userId, startDate, endDate);

  const workoutsCompleted = workoutsPlanned.filter(w => w.completed_at !== null);

  // All sets logged this week
  const weekSetIds = workoutsCompleted.map(w => `'${w.id}'`).join(',');
  const allSets = weekSetIds.length
    ? db.prepare(`
        SELECT ws.*, w.planned_date FROM workout_sets ws
        JOIN workouts w ON ws.workout_id = w.id
        WHERE ws.workout_id IN (${weekSetIds})
      `).all()
    : [];

  // Total tonnage (sets × reps × weight) — a proxy for total training work
  const totalTonnage = allSets.reduce((sum, s) => {
    return sum + ((s.actual_reps ?? 0) * (s.actual_weight ?? 0));
  }, 0);

  // Average RPE across all logged sets (only where actual_rpe was provided)
  const rpeValues = allSets.map(s => s.actual_rpe).filter(r => r !== null && r !== undefined);
  const avgRpe    = rpeValues.length
    ? parseFloat((rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length).toFixed(1))
    : null;

  // Strength progression: find the 2 exercises with the most sets this week
  const setsByExercise = {};
  for (const s of allSets) {
    if (!setsByExercise[s.exercise_id]) setsByExercise[s.exercise_id] = [];
    setsByExercise[s.exercise_id].push(s);
  }

  const topExercises = Object.entries(setsByExercise)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 2);

  const strengthProgress = topExercises.map(([exerciseId, sets]) => {
    // Compare this week's best weight to last week's best weight for this exercise
    const thisWeekBest = Math.max(...sets.map(s => s.actual_weight ?? 0));

    const lastWeekBest = db.prepare(`
      SELECT MAX(ws.actual_weight) as best
      FROM workout_sets ws
      JOIN workouts w ON ws.workout_id = w.id
      WHERE ws.exercise_id = ? AND w.user_id = ?
        AND w.planned_date BETWEEN ? AND ?
        AND ws.actual_weight IS NOT NULL
    `).get(exerciseId, userId, offsetDate(startDate, -7), offsetDate(startDate, -1))?.best ?? null;

    return {
      exercise_id:     exerciseId,
      exercise_name:   sets[0]?.exercise_name ?? exerciseId,
      this_week_kg:    thisWeekBest > 0 ? thisWeekBest : null,
      last_week_kg:    lastWeekBest,
      change_kg:       thisWeekBest > 0 && lastWeekBest ? parseFloat((thisWeekBest - lastWeekBest).toFixed(1)) : null,
    };
  });

  // ── Check-ins ─────────────────────────────────────────────────────────────

  const checkins = db.prepare(`
    SELECT * FROM daily_checkins
    WHERE user_id = ? AND date BETWEEN ? AND ?
    ORDER BY date ASC
  `).all(userId, startDate, endDate);

  const avgCheckin = averageFields(checkins, ['energy_1_10', 'nausea_1_10', 'gi_symptoms_1_10', 'sleep_hours']);

  // Count how many days had significant symptoms (nausea ≤ 5 or GI ≤ 5)
  const symptomDays = checkins.filter(c =>
    (c.nausea_1_10 !== null && c.nausea_1_10 <= 5) ||
    (c.gi_symptoms_1_10 !== null && c.gi_symptoms_1_10 <= 5)
  ).length;

  // ── Measurements ──────────────────────────────────────────────────────────

  // This week's most recent measurement
  const thisWeekMeasurement = db.prepare(`
    SELECT * FROM measurements
    WHERE user_id = ? AND taken_at BETWEEN ? AND ?
    ORDER BY taken_at DESC LIMIT 1
  `).get(userId, startDate, endDate);

  // Last week's most recent measurement (for comparison)
  const lastWeekMeasurement = db.prepare(`
    SELECT * FROM measurements
    WHERE user_id = ? AND taken_at BETWEEN ? AND ?
    ORDER BY taken_at DESC LIMIT 1
  `).get(userId, offsetDate(startDate, -7), offsetDate(startDate, -1));

  const measurements = buildMeasurementSummary(thisWeekMeasurement, lastWeekMeasurement);

  // 4-week trailing average bodyweight
  const fourWeekWeights = db.prepare(`
    SELECT weight_kg FROM measurements
    WHERE user_id = ? AND taken_at BETWEEN ? AND ? AND weight_kg IS NOT NULL
    ORDER BY taken_at DESC LIMIT 4
  `).all(userId, offsetDate(endDate, -27), endDate);

  const trendWeight = fourWeekWeights.length
    ? parseFloat((fourWeekWeights.reduce((s, r) => s + r.weight_kg, 0) / fourWeekWeights.length).toFixed(1))
    : null;

  // ── Activity (steps / cardio / active energy) ──────────────────────────────

  const activityDays = db.prepare(`
    SELECT date, steps, distance_m, active_energy_kcal, step_goal
    FROM daily_activity
    WHERE user_id = ? AND date BETWEEN ? AND ?
    ORDER BY date ASC
  `).all(userId, startDate, endDate);

  const stepVals = activityDays.map(d => d.steps).filter(v => v !== null && v !== undefined);
  const avgSteps = stepVals.length
    ? Math.round(stepVals.reduce((a, b) => a + b, 0) / stepVals.length)
    : null;
  const totalDistanceM  = activityDays.reduce((s, d) => s + (d.distance_m ?? 0), 0);
  const totalActiveKcal = activityDays.reduce((s, d) => s + (d.active_energy_kcal ?? 0), 0);
  const stepGoalHitDays = activityDays.filter(
    d => d.steps != null && d.step_goal && d.steps >= d.step_goal
  ).length;

  // Non-superseded cardio bouts only (HealthKit-wins dedup already applied at write).
  const cardioRows = db.prepare(`
    SELECT duration_min, intensity FROM cardio_sessions
    WHERE user_id = ? AND date BETWEEN ? AND ? AND superseded_by IS NULL
  `).all(userId, startDate, endDate);

  const cardioMinutes = Math.round(cardioRows.reduce((s, c) => s + (c.duration_min ?? 0), 0));
  const cardioByIntensity = { easy: 0, moderate: 0, hard: 0 };
  for (const c of cardioRows) {
    if (c.intensity && cardioByIntensity[c.intensity] != null) cardioByIntensity[c.intensity]++;
  }

  // ── Dose / titration context ──────────────────────────────────────────────

  const profile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
  const inTitration = profile?.last_dose_change_date
    ? daysBetween(profile.last_dose_change_date, endDate) <= 14
    : false;

  const recentDoseChange = db.prepare(`
    SELECT * FROM dose_history WHERE user_id = ? ORDER BY started_on DESC LIMIT 1
  `).get(userId);

  // ── Assemble the summary ──────────────────────────────────────────────────

  return {
    period: { start: startDate, end: endDate },

    workouts: {
      planned:   workoutsPlanned.length,
      completed: workoutsCompleted.length,
      adherence_pct: workoutsPlanned.length
        ? Math.round((workoutsCompleted.length / workoutsPlanned.length) * 100)
        : null,
      total_tonnage_kg: Math.round(totalTonnage),
      avg_rpe:          avgRpe,
    },

    strength: strengthProgress,

    checkins: {
      days_logged:    checkins.length,
      avg_energy:     avgCheckin.energy_1_10,
      avg_nausea_inv: avgCheckin.nausea_1_10,   // higher = better (1=severe, 10=none)
      avg_gi_inv:     avgCheckin.gi_symptoms_1_10,
      avg_sleep_hrs:  avgCheckin.sleep_hours,
      symptom_days:   symptomDays,
    },

    measurements,

    activity: {
      days_logged:              stepVals.length,
      avg_steps:                avgSteps,
      step_goal_hit_days:       stepGoalHitDays,
      total_distance_km:        parseFloat((totalDistanceM / 1000).toFixed(1)),
      total_active_energy_kcal: Math.round(totalActiveKcal),
      cardio_sessions:          cardioRows.length,
      cardio_minutes:           cardioMinutes,
      cardio_by_intensity:      cardioByIntensity,
    },

    body_weight: {
      this_week_kg:   thisWeekMeasurement?.weight_kg ?? null,
      trend_4wk_kg:   trendWeight,
    },

    drug_context: {
      in_titration_window: inTitration,
      current_drug:        recentDoseChange ? decrypt(recentDoseChange.drug ?? '') : null,
      days_since_dose_change: profile?.last_dose_change_date
        ? daysBetween(profile.last_dose_change_date, endDate)
        : null,
    },

    // Lean-mass proxy verdict — the headline for the weekly report
    lean_mass_proxy: measurements.proxy,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────

function buildMeasurementSummary(current, previous) {
  if (!current) {
    return {
      available: false,
      proxy: { score: null, summary: 'No measurements logged this week.' },
    };
  }

  const dec = r => ({
    weight_kg: r?.weight_kg ?? null,
    waist_cm:  r?.waist_cm  ? parseFloat(decrypt(r.waist_cm))  : null,
    hip_cm:    r?.hip_cm    ? parseFloat(decrypt(r.hip_cm))    : null,
    chest_cm:  r?.chest_cm  ? parseFloat(decrypt(r.chest_cm))  : null,
    arm_cm:    r?.arm_cm    ? parseFloat(decrypt(r.arm_cm))    : null,
    thigh_cm:  r?.thigh_cm  ? parseFloat(decrypt(r.thigh_cm))  : null,
  });

  const cur = dec(current);
  const prv = previous ? dec(previous) : null;

  if (!prv) {
    return { available: true, current: cur, previous: null, changes: null, proxy: { score: null, summary: 'First measurement logged — baseline set for next week.' } };
  }

  const changes = {
    weight_kg: diff(cur.weight_kg, prv.weight_kg),
    waist_cm:  diff(cur.waist_cm,  prv.waist_cm),
    hip_cm:    diff(cur.hip_cm,    prv.hip_cm),
    arm_cm:    diff(cur.arm_cm,    prv.arm_cm),
    thigh_cm:  diff(cur.thigh_cm,  prv.thigh_cm),
  };

  // Lean-mass proxy: waist down + limbs stable/up = green
  const waistDown   = changes.waist_cm !== null && changes.waist_cm < -0.1;
  const limbsStable = (changes.arm_cm   === null || changes.arm_cm   >= -0.3)
                   && (changes.thigh_cm  === null || changes.thigh_cm  >= -0.3);

  let score, summary;
  if (waistDown && limbsStable) {
    score   = 'green';
    summary = `Waist down ${Math.abs(changes.waist_cm).toFixed(1)} cm while limbs held — this is exactly the outcome you're training for.`;
  } else if (waistDown && !limbsStable) {
    score   = 'yellow';
    summary = `Waist is down but limbs shrank slightly. Check your protein — aim for your daily target every day this week.`;
  } else if (!waistDown && limbsStable) {
    score   = 'hold';
    summary = `Measurements held steady. Not every week shows movement — consistency compounds.`;
  } else {
    score   = 'flag';
    summary = `Waist held and limbs shrank slightly. Review your protein log and workout adherence — something to watch next week.`;
  }

  return { available: true, current: cur, previous: prv, changes, proxy: { score, summary } };
}

function averageFields(rows, fields) {
  const result = {};
  for (const field of fields) {
    const vals = rows.map(r => r[field]).filter(v => v !== null && v !== undefined);
    result[field] = vals.length ? parseFloat((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1)) : null;
  }
  return result;
}

function diff(a, b) {
  if (a === null || b === null) return null;
  return parseFloat((a - b).toFixed(1));
}

function offsetDate(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(dateA, dateB) {
  const a = new Date(dateA);
  const b = new Date(dateB);
  return Math.round(Math.abs(b - a) / (1000 * 60 * 60 * 24));
}

module.exports = { aggregateWeeklyReport };
