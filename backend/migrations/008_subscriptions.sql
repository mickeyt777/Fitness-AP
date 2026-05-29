-- Migration 008: subscriptions table
-- Tracks each user's subscription status, updated by the RevenueCat webhook.
-- The API checks this before serving protected routes in Phase 4.
-- During development and beta (TestFlight), all users are treated as active.

CREATE TABLE IF NOT EXISTS subscriptions (
  user_id            TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  status             TEXT NOT NULL DEFAULT 'trialing'
                     CHECK(status IN ('trialing','active','past_due','cancelled','expired','none')),
  product_id         TEXT,                   -- e.g. 'com.fitnessap.monthly'
  store              TEXT DEFAULT 'app_store' CHECK(store IN ('app_store','play_store','stripe')),
  original_purchase_date  DATETIME,
  current_period_end      DATETIME,
  revenuecat_customer_id  TEXT,
  updated_at         DATETIME NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
