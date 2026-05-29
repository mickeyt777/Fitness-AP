/**
 * /dose-history routes
 *
 * POST /dose-history           — record a new dose or drug change
 * GET  /dose-history/:userId   — get dose history for a user
 *
 * When a new dose is recorded, the previous "current" entry gets an ended_on date
 * and the profile's last_dose_change_date is updated. This triggers the titration
 * window in the workout engine.
 */

'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { requireUser } = require('../middleware/requireUser');
const { encrypt, decrypt } = require('../db/encrypt');

const router = express.Router();

const VALID_DRUGS = [
  'semaglutide', 'tirzepatide', 'liraglutide', 'retatrutide',
  'compounded_semaglutide', 'compounded_tirzepatide', 'none',
];

// ── POST /dose-history ─────────────────────────────────────────────────────

router.post('/', requireUser, (req, res, next) => {
  try {
    const db  = getDb();
    const uid = req.userId;
    const {
      drug,
      dose_mg,
      started_on = new Date().toISOString().slice(0, 10),
    } = req.body;

    if (!drug || !VALID_DRUGS.includes(drug)) {
      return res.status(400).json({
        error: `drug must be one of: ${VALID_DRUGS.join(', ')}`,
      });
    }

    const today = new Date().toISOString().slice(0, 10);

    // Close the previous current-dose entry.
    db.prepare(`
      UPDATE dose_history SET ended_on = ? WHERE user_id = ? AND ended_on IS NULL
    `).run(today, uid);

    // Insert the new dose entry.
    const id  = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO dose_history (id, user_id, drug, dose_mg, started_on, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, uid, drug, encrypt(String(dose_mg ?? '')), started_on, now);

    // Update the profile with the new drug/dose and flag the dose change date.
    db.prepare(`
      UPDATE profiles
      SET glp_drug = ?, glp_current_dose_mg = ?, last_dose_change_date = ?, updated_at = ?
      WHERE user_id = ?
    `).run(encrypt(drug), encrypt(String(dose_mg ?? '')), today, now, uid);

    const entry = db.prepare('SELECT * FROM dose_history WHERE id = ?').get(id);

    return res.status(201).json({
      ...entry,
      dose_mg: decrypt(entry.dose_mg),
      titration_window_active: true,
      titration_note: 'Dose change recorded. Training volume will be reduced for the next 14 days.',
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /dose-history/:userId ──────────────────────────────────────────────

router.get('/:userId', requireUser, (req, res, next) => {
  try {
    const db   = getDb();
    const rows = db.prepare(`
      SELECT * FROM dose_history WHERE user_id = ? ORDER BY started_on DESC
    `).all(req.params.userId);

    return res.json(rows.map(r => ({ ...r, dose_mg: decrypt(r.dose_mg) })));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
