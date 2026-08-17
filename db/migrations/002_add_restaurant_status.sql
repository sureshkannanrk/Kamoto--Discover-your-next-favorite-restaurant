-- =============================================================
-- Kamoto — PostgreSQL schema migration (Supabase)
-- Adds restaurant moderation workflow:
--   restaurants.status IN ('pending','approved','rejected')
--   users.role now also allows 'admin'
-- =============================================================

-- Add moderation status to restaurants. Existing rows are backfilled to
-- 'approved' so current live listings are not hidden.
ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending', 'approved', 'rejected'));

UPDATE restaurants SET status = 'approved' WHERE status = 'pending';

-- Allow admin role alongside customer/owner.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('customer', 'owner', 'admin'));

-- Index for admin moderation queries and public approved-only lookups.
CREATE INDEX IF NOT EXISTS idx_restaurants_status ON restaurants(status);
CREATE INDEX IF NOT EXISTS idx_restaurants_status_owner
  ON restaurants(owner_id, status);