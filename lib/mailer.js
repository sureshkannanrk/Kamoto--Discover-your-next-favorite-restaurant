'use strict';

const crypto = require('crypto');
const { BrevoClient } = require('@getbrevo/brevo');
const config = require('../config');

const BREVO_API_KEY = process.env.BREVO_API_KEY;
const BREVO_FROM = process.env.BREVO_FROM;

let brevoClient = null;

/**
 * Lazily build the Brevo client from the BREVO_API_KEY environment variable.
 * The key is never hardcoded and never exposed outside this module.
 */
function getClient() {
  if (brevoClient) return brevoClient;
  brevoClient = new BrevoClient({ apiKey: BREVO_API_KEY });
  return brevoClient;
}

/**
 * Parse BREVO_FROM, accepting either a bare email address or a
 * "Name <email>" string. The name falls back to "Kamoto".
 */
function parseSender(raw) {
  const match = /^(.*?)<([^<>]+)>\s*$/.exec(raw || '');
  if (match) return { name: match[1].trim() || 'Kamoto', email: match[2].trim() };
  return { name: 'Kamoto', email: (raw || '').trim() };
}

/**
 * Generate a cryptographically secure 6-digit OTP.
 */
function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Send the OTP by email through the Brevo HTTPS API.
 *
 * When Brevo is configured, the code is emailed and this returns
 * { delivered: true }. If sending fails, it returns { delivered: false,
 * error: '...' } so the caller can surface the failure to the user instead
 * of pretending the code was delivered.
 *
 * When Brevo is NOT configured, production fails closed (a controlled error
 * is returned so the OTP is never claimed sent and never leaked). In
 * development the code is returned in { delivered: false, devOtp } so the
 * app stays testable without mail credentials. The OTP is never logged.
 */
async function sendOtp(email, otp) {
  if (BREVO_API_KEY && BREVO_FROM) {
    try {
      await getClient().transactionalEmails.sendTransacEmail({
        sender: parseSender(BREVO_FROM),
        to: [{ email }],
        subject: 'Your Kamoto verification code',
        textContent:
          `Welcome to Kamoto!\n\n` +
          `Your verification code is: ${otp}\n\n` +
          `This code expires in 5 minutes. If you did not request it, you can ignore this email.`,
        htmlContent:
          `<p>Welcome to <strong>Kamoto</strong>!</p>` +
          `<p>Your verification code is:</p>` +
          `<h2 style="letter-spacing:4px">${otp}</h2>` +
          `<p>This code expires in 5 minutes.</p>`,
      });
      return { delivered: true, devOtp: null, error: null };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[mailer] Failed to send verification email:', err.message);
      return {
        delivered: false,
        devOtp: null,
        error: 'We could not send the verification email right now. Please try again in a few minutes.',
      };
    }
  }

  if (config.isProduction) {
    // eslint-disable-next-line no-console
    console.error('[mailer] Email delivery is not configured: BREVO_API_KEY/BREVO_FROM are missing.');
    return {
      delivered: false,
      devOtp: null,
      error: 'We could not send the verification email right now. Please try again in a few minutes.',
    };
  }

  return { delivered: false, devOtp: otp, error: null };
}

function isConfigured() {
  return Boolean(BREVO_API_KEY && BREVO_FROM);
}

module.exports = { generateOtp, sendOtp, isConfigured };