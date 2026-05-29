# Fitness AP — iOS Front-End Plan

## Plain English. No code yet. Just the plan.

---

## What Xcode is, and what we'll be building in it

**Xcode** is Apple's free development tool for building iPhone and Mac apps. You download it from the Mac App Store. It's the only tool that can build a real iOS app — there's no alternative for apps that go on the App Store.

Inside Xcode, we'll write code in **Swift** — Apple's modern programming language for iOS development. Swift is designed to be readable, fast, and safe. It's what almost all new iOS apps are written in today.

The UI framework we'll use is **SwiftUI**. Apple introduced SwiftUI in 2019 as a modern replacement for the older UIKit system. Instead of writing instructions like "create a button, then set its colour, then set its position," SwiftUI lets you describe what the screen *should look like* and it figures out the how. It's faster to write, easier to read, and better suited to a solo developer building a new app.

---

## The big picture of what the iOS app needs to do

1. Let users sign in with their Apple ID
2. Walk new users through an onboarding questionnaire
3. Show a daily home screen with the workout plan, check-in, and macros
4. Let users log workouts set by set
5. Show a weekly progress report
6. Let users chat with an AI coach
7. Handle subscriptions via RevenueCat
8. Send and receive push notifications

Everything the app does either lives entirely on the phone (the visual layout, navigation, caching) or talks to the backend we've already built.

---

## How the phone and server talk

The iOS app will talk to the backend using **HTTP requests** — the same system a web browser uses to load a webpage. The app sends a request to a URL (e.g., `https://api.fitnessap.com/workouts/USER-ID/plan`) and the server replies with JSON data that the app turns into something visible on screen.

Swift has built-in tools for making these network requests. We'll write a small "API layer" — a set of Swift functions that handle the talking-to-the-server work so the rest of the app doesn't have to think about it. The rest of the app just calls `getWorkoutPlan()` and gets back a workout object, without caring about HTTP or JSON.

---

## Authentication — Sign in with Apple

The first time someone opens the app, they'll see a "Sign in with Apple" button. This is Apple's own login system, similar to "Sign in with Google" but built into every iPhone.

When the user signs in, Apple gives the app a **token** — a short piece of text that proves who the user is. Our app sends this token to the backend with every request (in the `Authorization` header), and the backend verifies it's genuine by checking with Apple's servers.

**Why Sign in with Apple and not email + password?**
- Apple requires it for apps that offer third-party login options
- Users don't need to remember another password
- Apple handles two-factor authentication automatically
- Apple offers users the option to hide their real email address

For our app, Sign in with Apple is the only login method — simple, secure, no password management to build.

---

## The tab bar — the app's main navigation

Once logged in, the app will have a **tab bar** at the bottom of the screen — the row of icons most iPhone apps have. We'll have five tabs:

1. **Today** — the main daily screen
2. **Workout** — active session logging
3. **Nutrition** — macros and food coaching
4. **Progress** — measurements, photos, weekly report
5. **Coach** — the AI chat interface

Each tab is its own section of the app with its own navigation. This is the standard iPhone app pattern that users already know — no learning curve.

---

## Screen by screen — what each one does

### Onboarding (shown once, on first launch)

A series of simple screens that collect the information the backend needs to personalise the experience. Each screen asks one question:

1. **Welcome** — brief explanation of what the app does, "Get started" button
2. **Which GLP-1 medication are you on?** — a simple list: Ozempic, Wegovy, Mounjaro, Zepbound, Saxenda, Retatrutide, Other
3. **What dose are you on?** — a number picker
4. **When is your injection day?** — a day-of-week picker (so the app avoids scheduling hard workouts that day)
5. **How long have you been on the medication?** — a simple slider or number picker
6. **How experienced are you with strength training?** — Beginner / Some experience / Experienced
7. **How many days per week can you train?** — 2 / 3 / 4
8. **What equipment do you have access to?** — checkboxes: Dumbbells, Barbells, Cables/Machines, Just bodyweight
9. **Your stats** — height, weight, age, sex (used for the macro calculator and body fat estimate)
10. **Neck and waist measurements** — used for the Navy body fat formula
11. **Confirmation screen** — "Here's what we've set up for you" summary, "Let's go" button

The app sends all of this to `PUT /profiles/:userId` on the backend when the user hits "Let's go."

After onboarding, the user is taken to the Today screen and never sees onboarding again.

---

### Today screen (Tab 1)

This is the screen the user opens the app to every day. It has three sections:

**Morning check-in card** — if the user hasn't checked in yet today, this card is at the top and prompts them to take 30 seconds to rate how they're feeling. Five sliders: nausea, energy, GI symptoms, mood, sleep quality. When submitted, the backend runs the auto-deload check and tells the app whether today's session needs to be modified.

**Today's workout card** — shows the session type (e.g., "Full Body B") and lists the exercises. Has a prominent "Start Workout" button. If the backend decided to deload based on the check-in, this card shows the lighter version with a gentle explanation ("We've scaled back today — your body is adjusting to your new dose. This is by design.").

**Macros summary card** — shows today's protein, fat, carb, and calorie targets in a clean visual. Has a small "See food ideas" link that opens the protein leaderboard — the ranked list of best protein-per-calorie foods.

If the user has already checked in and done a workout today, the screen shifts to a "You're done for today" state with a summary.

---

### Workout screen (Tab 2)

This screen has two states:

**Before starting:** Shows the week's workout plan as a schedule — which sessions on which days. Tapping a session shows its exercise list with the coaching notes for each one.

**During a workout (active session):** The user has tapped "Start Workout" from the Today screen. This view guides them through the session set by set:

- Big display showing the current exercise, sets, reps, and target RPE
- A timer that starts automatically during rest periods
- Input for logging actual weight used and RPE after each set
- A "Next set" button, and when all sets are done, "Next exercise"
- When the last set of the last exercise is logged, a "Finish workout" button

When the user taps "Finish workout," the app sends all the logged sets to the backend (`PUT /workouts/:userId/:workoutId/complete`), which runs the progression engine and sends back weight recommendations for next time.

**After finishing:** A summary screen showing what was completed, with the progression advice — "Next time try 22.5 kg on goblet squat" — displayed clearly.

---

### Nutrition screen (Tab 3)

**Top section — today's targets:** The macro numbers in a clean visual — probably a horizontal bar or ring chart showing protein, fat, and carbs as proportions of the calorie target.

**Middle section — food coaching:** The protein leaderboard — a ranked list of foods with their protein-per-100-calories value. Tapping any food shows a coaching tip. This is powered by `GET /macros/:userId/leaderboard`.

**Bottom section — context note:** A plain-English explanation of why the macros are set the way they are. Something like: "You're 3 months into treatment. Protein is set high (1.6g/lb) because lean mass risk is greatest in the first 6 months." This comes from the `notes` array the backend returns.

---

### Progress screen (Tab 4)

This screen tracks the physical changes the drug and training are producing. Three sub-sections:

**Measurements tab:** A form for logging weekly measurements (weight, waist, hips, left/right arm/thigh). The app pre-fills last week's values so the user can see what changed. On submission, the backend returns a lean-mass proxy verdict — a simple label and explanation: "Lean mass appears stable — waist is narrowing while limb measurements are holding. Good sign."

**Photos tab:** A grid of the user's progress photos. A camera button in the corner lets them take or choose a new photo. Photos are uploaded to the backend, which stores them in Backblaze B2. The app displays them using the presigned URLs the backend returns.

**Weekly report tab:** A visual summary of the past week — workouts completed vs planned, average RPE, strength changes on key lifts, weight trend over 4 weeks. This is generated from `GET /reports/:userId/weekly`. There's a "Generate summary" button that calls the AI endpoint and displays the LLM-written narrative paragraph underneath the data.

---

### Coach screen (Tab 5)

A chat interface, similar to iMessage or WhatsApp. The user types a message, the app sends it to the backend, and the AI coach responds.

Examples of what users might type:
- "I wasn't able to eat enough protein today, what should I do?"
- "My knees hurt after squats — what should I try instead?"
- "I'm feeling really nauseous today, should I still work out?"
- "I just increased my dose — what should I expect this week?"

The interface itself is a scrolling list of messages, alternating between user (right-aligned, blue) and coach (left-aligned, grey). At the bottom, a text input field with a send button.

**How the AI works:** The app sends messages to `POST /chat`, which stores them and tries to parse intent. For complex messages, the backend calls the cloud LLM. Responses come back as JSON and the app displays the `reply` field as the coach's message.

**On-device option (Foundation Models):** Apple's iOS 18+ includes on-device AI models via the Foundation Models framework. For simple, common queries — things the on-device model can handle confidently — we can get an instant response without any server call. The app will try Foundation Models first, and only call the backend (which calls the cloud LLM) if the on-device confidence is low. This makes common interactions feel instant and keeps cloud LLM costs down.

---

## Data that lives on the phone vs the server

Not everything needs to go back and forth to the server constantly. We'll cache some data locally:

**Cached on the phone (refreshed when needed):**
- This week's workout plan (fetched once at the start of the week, cached until Sunday)
- Today's macro targets (fetched once per day)
- The protein leaderboard (almost never changes — can be cached for a week)
- The user's profile settings

**Always fetched live from the server:**
- Progress data and measurements (needs to be accurate)
- Chat messages (needs to be in sync)
- Weekly report (generated on demand)

SwiftUI has good tools for this. We'll use a simple in-memory cache for the session and write a few things to **UserDefaults** (the iPhone's built-in small-data storage) for things that should survive the app being closed.

We will NOT use a complex local database like Core Data. The backend is the source of truth. The phone is just a display layer with a small cache. This keeps the architecture simple.

---

## Push notifications — how they work on iOS

The user's iPhone needs to explicitly give Fitness AP permission to send notifications. The first time the app opens, iOS will ask: "Allow Fitness AP to send notifications?" Most users will say yes.

When they do, iOS gives the app a **device token** — a unique identifier for that phone's notification channel. The app sends this token to our backend (`POST /devices`), where it's stored. When the backend worker wants to send a notification (e.g., the 8 AM check-in reminder), it uses this token to deliver it through Apple's APNs system.

On the phone side, we'll set up the app to handle these notifications — showing them in the notification centre, and optionally opening the right screen when tapped. A check-in reminder notification should open the check-in card. A weekly report notification should open the Progress screen.

---

## RevenueCat — subscriptions on iOS

Charging for an iOS app requires going through Apple's payment system (there's no way around this). RevenueCat sits on top of Apple's system and simplifies it enormously.

**In the iOS app:** We'll add the RevenueCat Swift SDK. It handles displaying the paywall (the subscription offer screen), processing the purchase through Apple, and telling our backend what happened via webhooks (which we've already built on the backend).

**The paywall screen** will appear when a user tries to access a feature that requires a subscription. It will show the subscription options (monthly and annual), Apple's standard price, and a "Start free trial" button if we offer one.

**RevenueCat also handles:** Restoring purchases when someone reinstalls the app, handling subscription renewals, and reporting on subscription analytics.

---

## What the Xcode project will look like

When we open Xcode and create the project, we'll organise the Swift files into folders mirroring the backend structure:

```
FitnessAP/
  App/
    FitnessAPApp.swift      ← entry point; starts the app
    AppState.swift          ← global state (is the user logged in? etc.)
  Networking/
    APIClient.swift         ← all the code that talks to the backend
    Models.swift            ← Swift structs that match the JSON the server returns
  Features/
    Onboarding/             ← the first-launch screens
    Today/                  ← the daily home screen
    Workout/                ← session logging
    Nutrition/              ← macros and food coaching
    Progress/               ← measurements, photos, weekly report
    Coach/                  ← AI chat
  Components/
    (reusable UI pieces)
```

Each "Feature" folder will have its own view file (what the screen looks like) and its own view model (the logic that drives that screen).

---

## The order we'll build things in Xcode

1. **Project setup** — create the Xcode project, install RevenueCat SDK, set up folder structure, configure Sign in with Apple capability in the developer account

2. **Networking layer** — write `APIClient.swift` first. This is the foundation everything else depends on. Once this is working, every other screen can actually fetch real data.

3. **Sign in with Apple + onboarding** — the entry point. Once authentication works and the profile is set up, the rest of the app becomes testable with real data.

4. **Today screen** — the most important screen. Get this working end-to-end first: check-in, workout card, macro summary, all talking to the live backend.

5. **Workout logging** — the active session flow. This is the most complex UI (timer, set logging, transitions) so we tackle it once the simpler screens are solid.

6. **Nutrition screen** — mostly display work. Macros and food leaderboard from the API.

7. **Progress screen** — measurements form, photo capture, weekly report display.

8. **Coach screen** — the chat interface + Foundation Models integration.

9. **Subscriptions** — RevenueCat paywall wired up, gating applied to the right features.

10. **Push notifications** — permission request, device token registration, notification handling.

11. **Polish** — animations, loading states, error handling, empty states, dark mode, accessibility.

12. **TestFlight** — Apple's beta testing platform. Before App Store submission, you distribute to a small group of testers through TestFlight. They use the real app and report issues.

13. **App Store submission** — screenshots, app description, review submission. Apple reviews every app before it goes live (usually 24–48 hours).

---

## Things that are harder than they look (forewarned)

**Xcode can be temperamental.** It has its own quirks and sometimes gives confusing errors. The key skill in Xcode is learning to read the error messages carefully — they're usually correct, just cryptic at first.

**The Apple Developer Program costs $99/year.** This is required to put an app on the App Store. It's also required to test on a real iPhone (Xcode's simulator works for most things, but some features — like camera, push notifications, and Sign in with Apple — need a real device).

**App Store review takes time.** Apple reviews every app update. Simple updates usually take 24–48 hours. Your first submission might take longer or get rejected with questions. Build this into your timeline.

**Swift is strict about errors.** Unlike some languages, Swift won't let you ship code that ignores potential errors. This feels annoying at first, but it prevents a whole category of bugs. Embrace it.

**Simulator vs real device.** The iOS Simulator on your Mac runs most things correctly, but always test on a real iPhone before releasing. Camera, GPS, ARKit, notifications, and some animations behave differently on real hardware.

---

## The goal when the Mac arrives

When your Mac arrives and Xcode is installed, the first session will be:

1. Create the Xcode project
2. Get the networking layer talking to the backend (running locally on your Mac)
3. Get Sign in with Apple creating a real user record in the database
4. See the generated workout plan appear on screen in the app

When those four things work, the app is real. Everything after that is building the interface on top of a working foundation.
