'use strict';

const { Pool, types } = require('pg');
const bcrypt = require('bcryptjs');
const config = require('../config');

// PostgreSQL returns BIGINT (int8, OID 20) and NUMERIC (OID 1700) as strings.
// The application (and its views) expect numbers, so parse them back to JS
// numbers here. This keeps restaurant ids, review counts, prices and ratings
// working without template changes.
types.setTypeParser(20, (v) => Number(v));    // int8 -> number
types.setTypeParser(1700, (v) => Number(v));  // numeric -> number

let pool = null;

/**
 * Returns the shared PostgreSQL connection pool, initializing it on first call.
 */
function getDb() {
  if (pool) return pool;

  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is not configured. Add it to your .env file.');
  }

  pool = new Pool({
    connectionString: config.databaseUrl,
    ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  pool.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('[db] Unexpected PostgreSQL pool error:', err.message);
  });

  return pool;
}

const REQUIRED_TABLES = [
  'users',
  'restaurants',
  'menu_items',
  'reviews',
  'email_verifications',
];

/**
 * Verify the connection and confirm the required tables exist. Does not create
 * or drop anything — the schema is managed via db/migrations/001_create_schema.sql.
 */
async function verify() {
  const db = getDb();
  await db.query('SELECT 1');

  const missing = [];
  for (const table of REQUIRED_TABLES) {
    const res = await db.query(
      "SELECT to_regclass($1) AS name",
      ['public.' + table]
    );
    if (!res.rows[0].name) missing.push(table);
  }

  if (missing.length > 0) {
    throw new Error(
      'Missing required tables in PostgreSQL: ' + missing.join(', ') +
      '. Run db/migrations/001_create_schema.sql first.'
    );
  }
}

/**
 * Insert a user if the email does not already exist. Safe and idempotent:
 * the UNIQUE constraint on users.email makes this a no-op for existing users.
 * Returns true when a row was inserted, false otherwise.
 */
async function seedUser({ name, email, password, role }) {
  const db = getDb();
  const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) return false;

  const hash = bcrypt.hashSync(password, 10);
  const res = await db.query(
    'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)',
    [name, email, hash, role]
  );
  return res.rowCount > 0;
}

/**
 * Whether demo accounts should be seeded on startup.
 *
 * Fail-safe by default: demo accounts are NEVER created when
 * NODE_ENV=production. In every other environment they are seeded by
 * default, and SEED_DEMO=true/false can override that default for
 * explicit development/testing use.
 */
function shouldSeedDemo() {
  if ((process.env.NODE_ENV || '').toLowerCase() === 'production') return false;
  if (process.env.SEED_DEMO !== undefined) return process.env.SEED_DEMO !== 'false';
  return true;
}

/**
 * Seeds demo convenience accounts if they are missing. Idempotent — it will
 * never create duplicates or overwrite existing data. Demo accounts are
 * skipped entirely when shouldSeedDemo() is false (e.g. production).
 */
async function seed() {
  if (!shouldSeedDemo()) {
    // eslint-disable-next-line no-console
    console.log('[db] Demo account seeding is disabled for this environment.');
  } else {
    const owner = await seedUser({
      name: 'Demo Owner',
      email: 'owner@kamoto.test',
      password: 'Owner123!',
      role: 'owner',
    });
    const customer = await seedUser({
      name: 'Demo Customer',
      email: 'customer@kamoto.test',
      password: 'Customer123!',
      role: 'customer',
    });

    if (owner || customer) {
      // eslint-disable-next-line no-console
      console.log('[db] Seeded demo accounts: owner@kamoto.test / Owner123! and customer@kamoto.test / Customer123!');
    }
  }

  const db = getDb();
  const restaurantCount = await db.query('SELECT COUNT(*) AS count FROM restaurants');
  if (Number(restaurantCount.rows[0].count) === 0) {
    // eslint-disable-next-line no-console
    console.log('[db] No restaurants yet. Owners can add their first restaurant from the dashboard.');
  }
}

module.exports = { getDb, verify, seed };
