'use strict';

/**
 * activityService — Phase 2 (cardio / steps / HealthKit).
 *
 * Owns all SQL for daily_activity + cardio_sessions. Numeric decisions (adaptive
 * step goal, dedup conflict test, trend) live in lib/activityMath.js so they can
 * be unit-tested without a database.
 *
 * Dedup rule (decided with Mickey): HealthKit wins. HK workouts sync idempotently
 * by hk_uuid; when an HK bout overlaps a manual one (same day, same activity
 * type, overlapping time window), the manual row is marked superseded — never
 * deleted — and drops out of rollups. Manual entries only count when HK didn't
 * capture the same thing.
 */

const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const movementService = require('./movementService');
const { computeStepGoal, conflicts, activityTrend } = require('../lib/activityMath');

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Map a spoken/HealthKit modality string to a seeded conditioning movement id,
// so "stationary bike" / "spin" resolve to stationary_bike, etc. Only accept a
// conditioning-category hit — we never want a strength movement here.
function resolveModalityToMovementId(modality) {
  if (!modality) return null;
  const m = movementService.searchByAlias(modality);
  return m && m.category === 'conditioning' ? m.id : null;
}

// --- adaptive step goal -----------------------------------------------------

// 7-day median (+5%) of the days strictly BEFORE `date`, so a day's own steps
// never feed its own goal. Null until there's enough baseline.
function computeStepGoalForDate(db, userId, date) {
  const rows = db
    .prepare(
      `SELECT steps FROM daily_activity
       WHERE user_id = ? AND date < ? AND steps IS NOT NULL
       ORDER BY date DESC LIMIT 7`
    )
    .all(userId, date);
  return computeStepGoal(rows.map((r) => r.steps));
}

// --- daily_activity ---------------------------------------------------------

function upsertDailyActivity(userId, body) {
  const db = getDb();
  const date = body.date ?? todayStr();
  const existing = db
    .prepare('SELECT * FROM daily_activity WHERE user_id = ? AND date = ?')
    .get(userId, date);

  // Partial-update friendly: a field omitted from the body keeps its old value.
  const steps = body.steps ?? existing?.steps ?? null;
  const distance_m = body.distance_m ?? existing?.distance_m ?? null;
  const active_energy_kcal = body.active_energy_kcal ?? existing?.active_energy_kcal ?? null;

  const incomingSource = body.source ?? 'manual';
  // Once two different sources contribute to the same day, it's 'mixed'.
  let source = incomingSource;
  if (existing && existing.source && existing.source !== incomingSource) source = 'mixed';

  const step_goal = computeStepGoalForDate(db, userId, date);
  const now = new Date().toISOString();

  if (existing) {
    db.prepare(
      `UPDATE daily_activity
         SET steps = ?, distance_m = ?, active_energy_kcal = ?, step_goal = ?, source = ?, updated_at = ?
       WHERE user_id = ? AND date = ?`
    ).run(steps, distance_m, active_energy_kcal, step_goal, source, now, userId, date);
  } else {
    db.prepare(
      `INSERT INTO daily_activity
         (id, user_id, date, steps, distance_m, active_energy_kcal, step_goal, source, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(uuidv4(), userId, date, steps, distance_m, active_energy_kcal, step_goal, source, now, now);
  }

  return db.prepare('SELECT * FROM daily_activity WHERE user_id = ? AND date = ?').get(userId, date);
}

// --- cardio: manual entry ---------------------------------------------------

function logCardioSession(userId, body) {
  const db = getDb();
  const date = body.date ?? (body.started_at ? String(body.started_at).slice(0, 10) : todayStr());
  const movement_id = body.movement_id ?? resolveModalityToMovementId(body.modality);

  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO cardio_sessions
       (id, user_id, date, started_at, movement_id, modality, duration_min, distance_m,
        active_energy_kcal, avg_hr, intensity, source, hk_uuid, notes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', NULL, ?, ?)`
  ).run(
    id, userId, date, body.started_at ?? null, movement_id, body.modality ?? null,
    body.duration_min ?? null, body.distance_m ?? null, body.active_energy_kcal ?? null,
    body.avg_hr ?? null, body.intensity ?? null, body.notes ?? null, now
  );

  // If HealthKit already captured this same bout, HK wins — supersede the manual one now.
  reconcileManualAgainstExistingHK(db, userId, id);
  return db.prepare('SELECT * FROM cardio_sessions WHERE id = ?').get(id);
}

// --- cardio: HealthKit sync (idempotent by hk_uuid) -------------------------

function syncHealthKit(userId, workouts) {
  const db = getDb();
  const results = { inserted: 0, updated: 0, superseded_manual: 0, ids: [] };

  const tx = db.transaction((items) => {
    for (const w of items) {
      if (!w || !w.hk_uuid) continue; // an HK workout without its UUID can't be deduped — skip
      const date = w.date ?? (w.started_at ? String(w.started_at).slice(0, 10) : todayStr());
      const movement_id = w.movement_id ?? resolveModalityToMovementId(w.modality);
      const now = new Date().toISOString();

      const existing = db
        .prepare('SELECT id FROM cardio_sessions WHERE user_id = ? AND hk_uuid = ?')
        .get(userId, w.hk_uuid);

      let rowId;
      if (existing) {
        rowId = existing.id;
        db.prepare(
          `UPDATE cardio_sessions
             SET date = ?, started_at = ?, movement_id = ?, modality = ?, duration_min = ?,
                 distance_m = ?, active_energy_kcal = ?, avg_hr = ?, intensity = ?
           WHERE id = ?`
        ).run(
          date, w.started_at ?? null, movement_id, w.modality ?? null, w.duration_min ?? null,
          w.distance_m ?? null, w.active_energy_kcal ?? null, w.avg_hr ?? null, w.intensity ?? null, rowId
        );
        results.updated++;
      } else {
        rowId = uuidv4();
        db.prepare(
          `INSERT INTO cardio_sessions
             (id, user_id, date, started_at, movement_id, modality, duration_min, distance_m,
              active_energy_kcal, avg_hr, intensity, source, hk_uuid, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'healthkit', ?, ?)`
        ).run(
          rowId, userId, date, w.started_at ?? null, movement_id, w.modality ?? null,
          w.duration_min ?? null, w.distance_m ?? null, w.active_energy_kcal ?? null,
          w.avg_hr ?? null, w.intensity ?? null, w.hk_uuid, now
        );
        results.inserted++;
      }

      results.ids.push(rowId);
      results.superseded_manual += supersedeOverlappingManual(db, userId, rowId);
    }
  });
  tx(workouts || []);
  return results;
}

// HK row wins: mark same-day, same-type, time-overlapping manual rows superseded.
function supersedeOverlappingManual(db, userId, hkId) {
  const hk = db.prepare('SELECT * FROM cardio_sessions WHERE id = ?').get(hkId);
  if (!hk) return 0;
  const candidates = db
    .prepare(
      `SELECT * FROM cardio_sessions
       WHERE user_id = ? AND date = ? AND source = 'manual' AND superseded_by IS NULL AND id != ?`
    )
    .all(userId, hk.date, hkId);

  let n = 0;
  const now = new Date().toISOString();
  for (const c of candidates) {
    if (conflicts(c, hk)) {
      db.prepare('UPDATE cardio_sessions SET superseded_by = ?, superseded_at = ? WHERE id = ?').run(hkId, now, c.id);
      n++;
    }
  }
  return n;
}

// A manual row logged after HK already has the bout: the new manual one loses.
function reconcileManualAgainstExistingHK(db, userId, manualId) {
  const man = db.prepare('SELECT * FROM cardio_sessions WHERE id = ?').get(manualId);
  if (!man || man.superseded_by) return 0;
  const hks = db
    .prepare(
      `SELECT * FROM cardio_sessions
       WHERE user_id = ? AND date = ? AND source = 'healthkit' AND id != ?`
    )
    .all(userId, man.date, manualId);
  const now = new Date().toISOString();
  for (const hk of hks) {
    if (conflicts(man, hk)) {
      db.prepare('UPDATE cardio_sessions SET superseded_by = ?, superseded_at = ? WHERE id = ?').run(hk.id, now, manualId);
      return 1;
    }
  }
  return 0;
}

// --- reads ------------------------------------------------------------------

function listCardioSessions(userId, daysParam, includeSuperseded = false) {
  const db = getDb();
  const n = parseInt(daysParam ?? '30', 10);
  const filter = includeSuperseded ? '' : 'AND superseded_by IS NULL';
  return db
    .prepare(
      `SELECT * FROM cardio_sessions
       WHERE user_id = ? AND date >= date('now', ? || ' days') ${filter}
       ORDER BY date DESC, started_at DESC`
    )
    .all(userId, `-${n}`);
}

// Today-ring + Progress-sparkline payload, plus a directional non-clinical trend.
function getActivitySummary(userId, daysParam) {
  const db = getDb();
  const n = parseInt(daysParam ?? '14', 10);
  const today = todayStr();

  const daily = db
    .prepare(
      `SELECT date, steps, distance_m, active_energy_kcal, step_goal
       FROM daily_activity
       WHERE user_id = ? AND date >= date('now', ? || ' days')
       ORDER BY date ASC`
    )
    .all(userId, `-${n}`);

  const cardio = db
    .prepare(
      `SELECT id, date, started_at, movement_id, modality, duration_min, distance_m,
              active_energy_kcal, intensity, source
       FROM cardio_sessions
       WHERE user_id = ? AND date >= date('now', ? || ' days') AND superseded_by IS NULL
       ORDER BY date DESC, started_at DESC`
    )
    .all(userId, `-${n}`);

  const todayRow = db
    .prepare('SELECT steps, step_goal FROM daily_activity WHERE user_id = ? AND date = ?')
    .get(userId, today);
  const todayGoal =
    todayRow && todayRow.step_goal != null ? todayRow.step_goal : computeStepGoalForDate(db, userId, today);

  // Trend: trailing 7 days (incl. today) vs the 7 before that.
  const recent = db
    .prepare(
      `SELECT AVG(steps) a FROM daily_activity
       WHERE user_id = ? AND steps IS NOT NULL AND date >= date('now', '-6 days')`
    )
    .get(userId).a;
  const prior = db
    .prepare(
      `SELECT AVG(steps) a FROM daily_activity
       WHERE user_id = ? AND steps IS NOT NULL
         AND date >= date('now', '-13 days') AND date <= date('now', '-7 days')`
    )
    .get(userId).a;
  const trend = activityTrend(recent, prior);

  const cardioMinutes7d = db
    .prepare(
      `SELECT COALESCE(SUM(duration_min), 0) m FROM cardio_sessions
       WHERE user_id = ? AND superseded_by IS NULL AND date >= date('now', '-6 days')`
    )
    .get(userId).m;

  return {
    today: { date: today, steps: todayRow?.steps ?? null, step_goal: todayGoal },
    trend,
    cardio_minutes_7d: cardioMinutes7d,
    daily,
    cardio_sessions: cardio,
  };
}

module.exports = {
  upsertDailyActivity,
  logCardioSession,
  syncHealthKit,
  listCardioSessions,
  getActivitySummary,
  // exported for targeted tests
  computeStepGoalForDate,
  resolveModalityToMovementId,
};
