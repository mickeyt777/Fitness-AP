# Phase 2-D Kickoff — Rest-day / Recovery + Weekly-report (reviewable slices) — Handoff

**Branch:** `v2-phase1` (continues from P2-C). Confirm: `git checkout v2-phase1 && git log --oneline -8`.
Top of log should include the four P2-C commits (networking → HealthKit → Today card → Progress sparklines), the P2-C docs-complete commit, and the **P2-D Slice 1** commit (`P2-D Slice 1: backend rest-day/recovery read …`).

**Workspace:** `/Users/mickey/Documents/Fitness GLP v2/` (the v2 folder, NOT `Fitness AP v1`).

P2-C is fully shipped (see `HANDOFF_phase2C_ios_healthkit.md`, marked ✅ complete). P2-D was kicked off 2026-06-24; Mickey chose **rest-day/recovery state** as the first workstream. Phase 3 (StoreKit) remains **gated** — do not start.

## ✅ P2-D COMPLETE — 2026-06-24 (both workstreams shipped, build green)
- **Rest-day/recovery** — backend (Slice 1) + iOS Today card (Slice 2), committed.
- **Weekly-report fold-in** — backend aggregator + narrative now include activity (steps/cardio), committed.
- See per-slice details below. Remaining items are carry-overs / optional polish (listed at the end).

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

**Slice 2 — iOS recovery surface (Today). ✅ DONE & committed.** `Networking/Models/RecoveryModels.swift` (`RecoveryRead`) + `APIClient.getRecovery(userId:)` + `Features/Today/RecoveryCard.swift` — state-colored card (ready=green, easy=orange, **rest=indigo** [calm, not red], unknown=muted "log a check-in" nudge) showing `label` + score chip + `headline` + `reasons`. Self-fetching, hides on failure (mirrors MacroCard). Placed right after `CheckInCard` in `TodayView`. Verified: all 4 states decode through the model; static review clean. Known limit: fetches once on appear (no live refresh after a new check-in).

**Slice 3 — Weekly-report fold-in. ✅ DONE & committed (backend-only).** `engine/weeklyReport.js` gained an `activity` summary section (avg steps, step-goal-hit days, total distance km, active energy kcal, cardio sessions/minutes/intensity — counts only non-superseded cardio). `services/reportService.js` adds steps+cardio lines to `narrative_prompt` (null-safe). `services/aiService.js` tone guideline now has the LLM acknowledge movement while still leading with the lean-mass proxy. Verified: `node --check` + Python sqlite3 mirror (migrations 001–015) asserting the new queries incl. superseded-cardio exclusion. **Gating untouched — belongs to Phase 3.**

### Remaining (carry-overs / optional polish — NOT blocking; pick with Mickey)
- **iOS weekly-report display** (optional): if the app renders the structured summary, surface the new `summary.activity` fields (numbers, not just prose). Small iOS slice.
- Spoken cardio via chat → `cardio_sessions` (backend AI-parse routing, roadmap Pillar 2 step 3) — still lands in `workout_sets`.
- Today HealthKit sync cadence (sync-on-appear re-pulls ~30d → pull-to-refresh/throttle).
- `intensity` never inferred from HK; recovery card has no live refresh after a check-in.

**After P2-D: Phase 3 — Monetization (StoreKit 2). GATED. Do NOT start without Mickey's explicit go-ahead.**

---

## Standing workflow constraints (unchanged — do not break)
- **Agent git is read-only** (`status`/`log`/`diff`/`show`). Hand Mickey exact `add`/`commit` commands, one commit per slice, scoped `git add` (never `*.xcuserstate`/`.DS_Store`). A read-only `git diff` once left a stale `.git/index.lock`; if Mickey hits `index.lock: File exists`, `rm -f "<repo>/.git/index.lock"`.
- **Sandbox can't compile Swift or run better-sqlite3.** Verify Swift by static review + decoding sample JSON through model structs. Verify JS **pure** logic by running it (recoveryMath/activityMath have no DB deps) + `node --check`. SQL via Python stdlib `sqlite3` mirror. Mickey runs the real Xcode build + simulator/device and `npm start` (restart after JS/route/.env changes — no hot reload).
- Backend root `backend/`. iOS source root `FitnessAP/App/FitnessAP/`. Dev DB `backend/data/fitnessap.db`. Dev user `test-user-001`. Xcode project uses **synchronized folder groups** → new `.swift` files auto-join the target (no manual membership step).
- **Never edit an applied migration** — add a new numbered file (next is `016_…`). P2-D Slice 1 needed none.
