'use strict';

const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { encrypt, decrypt } = require('../db/encrypt');
const { httpError } = require('../lib/httpError');

const VALID_DRUGS = [
  'semaglutide', 'tirzepatide', 'liraglutide', 'retatrutide',
  'compounded_semaglutide', 'compounded_tirzepatide', 'none',
];

// POST /
// Records a new dose, closes the prior open entry, and flags the profile's
// dose-change date (triggers the titration window in the workout engine).
function recordDose(userId, body) {
  const db = getDb();
  const {
    drug,
    dose_mg,
    started_on = new Date().toISOString().slice(0, 10),
  } = body;

  if (!drug || !VALID_DRUGS.includes(drug)) {
    throw httpError(400, `drug must be one of: ${VALID_DRUGS.join(', ')}`);
  }

  const today = new Date().toISOString().slice(0, 10);

  // Close the previous current-dose entry.
  db.prepare(`
    UPDATE dose_history SET ended_on = ? WHERE user_id = ? AND ended_on IS NULL
  `).run(today, userId);

  // Insert the new dose entry.
  const id  = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO dose_history (id, user_id, drug, dose_mg, started_on, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, userId, drug, encrypt(String(dose_mg ?? '')), started_on, now);

  // Update the profile with the new drug/dose and flag the dose change date.
  db.prepare(`
    UPDATE profiles
    SET glp_drug = ?, glp_current_dose_mg = ?, last_dose_change_date = ?, updated_at = ?
    WHERE user_id = ?
  `).run(encrypt(drug), encrypt(String(dose_mg ?? '')), today, now, userId);

  const entry = db.prepare('SELECT * FROM dose_history WHERE id = ?').get(id);

  return {
    ...entry,
    dose_mg: decrypt(entry.dose_mg),
    titration_window_active: true,
    titration_note: 'Dose change recorded. Training volume will be reduced for the next 14 days.',
  };
}

// GET /:userId
function listDoseHistory(userId) {
  const db   = getDb();
  const rows = db.prepare(`
    SELECT * FROM dose_history WHERE user_id = ? ORDER BY started_on DESC
  `).all(userId);

  return rows.map(r => ({ ...r, dose_mg: decrypt(r.dose_mg) }));
}

module.exports = { recordDose, listDoseHistory };
