/**
 * /macros routes
 *
 * GET /macros/:userId              — calculate macros from the user's current profile
 * GET /macros/:userId/leaderboard  — protein-per-100-calorie food leaderboard
 */

'use strict';

const express = require('express');
const { getDb } = require('../db/database');
const { requireUser } = require('../middleware/requireUser');
const { calculateMacros, getProteinLeaderboard } = require('../engine/macros');
const { decrypt } = require('../db/encrypt');

const router = express.Router();

// ── GET /macros/:userId ────────────────────────────────────────────────────

router.get('/:userId', requireUser, (req, res, next) => {
  try {
    const db         = getDb();
    const rawProfile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.params.userId);

    if (!rawProfile) {
      return res.status(404).json({ error: 'Profile not found. Complete onboarding first.' });
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
    `).get(req.params.userId);

    const profile = {
      sex:               rawProfile.sex,
      age:               rawProfile.age,
      height_cm:         rawProfile.height_cm,
      current_weight_kg: rawProfile.current_weight_kg,
      goal_body_fat_pct: rawProfile.goal_body_fat_pct,
      waist_cm:          latestMeasurements?.waist_cm  ? parseFloat(decrypt(latestMeasurements.waist_cm))  : null,
      hip_cm:            latestMeasurements?.hip_cm    ? parseFloat(decrypt(latestMeasurements.hip_cm))    : null,
    };

    const result = calculateMacros(profile, { monthsOnDrug });
    return res.json(result);
  } catch (err) {
    next(err);
  }
});

// ── GET /macros/:userId/leaderboard ───────────────────────────────────────

router.get('/:userId/leaderboard', requireUser, (req, res, next) => {
  try {
    return res.json(getProteinLeaderboard());
  } catch (err) {
    next(err);
  }
});

module.exports = router;
