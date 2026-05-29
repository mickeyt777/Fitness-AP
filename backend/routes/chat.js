/**
 * /chat routes
 *
 * POST /chat           — receive a chat message from the iOS app
 * GET  /chat/:userId   — get recent chat history
 *
 * In v3, the iOS app does chat parsing on-device using Foundation Models.
 * When it successfully parses a message, it sends the parsed_payload here
 * for storage and action (e.g. logging the sets, recording the nutrition,
 * filing the side-effect note).
 *
 * When the on-device model returns low confidence, the iOS app should call
 * POST /ai/chat-parse instead, which routes to the cloud LLM.
 *
 * The backend doesn't do AI parsing — it stores what the iOS app sends.
 * This keeps the backend simple and the AI logic close to the user's device.
 */

'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { requireUser } = require('../middleware/requireUser');

const router = express.Router();

// ── POST /chat ─────────────────────────────────────────────────────────────

router.post('/', requireUser, (req, res, next) => {
  try {
    const db  = getDb();
    const uid = req.userId;
    const {
      role = 'user',
      raw_text,
      parsed_payload,
      parser_source = 'none',
      parser_confidence,
    } = req.body;

    if (!raw_text) return res.status(400).json({ error: 'raw_text is required' });

    const id  = uuidv4();
    const now = new Date().toISOString();

    db.prepare(`
      INSERT INTO chat_messages
        (id, user_id, sent_at, role, raw_text, parsed_payload, parser_source, parser_confidence)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, uid, now, role, raw_text,
      parsed_payload ? JSON.stringify(parsed_payload) : null,
      parser_source,
      parser_confidence ?? null
    );

    // If a parsed workout payload was included, act on it.
    let actionResult = null;
    if (parsed_payload?.type === 'workout_log') {
      actionResult = handleWorkoutLog(db, uid, parsed_payload, now);
    } else if (parsed_payload?.type === 'nutrition_log') {
      actionResult = { type: 'nutrition_log', note: 'Nutrition logged (macro tracking coming in Phase 2).' };
    } else if (parsed_payload?.type === 'side_effect') {
      actionResult = { type: 'side_effect', note: 'Side effect noted. Check-in updated.' };
    }

    const saved = db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(id);

    return res.status(201).json({ message: saved, action: actionResult });
  } catch (err) {
    next(err);
  }
});

// ── GET /chat/:userId ──────────────────────────────────────────────────────

router.get('/:userId', requireUser, (req, res, next) => {
  try {
    const db   = getDb();
    const limit = parseInt(req.query.limit ?? '50', 10);

    const rows = db.prepare(`
      SELECT * FROM chat_messages WHERE user_id = ? ORDER BY sent_at DESC LIMIT ?
    `).all(req.params.userId, limit);

    return res.json(rows.reverse()); // return chronological order
  } catch (err) {
    next(err);
  }
});

// ── Helper: handle a parsed workout log ───────────────────────────────────

/**
 * handleWorkoutLog(db, userId, payload, now)
 *
 * Example parsed_payload for a workout log:
 * {
 *   type: 'workout_log',
 *   sets: [
 *     { exercise_name: 'Goblet Squat', reps: 8, weight_kg: 16, rpe: 7 },
 *     { exercise_name: 'Goblet Squat', reps: 8, weight_kg: 16, rpe: 7.5 },
 *   ]
 * }
 *
 * This function finds today's planned workout and writes the actual results in.
 * If there's no open planned workout, it creates one.
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
    db.prepare(`
      INSERT INTO workouts (id, user_id, planned_date, session_type, created_at)
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
    const exerciseSlug = set.exercise_id ?? set.exercise_name?.toLowerCase().replace(/\s+/g, '_') ?? 'unknown';
    insertSet.run(
      uuidv4(), workout.id,
      exerciseSlug, set.exercise_name ?? exerciseSlug,
      order++,
      set.reps ?? null, set.weight_kg ?? null, set.rpe ?? null,
      now
    );
  }

  return { type: 'workout_log', workout_id: workout.id, sets_logged: payload.sets?.length ?? 0 };
}

module.exports = router;
