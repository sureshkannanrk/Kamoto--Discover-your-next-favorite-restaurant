'use strict';

const { Client } = require('pg');
const config = require('../config');
const hotels = require('./data/hotels');

const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL || 'newprincians@gmail.com';
const DRY_RUN = process.argv.includes('--dry-run');

function toAddress(record) {
  return [record.fullAddress, record.cityArea].filter(Boolean).join(', ');
}

async function main() {
  const client = new Client({
    connectionString: config.databaseUrl,
    ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
  });
  await client.connect();

  try {
    const ownerRes = await client.query(
      'SELECT id, email, role FROM users WHERE email = $1',
      [OWNER_EMAIL]
    );
    if (ownerRes.rows.length === 0) {
      throw new Error(`Owner not found: ${OWNER_EMAIL}. Create the owner account first.`);
    }
    const owner = ownerRes.rows[0];
    console.log(`[seed-hotels] owner: ${owner.email} (id=${owner.id}, role=${owner.role})`);

    let inserted = 0;
    let skipped = 0;

    for (const record of hotels) {
      const existing = await client.query(
        'SELECT id FROM restaurants WHERE owner_id = $1 AND name = $2',
        [owner.id, record.name]
      );
      if (existing.rows.length > 0) {
        skipped++;
        continue;
      }

      const address = toAddress(record);
      if (!DRY_RUN) {
        await client.query(
          `INSERT INTO restaurants (
             owner_id, name, cuisine, address, phone, description,
             timings, full_address, city_area, landmark, fssai_license,
             seating_capacity, dietary_type, parking_available, amenities,
             website_url, image_url, menu_images, status
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, '', '{}', 'pending')`,
          [
            owner.id,
            record.name,
            record.cuisine,
            address,
            record.phone,
            record.description,
            record.timings,
            record.fullAddress,
            record.cityArea,
            record.landmark,
            record.fssaiLicense,
            record.seatingCapacity,
            record.dietaryType,
            record.parkingAvailable,
            record.amenities,
            record.websiteUrl,
          ]
        );
      }
      inserted++;
      console.log(`[seed-hotels] ${DRY_RUN ? '[dry-run] ' : ''}+ ${record.name} (${record.cityArea})`);
    }

    console.log(`[seed-hotels] done: ${inserted} to insert, ${skipped} skipped (already present).`);

    if (DRY_RUN) {
      console.log('[seed-hotels] DRY RUN — no rows were written.');
    } else {
      const counts = await client.query(
        `SELECT status, COUNT(*)::int AS count FROM restaurants WHERE owner_id = $1 GROUP BY status`,
        [owner.id]
      );
      console.log('[seed-hotels] owner restaurant status counts:', counts.rows);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[seed-hotels] Failed:', err.message);
  process.exit(1);
});