# Fitness AP Backend — Setup Guide

This is the Node.js backend for the Fitness AP iOS app. It runs on a small Linux
server (VPS) and handles workout generation, macro calculation, and data storage.

You don't need a Mac to work on this. Any computer with Node.js installed can run
it locally for development. The VPS is only needed when you're ready to go live.

---

## Part 1 — Run it locally (for development)

### Step 1: Install Node.js

Download and install Node.js version 20 or newer from https://nodejs.org
Choose the "LTS" version — that's the stable one.

### Step 2: Open a terminal in the backend folder

On Windows: right-click the `backend` folder → "Open in Terminal"
On Mac: right-click → "New Terminal at Folder" (or use the Terminal app and `cd` to the folder)

### Step 3: Install dependencies

```bash
npm install
```

This downloads all the libraries the backend needs. It takes 30–60 seconds the
first time. `better-sqlite3` compiles itself during this step — that's normal.

### Step 4: Create your .env file

Copy the example:
```bash
cp .env.example .env
```

Open `.env` in a text editor. The only value you *need* to set to run locally is:

```
DB_PATH=./data/fitnessap.db
```

Leave `ENCRYPTION_KEY` blank for now — the app will warn you and store data in
plaintext during development, which is fine on your own computer. Set it before
you go live.

Set `SKIP_SUBSCRIPTION_CHECK=true` during local dev so you don't need a real
RevenueCat subscription to test the protected routes.

### Step 5: Start the server

```bash
npm run dev
```

You should see:
```
[db] opened ./data/fitnessap.db
[db] applied migration: 001_users.sql
... (one line per migration file)
Fitness AP backend listening on port 3000
```

The server is now running. Test it:
```bash
curl http://localhost:3000/health
```
Expected response: `{"status":"ok","version":"0.1.0"}`

### Step 6: Start the background worker (optional for dev)

In a separate terminal:
```bash
npm run dev:worker
```

The worker handles push notification jobs. It's safe to skip during development
unless you're testing notifications.

### Step 7: Authenticate in dev mode

In development (`NODE_ENV` is not `production`), pass a `X-User-Id` header
instead of a real Sign in with Apple JWT:

```bash
curl -H "X-User-Id: YOUR_USER_UUID" http://localhost:3000/workouts/YOUR_USER_UUID/plan
```

Create a test user first:
```bash
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"id":"test-user-001","display_name":"Test User"}'
```

---

## Part 2 — Deploy to a VPS (for going live)

A VPS is a Linux server you rent by the month. For this app, a Hetzner CX22
(~$5–10/month) is plenty. DigitalOcean "Basic Droplet" is equally good.

### Step 1: Provision the server

**Hetzner:**
1. Sign up at https://hetzner.com/cloud
2. Create a project → "Add Server"
3. Location: pick one close to the US (Ashburn, VA is a good pick)
4. Image: Ubuntu 24.04
5. Type: CX22 (2 vCPU, 4 GB RAM)
6. Add your SSH key (or let Hetzner generate a password — SSH key is better)
7. Click "Create & Buy Now"

**DigitalOcean:** same flow, called "Create Droplet" instead.

### Step 2: Connect to the server

```bash
ssh root@YOUR_SERVER_IP
```

### Step 3: Install Node.js on the server

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
node --version   # should print v20.x.x or higher
```

### Step 4: Install nginx and PM2

nginx acts as a "front door" — it takes HTTPS traffic and forwards it to Node.js.
PM2 keeps Node.js running even after a crash or reboot.

```bash
apt-get install -y nginx
npm install -g pm2
```

### Step 5: Get your code onto the server

Option A — Git (recommended):
```bash
git clone https://github.com/YOUR_USERNAME/fitness-ap-backend.git /opt/fitnessap
cd /opt/fitnessap
npm install
```

Option B — SFTP upload:
Use Transmit (Mac) or WinSCP (Windows) to upload the `backend` folder to
`/opt/fitnessap` on the server.

### Step 6: Create the .env file on the server

```bash
cp /opt/fitnessap/.env.example /opt/fitnessap/.env
nano /opt/fitnessap/.env
```

Minimum required values for production:
```
DB_PATH=/var/data/fitnessap.db
PORT=3000

# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=<64-char hex string>

# Apple auth
APPLE_BUNDLE_ID=com.yourname.fitnessap

# RevenueCat webhooks
REVENUECAT_WEBHOOK_SECRET=<from RevenueCat dashboard>

# Backblaze B2 for photos
B2_APPLICATION_KEY_ID=<from Backblaze>
B2_APPLICATION_KEY=<from Backblaze>
B2_BUCKET_NAME=fitnessap-photos
B2_ENDPOINT=https://s3.us-east-005.backblazeb2.com

# Push notifications (APNs)
APNS_KEY_ID=<from Apple dev portal>
APNS_TEAM_ID=<your Apple team ID>
APNS_BUNDLE_ID=com.yourname.fitnessap
APNS_KEY_PATH=/opt/fitnessap/AuthKey_XXXXXXXXXX.p8
```

Save the encryption key in a password manager. If you lose it, you cannot decrypt
user data.

Create the data directory:
```bash
mkdir -p /var/data
```

### Step 7: Start with PM2

```bash
cd /opt/fitnessap
pm2 start server.js --name fitnessap-api
pm2 start worker.js --name fitnessap-worker
pm2 save          # save process list so it survives reboots
pm2 startup       # follow the printed instructions to enable autostart
```

Check everything is running:
```bash
pm2 status
curl http://localhost:3000/health
```

### Step 8: Set up nginx with HTTPS

First, point your domain's DNS A record at your server's IP address.

Then:
```bash
apt-get install -y certbot python3-certbot-nginx
```

Create the nginx config:
```bash
nano /etc/nginx/sites-available/fitnessap
```

Paste this (replace `api.yourapp.com` with your actual domain):
```nginx
server {
    server_name api.yourapp.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }

    # Increase body size limit for photo uploads (default is 1MB)
    client_max_body_size 20M;
}
```

Enable it and get a free HTTPS certificate:
```bash
ln -s /etc/nginx/sites-available/fitnessap /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx
certbot --nginx -d api.yourapp.com
```

Certbot will auto-renew the certificate — no action needed on your part.

---

## Part 3 — Set up Litestream (database backups)

Litestream continuously copies your SQLite file to cloud storage. If your VPS
ever dies, you can restore the database from backup in minutes.

### Step 1: Create an object storage bucket

Sign up for Backblaze B2 (https://backblaze.com) or Cloudflare R2.
Create a private bucket. Generate an access key with read/write permissions.

**Note:** You can use a second B2 bucket for Litestream, separate from your
photos bucket. Two buckets = cleaner billing and easier access control.

### Step 2: Install Litestream

```bash
wget https://github.com/benbjohnson/litestream/releases/latest/download/litestream-v0.3.13-linux-amd64.tar.gz
tar -xzf litestream-*.tar.gz -C /usr/local/bin
```

### Step 3: Configure Litestream

```bash
nano /etc/litestream.yml
```

```yaml
dbs:
  - path: /var/data/fitnessap.db
    replicas:
      - type: s3
        bucket: your-litestream-bucket-name
        path: fitnessap-backup
        access-key-id: YOUR_B2_KEY_ID
        secret-access-key: YOUR_B2_SECRET
        endpoint: https://s3.us-east-005.backblazeb2.com
```

```bash
systemctl enable litestream
systemctl start litestream
```

### Restore from backup:
```bash
litestream restore -config /etc/litestream.yml /var/data/fitnessap.db
```

---

## Part 4 — Wiring Sign in with Apple (production auth)

In production the iOS app sends an **Apple identity token** (a JWT signed by
Apple's servers) in every request:

```
Authorization: Bearer <apple_identity_token>
```

The backend verifies this automatically using the `jsonwebtoken` and `jwks-rsa`
packages. You need to set one env var:

```
APPLE_BUNDLE_ID=com.yourname.fitnessap
```

That's it — the `requireUser` middleware fetches Apple's public keys automatically
and caches them for 24 hours.

**In development:** you don't need any of this. Pass `X-User-Id: <uuid>` instead,
and the middleware accepts it as long as `NODE_ENV` is not `production`.

---

## Part 5 — Set up push notifications (APNs)

1. In your Apple Developer account, go to Certificates → Keys
2. Create a new key with Apple Push Notifications Service (APNs) enabled
3. Download the `.p8` file — keep it safe, you can only download it once
4. Copy it to your server: `/opt/fitnessap/AuthKey_XXXXXXXXXX.p8`
5. Set the env vars in `.env`:
   ```
   APNS_KEY_ID=XXXXXXXXXX
   APNS_TEAM_ID=XXXXXXXXXX
   APNS_BUNDLE_ID=com.yourname.fitnessap
   APNS_KEY_PATH=/opt/fitnessap/AuthKey_XXXXXXXXXX.p8
   ```
6. Install the APNs library: `npm install @parse/node-apn`
7. Follow the instructions in `worker.js` (near the top) to replace the stub
   with the real APNs provider

Until you do step 6–7, the worker logs what it *would* send but doesn't actually
send anything — safe for testing.

---

## Part 6 — Set up photo uploads (Backblaze B2)

Photos are uploaded to Backblaze B2 via the S3-compatible API.

1. In Backblaze, create a private bucket (e.g. `fitnessap-photos`)
2. Create an Application Key with read/write access to that bucket
3. Set env vars:
   ```
   B2_APPLICATION_KEY_ID=<key ID>
   B2_APPLICATION_KEY=<application key>
   B2_BUCKET_NAME=fitnessap-photos
   B2_ENDPOINT=https://s3.us-east-005.backblazeb2.com
   ```
   (The endpoint URL varies by region — find yours in the B2 console)
4. The backend uses these libraries (already in package.json):
   - `@aws-sdk/client-s3`
   - `@aws-sdk/s3-request-presigner`
   - `multer`

Run `npm install` to pull them in.

Until these env vars are set, photo uploads are **stubbed** — accepted and logged
but not sent to B2. The route still works and returns a success response.

---

## Part 7 — Adding the cloud LLM provider

The `/ai` routes are stubbed. When you're ready to wire in a provider:

1. Open `routes/ai.js`
2. Find the `callCloudLlm` function (around line 50)
3. Follow the commented instructions to add your provider (Anthropic or OpenAI)
4. Set `CLOUD_LLM_PROVIDER` and `CLOUD_LLM_API_KEY` in your `.env`

The rest of the app doesn't change — only the inside of that one function.

---

## Part 8 — API reference

In development, all authenticated routes require `X-User-Id: <uuid>` header.
In production, use `Authorization: Bearer <apple_identity_token>` instead.

Routes marked 🔒 also require an active subscription (`requireSubscription`).

| Method | Path | Auth | What it does |
|--------|------|------|--------------|
| GET | /health | none | Health check |
| POST | /users | none | Create user (after Sign in with Apple) |
| GET | /users/:id | user | Get user record |
| DELETE | /users/:id | user | Delete user + all data |
| GET | /profiles/:userId | user | Get profile + GLP settings |
| PUT | /profiles/:userId | user | Save onboarding / settings |
| GET | /workouts/:userId/plan | user 🔒 | Generate this week's workout plan |
| POST | /workouts | user | Create a planned workout session |
| PUT | /workouts/:userId/:id/complete | user | Mark workout done, get progression |
| POST | /workouts/:id/sets | user | Log a set |
| POST | /checkins | user | Submit morning check-in (triggers deload check) |
| GET | /checkins/:userId/today | user | Get today's check-in |
| GET | /macros/:userId | user 🔒 | Calculate today's macro targets |
| GET | /macros/:userId/leaderboard | user | Protein-dense foods ranked |
| POST | /measurements | user | Log weekly measurements |
| GET | /measurements/:userId/latest | user | Most recent measurements + lean-mass proxy |
| POST | /dose-history | user | Record a dose change (starts titration window) |
| POST | /chat | user | Store a chat message + parsed payload |
| POST | /ai/chat-parse | user | Cloud LLM fallback for low-confidence parsing |
| POST | /ai/weekly-report | user | Generate LLM-written weekly narrative |
| GET | /reports/:userId/weekly | user 🔒 | Weekly summary data |
| POST | /photos/:userId | user 🔒 | Upload a progress photo (to B2) |
| GET | /photos/:userId | user 🔒 | List photos with presigned URLs |
| DELETE | /photos/:userId/:photoId | user | Delete a photo |
| POST | /devices | user | Register APNs device token |
| DELETE | /devices/:token | user | Unregister device token |
| POST | /webhooks/revenuecat | none | RevenueCat subscription events |

---

## Folder structure

```
backend/
  server.js                   ← entry point; starts Express and wires routes
  worker.js                   ← background worker (push notifications, cron jobs)
  .env.example                ← copy to .env and fill in values
  package.json                ← dependencies and npm scripts
  db/
    database.js               ← opens SQLite, runs migrations on startup
    encrypt.js                ← AES-256-GCM encryption for sensitive columns
  engine/
    macros.js                 ← GLP-1 protein-first macro calculator
    workout.js                ← workout generator, progression engine, deload logic
    exercises.js              ← exercise library with tier progressions and rotation
    weeklyReport.js           ← weekly aggregator (strength, lean-mass proxy, trend)
  migrations/                 ← run in order on first startup (auto, no manual step)
    001_users.sql
    002_profiles.sql
    003_dose_history.sql
    004_daily_checkins.sql
    005_workouts.sql
    006_measurements.sql
    007_chat_messages.sql
    008_subscriptions.sql
    009_device_tokens.sql
    010_photos.sql
  middleware/
    requireUser.js            ← Apple JWT verification (dev: X-User-Id header)
    requireSubscription.js    ← 402 if subscription is expired/cancelled
    security.js               ← helmet + global + AI rate limiters
    validate.js               ← input validation helpers
  routes/
    users.js                  ← POST/GET/DELETE /users
    profiles.js               ← GET/PUT /profiles
    workouts.js               ← workout plan, logging, completion, sets
    checkins.js               ← daily check-in + auto-deload decision
    macros.js                 ← macro targets + food leaderboard
    measurements.js           ← weekly measurements + lean-mass proxy score
    doseHistory.js            ← dose changes + titration window trigger
    chat.js                   ← chat storage + action routing
    ai.js                     ← cloud LLM wrapper (stubbed — swap provider here)
    reports.js                ← weekly report data + narrative endpoint
    photos.js                 ← progress photo upload/list/delete (B2 backed)
    webhooks.js               ← RevenueCat subscription lifecycle events
    devices.js                ← APNs device token register/unregister
  data/                       ← created automatically; holds fitnessap.db
  SETUP.md                    ← this file
```
