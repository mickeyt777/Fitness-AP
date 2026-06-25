# Next-Session Handoff — Remaining Items to Prioritize (Fitness GLP v2)

**Purpose:** this doc is for a *planning* conversation. P2-C and P2-D are fully shipped. What's
left is a small backlog of independent items. Read the "Decide first" section, then we'll agree an
order before writing any code. **Nothing here is started.**

**Branch:** `v2-phase1`. Confirm: `git checkout v2-phase1 && git log --oneline -12` — top should show the
P2-D commits (recovery backend, recovery iOS card, weekly-report fold-in) and the two docs-complete commits.

---

## Where we are (shipped & committed)
- **P2-C (iOS + HealthKit)** — networking layer, `HealthKitManager` + onboarding Apple Health step,
  Today step ring/cardio card, Progress steps+active-energy sparklines. Build green on device.
  Doc: `HANDOFF_phase2C_ios_healthkit.md` (✅ complete).
- **P2-D (recovery + weekly-report)** — backend recovery read (`/recovery/:userId`), Today
  `RecoveryCard`, and activity folded into the weekly-report aggregator + narrative.
  Doc: `HANDOFF_phase2D_recovery.md` (✅ complete).

## Standing constraints (unchanged — keep these)
- **Agent git is read-only** (`status`/`log`/`diff`/`show`); hand Mickey exact `add`/`commit`
  commands, one commit per slice, scoped `git add` (never `*.xcuserstate`/`.DS_Store`). Stale
  `.git/index.lock` after a read-only diff → `rm -f "<repo>/.git/index.lock"`.
- **Sandbox can't compile Swift or run better-sqlite3.** Verify Swift by static review + decoding
  sample JSON through model structs. Verify **pure** JS by running it + `node --check`. SQL via
  Python stdlib `sqlite3` mirror (migrations 001→015). Mickey runs real Xcode build + `npm start`
  (restart after JS/route/.env changes — no hot reload).
- Reviewable slices: one logical unit per slice, verified, handed off for commit before the next.
- Xcode project uses **synchronized folder groups** → new `.swift` files auto-join the target.
- Next migration number is `016_…` if one is ever needed. Dev user `test-user-001`, port 3000.

---

## Decide first: the remaining backlog (pick an order)

### A. Spoken cardio → `cardio_sessions`  (backend, functional gap)
**What:** today `chatService.handleWorkoutLog` routes ad-hoc chat logs into `workout_sets`. Spoken
cardio ("30 min stationary bike, moderate") should land in `cardio_sessions` instead, via the
AI-parse path (roadmap Pillar 2, step 3).
**Where:** `services/aiService.js` (chat-parse prompt — add a `cardio_log` type with
modality/duration/intensity), `services/chatService.js` (`handleWorkoutLog` → branch to
`activityService.logCardioSession`), maybe `routes/ai.js`. iOS `AIParseModels.swift`/`WorkoutParser`
if the parsed shape changes.
**Effort:** M. **Migration:** none (cardio_sessions exists). **Deps:** none.
**Open Qs:** how to disambiguate cardio vs strength in the parser; should confidence gate it; does the
confirm-card UI need a cardio variant.

### B. Today HealthKit sync cadence  (iOS polish)
**What:** `ActivityCard.load()` runs `performInitialSync` on every Today appearance (re-pulls ~30 days
of workouts each time). Replace with pull-to-refresh and/or a throttle (e.g. once per N minutes).
**Where:** `Features/Today/ActivityCard.swift` (+ maybe `TodayView` for `.refreshable`).
**Effort:** S. **Deps:** none. **Open Qs:** exact cadence; whether to add a manual refresh affordance.

### C. iOS weekly-report screen  (NEW feature — ⚠ Phase-3-gated)
**What:** the app does **not** call `/reports` or `/ai/weekly-report` anywhere — there's no report
model, API method, or screen. Building it = `WeeklyReportModels.swift` (mirror the aggregator output,
incl. the new `activity` block) + `APIClient` methods (`getWeeklySummary`, `getWeeklyReportNarrative`)
+ a report screen (summary cards + LLM narrative).
**Effort:** L. **Deps:** backend already returns everything.
**⚠ Gating:** the roadmap flags the **weekly-report upgrade as gated in Phase 3** (free/paid split).
Choosing this is effectively greenlighting Phase-3-adjacent work — confirm scope (build the screen now
but leave paywall/gating out? or wait until Phase 3 proper).

### D. Minor polish (bundle or defer)
- **Recovery card live refresh:** `RecoveryCard` fetches once on appear; submitting a check-in via
  `CheckInCard` doesn't refresh it until the next Today load. Small iOS state-sharing change.
- **HealthKit `intensity` inference:** workouts sync with `intensity: nil` (never inferred from HK).
  Could derive easy/moderate/hard from avg HR vs a simple zone heuristic. Small, judgment-y.
- **`confirmLog` parser_source:** pre-existing — hardcodes `"cloud"` even for on-device parses
  (`parse.source` is available). Tiny.

---

## Notes / decisions to revisit with fresh eyes
- **Recovery read is informational-only** (does not alter the plan). The acute
  `engine/workout.js shouldAutoDeload` still owns plan scaling; both can fire. If we ever want
  recovery to influence the plan, that's a deliberate, separate decision. All recovery thresholds
  live in one place in `lib/recoveryMath.js` and are easy to tune after seeing real device data.
- **Today card visual/cadence** (ring vs bar, sync timing) and **rest=indigo** color were my calls —
  worth a look on-device.

## Gated — do not start without explicit go-ahead
- **Phase 3 — Monetization (StoreKit 2):** trial → sub, buy reminders, price/free-paid split. Gated.
- The weekly-report free/paid gating belongs here (see item C).

---

### Suggested starting point (my read, for discussion — not a decision)
A (spoken cardio → cardio_sessions) is the most self-contained functional gap and unblocks fuller
cardio logging without touching the gated area; B is a quick win to bundle alongside. C is the big one
and needs a gating decision first. We'll settle the order at the top of the next session.
