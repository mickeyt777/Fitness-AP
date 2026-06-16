# Phase 0 — Structural Hardening Checklist

*The gate before any v2 feature work. Refactor in place — v1 works, keep it working at every step. Don't rewrite from a blank repo.*

**Golden rule for the whole phase:** after every step, the app still behaves exactly as v1 did. No behavior changes, only structure moves. Commit after each green step so you can always roll back one move.

---

## Track A — Set up the new repo (do first, once)

- [ ] Copy `Fitness AP` → `Fitness GLP` **with its `.git` folder** (`cp -R`, not a fresh export).
- [ ] `git checkout -b v2-phase0` so all hardening lands on a branch.
- [ ] Open the new folder in Xcode, clean build, run on simulator. **Confirm it works before touching anything.** This is your baseline.
- [ ] Rename project / scheme / display name to "Fitness GLP". **Leave bundle id `com.mickey.FitnessAP` as-is** (changing it = new App Store app).
- [ ] Commit: `chore: import v1, rename to Fitness GLP`.

---

## Track B — Backend service layer (the load-bearing work)

Do `workouts` first and slowly — it's the template every other service copies.

### B1. Scaffold
- [ ] Create `backend/services/` directory.
- [ ] Create `backend/config/env.js` — typed access to env vars, validated at startup (throws if a required var is missing). Move any `process.env.X` reads here.

### B2. Extract `workoutService.js` (the template)
- [ ] In `routes/workouts.js`, list every place it calls `getDb()` / runs a query inline. Write them down — that list is the service's surface.
- [ ] Create `services/workoutService.js`. Move each query into a named, exported function (e.g. `getPlanForUser(userId)`, `logWorkout(userId, payload)`). The service owns `getDb()`; the route no longer imports it.
- [ ] Rewrite the route handler to: parse input → call the service function → send the response. No SQL, no business logic left in the route.
- [ ] **Preserve the `String(reps)` quirk exactly** for now — normalizing it is a separate, deliberate step, not part of this move.
- [ ] Run the app. Hit every workouts endpoint (Xcode flows + curl/Postman). Responses must be **byte-identical** to baseline.
- [ ] Commit: `refactor: extract workoutService, thin workouts route`.

### B3. Repeat the pattern (now mechanical)
- [ ] `checkinService.js` ← `routes/checkins.js`
- [ ] `macroService.js` ← `routes/macros.js`
- [ ] `aiService.js` ← extract from `routes/ai.js` (chat-parse + weekly-report logic)
- [ ] Any remaining routes with inline DB calls (`users`, `profiles`, `measurements`).
- [ ] Commit after each one. Confirm the route file has **zero** `getDb()` imports when done.

### B4. Boundary validation
- [ ] Audit which routes actually run `validate.js`. (It exists in v1 but isn't applied everywhere.)
- [ ] Apply validation middleware to **every mutating route** (POST/PUT/PATCH/DELETE). This is what protects the Phase 2 HealthKit/cardio paths from malformed payloads.
- [ ] Commit: `fix: enforce validation on all mutating routes`.

### Backend gate
- [ ] Routes are thin (parse → service → respond). Services own all business logic + all DB access. `validate` on every write. `env.js` is the only place env vars are read.

---

## Track C — iOS structural hardening (parallel, low risk)

### C1. Externalize the base URL
- [ ] Create `App/Config.swift` with an env-driven `baseURL` (e.g. `.dev` → `http://localhost:3000`, `.staging`, `.prod`).
- [ ] Replace the hardcoded `kBaseURL` in `APIClient.swift` with `Config.baseURL`.
- [ ] Build + run, confirm it still hits localhost. Commit.

### C2. Split the Models monolith
- [ ] Create `Networking/Models/` and split `Models.swift` by domain: `AuthModels`, `WorkoutModels`, `CheckinModels`, `MeasurementModels`. (CardioModels/StoreModels come later with their phases.)
- [ ] Pure file move — no struct changes. Build, confirm compiles, commit.

### C3. Shared state components
- [ ] Create `Shared/Components/` with `LoadingView`, `EmptyStateView`, `ErrorStateView`.
- [ ] Retrofit **one** existing card to use them as the reference (e.g. the workout plan list's blank/loading state). Leave the rest for when each feature is touched in later phases.
- [ ] Commit.

### iOS gate
- [ ] No hardcoded base URL anywhere. Models split by domain. A shared loading/empty/error pattern exists and is used in at least one place.

---

## Phase 0 Definition of Done

- [ ] App behaves identically to v1 baseline (you changed structure, not features).
- [ ] Backend: thin routes, service layer owns logic + DB, validation on all writes, env externalized.
- [ ] iOS: Config.swift, models split, shared state components.
- [ ] All work on the `v2-phase0` branch, committed step-by-step.
- [ ] Merge to main → **only now** start Phase 1 (Movements) on top of `movementService`.

---

### What is intentionally NOT in Phase 0
- Normalizing `String(reps)` → number (do it as its own focused change with the migration).
- ViewModels for each tab (introduce per-feature as you build, starting with Today in Phase 2).
- Anything in the movements / cardio / monetization feature set.
