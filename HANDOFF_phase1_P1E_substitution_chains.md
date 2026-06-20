# Phase 1 — P1-A…P1-D COMPLETE / P1-E (Substitution Chains) Start — Handoff

**Branch:** continue on `v2-phase1` (P1-A…P1-D are committed there). Confirm before starting:
```
git checkout v2-phase1 && git log --oneline -8
```
You should see P1-D, P1-C, P1-B, and the P1-A commits on top of the Phase-0 merge (`688f823`). If they're missing, they weren't pushed — stop and check with Mickey.

**Workspace:** `/Users/mickey/Documents/Fitness GLP v2/` (the v2 folder, NOT `Fitness AP v1`).

---

## Status going in — P1-A…P1-D are COMPLETE (don't revisit)

All four units below are committed and were smoke-tested green end-to-end on 2026-06-20 (backend `npm start`, `GET /movements/search`, `GET /workouts/:id/plan`, and an iOS Xcode build).

**P1-A — movements table + seed.**
- `backend/migrations/012_movements.sql` — `movements` table. Coarse `category` (push/pull/arms/lower/core/carry/mobility/conditioning) + finer engine `pattern` (push_h/push_v/pull_h/pull_v/squat/hinge/arms/core/carry/mobility/conditioning). `aliases`/`primary_muscles`/`secondary_muscles` are JSON-text (`'[]'` empty); `is_compound`/`unilateral`/`glp_flag` are 0/1; `level` (beginner/intermediate/advanced) supersedes the old numeric tier; nullable self-FK `progresses_to`/`regresses_to`.
- `backend/migrations/013_seed_movements.sql` — **72 movements** (push 13, pull 9, arms 4, lower 23, core 8, carry 3, mobility 7, conditioning 5). 8 are `glp_flag=0`. **Only ~20 progression chains are set** (see "What chains already exist" below) — that's the gap P1-E fills.

**P1-B — `backend/services/movementService.js` read layer.**
- `rowToMovement(row)` shared mapper (parses JSON arrays, coerces 0/1→bool) — callers never see raw DB shapes.
- `getMovementById` (404 via `lib/httpError`), `getMovementsByCategory(category,{level,equipment})`, `getMovementsByEquipment(equipment)`, `searchByAlias(q)`.

**P1-C — engine reads from the table; hard-coded array deleted.**
- `engine/exercises.js` is now a thin **adapter over movementService**, same public API + return shape (level→tier, singular→plural equipment). Added `getEasierVariant(id, equip)`.
- `movementService` gained `getMovementsByPattern(pattern,{maxLevel,equipment,compoundOnly})` and a **real `getSubstitutes(id,{direction,equipment,compoundOnly})`** = multi-hop chain walk (`regresses_to`/`progresses_to`) **then** a level-appropriate same-pattern/owned-equipment fallback.
- **Equipment plural→singular** translation lives in `movementService` (`toSingularEquipment`, exported `EQUIPMENT_PLURAL_TO_SINGULAR`). Table uses singular (`dumbbell`,`cable`,…); engine/profiles use plural (`dumbbells`,`cables`).
- **Decision (live):** `getByPattern` requests `compoundOnly:true` — the table now holds isolation work (lateral raise, calf raise, leg curl) sharing a pattern with the main lifts, and the engine's pattern slots are main-lift slots. Matches the old curated array + the "compound bias" principle. **Plan output legitimately changed** vs v1 (bigger pool, ordered by level then name).
- `engine/workout.js` deload now **steps each main lift one level easier** via `getEasierVariant` (picks at the user's real tier, regresses one step, falls back to the picked movement) then still cuts sets/RPE. `String(reps)` untouched.

**P1-D — movement alias resolution.**
- `movementService.searchMovements(q,{limit})` — deterministic scored ranking (exact name 100 > exact alias 90 > prefix 70/60 > substring 50/40; tie-break shortest name then alpha). `searchByAlias` delegates to it.
- `backend/routes/movements.js` (mounted `/movements` in `server.js`) — `GET /movements/search?q=&limit=` → `{ query, match (full movement|null), candidates ([{id,name}] ranked best-first) }`. `requireUser`-gated; 400 on empty `q`.
- iOS: `AIParseModels.swift` — `ParsedWorkoutSet` gained optional **defaulted** `movement_id`/`canonical_name`; added `MovementRef` + `MovementSearchResult`. `APIClient.searchMovement(userId:query:)` (URL-encoded q). `WorkoutParser.resolve(userId:sets:)` + `(response:)` — explicit, best-effort, concurrent resolution; `parse()` stays LLM-only/offline.

### Carried-open follow-ups (NOT done — decide later, not part of P1-E)
- `WorkoutParser.resolve` is **not auto-invoked** in `WorkoutView.parse` (one-liner after a successful `workout_log` parse). And the backend chat/log path (`routes/ai.js` → `chatService`) does **not consume `movement_id`** yet. Wiring both makes alias resolution live end-to-end.
- `searchMovements` returns weak substring candidates even when `match` is an exact hit (e.g. `"Goblet Squat"` lists other `*squat*` movements). UI can ignore `candidates` when `match` is high-confidence; endpoint stays permissive.

---

## Standing workflow constraints (do not break)

- **Agent git use is read-only** — `status`, `log`, `diff`, `show` only. Hand Mickey exact `add`/`commit`/`push` commands, one commit per logical unit. Scope `git add` to specific files (no wildcards that catch `*.xcuserstate` / `.DS_Store`). NB: `*.xcuserstate` is not gitignored and keeps showing up — never stage it.
- A read-only `git diff` in the sandbox once left a stale `.git/index.lock`. If Mickey hits `index.lock: File exists`, he removes it: `rm -f "<repo>/.git/index.lock"`.
- **Sandbox cannot compile Swift and has no `node_modules`** (no `better-sqlite3`, so no boot/runtime). Verify: SQL via **Python stdlib `sqlite3`** (apply `migrations/*.sql` in sorted order to an in-memory DB, mirroring `db/database.js`); JS pure logic via an extracted harness + `node --check`; Swift via static review. `sqlite3` CLI is NOT installed. Mickey runs the real `npm start` + Xcode build.
- Backend auto-applies migrations on startup, tracked by filename in `_migrations`. **Never edit an already-applied migration** (012/013 are applied in the dev DB) — add a new numbered file.
- Backend root: `backend/`. iOS source root: `FitnessAP/App/FitnessAP/`. Dev DB: `backend/data/fitnessap.db`. Dev user for curl: `test-user-001` via `X-User-Id` header. Port 3000.

---

## P1-E scope — author the substitution chains (migration `014`)

**Goal:** fill in `progresses_to`/`regresses_to` across the library so `getSubstitutes` and the deload chain-walk run on vetted progressions, not just the same-pattern fallback. Substitutes pull from the same pool (the roadmap example: back squat → leg press → goblet squat).

**Deliverable:** a new `backend/migrations/014_movement_chains.sql` of `UPDATE movements SET progresses_to=…, regresses_to=… WHERE id=…;` statements. Do NOT touch 013. Mirror 013's style (UPDATEs after the fact so FKs resolve regardless of order).

**Collaborative, like the candidate list:** propose the full mapping, Mickey vets it before it's written as the migration. Author per pattern, easiest→hardest, within each `category`/`pattern` group.

### Decisions to resolve up front (ask Mickey)
1. **Chain topology** — each movement has exactly one `progresses_to` and one `regresses_to` (a single linked list per pattern), so branching variants (e.g. two equally-hard squats) must be ordered into one spine. Confirm the linear-chain model is acceptable, or whether equipment-swap alternates need a different mechanism than the self-FK (they currently rely on the same-pattern fallback in `getSubstitutes`, which already works).
2. **Cross-equipment within a chain** — is it fine for a regression to change equipment (e.g. `barbell_back_squat` → `leg_press` (machine) → `goblet_squat` (dumbbell))? The deload path filters by owned equipment afterward, so mixed-equipment chains are safe, but confirm the intent.
3. **Non-strength categories** — should `arms`, `core`, `carry`, `mobility`, `conditioning` get chains at all, or stay unchained (the engine's main-lift slots are compound squat/hinge/push/pull, so accessory chains may be unused for now)? Likely defer accessory/mobility/conditioning chains; focus P1-E on `lower`/`push`/`pull` compounds.

### What chains already exist (from 013 — do not duplicate, extend around them)
- **squat:** goblet→db_front→barbell_front; leg_press→goblet (regress).
- **hinge:** db_rdl→trap_bar→barbell_deadlift.
- **push_h:** push_up→db_bench→barbell_bench; incline_db_press→push_up (regress).
- **push_v:** db_shoulder_press→barbell_ohp.
- **pull_h:** chest_supported_row→db_row→barbell_row; cable_row→barbell_row.
- **pull_v:** lat_pulldown→assisted_pull_up→pull_up.

### Notable movements still unchained (candidates to weave in)
- **squat/lower:** bodyweight_squat, box_squat, split_squat, bulgarian_split_squat, walking_lunge, step_up, barbell_back_squat, leg_extension (isolation), calf_raise (isolation).
- **hinge:** glute_bridge, hip_thrust, kb_swing, back_extension, single_leg_rdl, barbell_rdl, leg_curl (isolation).
- **push:** machine_chest_press, cable_fly, db_floor_press, machine_shoulder_press, arnold_press, db_lateral_raise (isolation).
- **pull:** inverted_row, straight_arm_pulldown (isolation).
- (`barbell_back_squat` and `barbell_rdl` are advanced spines with no regression set — prime fixes.)

### Verification (include as a task)
- Apply 012+013+**014** to an in-memory Python `sqlite3` DB; assert:
  - every `progresses_to`/`regresses_to` resolves to a real id (no dangling FK);
  - no movement points to itself; no 2-cycles (A→B and B→A in the same direction);
  - each chain is internally consistent (if A.progresses_to=B then ideally B.regresses_to=A — flag asymmetries);
  - spot-check `getSubstitutes` outcomes for representative ids by mirroring the service logic (e.g. `barbell_back_squat` easier → leg_press/goblet present; deload `getEasierVariant` returns a real easier compound).
- `node --check` any touched JS (none expected — this is data-only unless `getSubstitutes` needs tweaks).
- Mickey: `npm start` (confirm 014 applies once: `[db] applied migration: 014_movement_chains.sql`) + re-hit `/workouts/:id/plan` and an equipment-swap/deload scenario.

### Files to read first
- `backend/migrations/013_seed_movements.sql` — the data + the existing chain UPDATEs to extend.
- `backend/services/movementService.js` — `getSubstitutes`, `getMovementsByPattern`, `getEasierVariant` consumers; confirm whether authored chains alone satisfy the deload/equipment-swap paths.
- `backend/engine/workout.js` — deload chain-walk consumer.
- `Phase1_Movement_Candidate_List.md` — the vetted library + rationale per movement (level, glp_flag, equipment).

---

## After P1-E (don't start without direction)
- Wire `WorkoutParser.resolve` into `WorkoutView` + backend `movement_id` consumption (the carried-open follow-up).
- Then **Phase 2 — Cardio/Steps/HealthKit** (iPhone-first, adaptive step goals, HealthKit-vs-manual dedup). **Do NOT start Phase 2 or Phase 3 (Monetization/StoreKit) without Mickey's go-ahead.**
