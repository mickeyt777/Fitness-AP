'use strict';

const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { httpError } = require('../lib/httpError');
const activityService = require('./activityService');

// POST /
// Stores the incoming message and, if a parsed payload is attached, acts on it.
// The backend does NO AI parsing — it stores what the iOS app sends.
function postMessage(userId, body) {
  const db = getDb();
  const {
    role = 'user',
    raw_text,
    parsed_payload,
    parser_source = 'none',
    parser_confidence,
  } = body;

  if (!raw_text) throw httpError(400, 'raw_text is required');

  const id  = uuidv4();
  const now = new Date().toISOString();

  // Defensive: parser_source has a CHECK(IN 'on_device','cloud','none'). Tolerate a
  // hyphenated "on-device" from older clients and coerce anything unexpected to
  // 'none' so a bad value can never make the whole INSERT fail the constraint.
  const normalizedSource = normalizeParserSource(parser_source);

  db.prepare(`
    INSERT INTO chat_messages
      (id, user_id, sent_at, role, raw_text, parsed_payload, parser_source, parser_confidence)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, userId, now, role, raw_text,
    parsed_payload ? JSON.stringify(parsed_payload) : null,
    normalizedSource,
    parser_confidence ?? null
  );

  // If a parsed workout payload was included, act on it.
  let actionResult = null;
  if (parsed_payload?.type === 'workout_log') {
    actionResult = handleWorkoutLog(db, userId, parsed_payload, now);
  } else if (parsed_payload?.type === 'cardio_log') {
    actionResult = handleCardioLog(userId, parsed_payload);
  } else if (parsed_payload?.type === 'nutrition_log') {
    actionResult = { type: 'nutrition_log', note: 'Nutrition logged (macro tracking coming in Phase 2).' };
  } else if (parsed_payload?.type === 'side_effect') {
    actionResult = { type: 'side_effect', note: 'Side effect noted. Check-in updated.' };
  }

  const saved = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(id);

  return { message: saved, action: actionResult };
}

// Coerce a parser_source to the chat_messages CHECK domain. Maps the hyphenated
// "on-device" (older iOS clients) to "on_device"; anything unrecognised → "none".
const PARSER_SOURCES = new Set(['on_device', 'cloud', 'none']);
function normalizeParserSource(value) {
  if (value === 'on-device') return 'on_device';
  return PARSER_SOURCES.has(value) ? value : 'none';
}

// GET /:userId
function listChat(userId, limitParam) {
  const db    = getDb();
  const limit = parseInt(limitParam ?? '50', 10);

  const rows = db.prepare(`
    SELECT * FROM chat_messages WHERE user_id = ? ORDER BY sent_at DESC LIMIT ?
  `).all(userId, limit);

  return rows.reverse(); // return chronological order
}

/**
 * handleWorkoutLog(db, userId, payload, now)
 * Finds today's planned workout (or creates an ad-hoc one) and writes the
 * parsed sets in. Internal to chatService.
 */
function handleWorkoutLog(db, userId, payload, now) {
  const today = now.slice(0, 10);

  // Find today's planned workout.
  let workout = db.prepare(`
    SELECT * FROM workouts
    WHERE user_id = ? AND planned_date = ? AND completed_at IS NULL
    ORDER BY created_at DESC LIMIT 1
  `).get(userId, today);

  // If none exists, create an ad-hoc workout record.
  if (!workout) {
    const wId = uuidv4();
    // Ad-hoc container for chat-logged sets. session_type is left NULL: the
    // table CHECK only permits engine/template session types and this isn't
    // one (a NULL satisfies the CHECK). Origin is kept in notes for traceability.
    db.prepare(`
      INSERT INTO workouts (id, user_id, planned_date, notes, created_at)
      VALUES (?, ?, ?, 'chat_logged', ?)
    `).run(wId, userId, today, now);
    workout = db.prepare('SELECT * FROM workouts WHERE id = ?').get(wId);
  }

  // Insert each set from the parsed payload.
  const insertSet = db.prepare(`
    INSERT INTO workout_sets
      (id, workout_id, exercise_id, exercise_name, set_order, actual_reps, actual_weight, actual_rpe, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const existingCount = db.prepare('SELECT COUNT(*) as c FROM workout_sets WHERE workout_id = ?')
                          .get(workout.id).c;

  let order = existingCount + 1;
  for (const set of (payload.sets ?? [])) {
    // Prefer the canonical movement id resolved by the iOS app
    // (WorkoutParser.resolve → movements table id, e.g. "goblet_squat").
    // Fall back to a legacy exercise_id, then to a slug of the spoken name.
    const exerciseSlug =
      set.movement_id
      ?? set.exercise_id
      ?? set.exercise_name?.toLowerCase().replace(/\s+/g, '_')
      ?? 'unknown';
    // Prefer the canonical movement name when resolution matched one.
    const exerciseName = set.canonical_name ?? set.exercise_name ?? exerciseSlug;
    insertSet.run(
      uuidv4(), workout.id,
      exerciseSlug, exerciseName,
      order++,
      set.reps ?? null, set.weight_kg ?? null, set.rpe ?? null,
      now
    );
  }

  return { type: 'workout_log', workout_id: workout.id, sets_logged: payload.sets?.length ?? 0 };
}

/**
 * handleCardioLog(userId, payload)
 * Routes a parsed spoken/typed cardio bout into cardio_sessions via
 * activityService (which owns the SQL, modality→movement resolution, and the
 * HealthKit-wins dedup). `payload.cardio` carries { modality, duration_min,
 * intensity, distance_m }. Returns an action summary for the chat UI.
 */
function handleCardioLog(userId, payload) {
  const cardio = payload.cardio ?? {};
  const session = activityService.logCardioSession(userId, {
    modality:     cardio.modality ?? null,
    duration_min: cardio.duration_min ?? null,
    distance_m:   cardio.distance_m ?? null,
    intensity:    cardio.intensity ?? null,
  });

  return {
    type:              'cardio_log',
    cardio_session_id: session.id,
    modality:          session.modality,
    duration_min:      session.duration_min,
    intensity:         session.intensity,
  };
}

module.exports = { postMessage, listChat };
