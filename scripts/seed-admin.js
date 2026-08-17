'use strict';

const bcrypt = require('bcryptjs');
const { Client } = require('pg');
const config = require('../config');

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'vk8821494@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'vinoth@18';
const ADMIN_NAME = process.env.ADMIN_NAME || 'Kamoto Admin';

async function ensureRoleColumn(client) {
  await client.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) DEFAULT 'user';"
  );
}

async function upsertAdmin(client) {
  const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);

  const existing = await client.query(
    'SELECT id FROM users WHERE email = $1',
    [ADMIN_EMAIL]
  );

  if (existing.rows.length > 0) {
    const res = await client.query(
      'UPDATE users SET role = $1, password_hash = $2 WHERE email = $3 RETURNING id, email, role',
      ['admin', hash, ADMIN_EMAIL]
    );
    return { action: 'updated', user: res.rows[0] };
  }

  const res = await client.query(
    'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, email, role',
    [ADMIN_NAME, ADMIN_EMAIL, hash, 'admin']
  );
  return { action: 'inserted', user: res.rows[0] };
}

async function main() {
  const client = new Client({
    connectionString: config.databaseUrl,
    ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
  });
  await client.connect();

  try {
    await ensureRoleColumn(client);
    const { action, user } = await upsertAdmin(client);

    const verify = await client.query(
      'SELECT password_hash FROM users WHERE email = $1',
      [ADMIN_EMAIL]
    );
    const passwordOk =
      verify.rows.length > 0 &&
      bcrypt.compareSync(ADMIN_PASSWORD, verify.rows[0].password_hash);

    console.log(`[seed-admin] ${action} admin: ${user.email} (id=${user.id}, role=${user.role})`);
    console.log(`[seed-admin] bcrypt password check: ${passwordOk ? 'PASS' : 'FAIL'}`);

    if (!passwordOk) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[seed-admin] Failed:', err.message);
  process.exit(1);
});
