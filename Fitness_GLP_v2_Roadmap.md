# Fitness GLP — v2 Roadmap

*Planning doc. No code this session. Successor to v1 (complete 2026-06-02).*

## Decisions locked this session
- **Name:** Fitness GLP (rebrand from "Fitness AP")
- **Activity data source:** iPhone-first, Apple Watch offered as an option during setup, manual logging as fallback
- **Step goals:** adaptive (based on the user's own trend)
- **Monetization:** 1-week free trial → subscription (StoreKit 2), with buy reminders at day 1, 3, 5, and last day. Price and terms still open.
- **Build order:** Movements first → Cardio/steps → Monetization
- **Substitution rules:** authored *after* the base movement list is locked
- **Design/UI:** in scope; mock key screens next session

---

## Pillar 1 — Movement library (build first)

The goal is to go from a handful of movements to a comprehensive, leveled library that the workout engine can draw from. This is the collaborative piece: I supply the structured taxonomy and a candidate list, you vet it against your knowledge base, and we promote the keepers into the engine functions.

### Proposed taxonomy
Each movement carries: `id`, `name`, `aliases[]` (for AI parse matching), `category`, `primary_muscles[]`, `secondary_muscles[]`, `equipment`, `level`, `is_compound`, `unilateral`, `tempo_default`, and `glp_flag` (whether it's appropriate to push hard given GLP-1 energy/muscle-loss context).

- **Categories:** Push, Pull, Squat/Hinge (lower), Core/Anti-rotation, Carry/Loaded, Mobility/Prehab, Conditioning (overlaps with Pillar 2)
- **Levels:** Beginner / Intermediate / Advanced — so plans scale with the user, and so deload logic can swap a movement down a level instead of just cutting volume
- **Equipment buckets:** Bodyweight, Dumbbell, Barbell, Machine/Cable, Bands, Kettlebell — lets us generate plans for home vs gym

### Why leveling matters for GLP-1
Users on GLP-1 drugs lose muscle alongside fat and often have lower energy. The library should let the engine (a) bias toward compound, muscle-sparing movements, (b) substitute a lower-level variant on low-energy check-in days rather than skipping, and (c) flag movements that are hard to do safely when fatigued.

### Engine integration (where these plug in)
- `backend/engine/workout.js` — movement selection + the existing `String(reps)` quirk to preserve
- New: a movements data table/JSON the engine reads from, so adding a movement is data, not code
- AI parse path (`WorkoutParser.swift` on-device → `/ai/chat-parse` fallback) needs the `aliases[]` so spoken/typed names map to the right movement id

### Our working process for the list
1. I generate a full candidate list organized by category × level × equipment
2. You strike/keep/rename based on what you actually want to coach
3. We lock the schema, then load the kept movements into the data table
4. Spot-check the AI parser resolves the new aliases correctly

### Substitution rules (after base list is locked)
Subs pull from the same movement pool, so they're authored once the library exists. Each movement gets an ordered fallback chain keyed on equipment availability and level — e.g. **back squat → leg press (machine) → goblet squat (dumbbell)**. The engine walks the chain until it finds a movement whose equipment the user has and whose level fits the day.

---

## Pillar 2 — Cardio & steps (build second)

Not every day is weights. We want a read on how active the user is overall, and to combine that with their measurements to estimate activity level / energy expenditure trend.

### Data model: iPhone-first, Watch optional, manual fallback
- **iPhone (primary):** read steps, walking/running distance, and active energy from the phone's motion data via HealthKit — no Apple Watch assumed.
- **Apple Watch (optional):** offered as a setup choice; when present it improves accuracy and adds heart-rate/workout data. Not required.
- **Manual (fallback):** reuse the existing AI chat flow so a user can say "30 min stationary bike, moderate" and have it parsed into a cardio session when HealthKit has no data (e.g. a non-tracked bike).
- **Setup flow:** onboarding asks whether they use an Apple Watch, then requests HealthKit permission accordingly; manual entry always available.
- **Dedup concern:** if HealthKit already captured a workout and the user also logs it manually, we need a reconciliation rule to avoid double-counting. Worth designing up front.

### Adaptive step goals
No fixed target. The goal adjusts to the user's own rolling trend — nudging slightly above their recent baseline rather than imposing a generic 10k. Combine logged movement (steps, cardio minutes, lifting volume) with the body measurements already tracked in the Progress tab to surface a simple activity/energy signal. Keep it directional, not clinical — frame it as a trend ("more active than last week"), and avoid anything that reads as medical advice given the GLP-1 context.

### UI surfaces
- Today tab: a steps/cardio ring or bar alongside the existing macro + check-in cards
- Progress tab: steps and active-energy sparklines next to the existing weight/measurement charts

---

## Pillar 3 — Monetization (build last)

### Model: 1-week free trial → subscription (StoreKit 2)
- **Trial:** 7-day full access. Introductory offer configured in App Store Connect.
- **Buy reminders during trial:** prompts at **day 1, day 3, day 5, and the last day**. Implemented as in-app prompts (and optionally local notifications), each timed to land on a moment of value rather than interrupting. Cadence is open to change.
- **Then:** auto-renewing subscription (monthly + annual; annual anchored as the better value). Price TBD.
- **Tech:** StoreKit 2 (`Product`, `Transaction`, `Transaction.currentEntitlements`), with on-device entitlement checks plus backend transaction verification so paid features can't be unlocked by a tampered client. The existing backend JWT + `requireUser` flow gives us a place to attach subscription status to the user.

### What's free vs gated (proposal — needs your call)
- **Free:** manual workout logging, basic Today view, daily check-in
- **Paid:** AI-generated workout plans, AI parse beyond a monthly quota, advanced analytics (activity signal, full history, trend reports), HealthKit-driven insights

### Paywall placement
Trigger at the moment of clearest value — e.g. when the user requests their first AI plan or opens advanced analytics — not on launch. Soft paywall during trial.

> **Open questions:** (1) Free/paid feature split. (2) Is AI plan generation the headline paid feature, or do we keep something free-tier sticky for non-payers? (3) Price points for monthly/annual.

---

## Cross-cutting — Design / UI refresh

You asked me to lean on design help to make the app more attractive. **Mocking key screens is the first task next session.** Planned set:
- Today (with the new steps/cardio surface)
- Progress (with steps + active-energy sparklines)
- Paywall / trial offer
- Onboarding (now covering Watch question + HealthKit permission + trial)

Supporting work alongside the mocks:
- A coherent visual identity for the "Fitness GLP" rebrand — palette, type scale, iconography, app icon
- Component pass on existing cards (CheckInCard, MacroCard, plan list) for consistency and hierarchy
- Empty/loading/error states, which tend to be thin in v1

---

## Additional features (approved 2026-06-02) — placed by phase

These five were approved and slotted into the existing phases rather than treated as a separate track:

1. **Muscle-retention framing → Phase 1 (Movements).** Mostly an engine selection bias — favor compound, muscle-sparing movements — so it rides along while we're already building the library and `glp_flag` logic. The protein-nudge half ties to macros, which already exist, so no new infra. *A real differentiator for this audience; ties macros + movements + measurements together.*
2. **Rest-day / recovery awareness → Phase 2 (Cardio/steps).** Once activity data + the existing check-in sliders are in place, an explicit "today is a rest day" state is a natural read on top of that signal, and gives the Today tab something intentional on non-weight days (vs an empty list).
3. **Weekly report upgrade → end of Phase 2, gated in Phase 3.** `/ai/weekly-report` already exists; once steps/cardio/activity signal are flowing we fold them into the recap (build after the data exists to avoid reworking twice). Doubles as a candidate paid feature, so its free/paid gating decision belongs in Phase 3.
4. **Data export → Phase 3 (Monetization).** Cheap to build, builds trust, and reduces "what happens to my data if I cancel" anxiety right where the subscription conversation happens.
5. **Dose-aware context → cross-cutting polish, after Phase 1 engine works.** `glp_current_dose_mg` is already stored; early in a dose escalation, energy/appetite dip, so the plan could gently adapt. The most sensitive item — must stay directional, never medical — so it's a deliberate later pass layered onto plan generation, not baked into the first build.

---

## Suggested sequencing
1. **Phase 1 — Movements:** lock taxonomy → build candidate list → you vet → load into engine → verify AI parse → muscle-retention selection bias + protein nudges. *Then* author substitution chains. *Later polish pass:* dose-aware plan adaptation. (Design identity work starts in parallel.)
2. **Phase 2 — Cardio/steps:** Watch question + HealthKit permission in onboarding → iPhone motion data → manual fallback via chat → dedup rule → adaptive step goal + activity signal → rest-day/recovery state → Today/Progress surfaces → weekly report upgrade (folds in steps/cardio/activity).
3. **Phase 3 — Monetization:** decide free/paid split (incl. weekly report + advanced analytics gating) + price → StoreKit 2 + backend verification → 7-day trial with day 1/3/5/last reminders → paywall placement → data export → trial offer in App Store Connect.

## Open decisions still to resolve
- Free/paid feature split + price points (Pillar 3)
- Trial reminder cadence (day 1/3/5/last) — confirm or adjust
- Dedup rule specifics for HealthKit vs manual cardio (Pillar 2)

## Next session
- Mock the key screens (Today, Progress, paywall, onboarding) as a reference set
- Kick off the movement candidate list for your review
