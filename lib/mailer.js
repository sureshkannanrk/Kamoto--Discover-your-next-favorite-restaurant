'use strict';

const crypto = require('crypto');
const config = require('../config');

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const OTP_OPTS = config.otp;

/**
 * Generate a cryptographically secure 6-digit OTP.
 */
function generateOtp() {
  const min = Math.pow(10, OTP_OPTS.length - 1);
  const max = Math.pow(10, OTP_OPTS.length);
  return crypto.randomInt(min, max).toString();
}

/**
 * Build the HTML and plain-text bodies for the verification email.
 * The OTP is only placed into these outbound payloads; it is never logged.
 */
function buildBodies(otp) {
  const htmlContent =
    `<p>Welcome to <strong>Kamoto</strong>!</p>` +
    `<p>Your verification code is:</p>` +
    `<h2 style="letter-spacing:4px">${otp}</h2>` +
    `<p>This code expires in 5 minutes. If you did not request it, you can ignore this email.</p>`;

  const textContent =
    `Welcome to Kamoto!\n\n` +
    `Your verification code is: ${otp}\n\n` +
    `This code expires in 5 minutes. If you did not request it, you can ignore this email.`;

  return { htmlContent, textContent };
}

/**
 * Core Brevo send. Shared by OTP and notification emails. Returns
 * { delivered: true } on success, or { delivered: false, error } on failure.
 * Never logs message contents.
 */
async function sendBrevo(email, subject, htmlContent, textContent) {
  if (!isConfigured()) {
    if (config.isProduction) {
      // eslint-disable-next-line no-console
      console.error('[mailer] Email delivery is not configured: BREVO_API_KEY is missing.');
    }
    return { delivered: false, error: 'Email delivery is not configured.' };
  }

  try {
    const response = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'api-key': config.brevo.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        sender: {
          name: config.brevo.fromName,
          email: config.brevo.fromEmail,
        },
        to: [{ email }],
        subject,
        htmlContent,
        textContent,
      }),
    });

    if (!response.ok) {
      const status = response.status;
      const body = await response.text();
      // eslint-disable-next-line no-console
      console.error(`[mailer] Brevo API returned HTTP ${status}:`, body);
      return {
        delivered: false,
        error: 'We could not send the email right now. Please try again in a few minutes.',
      };
    }

    return { delivered: true, error: null };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[mailer] Failed to send email via Brevo:', err.message);
    return {
      delivered: false,
      error: 'We could not send the email right now. Please try again in a few minutes.',
    };
  }
}

/**
 * Send the OTP by email using the Brevo Transactional Email REST API (v3).
 *
 * When Brevo is configured, the code is emailed over HTTPS (port 443) and
 * this returns { delivered: true }. If sending fails, it returns
 * { delivered: false, error: '...' } so the caller can surface the failure
 * to the user instead of pretending the code was delivered.
 *
 * When Brevo is NOT configured, production fails closed (a controlled error
 * is returned so the OTP is never claimed sent and never leaked). In
 * development the code is returned in { delivered: false, devOtp } so the
 * app stays testable without API credentials. The OTP is never logged.
 */
async function sendOtp(email, otp) {
  if (!isConfigured()) {
    if (config.isProduction) {
      return {
        delivered: false,
        devOtp: null,
        error: 'We could not send the verification email right now. Please try again in a few minutes.',
      };
    }
    return { delivered: false, devOtp: otp, error: null };
  }

  const { htmlContent, textContent } = buildBodies(otp);
  const result = await sendBrevo(email, 'Your Kamoto Verification Code', htmlContent, textContent);
  return { ...result, devOtp: null };
}

/**
 * Notify a hotel owner that their submission was approved or rejected.
 * On rejection the admin's rejection_reason is included verbatim.
 */
async function sendSubmissionDecision(email, hotelName, decision, rejectionReason) {
  const approved = decision === 'approved';
  const statusLabel = approved ? 'Approved' : 'Rejected';
  const subject = `Update on your Kamoto hotel submission: ${hotelName}`;

  const reasonBlock = approved
    ? '<p>Your listing is now <strong>Live</strong> and visible to customers.</p>'
    : `<p>Your listing was <strong>Rejected</strong>. Reason: ${escapeHtml(rejectionReason || 'No reason provided')}</p>`;

  const htmlContent =
    `<p>Hello,</p>` +
    `<p>Your Kamoto hotel submission <strong>${escapeHtml(hotelName)}</strong> has been <strong>${statusLabel}</strong>.</p>` +
    reasonBlock +
    `<p>If you have questions, edit your submission and resubmit it for another review.</p>` +
    `<p>— The Kamoto Team</p>`;

  const textContent =
    `Hello,\n\n` +
    `Your Kamoto hotel submission "${hotelName}" has been ${statusLabel}.\n\n` +
    (approved
      ? 'Your listing is now Live and visible to customers.\n'
      : `Your listing was Rejected. Reason: ${rejectionReason || 'No reason provided'}\n`) +
    `If you have questions, edit your submission and resubmit it for another review.\n\n— The Kamoto Team`;

  return sendBrevo(email, subject, htmlContent, textContent);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function isConfigured() {
  return Boolean(config.brevo.apiKey && config.brevo.fromEmail);
}

module.exports = { generateOtp, sendOtp, sendSubmissionDecision, isConfigured };
