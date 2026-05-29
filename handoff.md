# Fitness AP — Session Handoff

## What's fully working
- Onboarding (3-step profile form)
- Today tab: workout plan, check-in sliders with deload detection, macro card
- Workout tab: speak or type → Foundation Models parses on-device → falls back to Claude Haiku if unavailable/low-confidence → confirm card → logs sets to DB

## Key files touched last session
- `backend/routes/ai.js` — strips markdown fences from Claude response, tightened system prompt for natural language
- `FitnessAP/.../WorkoutParser.swift` — new file, on-device/cloud hybrid logic
- `FitnessAP/.../WorkoutView.swift` — now calls `WorkoutParser.parse()` instead of API directly

## Full file map

### Backend
- `backend/server.js` — entry point
- `backend/routes/ai.js` — `/ai/chat-parse` and `/ai/weekly-report` using Claude Haiku
- `backend/routes/users.js` — POST /users accepts optional `id` field
- `backend/engine/workout.js` — reps sent as `String(reps)`, not integer
- `backend/.env` — `CLOUD_LLM_PROVIDER=anthropic`, `ANTHROPIC_API_KEY=...`, `NODE_ENV=development`

### iOS
- `FitnessAP/App/FitnessAP/FitnessAPApp.swift` — app entry, `.fullScreenCover` for onboarding
- `FitnessAP/App/FitnessAP/App/AppState.swift` — `userId`, `showingOnboarding`
- `FitnessAP/App/FitnessAP/ContentView.swift` — TabView with `.toolbarBackground(.visible, for: .tabBar)`
- `FitnessAP/App/FitnessAP/Networking/APIClient.swift` — all URLSession calls
- `FitnessAP/App/FitnessAP/Networking/Models.swift` — all Codable structs
- `FitnessAP/App/FitnessAP/Features/Today/TodayView.swift` — plan list, CheckInCard, MacroCard
- `FitnessAP/App/FitnessAP/Features/Today/CheckInCard.swift` — color-coded sliders, deload banner
- `FitnessAP/App/FitnessAP/Features/Today/MacroCard.swift` — macro tiles
- `FitnessAP/App/FitnessAP/Features/Onboarding/OnboardingView.swift` — 3-step onboarding
- `FitnessAP/App/FitnessAP/Features/Workout/WorkoutView.swift` — chat UI + speech recognition
- `FitnessAP/App/FitnessAP/Features/Workout/WorkoutParser.swift` — on-device first, cloud fallback (confidence threshold 0.70)

## Known gotchas
- `AVAudioSession` must be configured with `.record` + `setActive(true)` BEFORE accessing `inputNode.inputFormat(forBus: 0)` — otherwise crashes
- iOS 26 floating tab bar overlap: fix is `.toolbarBackground(.visible, for: .tabBar)` on the TabView in ContentView, not on individual views
- `reps` field from backend must be `String(reps)`, not integer
- `glp_current_dose_mg` is stored as TEXT in DB, must be `String?` in Swift
- Backend must be restarted (`node server.js`) after any route/env changes
- Always open a second terminal tab for curl tests — the server blocks the first one

## Next up
1. **Progress tab** — weight and measurement trend charts
2. **Sign in with Apple** — replace dev `X-User-Id` header with Apple JWT (deferred until closer to ship)

## Starting the backend
```bash
cd ~/Documents/Fitness\ AP\ v1/backend
node server.js
```
