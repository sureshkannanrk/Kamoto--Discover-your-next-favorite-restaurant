'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');
const config = require('../config');

const sb = createClient(config.supabaseUrl, config.supabaseSecretKey);

const PUBLIC_UPLOADS = path.join(__dirname, '..', 'public', 'uploads');

const LEGACY = {
  'restaurants': [
    { id: 5, file: '1786770255366-66a86cb9fd26.jpeg' },
    { id: 6, file: '1786777298870-47235e32c2a0.jpg' },
  ],
  'avatars': [
    { id: 3, file: '1786769977612-afbbffa3d24d.png' },
    { id: 4, file: '1786770079421-9c61c9d80a60.jpeg' },
  ],
};

function safeExt(originalName) {
  const ext = path.extname(originalName || '').toLowerCase().replace(/[^a-z0-9.]/g, '');
  return /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : '.jpg';
}

async function migrate() {
  const db = new Client({
    connectionString: config.databaseUrl,
    ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
  });
  await db.connect();

  for (const [prefix, rows] of Object.entries(LEGACY)) {
    for (const row of rows) {
      const filePath = path.join(PUBLIC_UPLOADS, row.file);
      if (!fs.existsSync(filePath)) {
        console.log(`skip (missing) ${row.file}`);
        continue;
      }
      const key = `${prefix}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}${safeExt(row.file)}`;
      const buffer = fs.readFileSync(filePath);
      const contentType = row.file.toLowerCase().endsWith('.png')
        ? 'image/png'
        : row.file.toLowerCase().endsWith('.webp')
          ? 'image/webp'
          : row.file.toLowerCase().endsWith('.gif')
            ? 'image/gif'
            : 'image/jpeg';

      const { error: upErr } = await sb.storage.from(config.supabaseBucket).upload(key, buffer, {
        contentType,
        upsert: false,
      });
      if (upErr) {
        console.error(`upload failed for ${row.file}:`, upErr.message);
        continue;
      }
      const { data } = sb.storage.from(config.supabaseBucket).getPublicUrl(key);
      const url = data.publicUrl;

      if (prefix === 'restaurants') {
        await db.query('UPDATE restaurants SET image_url = $1 WHERE id = $2', [url, row.id]);
      } else {
        await db.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [url, row.id]);
      }
      console.log(`updated ${prefix}.${row.id} -> ${url}`);
    }
  }

  await db.end();
}

migrate().catch((e) => { console.error('MIGRATION ERROR:', e.message); process.exit(1); });