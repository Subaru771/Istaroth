-- Additive: existing authenticated HoYoLAB accounts stay in hoyolab mode.
ALTER TABLE accounts ADD COLUMN tracking_mode TEXT NOT NULL DEFAULT 'hoyolab'
  CHECK (tracking_mode IN ('hoyolab','estimate'));
