-- Istaroth personal cloud relay: one private deployment per owner.
CREATE TABLE IF NOT EXISTS recipients (
  chat_id TEXT PRIMARY KEY NOT NULL,
  display_name TEXT NOT NULL,
  joined_at INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  threshold INTEGER NOT NULL DEFAULT 180 CHECK (threshold IN (160,180,190,200)),
  last_threshold INTEGER,
  last_sent_at INTEGER
);
CREATE TABLE IF NOT EXISTS resin_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  at INTEGER,
  value INTEGER,
  cap INTEGER,
  full_at INTEGER,
  last_error TEXT
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
