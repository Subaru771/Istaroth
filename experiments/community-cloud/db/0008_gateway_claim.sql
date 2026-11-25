-- Safe additive migration: legacy Windows pairing remains usable.
-- Atomic gateway reservations prevent multiple gateway logins with the same code.
ALTER TABLE desktop_pairings ADD COLUMN claim_hash TEXT;
ALTER TABLE desktop_pairings ADD COLUMN claimed_at INTEGER;
CREATE INDEX IF NOT EXISTS idx_desktop_pairings_claim ON desktop_pairings(claim_hash);
