/**
 * /profiles routes
 *
 * GET  /profiles/:userId   — get a user's profile
 * PUT  /profiles/:userId   — create or update a user's profile (upsert)
 *
 * Sensitive fields (glp_drug, glp_current_dose_mg) are encrypted before write
 * and decrypted before return.
 */

'use strict';

const express = require('express');
const { getDb } = require('../db/database');
const { encrypt, decrypt } = require('../db/encrypt');
const { requireUser } = require('../middleware/requireUser');

const router = express.Router();

// Helper: decrypt sensitive profile fields before returning to the client.
function decryptProfile(row) {
  if (!row) return null;
  return {
    ...row,
    glp_drug:           decrypt(row.glp_drug),
    glp_current_dose_mg: decrypt(row.glp_current_dose_mg),
    equipment_available: row.equipment_available
      ? JSON.parse(row.equipment_available)
      : [],
  };
}

// ── GET /profiles/:userId ──────────────────────────────────────────────────

router.get('/:userId', requireUser, (req, res, next) => {
  try {
    const db  = getDb();
    const row = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.params.userId);

    if (!row) return res.status(404).json({ error: 'Profile not found' });
    return res.json(decryptProfile(row));
  } catch (err) {
    next(err);
  }
});

// ── PUT /profiles/:userId ──────────────────────────────────────────────────

router.put('/:userId', requireUser, (req, res, next) => {
  try {
    const db = getDb();
    const uid = req.params.userId;
    const b   = req.body;
    const now = new Date().toISOString();

    // Validate days_per_week.
    if (b.days_per_week !== undefined && (b.days_per_week < 2 || b.days_per_week > 4)) {
      return res.status(400).json({ error: 'days_per_week must be between 2 and 4' });
    }

    db.prepare(`
      INSERT INTO profiles (
        user_id, age, sex, height_cm, starting_weight_kg, current_weight_kg,
        goal_body_fat_pct, training_history_level, equipment_available,
        days_per_week, glp_drug, glp_current_dose_mg, glp_injection_day_of_week,
        glp_start_date, last_dose_change_date, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?
      )
      ON CONFLICT(user_id) DO UPDATE SET
        age = excluded.age,
        sex = excluded.sex,
        height_cm = excluded.height_cm,
        current_weight_kg = excluded.current_weight_kg,
        goal_body_fat_pct = excluded.goal_body_fat_pct,
        training_history_level = excluded.training_history_level,
        equipment_available = excluded.equipment_available,
        days_per_week = excluded.days_per_week,
        glp_drug = excluded.glp_drug,
        glp_current_dose_mg = excluded.glp_current_dose_mg,
        glp_injection_day_of_week = excluded.glp_injection_day_of_week,
        glp_start_date = excluded.glp_start_date,
        last_dose_change_date = excluded.last_dose_change_date,
        updated_at = excluded.updated_at
    `).run(
      uid,
      b.age ?? null,
      b.sex ?? null,
      b.height_cm ?? null,
      b.starting_weight_kg ?? null,
      b.current_weight_kg ?? null,
      b.goal_body_fat_pct ?? null,
      b.training_history_level ?? 'beginner',
      b.equipment_available ? JSON.stringify(b.equipment_available) : null,
      b.days_per_week ?? 3,
      b.glp_drug            ? encrypt(b.glp_drug)            : null,
      b.glp_current_dose_mg ? encrypt(b.glp_current_dose_mg) : null,
      b.glp_injection_day_of_week ?? null,
      b.glp_start_date       ?? null,
      b.last_dose_change_date ?? null,
      now
    );

    const updated = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(uid);
    return res.json(decryptProfile(updated));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
