-- =============================================================
-- Kamoto — PostgreSQL schema migration (Supabase)
-- Converts the existing SQLite schema (db/kamoto.db) to
-- PostgreSQL-compatible SQL. Run this in the Supabase SQL editor
-- or via psql. Does NOT migrate data and does not touch SQLite.
-- =============================================================

-- Enable case-insensitive text extension to preserve SQLite's
-- COLLATE NOCASE behaviour on email columns.
CREATE EXTENSION IF NOT EXISTS citext;

-- =============================================================
-- users
-- =============================================================
CREATE TABLE IF NOT EXISTS users (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          TEXT        NOT NULL,
  email         CITEXT      NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  role          TEXT        NOT NULL CHECK (role IN ('customer', 'owner')),
  avatar_url    TEXT        NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- restaurants
-- =============================================================
CREATE TABLE IF NOT EXISTS restaurants (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  cuisine     TEXT        NOT NULL,
  address     TEXT        NOT NULL,
  phone       TEXT        NOT NULL,
  price_range TEXT        NOT NULL CHECK (price_range IN ('$', '$$', '$$$', '$$$$')),
  description TEXT        NOT NULL DEFAULT '',
  image_url   TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- menu_items
-- =============================================================
CREATE TABLE IF NOT EXISTS menu_items (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  restaurant_id BIGINT      NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  price         NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  description   TEXT        NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- reviews
-- =============================================================
CREATE TABLE IF NOT EXISTS reviews (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  restaurant_id BIGINT    NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  user_id       BIGINT    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating        SMALLINT  NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment       TEXT      NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, user_id)
);

-- =============================================================
-- email_verifications
-- =============================================================
CREATE TABLE IF NOT EXISTS email_verifications (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email      CITEXT      NOT NULL,
  otp_hash   TEXT        NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN     NOT NULL DEFAULT FALSE,
  attempts   SMALLINT    NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================
-- Indexes (mirror the SQLite indexes)
-- =============================================================
CREATE INDEX IF NOT EXISTS idx_email_verifications_email
  ON email_verifications(email);

CREATE INDEX IF NOT EXISTS idx_restaurants_owner
  ON restaurants(owner_id);

CREATE INDEX IF NOT EXISTS idx_menu_restaurant
  ON menu_items(restaurant_id);

CREATE INDEX IF NOT EXISTS idx_reviews_restaurant
  ON reviews(restaurant_id);

CREATE INDEX IF NOT EXISTS idx_reviews_user
  ON reviews(user_id);
