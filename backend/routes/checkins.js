/**
 * /checkins routes
 *
 * POST /checkins           — submit today's check-in (energy, nausea, GI, sleep)
 * GET  /checkins/:userId   — get recent check-ins for a user (last 30 days default)
 * GET  /checkins/:userId/today — get today's check-in (used by app on open)
 *
 * The shouldAutoDeload logic from the workout engine is evaluated here so the
 * app can immediately tell the user if today's session is being swapped out.
 */

'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { requireUser } = require('../middleware/requireUser');
const { shouldAutoDeload } = require('../engine/workout');

const router = express.Router();

// ── POST /checkins ─────────────────────────────────────────────────────────

router.post('/', requireUser, (req, res, next) => {
  try {
    const db  = getDb();
    const uid = req.userId;
    const {
      date = new Date().toISOString().slice(0, 10),
      energy_1_10,
      nausea_1_10,
      gi_symptoms_1_10,
      sleep_hours,
      notes_text,
    } = req.body;

    const id  = uuidv4();
    const now = new Date().toISOString();

    // Upsert — if the user already checked in today, update the existing row.
    db.prepare(`
      INSERT INTO daily_checkins
        (id, user_id, date, energy_1_10, nausea_1_10, gi_symptoms_1_10, sleep_hours, notes_text, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, date) DO UPDATE SET
        energy_1_10      = excluded.energy_1_10,
        nausea_1_10      = excluded.nausea_1_10,
        gi_symptoms_1_10 = excluded.gi_symptoms_1_10,
        sleep_hours      = excluded.sleep_hours,
        notes_text       = excluded.notes_text
    `).run(id, uid, date, energy_1_10 ?? null, nausea_1_10 ?? null, gi_symptoms_1_10 ?? null, sleep_hours ?? null, notes_text ?? null, now);

    const saved = db.prepare('SELECT * FROM daily_checkins WHERE user_id = ? AND date = ?').get(uid, date);

    // Run the auto-deload check and include the result in the response.
    const deloadDecision = shouldAutoDeload(saved);

    return res.status(201).json({ checkin: saved, deload: deloadDecision });
  } catch (err) {
    next(err);
  }
});

// ── GET /checkins/:userId ──────────────────────────────────────────────────

router.get('/:userId', requireUser, (req, res, next) => {
  try {
    const db   = getDb();
    const days = parseInt(req.query.days ?? '30', 10);

    const rows = db.prepare(`
      SELECT * FROM daily_checkins
      WHERE user_id = ?
        AND date >= date('now', ? || ' days')
      ORDER BY date DESC
    `).all(req.params.userId, `-${days}`);

    return res.json(rows);
  } catch (err) {
    next(err);
  }
});

// ── GET /checkins/:userId/today ────────────────────────────────────────────

router.get('/:userId/today', requireUser, (req, res, next) => {
  try {
    const db   = getDb();
    const today = new Date().toISOString().slice(0, 10);
    const row   = db.prepare('SELECT * FROM daily_checkins WHERE user_id = ? AND date = ?')
                    .get(req.params.userId, today);

    return res.json(row ?? null);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
