'use strict';

const { Client } = require('pg');
const config = require('../config');
const hotels = require('./data/hotels');

const OWNER_EMAIL = 'newprincians@gmail.com';

async function main() {
  const client = new Client({
    connectionString: config.databaseUrl,
    ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
  });
  await client.connect();
  try {
    const ownerRes = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [OWNER_EMAIL]
    );
    if (ownerRes.rows.length === 0) throw new Error(`Owner not found: ${OWNER_EMAIL}`);
    const ownerId = ownerRes.rows[0].id;

    let updated = 0;
    let skipped = 0;
    for (const rec of hotels) {
      if (!rec.imageUrl) {
        skipped++;
        continue;
      }
      const res = await client.query(
        `UPDATE restaurants
            SET image_url = $1
          WHERE owner_id = $2 AND name = $3
          RETURNING id`,
        [rec.imageUrl, ownerId, rec.name]
      );
      if (res.rows.length > 0) updated++;
      else skipped++;
    }

    const check = await client.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE image_url <> '') AS with_image
         FROM restaurants WHERE owner_id = $1`,
      [ownerId]
    );
    console.log(`[update-images-db] updated ${updated} rows, skipped ${skipped}`);
    console.log('[update-images-db] owner totals:', check.rows[0]);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[update-images-db] Failed:', err.message);
  process.exit(1);
});