# Track B1 — `workoutService` Extraction Map

*The template every other service copies. Goal: move all logic + DB access out of `routes/workouts.js` into `services/workoutService.js`. **Behavior stays byte-identical** — responses and status codes don't change.*

Apply as one reviewed step, then commit on the host:
```
git add -A && git commit -m "refactor: extract workoutService, thin workouts route"
```

---

## The seam that makes this clean

`server.js:88` already maps thrown errors:
```js
res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
```
So a service can `throw httpError(404, 'Profile not found')` and the route just lets it propagate via `next(err)` — the 404s stay identical. That's the whole error strategy; no per-route status logic needed.

---

## New file 1 — `backend/lib/httpError.js`

A 4-line helper every service will reuse. Establish it now.

```js
'use strict';
function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}
module.exports = { httpError };
```

---

## New file 2 — `backend/services/workoutService.js`

Each route's inline SQL becomes a named, exported, HTTP-free function. The service owns `getDb()`, `decrypt`, and the engine calls.

```js
'use strict';

const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
const { decrypt } = require('../db/encrypt');
const { generateWorkoutPlan, progressWorkout } = require('../engine/workout');
const { httpError } = require('../lib/httpError');

// GET /:userId/plan
function getWeeklyPlan(userId) {
  const db = getDb();
  const rawProfile = db.prepare('SELECT * FROM profiles WHERE user_id = ?').get(userId);
  if (!rawProfile) {
    throw httpError(404, 'Profile not found. Complete onboarding first.');
  }
  const profile = {
    ...rawProfile,
    glp_drug:            decrypt(rawProfile.glp_drug),
    glp_current_dose_mg: decrypt(rawProfile.glp_current_dose_mg),
    equipment_available: rawProfile.equipment_available
      ? JSON.parse(rawProfile.equipment_available)
      : ['dumbbells', 'bodyweight'],
  };
  return generateWorkoutPlan(profile);
}

// GET /:userId
function listRecentWorkouts(userId) {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM workouts
    WHERE user_id = ?
    ORDER BY planned_date DESC
    LIMIT 30
  `).all(userId);
}

// POST /
function createWorkout(userId, { planned_date, session_type, template_id, exercises = [] }) {
  if (!planned_date) throw httpError(400, 'planned_date is required');

  const db        = getDb();
  const workoutId = uuidv4();
  const now       = new Date().toISOString();

  db.prepare(`
    INSERT INTO workouts (id, user_id, planned_date, session_type, template_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(workoutId, userId, planned_date, session_type ?? null, template_id ?? null, now);

  const insertSet = db.prepare(`
    INSERT INTO workout_sets
      (id, workout_id, exercise_id, exercise_name, set_order, target_reps, target_rpe, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let setOrder = 1;
  for (const ex of exercises) {
    for (let s = 0; s < (ex.target_sets ?? 3); s++) {
      insertSet.run(uuidv4(), workoutId, ex.exercise_id, ex.exercise_name, setOrder++,
                    ex.target_reps ?? null, ex.target_rpe ?? null, now);
    }
  }

  const workout = db.prepare('SELECT * FROM workouts WHERE id = ?').get(workoutId);
  const sets    = db.prepare('SELECT * FROM workout_sets WHERE workout_id = ? ORDER BY set_order').all(workoutId);
  return { ...workout, sets };
}

// GET /:userId/:workoutId
function getWorkout(userId, workoutId) {
  const db = getDb();
  const workout = db.prepare('SELECT * FROM workouts WHERE id = ? AND user_id = ?')
                    .get(workoutId, userId);
  if (!workout) throw httpError(404, 'Workout not found');

  const sets = db.prepare('SELECT * FROM workout_sets WHERE workout_id = ? ORDER BY set_order')
                 .all(workout.id);
  return { ...workout, sets };
}

// PUT /:userId/:workoutId/complete
function completeWorkout(userId, workoutId) {
  const db  = getDb();
  const now = new Date().toISOString();

  db.prepare('UPDATE workouts SET completed_at = ? WHERE id = ? AND user_id = ?')
    .run(now, workoutId, userId);

  const currentSets  = db.prepare('SELECT * FROM workout_sets WHERE workout_id = ?').all(workoutId);
  const thisWorkout  = db.prepare('SELECT * FROM workouts WHERE id = ?').get(workoutId);
  let previousSets = [];

  if (thisWorkout) {
    const previousWorkout = db.prepare(`
      SELECT w.id FROM workouts w
      WHERE w.user_id = ? AND w.session_type = ? AND w.completed_at IS NOT NULL
        AND w.id != ?
      ORDER BY w.completed_at DESC
      LIMIT 1
    `).get(userId, thisWorkout.session_type, workoutId);

    if (previousWorkout) {
      previousSets = db.prepare('SELECT * FROM workout_sets WHERE workout_id = ?')
                       .all(previousWorkout.id);
    }
  }

  // NOTE (Trap 2 / N+1): progressWorkout() calls getExercise() per set.
  // Fine on the in-memory array today; revisit when movements move to SQLite in Phase 1.
  const progression = progressWorkout(currentSets, previousSets);
  return { message: 'Workout completed.', progression };
}

// POST /:workoutId/sets
// NOTE: reps pass straight through as stored (String(reps) quirk preserved — do NOT coerce here).
function logSet(workoutId, body) {
  const db  = getDb();
  const id  = uuidv4();
  const now = new Date().toISOString();
  const {
    exercise_id, exercise_name, set_order,
    target_reps, target_rpe,
    actual_reps, actual_weight, actual_rpe, notes,
  } = body;

  db.prepare(`
    INSERT INTO workout_sets
      (id, workout_id, exercise_id, exercise_name, set_order,
       target_reps, target_rpe, actual_reps, actual_weight, actual_rpe, notes, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, workoutId, exercise_id, exercise_name ?? exercise_id, set_order ?? 1,
         target_reps ?? null, target_rpe ?? null,
         actual_reps ?? null, actual_weight ?? null, actual_rpe ?? null,
         notes ?? null, now);

  return db.prepare('SELECT * FROM workout_sets WHERE id = ?').get(id);
}

module.exports = {
  getWeeklyPlan, listRecentWorkouts, createWorkout,
  getWorkout, completeWorkout, logSet,
};
```

---

## Rewritten `backend/routes/workouts.js` (thin)

Routes now only: parse params/body → call service → respond. No `getDb`, no SQL, no engine imports.

```js
'use strict';

const express = require('express');
const { requireUser } = require('../middleware/requireUser');
const workoutService = require('../services/workoutService');

const router = express.Router();

// GET /workouts/:userId/plan
router.get('/:userId/plan', requireUser, (req, res, next) => {
  try { res.json(workoutService.getWeeklyPlan(req.params.userId)); }
  catch (err) { next(err); }
});

// GET /workouts/:userId
router.get('/:userId', requireUser, (req, res, next) => {
  try { res.json(workoutService.listRecentWorkouts(req.params.userId)); }
  catch (err) { next(err); }
});

// POST /workouts
router.post('/', requireUser, (req, res, next) => {
  try { res.status(201).json(workoutService.createWorkout(req.userId, req.body)); }
  catch (err) { next(err); }
});

// GET /workouts/:userId/:workoutId
router.get('/:userId/:workoutId', requireUser, (req, res, next) => {
  try { res.json(workoutService.getWorkout(req.params.userId, req.params.workoutId)); }
  catch (err) { next(err); }
});

// PUT /workouts/:userId/:workoutId/complete
router.put('/:userId/:workoutId/complete', requireUser, (req, res, next) => {
  try { res.json(workoutService.completeWorkout(req.params.userId, req.params.workoutId)); }
  catch (err) { next(err); }
});

// POST /workouts/:workoutId/sets
router.post('/:workoutId/sets', requireUser, (req, res, next) => {
  try { res.status(201).json(workoutService.logSet(req.params.workoutId, req.body)); }
  catch (err) { next(err); }
});

module.exports = router;
```

---

## Behavior-parity checklist (before you commit)

- [ ] `GET /workouts/:userId/plan` — returns plan; 404 when no profile (now via thrown `httpError`).
- [ ] `GET /workouts/:userId` — last 30 by `planned_date DESC`.
- [ ] `POST /workouts` — 201 with `{...workout, sets}`; 400 when `planned_date` missing.
- [ ] `GET /workouts/:userId/:workoutId` — 404 when not found.
- [ ] `PUT .../complete` — `{ message, progression }`.
- [ ] `POST /:workoutId/sets` — 201 with the inserted set; reps unchanged (still String).
- [ ] Route file imports **no** `getDb` / `db/encrypt` / `engine/*`.

## What's deliberately NOT in this step
- Don't normalize `String(reps)` here — separate change with its migration.
- Don't fix the N+1 in `progressWorkout` — that's Phase 1, when movements become a table.
- Don't add `validate` middleware yet — that's Track B4, applied across all routes at once.

## Then repeat the pattern
`checkinService` ← `routes/checkins.js` (note: it imports `shouldAutoDeload` from the engine — that call moves into the service too), then `macroService`, `aiService`, and the rest.
