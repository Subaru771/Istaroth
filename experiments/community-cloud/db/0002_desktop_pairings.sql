-- Additive migration. All existing users, sessions, HoYoLAB credentials and alert settings remain intact.
CREATE TABLE IF NOT EXISTS desktop_pairings (
 code_hash TEXT PRIMARY KEY NOT NULL,
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_desktop_pairings_user ON desktop_pairings(user_id);
CREATE INDEX IF NOT EXISTS idx_desktop_pairings_expiry ON desktop_pairings(expires_at);
