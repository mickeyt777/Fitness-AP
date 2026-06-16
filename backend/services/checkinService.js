'use strict';

const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { shouldAutoDeload } = require('../engine/workout');

// POST /
// Upsert today's check-in, then run the auto-deload decision on the saved row.
function submitCheckin(userId, body) {
  const db = getDb();
  const {
    date = new Date().toISOString().slice(0, 10),
    energy_1_10,
    nausea_1_10,
    gi_symptoms_1_10,
    sleep_hours,
    notes_text,
  } = body;

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
  `).run(id, userId, date, energy_1_10 ?? null, nausea_1_10 ?? null, gi_symptoms_1_10 ?? null, sleep_hours ?? null, notes_text ?? null, now);

  const saved = db.prepare('SELECT * FROM daily_checkins WHERE user_id = ? AND date = ?').get(userId, date);

  const deloadDecision = shouldAutoDeload(saved);

  return { checkin: saved, deload: deloadDecision };
}

// GET /:userId
function listRecentCheckins(userId, days) {
  const db = getDb();
  const n  = parseInt(days ?? '30', 10);

  return db.prepare(`
    SELECT * FROM daily_checkins
    WHERE user_id = ?
      AND date >= date('now', ? || ' days')
    ORDER BY date DESC
  `).all(userId, `-${n}`);
}

// GET /:userId/today
function getTodayCheckin(userId) {
  const db    = getDb();
  const today = new Date().toISOString().slice(0, 10);
  const row   = db.prepare('SELECT * FROM daily_checkins WHERE user_id = ? AND date = ?')
                  .get(userId, today);
  return row ?? null;
}

module.exports = { submitCheckin, listRecentCheckins, getTodayCheckin };
