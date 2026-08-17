-- =============================================================
-- Kamoto — PostgreSQL schema migration (Supabase)
-- Hotel submission workflow:
--   * Drop price_range (replaced by detailed hotel fields)
--   * Add rejection_reason for admin feedback
--   * Add 10 detailed hotel fields
--   * Add menu_images for uploaded menu photos
-- =============================================================

ALTER TABLE restaurants DROP COLUMN IF EXISTS price_range;

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS timings         TEXT   NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS full_address    TEXT   NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS city_area       TEXT   NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS landmark        TEXT   NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS fssai_license   TEXT   NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS seating_capacity INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dietary_type    TEXT   NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS parking_available BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS amenities       TEXT   NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS website_url     TEXT   NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS menu_images     TEXT[]  NOT NULL DEFAULT '{}';

-- Reset status for existing rows so nothing that was previously live breaks;
-- they were approved before moderation existed.
UPDATE restaurants SET status = 'approved' WHERE status = '' OR status IS NULL;