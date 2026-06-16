'use strict';

const { getDb } = require('../db/database');
const { decrypt } = require('../db/encrypt');
const { calculateMacros, getProteinLeaderboard } = require('../engine/macros');
const { httpError } = require('../lib/httpError');

// GET /:userId
function getMacros(userId) {
  const db         = getDb();
  const rawProfile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);

  if (!rawProfile) {
    throw httpError(404, 'Profile not found. Complete onboarding first.');
  }

  // Calculate months on drug for protein-range calibration.
  let monthsOnDrug = 0;
  if (rawProfile.glp_start_date) {
    const start = new Date(rawProfile.glp_start_date);
    const now   = new Date();
    monthsOnDrug = (now.getFullYear() - start.getFullYear()) * 12
                 + (now.getMonth() - start.getMonth());
  }

  // Get latest measurements for body-fat estimation.
  const latestMeasurements = db.prepare(`
    SELECT * FROM measurements WHERE user_id = ? ORDER BY taken_at DESC LIMIT 1
  `).get(userId);

  const profile = {
    sex:               rawProfile.sex,
    age:               rawProfile.age,
    height_cm:         rawProfile.height_cm,
    current_weight_kg: rawProfile.current_weight_kg,
    goal_body_fat_pct: rawProfile.goal_body_fat_pct,
    waist_cm:          latestMeasurements?.waist_cm  ? parseFloat(decrypt(latestMeasurements.waist_cm))  : null,
    hip_cm:            latestMeasurements?.hip_cm    ? parseFloat(decrypt(latestMeasurements.hip_cm))    : null,
  };

  return calculateMacros(profile, { monthsOnDrug });
}

// GET /:userId/leaderboard
function getLeaderboard() {
  return getProteinLeaderboard();
}

module.exports = { getMacros, getLeaderboard };
