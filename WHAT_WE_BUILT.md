# What We Built and How We Built It

## A guide for new programmers — or anyone who wants to understand the decisions behind Fitness AP's backend

---

## First, what even is a "backend"?

When you use an app on your phone, there are two parts working together:

- **The front end** is the part you see and touch — the screens, buttons, and animations. For Fitness AP, this is the iOS app written in Swift.
- **The backend** is an invisible computer somewhere on the internet that stores all the data and does the heavy calculation. Your phone sends it questions ("what's my workout today?") and it sends back answers.

Think of it like a restaurant. The front end is the dining room — it's what the customer experiences. The backend is the kitchen — the real work happens there, but the customer never sees it.

The backend we built is a program that runs 24/7 on a small rented Linux computer (called a VPS — more on that shortly). The iOS app talks to it over the internet.

---

## Why do we even need a backend? Can't the app do everything itself?

For a lot of things, yes — the iOS app could do the calculation locally. But there are good reasons to have a backend:

1. **Data lives in one place.** If the user gets a new iPhone, their workout history doesn't disappear. It's on the server.
2. **The server can do things the phone can't.** Sending push notifications at 8 AM requires something that's always on — a phone might be off or have no signal.
3. **Security.** Sensitive things (encryption keys, API credentials) should never be stored in an app that users can download and inspect.
4. **Multiple devices.** If someone has both an iPhone and an iPad, they share the same data.

---

## The technology choices

### Node.js — the language the backend is written in

Node.js is JavaScript — the same language that runs in web browsers — but able to run on a server. We chose it because:

- It's fast enough for our needs
- There are enormous numbers of ready-made libraries (called "packages") for it
- It handles the kind of work we're doing — lots of small requests, not heavy number-crunching — very efficiently

**What does it actually do?** Node.js runs our backend code as a process (a running program). When the iOS app sends a request, Node.js receives it, runs the appropriate code, and sends back a response.

---

### Express — the web framework

Writing a web server from scratch in Node.js would be tedious. Express is a library that handles the boring parts — receiving HTTP requests, routing them to the right code, sending responses. Think of it as the scaffolding the building is constructed on.

**What's HTTP?** It's the standard language that computers use to talk over the internet. When you visit a website, your browser sends an HTTP request, and the web server sends back an HTTP response. Our iOS app does the same thing.

**What's routing?** Our server can handle many different types of requests. Routing means saying: "when a request comes in asking for `/workouts`, run *this* code; when it comes in asking for `/macros`, run *that* code." Express makes this easy:

```javascript
app.use('/workouts', workoutsRouter);
app.use('/macros',   macrosRouter);
```

---

### SQLite — the database

A database is where data is stored permanently. When someone logs a workout, it needs to be saved somewhere so it's still there tomorrow. We chose SQLite because:

**What makes SQLite unusual:** Most databases run as their own separate server. SQLite is different — the entire database is a single file on disk (we called ours `fitnessap.db`). Our Node.js process reads and writes it directly.

**Why that's good for us:** Less complexity. We don't need to install, configure, and maintain a separate database server. Everything lives in one place. For an app with tens of thousands of users (not millions), SQLite is genuinely fast enough.

**Why not PostgreSQL or MySQL?** Those are powerful databases, but they're overkill for our scale. They require more infrastructure, more maintenance, and more expertise. SQLite is famously reliable — it's built into every iPhone and Android phone. We'd switch to PostgreSQL only if we grew to hundreds of thousands of active users — a good problem to have.

**WAL mode:** We enabled something called WAL (Write-Ahead Logging). This is a technical detail, but the short version is: it makes the database faster when multiple things are trying to read or write at the same time. It also makes the database more resilient if the server crashes mid-write.

---

### Migrations — keeping the database in sync with the code

Imagine you launch the app and users start storing data. Then two weeks later you add a new feature that needs a new column in the database. How do you add that column to a live database without losing everyone's data?

The answer is **migrations** — a series of numbered SQL files that each make one change to the database structure:

```
001_users.sql         ← creates the users table
002_profiles.sql      ← creates the profiles table  
003_dose_history.sql  ← creates the dose history table
...
010_photos.sql        ← creates the photos table (added later)
```

Every time the server starts, it checks which migrations have already run (tracked in a `_migrations` table) and runs any new ones. This means:

- The first time you start the server, all 10 migrations run and the full database is created
- After that, only new migrations run
- You can add features safely by adding a new migration file

This is industry-standard practice. Every serious backend uses some version of this pattern.

---

### The REST API — how the phone and server talk

REST is a set of conventions for how web services communicate. Our backend is a "REST API" (Application Programming Interface). The iOS app sends HTTP requests to specific URLs (called "endpoints"), and the server responds with JSON.

**What's JSON?** It's a simple text format for sending structured data. It looks like this:
```json
{
  "protein_g": 241,
  "fat_g": 60,
  "carbs_g": 172,
  "calories_floor": 2193
}
```
The app can easily read this and display the numbers on screen.

**The HTTP methods** — there are different types of requests, each with a conventional meaning:
- `GET` — "give me some data" (e.g., get today's workout plan)
- `POST` — "here's some new data to store" (e.g., log a check-in)
- `PUT` — "update this existing thing" (e.g., update my profile)
- `DELETE` — "remove this" (e.g., delete a photo)

Our entire API table in SETUP.md maps out what each endpoint does. The iOS app calls these from Swift.

---

## The GLP-specific engine — the smart part

This is what makes Fitness AP different from a generic workout app. GLP-1 drugs (Ozempic, Wegovy, Mounjaro, etc.) fundamentally change how the body responds to training. We encoded those rules into code.

### The workout engine (`engine/workout.js`)

**What it does:** Given a user's profile, it generates a personalised weekly workout plan.

**Key concepts:**

**RPE (Rate of Perceived Exertion)** is a scale from 1–10 of how hard an exercise felt. 1 is effortless, 10 is absolute maximum effort. For GLP users, we hard-cap training at RPE 7–8. This is deliberate — GLP drugs reduce recovery capacity, so pushing to failure (RPE 10) creates more harm than good. The engine enforces this ceiling on every exercise prescription.

**Titration window** — when a user increases their GLP-1 dose, the first two weeks are rough. Nausea, fatigue, and GI symptoms are common. The engine detects this (by checking when the last dose change was) and automatically scales back volume and intensity for 14 days. This isn't a user-facing option they have to turn on — it just happens.

**Auto-deload** — every morning the user does a quick check-in (nausea, energy, GI symptoms on a 1–10 scale). The engine reads these numbers and, if they cross certain thresholds, swaps that day's session for a lighter "deload" version. Code doesn't judge — it just applies the rules consistently.

**Progression engine** — after completing a session, the app logs how hard each exercise felt. The progression engine looks at this session and the previous one: if both were comfortably below the target RPE, it adds a small amount of weight next time. If the user struggled (missed reps, RPE went above 8.5), it reduces the weight by 10%. This is called **double progression** — it only increases weight when the current weight genuinely feels easy across multiple sessions, not just one good day.

**Exercise tiers** — every exercise is rated tier 1, 2, or 3. Tier 1 is the most beginner-friendly (goblet squat), tier 3 is the most demanding (barbell front squat). New users start at tier 1 and progress over months. This prevents beginners from jumping straight to complex barbell movements they're not ready for.

**Session variety** — the engine doesn't give the same exercises every session. It uses the week number and session variant (A/B/C) to rotate deterministically through the available options. "Deterministically" means the rotation is predictable and consistent — session A in week 1 always picks the same exercise — rather than randomly shuffling, which would sometimes repeat and sometimes skip.

---

### The macro calculator (`engine/macros.js`)

Standard macro calculators subtract 500 calories from someone's TDEE (total daily energy expenditure) to create a deficit. For GLP users, this is wrong — the drug is already suppressing appetite by 700–1,200 calories/day. The real problem isn't "eat less." It's "hit protein while barely able to eat at all."

Our calculator does three things differently:

**U.S. Navy body fat formula** — using waist, neck, and height measurements (which the app collects weekly), we estimate body fat percentage. This lets us calculate **lean body mass** (LBM) — the muscle, bone, and organ weight that doesn't include fat. Protein targets are based on LBM, not total weight, because fat doesn't need protein to maintain itself.

**Protein-first, phased over time** — protein target is 1.6g per pound of LBM in the first 6 months (when lean mass loss risk is highest during rapid weight loss), stepping down to 1.4g after 6 months, and 1.2g after a year. This isn't arbitrary — it reflects the research on muscle preservation during aggressive caloric restriction.

**Calorie floor, not target** — we calculate BMR (Basal Metabolic Rate — the calories you'd burn lying in bed all day) and set the calorie output as a minimum, not a goal. The drug is already creating the deficit. Our job is to make sure users don't fall below the minimum needed to sustain muscle and basic health.

---

## Security — why it matters and what we built

### Encryption at the column level

The database file lives on our server. If someone broke into the server and copied the database file, they'd have everyone's data. To defend against this, we encrypt the most sensitive columns — drug names, doses, and body measurements — before storing them.

We use **AES-256-GCM**, which is the same encryption standard used by banks and governments. Each piece of data is encrypted with a random "IV" (initialisation vector) before being stored, which means encrypting the same value twice produces different-looking output. This prevents attackers from detecting patterns (e.g., noticing that many users have the same encrypted value for their drug).

The encryption key lives only in the `.env` file — never in the code. If someone steals the database file without the key, the sensitive data is unreadable.

### Helmet — security headers

HTTP responses can include "headers" — extra metadata that browsers and apps read. Some headers tell the client how to handle security-sensitive scenarios. The `helmet` library automatically sets a bunch of these headers to sensible secure defaults. It's a best practice on every Express backend. We just include it and it works.

### Rate limiting

We limit how many requests a single IP address can make in a time window:
- Regular routes: 300 requests per 15 minutes
- AI routes: 20 requests per hour

This prevents abuse — someone trying to hammer the API, extract data, or run up our AI bill. The iOS app makes far fewer requests than these limits in normal use, so real users never notice.

### The requireUser middleware

**What's middleware?** In Express, middleware is code that runs before a route handler. Think of it as a security check at the door of a nightclub — you go through it before you're allowed in.

Every protected route (anything that touches user data) first passes through `requireUser`. It checks for a valid authentication token and looks up the user in the database. If the token is missing or invalid, the request is rejected with a 401 ("Unauthorized") response before any business logic runs.

In production, this validates a **Sign in with Apple JWT** — a cryptographically signed token that proves the user is who they say they are. In development, a simpler `X-User-Id` header is accepted so we can test without a real Apple account.

**What's a JWT?** JSON Web Token — a small piece of text that contains encoded information (like a user's ID) and is signed with a private key. Apple signs these tokens when a user logs in, and our backend verifies the signature using Apple's public keys. It's like a signed check — anyone can read it, but only the signer could have produced it.

### requireSubscription middleware

After `requireUser` confirms who someone is, `requireSubscription` checks whether they're a paying customer. It queries the `subscriptions` table (kept up to date by RevenueCat webhooks) and returns 402 ("Payment Required") if the subscription is expired or cancelled.

---

## The worker — background jobs

The server (`server.js`) handles incoming requests. The worker (`worker.js`) runs as a separate process and handles things that need to happen on a schedule, regardless of whether any request came in.

**node-cron** is the library we use for scheduling. It uses "cron expressions" — a compact notation for "run this at 8 AM every day" (`0 8 * * *`) or "run this every Sunday at 8 PM" (`0 20 * * 0`).

The worker has three jobs:
1. **Daily check-in reminder at 8 AM** — looks for users who haven't checked in yet and sends them a push notification
2. **Weekly report ready at 8 PM Sunday** — notifies users who completed workouts that week
3. **Titration window alert at 7 AM** — for users who changed their dose yesterday, sends a heads-up that training is being scaled back

Push notifications go via **APNs** (Apple Push Notification service) — Apple's system for delivering notifications to iPhones. We've written the code and left clear instructions for wiring it in — it requires credentials from your Apple Developer account that we don't have yet.

---

## RevenueCat — subscription management

Handling App Store subscriptions yourself is painful. Apple sends cryptic receipts, there are renewal edge cases, refunds, billing failures, family sharing — it's a lot. RevenueCat is a service that handles all of this and sends us simple webhook events.

A **webhook** is a push notification for servers — instead of our server constantly asking RevenueCat "has anything changed?", RevenueCat calls us when something happens. Our webhook handler at `POST /webhooks/revenuecat` receives these events and updates the `subscriptions` table accordingly.

We verify that webhook requests actually came from RevenueCat (not someone pretending to be RevenueCat) by checking a shared secret — both sides know a password, and requests without it are rejected.

---

## Photos — Backblaze B2 object storage

User progress photos should not be stored in SQLite. The database is for structured data (numbers, text). Images are large binary files — a typical photo is 3–8 MB. Storing thousands of them in SQLite would make the database enormous and slow.

Instead, photos go to **Backblaze B2** — a cloud object storage service (similar to Amazon S3 but much cheaper). Think of it as a hard drive in the cloud accessible via the internet. Our server receives the photo from the iOS app, uploads it to B2, and stores only a small "object key" (essentially a file path) in SQLite. To show the user their photo later, we generate a **presigned URL** — a temporary link that proves the bearer is allowed to access that specific file, valid for one hour.

---

## Litestream — automatic backups

SQLite is a file. If the VPS hard drive fails, the file is gone. Litestream is a tool that continuously copies every database change to a Backblaze bucket in real time. It's not a once-a-day backup — it's continuous replication. If the server fails, the most data we'd lose is a few seconds. Restoring from backup is a single command.

---

## The folder structure — and why it's organised this way

```
backend/
  server.js     ← the front door; wires everything together
  worker.js     ← the background process; scheduled jobs
  db/           ← database setup and encryption
  engine/       ← the smart GLP-specific logic
  middleware/   ← gatekeepers that run before route handlers
  migrations/   ← numbered SQL files; database version history
  routes/       ← one file per area of the API
```

This is a **separation of concerns** — each file has one job. The macro calculator doesn't know about authentication. The authentication middleware doesn't know about workouts. When something goes wrong or needs changing, you know exactly which file to look in.

The `engine/` folder is especially intentional. The GLP logic (workout generation, macro calculation, progression rules) is pure business logic — it doesn't depend on the database or the HTTP layer. This makes it easy to test in isolation (which is exactly what we did in the logic tests) and easy to change without touching the API layer.

---

## What "25 files, 0 failures" actually means

At the end of each session we run every JavaScript file through `node --check` — a built-in tool that reads the file and reports any syntax errors without running the code. Zero failures means every file is valid, parseable JavaScript. It doesn't catch logic bugs (that's what the logic tests are for), but it guarantees nothing will crash on startup due to a typo or missing bracket.

The logic tests go further: they actually run the engine functions with known inputs and verify the outputs are correct. 57 tests across the macro calculator, workout engine, exercise rotation, validation middleware, and encryption — all passing.

---

## What's not done yet (and why)

**The iOS app** — we deliberately built the backend first because the backend is the foundation. The iOS app is the user interface on top of a working system. Knowing exactly what data the API returns makes building the screens much easier.

**Real APNs credentials** — these require an Apple Developer account and a Mac to generate. Stubbed for now; full instructions are in SETUP.md.

**Real LLM integration** — the AI narrative features (weekly report summary, chat parsing) are stubbed with clear wiring instructions. The engine and routes are in place; we just need an API key and a provider choice.

**JWT library install** — `jsonwebtoken` and `jwks-rsa` are in `package.json` and will install automatically with `npm install`. They're lazy-loaded, so the server runs fine without them — it just falls back to the dev header until a real Apple account is wired up.

---

## The one pattern to remember

Every piece of this backend follows the same pattern:

1. **Request comes in** from the iOS app
2. **Middleware runs** — is the user authenticated? Do they have a subscription? Is the input valid?
3. **Business logic runs** — generate the workout, calculate macros, run progression
4. **Database is read or written**
5. **Response goes back** to the iOS app as JSON

Understanding that pipeline makes every file in the project immediately legible.
