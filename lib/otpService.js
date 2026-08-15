'use strict';

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/init');
const config = require('../config');

const OTP_OPTS = config.otp;

/**
 * Generate a cryptographically secure numeric OTP of the configured length.
 */
function generateOtp() {
  const min = Math.pow(10, OTP_OPTS.length - 1);
  const max = Math.pow(10, OTP_OPTS.length);
  return crypto.randomInt(min, max).toString();
}

/**
 * Store a new OTP for the given email. The plaintext is never persisted;
 * only a bcrypt hash is stored alongside the creation/expiration timestamps
 * and the verification status.
 *
 * Old unused codes for the same email are invalidated first so that only the
 * latest code remains usable.
 */
async function storeOtp(email, otp) {
  const db = getDb();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_OPTS.ttlMs);
  const hash = bcrypt.hashSync(otp, 8);

  await pruneExpired();
  await db.query(
    'UPDATE email_verifications SET used = true WHERE email = $1 AND used = false',
    [email]
  );

  const res = await db.query(
    'INSERT INTO email_verifications (email, otp_hash, created_at, expires_at) VALUES ($1, $2, $3, $4) RETURNING id',
    [email, hash, now, expiresAt]
  );

  return Number(res.rows[0].id);
}

/**
 * Return the active (unused, unexpired) OTP record for an email, or null.
 */
async function activeOtpRecord(email) {
  const res = await getDb().query(
    'SELECT id, email, otp_hash, created_at, expires_at, used, attempts FROM email_verifications WHERE email = $1 AND used = false ORDER BY id DESC LIMIT 1',
    [email]
  );
  return res.rows[0] || null;
}

/**
 * Number of currently active (unused, unexpired) codes for an email.
 */
async function countActiveOtp(email) {
  const res = await getDb().query(
    'SELECT COUNT(*) AS total FROM email_verifications WHERE email = $1 AND used = false AND expires_at > $2',
    [email, new Date()]
  );
  return Number(res.rows[0].total);
}

/**
 * Milliseconds until a new code may be requested for this email (cooldown
 * between sends), 0 when a new request is allowed.
 */
async function resendCooldownMs(email) {
  const res = await getDb().query(
    'SELECT created_at FROM email_verifications WHERE email = $1 ORDER BY id DESC LIMIT 1',
    [email]
  );
  if (res.rows.length === 0) return 0;
  const createdAt = new Date(res.rows[0].created_at);
  if (Number.isNaN(createdAt.getTime())) return 0;
  const remaining = OTP_OPTS.resendCooldownMs - (Date.now() - createdAt.getTime());
  return Math.max(0, remaining);
}

/**
 * Verify a submitted code. A code can only be used once: a successful match
 * marks the record used and a failed attempt increments the attempt counter.
 *
 * Returns { valid: true } or { valid: false, reason } where reason is one of
 * 'missing' | 'format' | 'expired' | 'mismatch' | 'locked'.
 */
async function verifyOtp(email, otp) {
  const code = String(otp || '').trim();
  if (!code) return { valid: false, reason: 'missing' };
  if (!new RegExp(`^\\d{${OTP_OPTS.length}}$`).test(code)) {
    return { valid: false, reason: 'format' };
  }

  const db = getDb();
  const record = await activeOtpRecord(email);
  if (!record) return { valid: false, reason: 'expired' };

  if (new Date(record.expires_at).getTime() < Date.now()) {
    await db.query('UPDATE email_verifications SET used = true WHERE id = $1', [record.id]);
    return { valid: false, reason: 'expired' };
  }

  if (Number(record.attempts) >= OTP_OPTS.maxAttempts) {
    await db.query('UPDATE email_verifications SET used = true WHERE id = $1', [record.id]);
    return { valid: false, reason: 'locked' };
  }

  let matches = false;
  try {
    matches = bcrypt.compareSync(code, record.otp_hash);
  } catch (err) {
    matches = false;
  }

  if (!matches) {
    await db.query('UPDATE email_verifications SET attempts = attempts + 1 WHERE id = $1', [record.id]);
    return { valid: false, reason: 'mismatch' };
  }

  await db.query('UPDATE email_verifications SET used = true WHERE id = $1', [record.id]);
  return { valid: true };
}

/**
 * Remove expired/used records so the table does not grow unboundedly.
 */
async function pruneExpired() {
  await getDb().query(
    'DELETE FROM email_verifications WHERE used = true OR expires_at < $1',
    [new Date()]
  );
}

module.exports = {
  generateOtp,
  storeOtp,
  activeOtpRecord,
  countActiveOtp,
  resendCooldownMs,
  verifyOtp,
  pruneExpired,
};
