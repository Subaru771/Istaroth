PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  username TEXT NOT NULL DEFAULT '',
  invite_code TEXT UNIQUE NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS logins (
  token_hash TEXT PRIMARY KEY NOT NULL,
  telegram_id TEXT,
  code_hash TEXT,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS accounts (
  user_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  genshin_uid TEXT NOT NULL,
  region TEXT NOT NULL,
  nickname TEXT NOT NULL,
  credential_iv TEXT NOT NULL,
  credential_ciphertext TEXT NOT NULL,
  resin INTEGER,
  cap INTEGER,
  full_at INTEGER,
  last_sync_at INTEGER,
  next_sync_at INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  self_enabled INTEGER NOT NULL DEFAULT 1 CHECK(self_enabled IN (0,1)),
  self_threshold INTEGER NOT NULL DEFAULT 180 CHECK(self_threshold IN (160,180,190,200))
);
CREATE INDEX IF NOT EXISTS idx_accounts_due ON accounts(next_sync_at);
CREATE TABLE IF NOT EXISTS subscriptions (
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscriber_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  threshold INTEGER NOT NULL DEFAULT 180 CHECK(threshold IN (160,180,190,200)),
  joined_at INTEGER NOT NULL,
  PRIMARY KEY(owner_id, subscriber_id),
  CHECK(owner_id != subscriber_id)
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_subscriber ON subscriptions(subscriber_id);
CREATE TABLE IF NOT EXISTS alert_state (
  owner_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  threshold INTEGER NOT NULL,
  armed INTEGER NOT NULL DEFAULT 1 CHECK(armed IN (0,1)),
  PRIMARY KEY(owner_id, recipient_id)
);
CREATE TABLE IF NOT EXISTS delivery_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id TEXT NOT NULL,
  recipient_id TEXT NOT NULL,
  threshold INTEGER NOT NULL,
  resin INTEGER NOT NULL,
  cap INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  next_attempt_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_delivery_due ON delivery_queue(next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_delivery_owner ON delivery_queue(owner_id,recipient_id);
CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL
);
