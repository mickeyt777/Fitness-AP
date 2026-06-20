# Phase 1 Start — Handoff

**Branch:** cut a new branch from `master` at the start of this session:
```
git checkout master && git checkout -b v2-phase1
```

**Status going in:** Phase 0 is COMPLETE and merged to `master`.

## What Phase 0 delivered (don't revisit)

**Backend (Track B):**
- All route files thinned — logic extracted into `backend/services/` (authService, workoutService, chatService, checkinService, macroService, measurementService, photoService, webhookService, and others)
- `backend/config/env.js` — centralised env access, fail-fast on missing secrets in prod
- Route validation added to all mutating routes

**iOS (Track C):**
- `App/Config.swift` — env-driven `Config.baseURL` replaces hard-coded `kBaseURL` (simplified to `#if DEBUG` / `#else` to work around an Xcode 27 beta Swift 6 type-checker crash on `#if DEBUG` inside closures)
- `Networking/Models/` — `Models.swift` monolith split into 10 per-domain files (pure move, no type changes)
- `Shared/Components/` — `LoadingStateView`, `EmptyStateView`, `ErrorStateView` added; `TodayView` retrofitted as the reference implementation

**Xcode / build notes:**
- Project uses Xcode 27 beta with Swift 6 (`-swift-version 6`) targeting macOS 27 SDK
- Must open `FitnessAP/FitnessAP.xcodeproj` directly — Xcode 27's new folder-open "FilesWorkspaces" mode only compiles one file at a time and breaks module resolution
- `ProgressScreenView.swift` has a benign yellow warning ("Variable 'body' was never mutated") — Xcode 27 beta false positive on `var body: some View`, ignore it
- `.DS_Store` and `UserInterfaceState.xcuserstate` kept getting in the way of git operations; use `git stash --include-untracked` before branch switches/merges

## Standing workflow constraints (do not break)

- Agent git use is **read-only** — `status`, `log`, `diff`, `show` only. Hand Mickey exact `add`/`commit`/`push` commands, one commit per logical unit. Scope `git add` to specific files (no wildcards that catch `*.xcuserstate`).
- Sandbox cannot compile Swift — static review + `grep` only. Mickey runs the real Xcode build.
- `node --check` works for JS syntax checks in the sandbox (no `node_modules`, so no boot/runtime).
- iOS source root: `FitnessAP/App/FitnessAP/`
- Backend root: `backend/`

---

## Phase 1 scope — Movements (Pillar 1)

See `Fitness_GLP_v2_Roadmap.md` for the full product context.

### Why movements first
The existing workout engine (`backend/engine/workout.js`) hard-codes a small exercise list inside `backend/engine/exercises.js`. Phase 1 replaces that with a proper leveled movement library stored in a data table, making adding/changing movements a data operation rather than a code change.

### Carry-over cleanups from Phase 0 (do these as early Phase 1 units)

1. **`String(reps)` quirk** — `backend/engine/workout.js` stores reps as a string (e.g. `"10–12"` or `"60 sec/side"`). This is intentional for display flexibility but the iOS `Exercise` model already declares `reps: String`. Don't "fix" this — but if there are any places where reps is accidentally coerced to Int and back, normalise them. May require a DB migration if the column type is wrong.

2. **N+1 in `progressWorkout`** — the progression function in `backend/engine/workout.js` likely issues one query per exercise when loading previous sets. Batch it.

### Phase 1 unit plan

**P1-A — Movement library schema + data table**
- Design the `movements` table schema: `id`, `name`, `aliases` (JSON array, for AI parse matching), `category`, `primary_muscles` (JSON array), `secondary_muscles` (JSON array), `equipment`, `level` (beginner/intermediate/advanced), `is_compound` (bool), `unilateral` (bool), `tempo_default`, `glp_flag` (bool — safe to push on GLP-1)
- Write the migration (`backend/migrations/`)
- Seed with an initial movement list (we'll expand collaboratively — see Roadmap Pillar 1 for the taxonomy: Push / Pull / Squat+Hinge / Core / Carry / Mobility / Conditioning × Beginner / Intermediate / Advanced × equipment buckets)

**P1-B — `movementService`**
- New service at `backend/services/movementService.js`
- Functions: `getMovementById`, `getMovementsByCategory`, `getMovementsByEquipment`, `searchByAlias` (for AI parse), `getSubstitutes` (for deload/equipment swap — substitution chains come later, stub this out)
- `backend/engine/exercises.js` and `workout.js` refactor to read from `movementService` instead of hard-coded arrays

**P1-C — Engine integration**
- `generateWorkoutPlan` reads from the movement library
- Substitution logic: when equipment doesn't match or it's a deload day, walk a fallback chain keyed on level and equipment
- `progressWorkout` N+1 fix (the carry-over cleanup)
- Preserve the `String(reps)` format throughout

**P1-D — iOS AI parse alias wiring**
- `WorkoutParser.swift` (on-device parser) and `/ai/chat-parse` backend route need to resolve movement aliases to canonical movement IDs
- New endpoint or extend existing: `GET /movements/search?q=<alias>` returns the matched movement
- Update `AIParseModels.swift` if the response shape changes

### Files to read before starting
- `backend/engine/workout.js` — the generator and progression engine
- `backend/engine/exercises.js` — the current hard-coded exercise list (what we're replacing)
- `backend/services/workoutService.js` — thin service wrapper added in Phase 0
- `FitnessAP/App/FitnessAP/Features/Workout/WorkoutParser.swift` — on-device AI parse
- `FitnessAP/App/FitnessAP/Networking/Models/AIParseModels.swift` and `WorkoutModels.swift`
- `Fitness_GLP_v2_Roadmap.md` — Pillar 1 product context

### Don't start Phase 2 (Cardio/Steps/HealthKit) or Phase 3 (Monetization/StoreKit) this session.
