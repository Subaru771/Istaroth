-- Additive friend reminder rules: preserves subscriptions, settings, and alerts.
-- The owner chooses per-friend rules; no friend's session or UID is exposed.
CREATE TABLE IF NOT EXISTS friend_reminder_rules (
  owner_id TEXT NOT NULL,
  subscriber_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('single','multiple','every')),
  thresholds TEXT NOT NULL DEFAULT '[]',
  step INTEGER NOT NULL DEFAULT 0 CHECK(step BETWEEN 0 AND 500),
  last_resin INTEGER DEFAULT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(owner_id,subscriber_id),
  FOREIGN KEY(owner_id,subscriber_id) REFERENCES subscriptions(owner_id,subscriber_id) ON DELETE CASCADE
);
