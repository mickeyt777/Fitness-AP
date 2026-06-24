# Phase 2-C Kickoff — iOS + HealthKit surfaces (reviewable slices) — Handoff

**Branch:** all Phase 2 work is on `v2-phase1`. Confirm before starting:
```
git checkout v2-phase1 && git log --oneline -6
```
Top of log should be (newest first):
`f0fa6bb` P2-B harden date derivation, `499b6b2` P2-B activity service, `6ce8660` P2-A migration 015, on top of the P1 commits (`3c395aa`, `8f881b4`, `d1f5b8e`…). If those P2 commits are missing they weren't pushed — stop and check with Mickey.

**Mickey has given the go-ahead for P2-C, to be done in REVIEWABLE SLICES** (one logical unit per slice, each verified and handed off for commit before the next). Do NOT dump the whole iOS phase in one pass. Phase 3 (Monetization/StoreKit) remains gated — do not start it.

**Workspace:** `/Users/mickey/Documents/Fitness GLP v2/` (the v2 folder, NOT `Fitness AP v1`).

---

## ✅ P2-C COMPLETE — 2026-06-24 (all four slices shipped, build green on device)

All slices were built, statically verified, Xcode-built green by Mickey, and committed one-per-slice on `v2-phase1`:

- **Slice 1 — Networking.** `Networking/Models/ActivityModels.swift` (Decodable/Encodable for the full `/activity` contract; one `CardioSession` covers both the full row and the summary projection) + five `APIClient` methods (`getActivitySummary`, `getCardioSessions`, `syncHealthKitWorkouts`, `upsertDailyActivity`, `logCardioSession`).
- **Slice 2 — HealthKit read + onboarding.** `App/HealthKitManager.swift` (`@MainActor`, read-only: steps / walking+running distance / active energy / heart rate / workouts; maps `HKWorkout` → `HealthKitWorkout` by `uuid`; `performInitialSync` helper). New onboarding step 4 (Apple Watch question + Connect Apple Health). **Xcode config landed:** HealthKit capability (`com.apple.developer.healthkit` in entitlements) + `INFOPLIST_KEY_NSHealthShareUsageDescription` (no Info.plist file — project uses `GENERATE_INFOPLIST_FILE`). Needed `import Combine` in the manager (it doesn't import SwiftUI).
- **Slice 3 — Today surface.** `Features/Today/ActivityCard.swift` — step ring vs adaptive `step_goal`, weekly cardio minutes, non-clinical trend. Best-effort HealthKit sync on appear, then `GET /activity/:userId/summary`. Wired into `TodayView` between MacroCard and the plan. **Decisions:** ring (not bar); sync-on-appear cadence (revisit on device).
- **Slice 4 — Progress surface.** `ActivitySection` in `ProgressScreenView.swift` — steps bar sparkline + active-energy line/area sparkline from `summary.daily`, failure-isolated fetch (won't blank the weight/measurement screen).

**Carry-over follow-ups (candidate P2-D / cleanup):**
1. Spoken cardio via chat still lands in `workout_sets`, not `cardio_sessions` (backend AI-parse routing — roadmap Pillar 2 step 3).
2. Today card HealthKit sync cadence (sync-on-appear re-pulls ~30 days each appearance) — consider pull-to-refresh or a throttle.
3. `avg_hr`/`intensity` are sent from HealthKit where available but `intensity` is never inferred from HK.

---

## Status going in — P2-A and P2-B are COMPLETE (backend done, don't revisit)

Verified green on 2026-06-20: migrations 001→015 apply clean, 26 pure-logic unit tests, SQL-mirror behavior checks, and a 14-check live HTTP smoke test all pass.

**P2-A — data model (migration `015_cardio_activity.sql`).** Two new tables (decision: new tables, not an extension of `workouts`):
- `daily_activity` — one row per user per day. `UNIQUE(user_id, date)`. Cols: `steps`, `distance_m`, `active_energy_kcal`, `step_goal` (adaptive snapshot for that day), `source` ∈ {healthkit, manual, mixed}.
- `cardio_sessions` — one discrete cardio bout. Optional `movement_id` FK into the seeded conditioning movements (`stationary_bike`, `incline_walk`, `rower`, `elliptical`, `kb_circuit`) with a `modality` text fallback. `hk_uuid` is partial-unique per user (idempotent HealthKit sync). `superseded_by` is a self-FK used by the dedup rule. `intensity` ∈ {easy, moderate, hard}.

**P2-B — backend activity layer.**
- `backend/lib/activityMath.js` — pure, db-free: `computeStepGoal` (7-day **median** +5%, null until ≥3 baseline days), `intervalsOverlap`, `sameActivityType`, `conflicts` (the HK-wins decision), `deriveDate` (guards against malformed/date-less `started_at`), `activityTrend` (non-clinical directional label).
- `backend/services/activityService.js` — all SQL: `upsertDailyActivity`, `logCardioSession`, `syncHealthKit`, `listCardioSessions`, `getActivitySummary`.
- `backend/routes/activity.js` — mounted at `/activity` in `server.js`.
- `backend/scripts/smoke_activity.sh` — rerunnable HTTP smoke test (self-clears its own rows; portable BSD/GNU `date`).

**Decisions already locked (do not re-litigate without Mickey):**
1. **Data model** — new tables (above).
2. **Dedup** — **HealthKit wins.** HK syncs idempotently by `hk_uuid`; an HK bout overlapping a manual one (same day + same activity type + overlapping/unknown time window) marks the manual row `superseded_by` the HK row — never deletes it. Rollups and lists count only non-superseded rows.
3. **Adaptive step goal** — rolling **7-day median +5%**, rounded to nearest 100, null until ≥3 days of step history. Snapshotted per day; computed from days strictly *before* the target date.
4. **Start order** — backend first (done), now iOS.

---

## Backend API contract (what the iOS layer talks to)

Dev auth: `X-User-Id: <userId>` header (prod: `Authorization: Bearer <jwt>`). Port 3000. All distances in **meters**, energy in **kcal** (HealthKit-native units — no conversion needed on ingest; display conversion is the app's job via `UnitSystem.swift`).

**POST `/activity/daily`** — upsert a day's rollup. Body (all optional except behavior): `{ date?, steps?, distance_m?, active_energy_kcal?, source? }`. Partial-update friendly (omitted fields keep prior values; two differing sources on a day → `source:"mixed"`). Returns the `daily_activity` row incl. computed `step_goal`.

**POST `/activity/cardio`** — log one manual bout. Body: `{ date?, started_at?, modality?, movement_id?, duration_min?, distance_m?, active_energy_kcal?, avg_hr?, intensity?, notes? }`. If `modality` is given without `movement_id`, the server alias-resolves it to a conditioning movement (e.g. "stationary bike" → `stationary_bike`). Returns the new `cardio_sessions` row. A manual bout that overlaps an existing HK bout is immediately superseded.

**POST `/activity/healthkit/sync`** — idempotent batch. Body: `{ workouts: [ { hk_uuid, started_at?, date?, modality?, movement_id?, duration_min?, distance_m?, active_energy_kcal?, avg_hr?, intensity? }, … ] }`. Returns `{ inserted, updated, superseded_manual, ids: [] }`. Re-sending the same `hk_uuid` updates, never duplicates. `hk_uuid` is required per workout (no UUID → skipped).

**GET `/activity/:userId/cardio?days=30&include_superseded=false`** — recent bouts; hides superseded by default.

**GET `/activity/:userId/summary?days=14`** — the surface payload:
```
{ today: { date, steps, step_goal },
  trend: { direction: "up"|"flat"|"down", pct, label },   // non-clinical, e.g. "More active than last week"
  cardio_minutes_7d,
  daily: [ { date, steps, distance_m, active_energy_kcal, step_goal } ],   // ascending
  cardio_sessions: [ { id, date, started_at, movement_id, modality, duration_min, distance_m, active_energy_kcal, intensity, source } ] }
```

**Validation ranges** (400 on violation): steps 0–200000, distance_m 0–1000000, active_energy_kcal 0–50000, duration_min 0–1440, avg_hr 1–250, intensity ∈ {easy,moderate,hard}, source ∈ {healthkit,manual,mixed}, date `YYYY-MM-DD`.

---

## Standing workflow constraints (do not break)

- **Agent git use is read-only** — `status`, `log`, `diff`, `show` only. Hand Mickey exact `add`/`commit`/`push` commands, one commit per slice. Scope `git add` to specific files (no wildcards catching `*.xcuserstate`/`.DS_Store`). `*.xcuserstate` is NOT gitignored — never stage it.
- **Sandbox cannot compile Swift and has no `node_modules`/`better-sqlite3`.** Verify Swift by static review + decoding sample JSON through the model structs where possible (a tiny `swift` snippet won't run — no toolchain). Verify JS pure logic via extracted harness + `node --check`. SQL via Python stdlib `sqlite3` (apply `migrations/*.sql` in order to in-memory). `sqlite3` CLI is not in the sandbox (it IS on Mickey's Mac). Mickey runs the real Xcode build + simulator/device and `npm start`.
- **Never edit an already-applied migration** — add a new numbered file (next is `016_…`). P2-C is not expected to need a migration.
- Backend root: `backend/`. iOS source root: `FitnessAP/App/FitnessAP/`. Dev DB: `backend/data/fitnessap.db`. Dev user: `test-user-001`. Backend must be restarted after JS/route/.env changes (no hot reload).
- A read-only `git diff` once left a stale `.git/index.lock`; if Mickey hits `index.lock: File exists`, he runs `rm -f "<repo>/.git/index.lock"`.

---

## iOS lay of the land (real paths)

- `FitnessAP/App/FitnessAP/Networking/APIClient.swift` — `final class APIClient`; `perform`/`performOptional` generic helpers; `buildRequest` sets the `X-User-Id` / `Bearer` header. Add new endpoint methods here, matching the existing `getTodayCheckin` / `getMeasurements` style (`async throws`, snake_case `Encodable` body structs).
- `FitnessAP/App/FitnessAP/Networking/Models/` — one file per domain. **NB:** `HealthModels.swift` already exists but is only the `/health` ping response — do NOT reuse it for activity. Create a new `ActivityModels.swift`.
- `FitnessAP/App/FitnessAP/Features/Today/` — `TodayView.swift`, `MacroCard.swift`, `CheckInCard.swift`. The steps/cardio ring attaches here alongside the existing cards.
- `FitnessAP/App/FitnessAP/Features/Progress/ProgressScreenView.swift` — weight/measurement charts; steps + active-energy sparklines go next to them.
- `FitnessAP/App/FitnessAP/Features/Onboarding/OnboardingView.swift` — the Apple Watch question + HealthKit permission step attaches here.
- `FitnessAP/App/FitnessAP/Shared/Components/` — `EmptyStateView`, `ErrorStateView`, `LoadingStateView` for reuse.
- `FitnessAP/App/FitnessAP/App/` — `AppState.swift`, `Config.swift` (`Config.baseURL`), `UnitSystem.swift`.

---

## P2-C slice plan (one commit per slice; verify, then hand off)

**Slice 1 — Networking only (no UI). ✅ DONE.** `ActivityModels.swift` (Decodable/Encodable structs mirroring the contract above) + `APIClient` methods: `getActivitySummary`, `getCardioSessions`, `syncHealthKitWorkouts`, `upsertDailyActivity`, `logCardioSession`. Verify by decoding captured sample JSON (from the smoke test) through the structs. No HealthKit yet. Smallest, safest first slice.

**Slice 2 — HealthKit read + onboarding permission. ✅ DONE.** A `HealthKitManager` (read steps, walking+running distance, active energy via `HKHealthStore`/`HKStatisticsQuery`; map `HKWorkout`s → the `/healthkit/sync` payload using `HKWorkout.uuid` as `hk_uuid`). Add the **Apple Watch question** to `OnboardingView` → request HealthKit authorization accordingly; **manual entry always available regardless of the answer.** Mickey adds the **HealthKit capability + Info.plist `NSHealthShareUsageDescription`** in Xcode (same as Sign in with Apple before it) — call this out explicitly in the slice handoff; it can't be done from here.

**Slice 3 — Today surface. ✅ DONE.** A steps/cardio ring (or bar) component in `Features/Today/`, wired to `GET /activity/:userId/summary`, sitting alongside `MacroCard` + `CheckInCard`. Show today's steps vs adaptive `step_goal`, cardio minutes, and the non-clinical `trend.label`. Reuse the shared Loading/Empty/Error components.

**Slice 4 — Progress surface. ✅ DONE.** Steps + active-energy sparklines in `ProgressScreenView.swift` next to the existing weight/measurement charts, driven by `summary.daily`.

(Rest-day/recovery read and the weekly-report fold-in are **P2-D**, after these.)

### Verification expectations (every slice)
- Static review of all Swift; where feasible, round-trip the contract's sample JSON through the new model structs to catch key/case mismatches (snake_case decoding).
- `node --check` / Python-mirror only if any backend code is touched (not expected in C).
- Always include a final verification task in the task list. Mickey runs the real Xcode build + simulator; HealthKit needs a real device or the simulator's Health app for full coverage.

### Open items to confirm with Mickey during P2-C
1. **Manual cardio via chat** — today `chatService.handleWorkoutLog` lands ad-hoc logs as `workout_sets`, NOT `cardio_sessions`. Routing spoken cardio ("30 min stationary bike, moderate") into `cardio_sessions` via the AI-parse path is a backend change (roadmap Pillar 2 step 3). For P2-C use the explicit `POST /activity/cardio` for manual entry; decide with Mickey whether/when to also fold the chat path in (candidate P2-D slice).
2. **Ring visual** — ring vs bar, and exact metrics shown on the Today card.
3. **HealthKit read cadence** — on app foreground? Pull-to-refresh? Background delivery is likely out of scope for now.

---

## After P2-C
- **P2-D** — rest-day/recovery state (uses activity data + existing check-in sliders) and the weekly-report upgrade (`/ai/weekly-report` fold-in; its free/paid gating belongs to Phase 3).
- **Phase 3 — Monetization (StoreKit 2).** Gated. **Do NOT start without Mickey's go-ahead.**
