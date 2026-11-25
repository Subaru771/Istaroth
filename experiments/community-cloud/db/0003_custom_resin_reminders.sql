-- Additive migration. Original accounts, credentials, and friend alerts are unchanged.
CREATE TABLE IF NOT EXISTS self_reminder_rules (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK(mode IN ('single','multiple','every')),
  thresholds TEXT NOT NULL DEFAULT '[]',
  step INTEGER NOT NULL DEFAULT 0 CHECK(step BETWEEN 0 AND 500),
  last_resin INTEGER DEFAULT NULL,
  updated_at INTEGER NOT NULL
);
