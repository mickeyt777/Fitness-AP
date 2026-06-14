# Phase 0 — Track C (iOS hardening) — Handoff

**Branch:** `v2-phase0`
**Status going in:** Backend Phase 0 is COMPLETE and committed (Track B service extraction, `config/env.js`, B4 route validation). Track C is the last piece of Phase 0. After C lands → merge `v2-phase0` → `main`, **then** start Phase 1 (Movements).

## Standing workflow constraint (do not break)

Keep your own git use **read-only** — `status`, `log`, `diff`, `show` only. Do **not** run `add`/`commit`/`push`. After each logical unit, hand Mickey the exact commands to run on his Mac, one commit per logical unit. Scope `git add` to the specific files touched (exclude noise like `*.xcuserstate`). The mounted/synced folder leaves a stale `.git/index.lock` when the sandbox touches `.git`, so writes from the agent side fail anyway — Mickey runs `rm -f .git/index.lock` then commits himself.

## Xcode project note

The project uses **synchronized folders** (Xcode 26.5). Dropping a new `.swift` file into the folder on disk auto-adds it to the target — no `.pbxproj` edits, no manual "Add Files" step. Creating files with the Write tool is sufficient; Mickey just rebuilds.

iOS source root:
`FitnessAP/App/FitnessAP/`

---

## Track C scope (3 units)

C1 — `Config.swift` (env-driven base URL)
C2 — split `Models.swift` monolith by domain
C3 — shared `Loading / Empty / Error` state views + retrofit one card as reference

These are independent; do them as **three separate commits** in this order (C1 and C2 are pure plumbing; C3 introduces reusable UI).

---

## C1 — `Config.swift`

**Goal:** stop hard-coding the backend URL inside `APIClient.swift`. Centralize it so dev/prod differ by build config, not by editing a `private let`.

**Today:** `APIClient.swift` line 12 has `private let kBaseURL = "http://localhost:3000"`, used at line 66 (`URL(string: kBaseURL + path)`) and referenced in the `.badURL` error string at line 25.

**New file:** `FitnessAP/App/FitnessAP/App/Config.swift`

```swift
// Config.swift
// Single source of truth for environment-dependent settings.
// baseURL resolves from (in priority order):
//   1. Info.plist "API_BASE_URL" (set per-build-config via an .xcconfig) — preferred for release
//   2. DEBUG fallback to localhost for simulator/dev
//   3. Release fallback to the production host
//
// To point a build at a different backend, set API_BASE_URL in the build
// configuration's .xcconfig (or scheme env var) — no source edits needed.

import Foundation

enum Config {
    static let baseURL: String = {
        if let fromPlist = Bundle.main.object(forInfoDictionaryKey: "API_BASE_URL") as? String,
           !fromPlist.trimmingCharacters(in: .whitespaces).isEmpty {
            return fromPlist
        }
        #if DEBUG
        return "http://localhost:3000"
        #else
        return "https://api.fitnessap.com"   // TODO: confirm prod host before release
        #endif
    }()
}
```

**Edit `APIClient.swift`:**

- Delete lines 10–12 (the `// MARK: - Base URL` comment block + `private let kBaseURL = ...`).
- Line 66: `URL(string: kBaseURL + path)` → `URL(string: Config.baseURL + path)`.
- Line 25 error string: `"Invalid URL — check kBaseURL in APIClient.swift"` → `"Invalid URL — check Config.baseURL"`.

**Verify:** grep the whole iOS tree for `kBaseURL` → must return zero hits after the edit.

**Commit (hand to Mickey):**
```
rm -f .git/index.lock
git add "FitnessAP/App/FitnessAP/App/Config.swift" "FitnessAP/App/FitnessAP/Networking/APIClient.swift"
git commit -m "iOS C1: env-driven Config.baseURL, drop hard-coded kBaseURL"
```

---

## C2 — split `Models.swift` by domain

**Goal:** break the 265-line `Networking/Models.swift` monolith into per-domain files. This is a **pure move** — do NOT rename, restructure, or change any struct, field, type, or Codable conformance. Swift has no per-file namespacing; every type stays in the same module, so callers are unaffected. Each new file just needs `import Foundation` at the top.

**Current grouping in `Models.swift`** (MARK sections, all moving as-is):

| Domain | Types | New file |
|---|---|---|
| Health | `HealthResponse` | `Networking/Models/HealthModels.swift` |
| Auth | `AppleSignInResponse` | `Networking/Models/AuthModels.swift` |
| User | `UserModel` | `Networking/Models/UserModels.swift` |
| Profile | `Profile`, `UpsertProfileBody` | `Networking/Models/ProfileModels.swift` |
| Workout | `WorkoutPlan` (typealias), `WorkoutSession`, `Exercise` | `Networking/Models/WorkoutModels.swift` |
| Macros | `MacroResult`, `FoodItem` | `Networking/Models/MacroModels.swift` |
| Check-in | `CheckIn`, `DeloadDecision`, `CheckInResponse`, `SubmitCheckinBody` | `Networking/Models/CheckInModels.swift` |
| Chat | `ChatMessage`, `ChatResponse`, `ChatAction`, `SendChatBody` | `Networking/Models/ChatModels.swift` |
| AI parse | `ParsedWorkoutSet`, `ParsedWorkout`, `AiParseResponse` | `Networking/Models/AIParseModels.swift` |
| Measurements | `BodyMeasurement`, `LeanMassProxy`, `MeasurementResponse`, `LogMeasurementBody` | `Networking/Models/MeasurementModels.swift` |

**Procedure:**
1. Create the `Networking/Models/` subfolder (synchronized folder will pick it up).
2. For each domain, create the file with `import Foundation` + the exact struct text copied verbatim from the corresponding MARK block.
3. Delete the original `Networking/Models.swift` once every type has a new home.
4. **Verify nothing was lost:** the set of `struct`/`typealias`/`enum` names across the new files must exactly equal the set previously in `Models.swift`. Grep each type name across the tree to confirm exactly one definition each. Watch the two known naming quirks (don't "fix" them — they're load-bearing):
   - `BodyMeasurement` (NOT `Measurement` — avoids collision with Foundation's `Measurement<UnitType>`).
   - `glp_current_dose_mg` is `String?`; `unit_system` is `String?`.

**Note:** keep it a literal move. Resist tidying field order, adding `CodingKeys`, or merging bodies — any of that turns a safe move into a reviewable change and risks decode breakage. Field names stay snake_case so `JSONDecoder` works with no `keyDecodingStrategy` (see Models.swift header comment).

**Commit (hand to Mickey):**
```
rm -f .git/index.lock
git add "FitnessAP/App/FitnessAP/Networking/Models/" 
git add -u "FitnessAP/App/FitnessAP/Networking/Models.swift"
git commit -m "iOS C2: split Models.swift monolith into per-domain files (pure move)"
```
(`git add -u` stages the deletion of the old `Models.swift`.)

---

## C3 — shared state views + one retrofit

**Goal:** stop re-implementing loading/empty/error UI in every screen. Add three small reusable views, then retrofit **one** card (TodayView's plan list) as the reference implementation. The rest get migrated incrementally in later phases — C3 only does the one reference so the pattern is established without a giant diff.

**New folder:** `FitnessAP/App/FitnessAP/Shared/Components/`

**`LoadingStateView.swift`:**
```swift
import SwiftUI

/// Centered spinner with an optional label. Use while a screen's primary data loads.
struct LoadingStateView: View {
    var message: String = "Loading…"
    var body: some View {
        VStack(spacing: 12) {
            ProgressView()
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}
```

**`EmptyStateView.swift`:**
```swift
import SwiftUI

/// Friendly empty state. `systemImage` is an SF Symbol name.
struct EmptyStateView: View {
    var systemImage: String = "tray"
    var title: String
    var message: String? = nil

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.largeTitle)
                .foregroundStyle(.secondary)
            Text(title)
                .font(.headline)
            if let message {
                Text(message)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }
}
```

**`ErrorStateView.swift`:**
```swift
import SwiftUI

/// Error display with an optional retry button. Pass the user-facing message
/// (e.g. APIError.errorDescription) and a retry closure that re-runs the load.
struct ErrorStateView: View {
    var message: String
    var retry: (() -> Void)? = nil

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle")
                .font(.largeTitle)
                .foregroundStyle(.orange)
            Text("Something went wrong")
                .font(.headline)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            if let retry {
                Button("Try again", action: retry)
                    .buttonStyle(.borderedProminent)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }
}
```

**Retrofit reference — `Features/Today/TodayView.swift`:**
Today (lines ~10–22) the view holds `@State var sessions`, `isLoading`, `errorMessage`, and the body does:
```swift
if isLoading {
    ProgressView("Loading your plan…")
} else if let error = errorMessage {
    errorView(error)          // private helper at ~line 69
} else if sessions.isEmpty {
    // inline empty state
} else {
    // plan list
}
```
Replace with the shared views (keep whatever load function exists — name it `load()` below, match the real one):
```swift
if isLoading {
    LoadingStateView(message: "Loading your plan…")
} else if let error = errorMessage {
    ErrorStateView(message: error) { Task { await load() } }
} else if sessions.isEmpty {
    EmptyStateView(
        systemImage: "figure.strengthtraining.traditional",
        title: "No plan yet",
        message: "Your workout plan will appear here once it's generated."
    )
} else {
    // existing plan list — unchanged
}
```
Then delete the now-unused private `errorView(_:)` helper (~line 69) if nothing else references it (grep first). Leave the rest of TodayView alone — this is a reference migration, not a rewrite.

**Verify:** the three component types each grep to exactly one definition; TodayView still compiles conceptually (no dangling `errorView` call). Other screens (ProgressScreenView, NutritionView, CoachView, WorkoutView) are intentionally left unmigrated this phase.

**Commit (hand to Mickey):**
```
rm -f .git/index.lock
git add "FitnessAP/App/FitnessAP/Shared/Components/" "FitnessAP/App/FitnessAP/Features/Today/TodayView.swift"
git commit -m "iOS C3: shared Loading/Empty/Error state views + TodayView retrofit"
```

---

## After Track C

1. Full build in Xcode on Mickey's Mac (the sandbox can't compile Swift — only static review/grep is possible agent-side). Confirm the app builds and the Today tab still loads its plan, shows empty/error correctly.
2. Merge `v2-phase0` → `main` (Mickey runs the merge).
3. Start **Phase 1 (Movements)** — first unit is `movementService` reading a leveled movement library data table. Deferred Phase-1 cleanups carried over: normalize the `String(reps)` quirk (+ migration); fix the N+1 in `progressWorkout`.

## Quick reference — verification you CAN do agent-side
- `node --check` for any JS (sandbox has no `node_modules`, so no boot/curl).
- Swift: static review + `grep` only (no `swiftc`). Confirm symbol counts, zero stale references, exactly-one-definition per moved type.
- Real builds, boots, and smoke tests run on Mickey's Mac.
