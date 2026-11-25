-- Additive. Existing reminder rules, sessions and credentials are preserved.
CREATE TABLE IF NOT EXISTS notification_quiet_hours (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  start_min INTEGER NOT NULL CHECK(start_min BETWEEN 0 AND 1439),
  end_min INTEGER NOT NULL CHECK(end_min BETWEEN 0 AND 1439),
  timezone TEXT NOT NULL
);
