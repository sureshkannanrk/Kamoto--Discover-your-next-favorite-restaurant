'use strict';

const crypto = require('crypto');
const { Resend } = require('resend');

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM = process.env.RESEND_FROM;

let resendClient = null;
let configured = false;

/**
 * Lazily build the Resend client from the RESEND_API_KEY environment
 * variable. The key is never hardcoded and never exposed outside this module.
 */
function getClient() {
  if (resendClient) return resendClient;
  resendClient = new Resend(RESEND_API_KEY);
  configured = true;
  return resendClient;
}

/**
 * Generate a cryptographically secure 6-digit OTP.
 */
function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Send the OTP by email through the Resend HTTPS API.
 *
 * When Resend is configured, the code is emailed and this returns
 * { delivered: true }. If sending fails, it returns { delivered: false,
 * error: '...' } so the caller can surface the failure to the user instead
 * of pretending the code was delivered.
 *
 * When Resend is NOT configured (development), the code is returned in
 * { delivered: false, devOtp } so the app stays testable without mail
 * credentials. The OTP is never logged to the console.
 */
async function sendOtp(email, otp) {
  if (RESEND_API_KEY && RESEND_FROM) {
    try {
      const { data, error } = await getClient().emails.send({
        from: RESEND_FROM,
        to: [email],
        subject: 'Your Kamoto verification code',
        text:
          `Welcome to Kamoto!\n\n` +
          `Your verification code is: ${otp}\n\n` +
          `This code expires in 5 minutes. If you did not request it, you can ignore this email.`,
        html:
          `<p>Welcome to <strong>Kamoto</strong>!</p>` +
          `<p>Your verification code is:</p>` +
          `<h2 style="letter-spacing:4px">${otp}</h2>` +
          `<p>This code expires in 5 minutes.</p>`,
      });
      if (error) throw new Error(error.message);
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

  return { delivered: false, devOtp: otp, error: null };
}

function isConfigured() {
  return Boolean(RESEND_API_KEY && RESEND_FROM);
}

module.exports = { generateOtp, sendOtp, isConfigured };