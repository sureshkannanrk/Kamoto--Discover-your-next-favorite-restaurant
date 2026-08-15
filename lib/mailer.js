'use strict';

const crypto = require('crypto');
const nodemailer = require('nodemailer');
const config = require('../config');

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = process.env.SMTP_SECURE === 'true' || SMTP_PORT === 465;
const SMTP_USERNAME = process.env.SMTP_USERNAME;
const SMTP_PASSWORD = process.env.SMTP_PASSWORD;
const SMTP_FROM = process.env.SMTP_FROM || 'Kamoto <noreply@kamoto.local>';

let transporter = null;

/**
 * Lazily build the SMTP transporter from environment variables. Credentials
 * are never hardcoded and never exposed outside this module. Port 587 uses
 * STARTTLS (secure: false + requireTLS), port 465 uses implicit TLS.
 */
function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    requireTLS: SMTP_PORT === 587,
    auth: { user: SMTP_USERNAME, pass: SMTP_PASSWORD },
  });
  return transporter;
}

/**
 * Generate a cryptographically secure 6-digit OTP.
 */
function generateOtp() {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Send the OTP by email using Nodemailer over SMTP.
 *
 * When SMTP is configured, the code is emailed and this returns
 * { delivered: true }. If sending fails, it returns { delivered: false,
 * error: '...' } so the caller can surface the failure to the user instead
 * of pretending the code was delivered.
 *
 * When SMTP is NOT configured, production fails closed (a controlled error
 * is returned so the OTP is never claimed sent and never leaked). In
 * development the code is returned in { delivered: false, devOtp } so the
 * app stays testable without mail credentials. The OTP is never logged.
 */
async function sendOtp(email, otp) {
  if (SMTP_HOST && SMTP_USERNAME && SMTP_PASSWORD) {
    try {
      await getTransporter().sendMail({
        from: SMTP_FROM,
        to: email,
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
    console.error('[mailer] Email delivery is not configured: SMTP credentials are missing.');
    return {
      delivered: false,
      devOtp: null,
      error: 'We could not send the verification email right now. Please try again in a few minutes.',
    };
  }

  return { delivered: false, devOtp: otp, error: null };
}

function isConfigured() {
  return Boolean(SMTP_HOST && SMTP_USERNAME && SMTP_PASSWORD);
}

module.exports = { generateOtp, sendOtp, isConfigured };