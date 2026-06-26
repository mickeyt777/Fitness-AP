# Pre-Launch Plan — Hosting + TestFlight (Fitness GLP v2)

*Planning doc. No code this session. Date: 2026-06-25. Branch: `v2-phase1`.*

**Goal:** get the app into real people's hands on a hosted backend, gather bugs +
feedback, and *defer monetization* until that feedback is in.

## Decisions locked
- **Host:** Railway (managed PaaS, git-push deploys).
- **Database:** keep SQLite (better-sqlite3) for the beta; revisit before scale.
- **Auth:** Sign in with Apple (already built end-to-end).
- **Testers:** TestFlight **internal first** (up to 100, no Beta App Review) → external soon.
- **Backend URL:** Railway's free `*.up.railway.app` subdomain (no custom domain yet).
- **AI:** ON for testers (set the Anthropic key; existing 20-calls/hr limit caps cost).
- **Push notifications:** **IN v1 (decided).** Partner will PR the finished implementation, so the
  build work in Track 2 is committed, not optional.
- **Rebrand:** **DONE this session** — all iOS user-facing "Fitness AP" strings are now
  "Fitness GLP" (sign-in + dev titles, home-screen display name, HealthKit permission text).
  Backend brand mentions are comment headers only (cosmetic, not shipped to users).
- **Apple Developer:** enrolled; **bundle ID not yet finalized.** Recommendation:
  `com.mickey.fitnessglp` (see Track 3.1). Permanent once the App ID is created — confirm before use.
- **Privacy policy host:** serve a static `/privacy` page from the Railway backend (one platform,
  no extra service — see Track 4.3).
- **Out of scope this round:** monetization (StoreKit/RevenueCat), progress photos / Backblaze
  B2, custom domain, external TestFlight + Beta App Review. (See "Explicitly deferred.")

---

## Where we already are (do NOT rebuild)
The codebase is written to run in production — this is a deploy-and-configure effort, not a
build effort. Already done:
- **Sign in with Apple, both ends.** Backend `routes/auth.js` + `services/authService.js`
  verify Apple's identity token via JWKS and mint a 30-day session JWT. `middleware/requireUser`
  enforces `Authorization: Bearer <jwt>` in production and only allows the `X-User-Id` dev
  bypass when `NODE_ENV !== production`. iOS `Features/Auth/SignInView.swift` +
  `KeychainManager` + `AppState` complete the loop.
- **Boot-time secret validation.** `config/env.js` refuses to start in production unless
  `JWT_SECRET`, `ENCRYPTION_KEY`, `APPLE_BUNDLE_ID`, `REVENUECAT_WEBHOOK_SECRET` are set —
  a misconfigured deploy fails loudly instead of 500ing later.
- **Security middleware:** helmet + rate limiters (global 300/15min; AI 20/hr).
- **Encrypted health columns** (AES-256-GCM) gated on `ENCRYPTION_KEY`.
- **Migrations run automatically at boot** (`initDb()`), so a fresh prod DB self-builds.
- **iOS env switch** (`App/Config.swift`): DEBUG → localhost, RELEASE → prod URL placeholder.

---

## The gap list (what stands between us and testers)

### Track 1 — Deploy the backend to Railway
1. **Create the Railway project** from the GitHub repo, root set to `/backend`, start command
   `npm start`, Node 20+. (better-sqlite3 compiles natively at install — Railway handles this.)
2. **Attach a persistent volume** mounted at `/var/data`. Set `DB_PATH=/var/data/fitnessap.db`
   (matches the `.env.example` production hint). Without a volume, the DB is wiped on every
   redeploy.
3. ⚠ **Run server + worker in ONE service.** A Railway volume attaches to a single service, so
   the push worker can't be a second service sharing the same SQLite file. For the beta, launch
   both processes in one container (a small start script, or `concurrently` / a process manager
   running `node server.js` + `node worker.js`). Decision noted; trivial to split later if we
   move off SQLite. *(If we drop push for v1 — see Track 2 — the worker question disappears.)*
4. **Set environment variables** (Railway dashboard):
   - `NODE_ENV=production`
   - `JWT_SECRET` — generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
   - `ENCRYPTION_KEY` — **generate ONCE, store in a password manager, never change.** If lost or
     rotated, every encrypted health column becomes unreadable. Generate the same way as JWT_SECRET.
   - `APPLE_BUNDLE_ID` — the finalized bundle ID (Track 3, step 1).
   - `REVENUECAT_WEBHOOK_SECRET` — **placeholder value** (e.g. `unused-during-beta`). It's
     required at boot but monetization is off; pairing it with the next var keeps everything free.
   - `SKIP_SUBSCRIPTION_CHECK=true` — opens the (scaffolded) paywall so the free beta isn't gated.
     *Note:* the only routes currently behind `requireSubscription` are `/photos`, which are
     deferred/stubbed anyway, so this is low-risk. Flip to `false` when monetization ships.
   - `ANTHROPIC_API_KEY` + `CLOUD_LLM_PROVIDER=anthropic` — turns on real AI for testers.
   - `APNS_*` — only if push stays in v1 (Track 2).
   - Leave `B2_*` unset (photos deferred — uploads stay stubbed).
5. **Verify boot:** Railway logs show migrations applied + "listening on port"; hit
   `https://<sub>.up.railway.app/health` → `{"status":"ok"}`.
6. **Clean slate is expected:** prod DB starts empty; `test-user-001` data is local-only and
   does not (and should not) carry over.

### Track 2 — Finish push notifications (committed for v1 — partner PR)
Push is *scaffolded but not functional* on either end. This is the main build task before the
first internal build, and the piece your partner will pull-request:
- **Backend:** `sendPush()` in `worker.js` is a stub that returns `not_implemented` even with
  credentials. Need to `npm install @parse/node-apn` and replace the stub (the exact code is in
  the file's comment). Cron schedules (daily reminder, weekly-report ready, titration alert) and
  the `/devices` token routes already exist.
- **Railway/APNs key:** `APNS_KEY_PATH` expects a `.p8` file path. Don't commit the key — store
  its contents in a Railway env var and write it to disk at boot, then set the four `APNS_*` vars.
- **iOS:** there is currently **no push registration at all** — need the Push Notifications
  capability, a permission prompt, `registerForRemoteNotifications`, and a `POST /devices` call
  with the token after sign-in.
- **Apple side:** enable the Push Notifications capability on the App ID (Track 4.1) and create an
  APNs Auth Key (.p8) in the Developer portal — that key's ID/Team ID feed the `APNS_*` vars.

### Track 3 — iOS release configuration
1. **Finalize the bundle ID.** Current project value is `com.mickey.FitnessAP`.
   **Recommended: `com.mickey.fitnessglp`** — keeps your existing `com.mickey.*` namespace (so it's
   guaranteed unique to your Apple account), lowercase by convention, and reflects the rebrand.
   It's invisible to users but **permanent** once the App ID is created, so lock it now. Must match
   `APPLE_BUNDLE_ID` (server), the App ID, and `PRODUCT_BUNDLE_IDENTIFIER` in both Xcode build
   configs. Alternative if you want a company-style identity later: `com.fitnessglp.app`.
   *(Blocks Track 1 step 4 and Track 4.)*
2. **Set the production URL** in `App/Config.swift`: replace `https://api.fitnessap.com` with the
   Railway subdomain.
3. **Enable capabilities** in Xcode → Signing & Capabilities: **Sign in with Apple** (required by
   `SignInView`), **Push Notifications** (if Track 2 stays in v1). HealthKit is already enabled.
4. **Rebrand check:** the iOS strings still say "Fitness AP" (e.g. `SignInView` title). Decide if
   the beta ships as "Fitness GLP" — a quick string/asset pass, not structural.
5. **Real-device smoke test** against the Railway backend (the three items the Session-D handoff
   flagged: recovery card refresh, on-device parse `parser_source`, HealthKit intensity).

### Track 4 — Apple Developer → App Store Connect → TestFlight
1. **App ID** in the Developer portal for the bundle ID, with **Sign in with Apple** (and **Push**
   if in scope) enabled.
2. **App record** in App Store Connect.
3. **Privacy policy URL + App Privacy labels.** With HealthKit *and* Sign in with Apple, Apple is
   strict. A privacy policy is needed for the app record and **mandatory before external** review.
   **Recommended home:** serve a static `/privacy` page from the **Railway backend you're already
   deploying** — add one Express route (or `express.static`) returning a `privacy.html`. Keeps
   everything on one platform, no extra service, and gives a stable URL like
   `https://<your-app>.up.railway.app/privacy` to paste into App Store Connect. The content must
   reflect what the app actually collects: HealthKit activity data, check-ins/measurements
   (encrypted at rest), and the Apple user ID — and that it isn't sold. *Alternative:* deploy the
   existing `web/` Next.js site as a second Railway service if you also want the marketing site live.
4. **Archive + upload** the Release build from Xcode.
5. **Internal testers** (App Store Connect users, up to 100, **no Beta App Review**) — fastest path
   to real-device feedback. Expand to external later (needs Beta App Review + the privacy policy).

### Track 5 — Data safety + ops for real users
1. **Backups.** Real user health data lands in one SQLite file on the volume. Set up a recurring
   backup (Railway volume snapshot, or a small cron that copies the `.db` off-box). Do this
   *before* the first tester signs in.
2. **`ENCRYPTION_KEY` permanence** — restated because it's the highest-stakes item: set once,
   back it up, never change.
3. **Monitoring.** Railway logs + the `/health` endpoint are enough for an internal beta. Optional:
   a lightweight uptime ping.
4. **AI cost watch.** Anthropic key is live for testers; the 20/hr limiter caps it, but glance at
   spend after the first few days.

---

## Critical path (suggested order)
1. **Finalize bundle ID** (unblocks env + Apple config). *(Track 3.1)*
2. **Generate `JWT_SECRET` + `ENCRYPTION_KEY`; back them up.** *(Track 1.4)*
3. **Stand up Railway**: repo, volume, env vars, deploy, `/health` green. *(Track 1)*
4. **Build push (Track 2)** — backend APNs sender + iOS registration. Partner PR.
5. **Point iOS at Railway + enable capabilities + rebrand pass.** *(Track 3)*
6. **Apple App ID + App Store Connect record + privacy policy.** *(Track 4.1–4.3)*
7. **Archive, upload, add internal testers.** *(Track 4.4–4.5)*
8. **Backups + final on-device smoke test.** *(Track 5, Track 3.5)*
9. **Hand out the internal TestFlight link.** 🎉

## "Ready to hand out" checklist
- [ ] `/health` green on the Railway URL
- [ ] Sign in with Apple works on a real device against prod
- [ ] AI plan / weekly narrative returns real output (key live)
- [ ] DB on a persistent volume + a backup job running
- [ ] `ENCRYPTION_KEY` generated once and backed up
- [ ] Privacy policy hosted + linked in App Store Connect
- [ ] (If push in v1) a real notification arrives on device
- [ ] Internal testers added; build processed in TestFlight

---

## Open questions still to resolve
1. **Confirm the bundle ID** = `com.mickey.fitnessglp`? (Recommended; permanent — say yes and I'll
   update both Xcode build configs + the `APPLE_BUNDLE_ID` references.)
2. **Confirm privacy-policy host** = Vercel `web/` `/privacy` page? (Or GitHub Pages fallback.)

*Resolved this session:* push is in v1 (partner PR); rebrand to "Fitness GLP" done.

## Explicitly deferred (not blocking the beta)
- **Monetization** — StoreKit 2 / RevenueCat, trial, paywall, free-paid split, price. Revisit after
  feedback. `SKIP_SUBSCRIPTION_CHECK=true` keeps everything free meanwhile.
- **Progress photos / Backblaze B2** — stays stubbed; `/photos` accepts but doesn't store.
- **Custom domain** — Railway subdomain for now.
- **External TestFlight + Beta App Review** — after the internal round stabilizes.
- **Postgres migration** — only if SQLite shows strain at scale.
