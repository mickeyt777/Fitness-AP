# Phase 2-D Kickoff — Rest-day / Recovery + Weekly-report (reviewable slices) — Handoff

**Branch:** `v2-phase1` (continues from P2-C). Confirm: `git checkout v2-phase1 && git log --oneline -8`.
Top of log should include the four P2-C commits (networking → HealthKit → Today card → Progress sparklines), the P2-C docs-complete commit, and the **P2-D Slice 1** commit (`P2-D Slice 1: backend rest-day/recovery read …`).

**Workspace:** `/Users/mickey/Documents/Fitness GLP v2/` (the v2 folder, NOT `Fitness AP v1`).

P2-C is fully shipped (see `HANDOFF_phase2C_ios_healthkit.md`, marked ✅ complete). P2-D was kicked off 2026-06-24; Mickey chose **rest-day/recovery state** as the first workstream. Phase 3 (StoreKit) remains **gated** — do not start.

---

## ✅ P2-D Slice 1 — Backend recovery read — COMPLETE & committed (2026-06-24)

No migration (reuses `daily_checkins` + the activity tables). Mirrors the activity layering (pure lib → service → thin route).

- **`backend/lib/recoveryMath.js`** — pure, db-free `recoveryState(inputs)` →
  `{ state: 'ready'|'easy'|'rest'|'unknown', score: 0-100|null, label, headline, reasons[] }`.
  Null-safe additive scoring from a neutral 70 over: sleep, energy (avg of recent days), today's GLP symptoms (nausea/GI, low = worse), and recent activity load. **Load only ever steers toward 'easy', never 'rest' on its own.** Severe symptoms (≤3) = −32 (kept in line with the acute deload's nausea≤4 sensitivity). `unknown` when there's no wellness signal at all.
- **`backend/services/recoveryService.js`** — composes inputs from `checkinService.listRecentCheckins(userId, 3)` (energy avg, latest sleep, today's symptoms) + `activityService.getActivitySummary(userId, 7)` (cardio_minutes_7d, steps-vs-goal, count of 'hard' bouts in last ~2 days). No new SQL. Returns `{ date, ...recoveryState(...) }`.
- **`backend/routes/recovery.js`** — `GET /recovery/:userId` (requireUser), mounted at `/recovery` in `server.js`.
- **`backend/scripts/test_recoveryMath.js`** — 12/12 pure-logic cases; `node scripts/test_recoveryMath.js` from `backend/`.

**Verified:** `node --check` clean on all touched files; math harness 12/12 (runnable in-sandbox since pure); live smoke confirmed `unknown` for a user with no recent check-in.

**Decision locked (flagged for Mickey, revisit anytime):** the recovery read is **informational only** — it does NOT alter the generated plan. The acute, symptom-driven plan scaling stays in `engine/workout.js shouldAutoDeload` (today's single check-in). Recovery is the complementary multi-day nudge; both can fire. All thresholds live in one place in `recoveryMath.js`.

### API contract (what the iOS layer will talk to)
`GET /recovery/:userId` (dev auth `X-User-Id`, prod Bearer JWT; port 3000) →
```
{ "date": "YYYY-MM-DD",
  "state": "ready" | "easy" | "rest" | "unknown",
  "score": 0-100 | null,                 // null only when state == "unknown"
  "label": "Good to train" | "Take it easy" | "Rest day" | "No recovery read yet",
  "headline": "…one-line non-clinical nudge…",
  "reasons": ["…", "…"] }                // up to 3; [] when unknown
```
Smoke: `curl -H "X-User-Id: test-user-001" localhost:3000/recovery/test-user-001` (restart backend first — no hot reload).

---

## P2-D remaining slice plan (one commit per slice; verify, then hand off)

**Slice 2 — iOS recovery surface (Today).** A state-colored recovery card/banner in `Features/Today/`, wired to a new `APIClient.getRecovery(userId:)` + a `RecoveryModels.swift` (Decodable mirroring the contract). Show `label` + `headline` + `reasons`; color by state (ready=green, easy=amber/orange, rest=blue/red — Mickey's call). Hide gracefully on `unknown`/failure, or show the "log a check-in" nudge. Reuse `Shared/Components`. Sits alongside `CheckInCard`/`MacroCard`/`ActivityCard`. Verify by decoding sample JSON through the model (snake_case), static review, brace balance, no type collisions.

**Slice 3 (separate P2-D workstream) — Weekly-report fold-in.** Upgrade `backend/routes/ai.js` `/ai/weekly-report` to incorporate activity/cardio/steps (+ optionally the recovery trend), so the weekly summary reflects movement, not just workouts/macros. Backend-first. **Its free/paid gating belongs to gated Phase 3 — build the content, leave gating out.**

**Carry-over candidates (fold in where it fits):** spoken cardio via chat → `cardio_sessions` (backend AI-parse routing, roadmap Pillar 2 step 3); Today HealthKit sync cadence (sync-on-appear re-pulls ~30d → pull-to-refresh/throttle); `intensity` never inferred from HK.

---

## Standing workflow constraints (unchanged — do not break)
- **Agent git is read-only** (`status`/`log`/`diff`/`show`). Hand Mickey exact `add`/`commit` commands, one commit per slice, scoped `git add` (never `*.xcuserstate`/`.DS_Store`). A read-only `git diff` once left a stale `.git/index.lock`; if Mickey hits `index.lock: File exists`, `rm -f "<repo>/.git/index.lock"`.
- **Sandbox can't compile Swift or run better-sqlite3.** Verify Swift by static review + decoding sample JSON through model structs. Verify JS **pure** logic by running it (recoveryMath/activityMath have no DB deps) + `node --check`. SQL via Python stdlib `sqlite3` mirror. Mickey runs the real Xcode build + simulator/device and `npm start` (restart after JS/route/.env changes — no hot reload).
- Backend root `backend/`. iOS source root `FitnessAP/App/FitnessAP/`. Dev DB `backend/data/fitnessap.db`. Dev user `test-user-001`. Xcode project uses **synchronized folder groups** → new `.swift` files auto-join the target (no manual membership step).
- **Never edit an applied migration** — add a new numbered file (next is `016_…`). P2-D Slice 1 needed none.
