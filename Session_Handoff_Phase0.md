# Session Handoff — Fitness GLP v2, Phase 0 Setup

*Date: 2026-06-13 · Picks up after architecture review. Next session: paste the bottom prompt into a fresh Opus session with the `Fitness GLP v2` folder connected.*

---

## What happened this session

1. **Rebuilt the v2 architecture diagram** (`fitness_glp_v2_architecture_opus.html`). Fixed the key semantic error in the prior version: the engine is pure compute *called by* services and never touches the DB — all DB access lives in the service layer. Added the layering rule, the three named traps (god-object ViewModel, N+1 in engine, cardio double-count), the production patterns, phase toggles, and hover rationale.

2. **Consolidated to one working folder.** Connected the v1 `Fitness AP v1` folder and copied it into `Fitness GLP v2` with full git history (excluded `node_modules`, `.next`, `.DS_Store`, redundant nested `backend/.git`). You now work only out of `Fitness GLP v2`.

3. **Recovered a missing file.** v1's working copy was silently missing `UnitSystem.swift` (it lived only on un-merged side branch `d7ad495`) while the files using it were present — that's why the first build failed with 9 "Cannot find type 'UnitSystem'" errors. Restored from git:
   - `FitnessAP/App/FitnessAP/App/UnitSystem.swift`
   - `backend/migrations/011_unit_system.sql`

4. **Produced the Phase 0 plan + first refactor step** (see Deliverables).

---

## Current repo state

- **Folder:** `/Users/mickey/Documents/Fitness GLP v2`
- **Branch:** `v2-phase0`
- **Commits:** `e3b46e6` baseline → on top of `f5491e0` (v1_complete) → `ec9c030`
- **Bundle id:** left as `com.mickey.FitnessAP` on purpose (changing it = new App Store app). Rename project/display name only.
- **Project type:** Xcode 16 synchronized folders — dropping a `.swift` file on disk auto-adds it to the target, no pbxproj edits needed.

### ⚠️ Two manual steps still owed by you (host Terminal)
The sandbox can't write inside `.git` on this synced mount (leaves a stale `index.lock`). So the `UnitSystem` recovery is **on disk but not yet committed**. Run on your Mac:
```
cd "/Users/mickey/Documents/Fitness GLP v2"
rm -f .git/index.lock && git add -A && git commit -m "fix: restore UnitSystem.swift + migration 011 (lost from v1 working copy)"
```
Then **rebuild in Xcode** to confirm the 9 errors clear (they should — the file is back).

> Workflow note for next session: keep my git use read-only (status/diff/show); I'll hand you any commit/write commands to run on the host.

---

## Deliverables in the folder

| File | What it is |
|---|---|
| `fitness_glp_v2_architecture_opus.html` | Corrected, interactive v2 architecture diagram |
| `Phase0_Hardening_Checklist.md` | Full Phase 0 plan: repo setup → backend service layer → iOS structural fixes, with a Definition of Done |
| `Phase0_workoutService_extraction.md` | Copy-paste-ready first refactor: `lib/httpError.js`, `services/workoutService.js`, thinned `routes/workouts.js`, parity checklist |

---

## Where to start next session

1. Confirm the build is green and the `UnitSystem` recovery is committed (steps above).
2. **Apply Track B1** — the `workoutService` extraction from `Phase0_workoutService_extraction.md`. Verify byte-identical responses, then commit on host.
3. Repeat the pattern: `checkinService` (its `shouldAutoDeload` engine call moves into the service too) → `macroService` → `aiService` → remaining routes.
4. Then Track B4 (apply `validate` to every mutating route) and the iOS tracks (Config.swift, split Models, shared Loading/Empty/Error).
5. Phase 0 done → start Phase 1 (Movements) on `movementService`.

### Deferred on purpose (not Phase 0)
- Normalizing `String(reps)` → number (own change + migration).
- Fixing the N+1 in `progressWorkout` (Phase 1, when movements become a SQLite table).
- The design/mockup track — independent, can run in parallel (see `Next_Session_Design_Kickoff.md`).

---

## Paste-into-next-session prompt

> Continue Fitness GLP v2, Phase 0. Read `Session_Handoff_Phase0.md`, `Phase0_Hardening_Checklist.md`, and `Phase0_workoutService_extraction.md` in this folder first. I've connected the `Fitness GLP v2` folder. Confirm with me that the build is green and the UnitSystem recovery is committed, then let's apply the `workoutService` extraction and move through the service layer one route at a time. Keep your own git use read-only and hand me commit commands to run on my Mac.
