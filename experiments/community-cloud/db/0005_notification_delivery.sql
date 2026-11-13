-- v0.9.6: Add delivery diagnostics and retryable friend approval messages.
-- Additive only. Existing users, accounts, sessions, bot configuration and reminders stay intact.
CREATE TABLE IF NOT EXISTS notification_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('friend_approved')),
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  next_attempt_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','expired','cancelled')),
  delivered_at INTEGER,
  last_error TEXT,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notification_events_due ON notification_events(status,next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_notification_events_owner ON notification_events(owner_id,recipient_id);
CREATE TABLE IF NOT EXISTS notification_delivery_state (
  owner_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('resin','friend_approved','test')),
  status TEXT NOT NULL CHECK(status IN ('queued','sent','retrying','expired','blocked')),
  last_error TEXT,
  last_attempt_at INTEGER,
  last_success_at INTEGER,
  PRIMARY KEY(owner_id,recipient_id,kind)
);
