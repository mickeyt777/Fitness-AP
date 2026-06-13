'use strict';

const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { encrypt, decrypt } = require('../db/encrypt');

// Decrypt a measurement row before returning it.
function decryptRow(row) {
  if (!row) return null;
  return {
    ...row,
    waist_cm: row.waist_cm ? parseFloat(decrypt(row.waist_cm)) : null,
    hip_cm:   row.hip_cm   ? parseFloat(decrypt(row.hip_cm))   : null,
    chest_cm: row.chest_cm ? parseFloat(decrypt(row.chest_cm)) : null,
    arm_cm:   row.arm_cm   ? parseFloat(decrypt(row.arm_cm))   : null,
    thigh_cm: row.thigh_cm ? parseFloat(decrypt(row.thigh_cm)) : null,
  };
}

/**
 * leanMassProxy(current, previous)
 * Returns a simple lean-mass proxy score.
 * "Green" = waist went down while arms or thighs held or grew.
 * This is the headline metric for the weekly report.
 */
function leanMassProxy(current, previous) {
  if (!previous) return { score: null, summary: 'Not enough data yet — one more week.' };

  const waistChange = (current.waist_cm ?? 0) - (previous.waist_cm ?? 0);
  const armChange   = (current.arm_cm   ?? 0) - (previous.arm_cm   ?? 0);
  const thighChange = (current.thigh_cm ?? 0) - (previous.thigh_cm ?? 0);

  const waistDown  = waistChange < -0.1;
  const limbsStable = armChange >= -0.3 && thighChange >= -0.3;

  let verdict = 'neutral';
  let summary = '';

  if (waistDown && limbsStable) {
    verdict = 'green';
    summary = `You lost ${Math.abs(waistChange).toFixed(1)} cm off your waist while holding your limbs — this is the win you came for.`;
  } else if (waistDown && !limbsStable) {
    verdict = 'yellow';
    summary = `Waist is down but limbs shrank slightly. Check protein intake and make sure you\'re hitting the workout plan.`;
  } else if (!waistDown && limbsStable) {
    verdict = 'hold';
    summary = `Measurements holding steady this week. Not every week shows movement — stay consistent.`;
  } else {
    verdict = 'flag';
    summary = `Waist held and limbs shrank. Review your protein and training logs — something to watch.`;
  }

  return { score: verdict, waist_change_cm: waistChange, arm_change_cm: armChange, thigh_change_cm: thighChange, summary };
}

// POST /
function logMeasurement(userId, body) {
  const db = getDb();
  const {
    taken_at = new Date().toISOString().slice(0, 10),
    weight_kg, waist_cm, hip_cm, chest_cm, arm_cm, thigh_cm,
    progress_photo_front_url, progress_photo_side_url,
  } = body;

  const id  = uuidv4();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO measurements
      (id, user_id, taken_at, weight_kg, waist_cm, hip_cm, chest_cm, arm_cm, thigh_cm,
       progress_photo_front_url, progress_photo_side_url, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, userId, taken_at,
    weight_kg ?? null,
    waist_cm  ? encrypt(String(waist_cm))  : null,
    hip_cm    ? encrypt(String(hip_cm))    : null,
    chest_cm  ? encrypt(String(chest_cm))  : null,
    arm_cm    ? encrypt(String(arm_cm))    : null,
    thigh_cm  ? encrypt(String(thigh_cm))  : null,
    progress_photo_front_url ?? null,
    progress_photo_side_url  ?? null,
    now
  );

  const saved = decryptRow(db.prepare('SELECT * FROM measurements WHERE id = ?').get(id));

  // Get the previous entry for the proxy score.
  const previous = decryptRow(db.prepare(`
    SELECT * FROM measurements WHERE user_id = ? AND taken_at < ? ORDER BY taken_at DESC LIMIT 1
  `).get(userId, taken_at));

  const proxy = leanMassProxy(saved, previous);

  return { measurement: saved, lean_mass_proxy: proxy };
}

// GET /:userId
function listMeasurements(userId, weeksParam) {
  const db    = getDb();
  const weeks = parseInt(weeksParam ?? '26', 10);

  const rows = db.prepare(`
    SELECT * FROM measurements
    WHERE user_id = ?
      AND taken_at >= date('now', ? || ' days')
    ORDER BY taken_at DESC
  `).all(userId, `-${weeks * 7}`);

  return rows.map(decryptRow);
}

// GET /:userId/latest
function getLatestMeasurement(userId) {
  const db  = getDb();
  const row = db.prepare('SELECT * FROM measurements WHERE user_id = ? ORDER BY taken_at DESC LIMIT 1')
                .get(userId);
  return decryptRow(row) ?? null;
}

module.exports = { logMeasurement, listMeasurements, getLatestMeasurement };
