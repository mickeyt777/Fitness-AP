# Phase 1 COMPLETE → Phase 2 (Cardio / Steps / HealthKit) Kickoff — Handoff

**Branch:** Phase 1 work lives on `v2-phase1`. Confirm before starting:
```
git checkout v2-phase1 && git log --oneline -8
```
You should see (top first): `3c395aa` session_type CHECK fix, `8f881b4` P1-E follow-up wiring, `d1f5b8e` P1-E migration 014, on top of the P1-A…P1-D commits. If they're missing they weren't pushed — stop and check with Mickey.

**Do NOT start Phase 2 work without Mickey's explicit go-ahead.** This doc is the plan to pick up from, not a license to begin. Phase 3 (Monetization/StoreKit) is even further gated.

**Workspace:** `/Users/mickey/Documents/Fitness GLP v2/` (the v2 folder, NOT `Fitness AP v1`).

---

## Status going in — Phase 1 is COMPLETE (don't revisit)

All committed on `v2-phase1` and verified green end-to-end on 2026-06-20 (backend boot, `/movements/search`, `/workouts/:id/plan`, and a real chat-log save in the iOS simulator).

- **P1-A…P1-D** (movements table + seed, `movementService` read layer, engine routed through the table, alias resolution) — done in prior sessions.
- **P1-E — substitution chains (`backend/migrations/014_movement_chains.sql`).** Authored `progresses_to`/`regresses_to` for the squat/hinge/push_h/push_v/pull_h **compounds** (accessory/isolation/core/carry/mobility/conditioning deferred — the engine's main-lift slots never select them; pull_v was already complete in 013). Model: linear spine per family (bidirectional) + one-way "alternates" merging into a spine (same convention 013 uses for `leg_press`/`incline_db_press`/`cable_row`). Touches **zero** existing 013 links except NULL-fills. Roadmap chain realized: `getSubstitutes(barbell_back_squat, easier)` → leg_press → goblet → bodyweight → box. Every advanced compound deloads one hop to a real easier movement. `barbell_rdl`/`single_leg_rdl`/`kb_swing` all regress to `db_romanian_deadlift` (Mickey confirmed the stimulus is intended). Verified via a Python `sqlite3` mirror of 012+013+014: no dangling FKs / self-loops / 2-cycles; the only asymmetries are the intended alternates.
- **Alias resolution wired live end-to-end** (the carried-open P1-D follow-up):
  - iOS `WorkoutView.parse` now calls `WorkoutParser.resolve(response:)` after a successful `workout_log` parse (spinner stays up through resolution; best-effort, never blocks logging). `ConfirmCard` shows `canonical_name ?? exercise_name`.
  - Backend `chatService.handleWorkoutLog` consumes `movement_id`: `exercise_id` = `movement_id ?? exercise_id (legacy) ?? slug(name) ?? 'unknown'`; `exercise_name` = `canonical_name ?? exercise_name ?? slug`. So `workout_sets.exercise_id` now stores the real movements-table id when resolved.
  - `confirmLog` now sends `parser_source: parse.source` (was hardcoded `"cloud"`).
- **Bug fixed this session:** chat-logged ad-hoc workouts were inserting `session_type='chat_logged'`, which violates the `workouts.session_type` CHECK (engine/template types only). Now left NULL with `'chat_logged'` in `notes`. This is why "log sets" only worked before when a planned workout already existed for the day.

### Loose ends (minor, optional — not Phase 2)
- `.gitignore` had an unstaged modification at session end (Mickey's). Commit or discard as desired.
- `searchMovements` still returns weak substring candidates even when `match` is a high-confidence exact hit; UI can ignore `candidates` when `match` is strong. Endpoint stays permissive by design.

---

## Standing workflow constraints (do not break)

- **Agent git use is read-only** — `status`, `log`, `diff`, `show` only. Hand Mickey exact `add`/`commit`/`push` commands, one commit per logical unit. Scope `git add` to specific files (no wildcards that catch `*.xcuserstate` / `.DS_Store`). NB: `*.xcuserstate` is not gitignored — never stage it.
- A read-only `git diff` in the sandbox once left a stale `.git/index.lock`. If Mickey hits `index.lock: File exists`, he removes it: `rm -f "<repo>/.git/index.lock"`.
- **Sandbox cannot compile Swift and has no `node_modules`/`better-sqlite3`** (no boot/runtime). Verify: SQL via **Python stdlib `sqlite3`** (apply `migrations/*.sql` in sorted order to an in-memory DB, mirroring `db/database.js`); JS pure logic via an extracted harness + `node --check`; Swift via static review. `sqlite3` CLI is NOT installed. Mickey runs the real `npm start` + Xcode build + simulator.
- **node one-liners against the dev DB must run from `backend/`** (`better-sqlite3` is in `backend/node_modules`; DB path `data/fitnessap.db` is relative to `backend`).
- The migration apply log (`[db] applied migration: NNN_...`) prints **only on the first start** after adding the file; later starts skip silently. To confirm a migration applied, query `_migrations` or the data — not the log.
- Backend auto-applies migrations on startup, tracked by filename in `_migrations`. **Never edit an already-applied migration** — add a new numbered file (next is `015_...`).
- Backend root: `backend/`. iOS source root: `FitnessAP/App/FitnessAP/`. Dev DB: `backend/data/fitnessap.db`. Dev user for curl: `test-user-001` via `X-User-Id` header. Port 3000. Backend must be restarted after JS/route/.env changes.

---

## Phase 2 scope — Cardio / Steps / HealthKit (iPhone-first)

From `Fitness_GLP_v2_Roadmap.md` (Pillar 2). Build order within the phase:

1. **Onboarding additions** — ask whether the user has an Apple Watch, then request HealthKit permission accordingly. Manual entry always available regardless.
2. **iPhone motion data via HealthKit (primary)** — read steps, walking/running distance, and active energy from the phone (no Apple Watch assumed).
3. **Manual fallback via the existing chat flow** — reuse the AI parse path so "30 min stationary bike, moderate" becomes a cardio session when HealthKit has no data (e.g. a non-tracked bike). Note: the movements table already seeds conditioning movements (`stationary_bike`, `incline_walk`, `rower`, `elliptical`, `kb_circuit`) — alias resolution can map spoken cardio to these.
4. **HealthKit-vs-manual dedup rule** — *design up front.* If HealthKit already captured a workout and the user also logs it manually, avoid double-counting. This is an explicit open question (roadmap line ~120). Decide the reconciliation rule with Mickey before building the surfaces.
5. **Adaptive step goal + activity signal** — no fixed 10k; nudge slightly above the user's own rolling baseline. Combine logged movement (steps, cardio minutes, lifting volume) with the body measurements already in the Progress tab into a simple, directional activity/energy signal. **Keep it non-clinical** — frame as a trend ("more active than last week"), never medical advice (GLP-1 context).
6. **Rest-day / recovery state** — once activity data + the existing check-in sliders are in place, add an explicit "today is a rest day" read so the Today tab has something intentional on non-weight days.
7. **Surfaces:**
   - Today tab: a steps/cardio ring or bar alongside the existing macro + check-in cards.
   - Progress tab: steps and active-energy sparklines next to the existing weight/measurement charts.
8. **Weekly report upgrade (end of Phase 2, gating decided in Phase 3)** — `/ai/weekly-report` already exists; once steps/cardio/activity are flowing, fold them into the recap. Build only after the data exists to avoid reworking twice. It's a candidate paid feature, so its free/paid gating belongs to Phase 3.

### Decisions to resolve up front (ask Mickey)
1. **Dedup rule** — time-window overlap + activity-type match? HealthKit-wins vs manual-wins? Surface both and let the user merge? This needs a concrete rule before the Today/Progress surfaces are built.
2. **New tables vs extend `workouts`** — does a cardio/steps session live in a new table (e.g. `cardio_sessions`, `daily_activity`) or as `workouts` rows with `session_type` extended? Note the existing `workouts.session_type` CHECK is restrictive and nullable; manual cardio currently routes through `chatService.handleWorkoutLog` and lands as `workout_sets`. Decide the data model before migration `015`.
3. **Adaptive goal formula** — what rolling window (7d? 14d?) and what "nudge above baseline" means numerically. Keep it simple and explainable.
4. **HealthKit entitlement / capability** — Xcode target needs the HealthKit capability + Info.plist usage strings; Mickey adds these in Xcode (like the Sign in with Apple capability before it).

### Files / context to read first
- `Fitness_GLP_v2_Roadmap.md` — Pillar 2 (lines ~46–62), build order (~114), open questions (~120).
- `backend/migrations/005_workouts.sql` — `workouts`/`workout_sets` shape + the `session_type` CHECK.
- `backend/services/chatService.js` — `handleWorkoutLog` (manual-entry path that cardio would reuse/extend).
- `backend/routes/ai.js` + the AI parse flow — manual cardio parsing reuses this.
- iOS `FitnessAP/App/FitnessAP/Features/Today/` (TodayView, MacroCard, CheckInCard) and `Features/Progress/ProgressScreenView.swift` — where the new surfaces attach.
- iOS `Features/Onboarding/OnboardingView.swift` — where the Watch question + HealthKit permission step goes.

### Verification expectations (Phase 2)
- New migrations: apply 012…015+ to an in-memory Python `sqlite3` DB; assert schema + any seed/constraints hold.
- Backend logic: extracted harness + `node --check`.
- HealthKit + SwiftUI: static review in-sandbox; Mickey runs the real Xcode build + simulator/device (HealthKit needs a real device or the simulator's Health app for full coverage).
- Always include a final verification task in the task list.

---

## After Phase 2 (don't start without direction)
- **Phase 3 — Monetization (StoreKit 2):** 1-week free trial → sub; buy reminders at day 1/3/5/last; price + free/paid split still open. Folds in the weekly-report gating and data export. **Do NOT start without Mickey's go-ahead.**
