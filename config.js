'use strict';

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

const DEV_SESSION_SECRET = 'kamoto-dev-secret-change-me-in-production';

const environment = (process.env.NODE_ENV || 'development').toLowerCase();
const isProduction = environment === 'production';

const rawSessionSecret = process.env.SESSION_SECRET;

if (isProduction) {
  if (!rawSessionSecret) {
    throw new Error(
      'SESSION_SECRET is required when NODE_ENV=production. ' +
      'Set a strong, unique value via environment variable before starting.'
    );
  }
  if (rawSessionSecret === DEV_SESSION_SECRET) {
    throw new Error(
      'SESSION_SECRET must not use the development fallback value in production. ' +
      'Set a strong, unique value via environment variable before starting.'
    );
  }
}

const config = {
  environment,
  isProduction,
  port: process.env.PORT || 3000,
  sessionSecret: rawSessionSecret || DEV_SESSION_SECRET,
  sessionMaxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
  databaseUrl: process.env.DATABASE_URL,
  databaseSsl: process.env.DATABASE_SSL !== 'false',
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
  supabaseBucket: process.env.SUPABASE_BUCKET || 'images',
  brevo: {
    apiKey: process.env.BREVO_API_KEY,
    fromEmail: process.env.BREVO_FROM_EMAIL,
    fromName: process.env.BREVO_FROM_NAME || 'Kamoto',
  },
  viewsPath: path.join(__dirname, 'views'),
  publicPath: path.join(__dirname, 'public'),
  priceRanges: ['$', '$$', '$$$', '$$$$'],
  maxMenuItems: 50,
  maxReviewLength: 2000,
  otp: {
    length: 6,
    ttlMs: Number(process.env.OTP_TTL_MINUTES || 5) * 60 * 1000, // 5 minutes
    resendCooldownMs: Number(process.env.OTP_RESEND_COOLDOWN_SECONDS || 60) * 1000,
    maxPendingPerEmail: Number(process.env.OTP_MAX_PENDING || 5),
    maxAttempts: Number(process.env.OTP_MAX_ATTEMPTS || 5),
  },
};

module.exports = config;
