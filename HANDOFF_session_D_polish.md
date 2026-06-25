# Session Handoff — Backlog item D (minor polish bundle)

**Branch:** `v2-phase1`. Staged in the working tree, **NOT committed** (agent git is
read-only). Commit commands at the bottom — three logical slices. One backend file
changed, so **`npm start` must be restarted** for D3's server half (no hot reload).

---

## What was built

All three D items. Item 3 turned out to be a **real latent bug**, not the cosmetic
cleanup the backlog described — details below.

**D1 — Recovery card live refresh after a check-in**
- `Features/Today/CheckInCard.swift`: added `var onSaved: (() -> Void)? = nil`, fired
  right after a successful `submitCheckin`.
- `Features/Today/RecoveryCard.swift`: added `var refreshToken: Int = 0` +
  `.onChange(of: refreshToken)` → re-fetches the read.
- `Features/Today/TodayView.swift`: new `recoveryRefreshToken`; `CheckInCard`'s
  `onSaved` bumps it, `RecoveryCard` receives it. Mirrors the existing
  `activityRefreshToken` pattern. Recovery now reflects the check-in you just saved
  without leaving the tab.

**D2 — HealthKit cardio intensity inference**
- `App/HealthKitManager.swift`: `mapWorkout` previously set `intensity: nil`. Added
  `inferIntensity(avgHR:)` → easy `<120`, moderate `120–149`, hard `≥150` bpm; nil when
  there's no HR sample (so the `cardio_sessions` CHECK is never violated).
- ⚠ **Coarse on purpose:** the static mapper has no access to the user's age/max-HR, so
  these are absolute-BPM bands, not %HRmax zones. It's a hint, not a verdict. If you
  later want true zones, thread the profile age into the mapper — flagged for a future
  pass.

**D3 — `parser_source` mismatch (the real bug)**
- The backlog said `confirmLog` hardcoded `"cloud"`. That was *already* changed to
  `parse.source` — but that change exposed a contract break: the iOS on-device path
  sent **`"on-device"` (hyphen)** while `migration 007`'s column has
  `CHECK(parser_source IN ('on_device','cloud','none'))` — **underscore**. An on-device
  parse confirm would fail the CHECK and the log would 500.
  - Why sims stayed green: Apple Foundation Models on-device parsing isn't available in
    the Simulator, so `parse.source` was always `"cloud"` there. The break only shows on
    a **real iOS 26 device** that parses on-device.
- Fix:
  - `Features/Workout/WorkoutParser.swift`: on-device source literal `"on-device"` →
    `"on_device"`. (Comment in `WorkoutView.swift` updated to match.)
  - `services/chatService.js`: added `normalizeParserSource()` — maps a legacy
    `"on-device"` → `"on_device"` and coerces anything unrecognised → `"none"`, so a bad
    value from any client can never fail the INSERT again.

---

## Verification status

- **Backend:** `node --check services/chatService.js` clean. `normalizeParserSource`
  unit-checked (6/6 cases pass). **SQLite mirror of the 007 CHECK** proves the bug +
  fix: `'on-device'` → REJECTED, `'on_device'`/`'cloud'`/`'none'` → ACCEPTED.
- **iOS (D1/D2 + D3 iOS half):** sandbox can't compile Swift — static-reviewed.
  - D1: trailing-closure binds to the optional `onSaved`; `RecoveryCard` preview still
    compiles (defaulted `refreshToken`); `.onChange(of:_,_)` matches the iOS-17 two-param
    form already used in `ProgressScreenView`.
  - D2: `switch` over `Double` range patterns returning `String?`.
- **Still needs a real device/Sim pass by you:**
  1. Today → adjust sliders → **Save check-in** → RecoveryCard updates in place.
  2. **Restart `npm start`** (D3 backend change), then on a real iOS 26 device speak a
     log that parses on-device (high confidence) → it saves (no 500), and the row's
     `parser_source` is `on_device`.
  3. Apple Health sync → cardio bouts with HR now carry easy/moderate/hard.

---

## Commit commands (run yourself — scoped, never add .xcuserstate/.DS_Store)

```sh
cd "<repo root: Fitness GLP v2>"

# D1 — recovery card live refresh
git add FitnessAP/App/FitnessAP/Features/Today/CheckInCard.swift \
        FitnessAP/App/FitnessAP/Features/Today/RecoveryCard.swift \
        FitnessAP/App/FitnessAP/Features/Today/TodayView.swift
git commit -m "D1: refresh RecoveryCard after a check-in saves"

# D2 — HealthKit intensity inference
git add FitnessAP/App/FitnessAP/App/HealthKitManager.swift
git commit -m "D2: infer cardio intensity from avg HR on HealthKit sync"

# D3 — parser_source contract fix (iOS literal + backend normalization)
git add FitnessAP/App/FitnessAP/Features/Workout/WorkoutParser.swift \
        FitnessAP/App/FitnessAP/Features/Workout/WorkoutView.swift \
        backend/services/chatService.js
git commit -m "D3: fix parser_source on_device mismatch (CHECK was rejecting on-device logs)"
```

Note: `HANDOFF_session_weekly_report_screen.md` (item C) is still untracked — commit it
with the docs if you want it in history.

---

## Backlog after this session
- A, B, C, D — **done.**
- **Gated, needs explicit go-ahead:** Phase-3 monetization (StoreKit 2) and the
  weekly-report free/paid gating. The report screen was built gating-free so Phase 3 can
  layer the paywall on top.
- **Future small follow-up (noted, not urgent):** D2 intensity could use true %HRmax
  zones if the user's age is threaded into the HealthKit mapper.

## Standing constraints (unchanged)
- Agent git read-only; one commit per slice; scoped `git add`. Stale `.git/index.lock` →
  `rm -f "<repo>/.git/index.lock"`.
- Sandbox can't compile Swift / run better-sqlite3. Verify Swift by static review; JS via
  `node --check`; SQL via Python `sqlite3` mirror. Restart `npm start` after JS changes.
- Synchronized folder groups; dev user `test-user-001`, port 3000; next migration `016_…`.
