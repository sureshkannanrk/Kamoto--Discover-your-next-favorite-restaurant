'use strict';

const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const config = require('../config');

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

// New uploads are held in memory and pushed to Supabase Storage instead of
// being written to the local filesystem. Legacy /uploads/... files remain
// untouched and are still served by express.static.
const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  if (ALLOWED.has(file.mimetype)) {
    return cb(null, true);
  }
  req.fileValidationError = 'Only JPG, PNG, GIF, or WebP images are allowed.';
  return cb(null, false);
}

const uploadImage = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 },
});

let supabase = null;

/**
 * Lazily build the server-side Supabase client. The secret key is only ever
 * used here, server-side, and is never returned or exposed.
 */
function getSupabase() {
  if (supabase) return supabase;
  if (!config.supabaseUrl || !config.supabaseSecretKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY must be configured for image uploads.');
  }
  supabase = createClient(config.supabaseUrl, config.supabaseSecretKey);
  return supabase;
}

function safeExt(originalName) {
  const ext = path.extname(originalName || '').toLowerCase().replace(/[^a-z0-9.]/g, '');
  return /^\.[a-z0-9]{1,5}$/.test(ext) ? ext : '.jpg';
}

/**
 * Upload a multer file (memory buffer) to the public Supabase Storage bucket.
 * Object keys are namespaced by the form field: avatars/... or restaurants/...
 *
 * Returns { url, key } where url is the permanent public URL and key is the
 * object key used for later cleanup. Throws (without exposing credentials)
 * when the upload fails, so the caller never persists an invalid URL.
 */
async function storeUpload(file) {
  if (!file) return null;
  const sb = getSupabase();
  const prefix = file.fieldname === 'avatar' ? 'avatars' : 'restaurants';
  const key = `${prefix}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}${safeExt(file.originalname)}`;

  const { error } = await sb.storage.from(config.supabaseBucket).upload(key, file.buffer, {
    contentType: file.mimetype,
    upsert: false,
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[uploads] Supabase Storage upload failed:', error.message);
    throw new Error('Image upload failed. Please try again.');
  }

  const url = `${config.supabaseUrl}/storage/v1/object/public/${config.supabaseBucket}/${key}`;
  return { url, key };
}

/**
 * Delete a storage object, ignoring errors so cleanup is best-effort. Used to
 * remove a newly uploaded object when the database write fails afterwards.
 */
async function removeStoredObject(key) {
  if (!key) return;
  try {
    await getSupabase().storage.from(config.supabaseBucket).remove([key]);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[uploads] Failed to remove storage object:', key, err.message);
  }
}

module.exports = { uploadImage, storeUpload, removeStoredObject };