# Next Session — Design Kickoff Prompt

*Paste the prompt below into a new session (use Opus). Connect the `Fitness GLP v2` folder first so the roadmap is available.*

---

## Prompt

We're starting the design phase of **Fitness GLP** (v2 of my GLP-1 fitness iOS app). The full plan is in `Fitness_GLP_v2_Roadmap.md` in this folder — read it first for context. v1 is complete; this session is **design only, no production code yet**.

I want you to mock the key screens as a visual reference set before we build anything. Produce them as clean, viewable mockups (SwiftUI-flavored or HTML/SVG previews — your call on what renders best), iOS 26 styling, dark and light where it matters.

Screens to mock:
1. **Today** — daily plan list + check-in card + macro card, plus the NEW steps/cardio surface (ring or bar). Needs a non-weight / rest-day state too.
2. **Progress** — existing weight + body-measurement charts and wellness sparklines, plus NEW steps + active-energy sparklines.
3. **Paywall / trial offer** — 1-week free trial → subscription framing. Soft, value-first, not a launch wall.
4. **Onboarding** — now also covers the Apple Watch question, HealthKit permission, and the trial.

Also propose a **visual identity for the "Fitness GLP" rebrand**: palette, type scale, iconography direction, and an app-icon concept. Muscle-retention / GLP-1 audience — should feel supportive and clinical-adjacent without being medical.

Work with me iteratively: show me a first pass, I'll react, we refine. Ask clarifying questions before you start if scope is unclear.

---

## Quick context for the model (also in the roadmap)
- **App:** GLP-1 fitness app. Backend Node/Express/SQLite; iOS SwiftUI, iOS 26, bundle `com.mickey.FitnessAP`.
- **Existing tabs:** Today, Workout (AI chat parse), Progress.
- **Build order for v2:** Movements → Cardio/steps → Monetization. Design runs parallel and starts now.
- **Audience nuance:** GLP-1 users lose muscle + have lower energy — design should make rest days, muscle retention, and gentle activity nudges feel intentional, never preachy or medical.

## My working style
- Short, direct answers. Walk me through multi-step terminal/Xcode steps one at a time.
- I test on device/simulator and report back with screenshots.
- Use Opus for this session (design quality matters).
