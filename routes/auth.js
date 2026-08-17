'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const { getDb } = require('../db/init');
const { asyncHandler, httpError, csrfProtection } = require('../middleware/errorHandler');
const config = require('../config');
const {
  validateName,
  validateEmail,
  validatePassword,
  validateRole,
} = require('../lib/validation');
const { generateOtp, storeOtp, resendCooldownMs, countActiveOtp, verifyOtp } = require('../lib/otpService');
const { sendOtp, isConfigured } = require('../lib/mailer');
const { uploadImage, storeUpload, removeStoredObject } = require('../lib/uploads');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function renderForm(res, page, user, errors, statusCode = 200) {
  return res.status(statusCode).render(page, {
    title: page === 'auth/register' ? 'Create Account' : 'Log In',
    user,
    errors: errors || {},
  });
}

function setSession(req, user) {
  req.session.user = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    avatar_url: user.avatar_url || '',
  };
}

function maskEmail(email) {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const visible = local.length <= 2 ? local[0] + '*' : local.slice(0, 2) + '*'.repeat(Math.max(1, local.length - 2));
  return `${visible}@${domain}`;
}

/**
 * Development-only OTP hint. Never exposed in production: when the code was
 * actually emailed, or NODE_ENV=production, the hint is always empty.
 */
function devOtpHint(mail) {
  if (mail.delivered || config.isProduction) return '';
  return mail.devOtp;
}

router.get('/register', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  const role = req.query.role === 'owner' ? 'owner' : 'customer';
  return renderForm(res, 'auth/register', { name: '', email: '', role });
});

router.post(
  '/register',
  asyncHandler(async (req, res) => {
    if (req.session.user) {
      req.session.flash = { type: 'error', message: 'You are already logged in.' };
      return res.redirect('/dashboard');
    }

    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim();
    const password = String(req.body.password || '');
    const role = String(req.body.role || '');

    const errors = {};
    const nameError = validateName(name);
    const emailError = validateEmail(email);
    const passwordError = validatePassword(password);
    const roleError = validateRole(role);

    if (nameError) errors.name = nameError;
    if (emailError) errors.email = emailError;
    if (passwordError) errors.password = passwordError;
    if (roleError) errors.role = roleError;

    if (Object.keys(errors).length > 0) {
      return renderForm(res, 'auth/register', { name, email, role }, errors, 422);
    }

    const db = getDb();
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);

    if (existing.rows.length > 0) {
      return renderForm(
        res,
        'auth/register',
        { name, email, role },
        { email: 'An account with this email already exists.' },
        409
      );
    }

    const cooldownMs = await resendCooldownMs(email);
    if (cooldownMs > 0) {
      const seconds = Math.ceil(cooldownMs / 1000);
      return renderForm(
        res,
        'auth/register',
        { name, email, role },
        { form: `Please wait ${seconds} seconds before requesting another code.` },
        429
      );
    }

    if ((await countActiveOtp(email)) >= config.otp.maxPendingPerEmail) {
      return renderForm(
        res,
        'auth/register',
        { name, email, role },
        { form: 'Too many verification codes requested for this email. Please try again later.' },
        429
      );
    }

    const otp = generateOtp();
    await storeOtp(email, otp);
    const mail = await sendOtp(email, otp);

    if (mail.error) {
      return renderForm(
        res,
        'auth/register',
        { name, email, role },
        { form: mail.error },
        503
      );
    }

    req.session.pendingUser = {
      name,
      email,
      passwordHash: bcrypt.hashSync(password, 10),
      role,
    };

    req.session.flash = {
      type: 'success',
      message: `We sent a 6-digit verification code to ${email}. Please enter it below to finish creating your account.`,
    };

    return res.render('auth/verify-otp', {
      title: 'Verify Your Email',
      email,
      maskedEmail: maskEmail(email),
      devOtp: devOtpHint(mail),
      errors: {},
    });
  })
);

router.get(
  '/verify-otp',
  (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');
    if (!req.session.pendingUser) {
      req.session.flash = { type: 'error', message: 'Please register first.' };
      return res.redirect('/register');
    }
    const email = String(req.query.email || req.session.pendingUser.email);
    return res.render('auth/verify-otp', {
      title: 'Verify Your Email',
      email,
      maskedEmail: maskEmail(email),
      devOtp: isConfigured() ? '' : '',
      errors: {},
    });
  }
);

router.post(
  '/verify-otp',
  asyncHandler(async (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');

    const pending = req.session.pendingUser;
    if (!pending) {
      req.session.flash = { type: 'error', message: 'Please register first.' };
      return res.redirect('/register');
    }

    const email = pending.email;
    const otp = String(req.body.otp || '').trim();

    const result = await verifyOtp(email, otp);
    const errors = {};

    if (!result.valid) {
      switch (result.reason) {
        case 'missing':
        case 'format':
          errors.otp = 'Please enter the 6-digit code from your email.';
          break;
        case 'expired':
          errors.otp = 'This code has expired. Please request a new one.';
          break;
        case 'locked':
          errors.otp = 'Too many incorrect attempts. Please request a new code.';
          break;
        default:
          errors.otp = 'That code is incorrect. Please check your email and try again.';
      }

      return res.render('auth/verify-otp', {
        title: 'Verify Your Email',
        email,
        maskedEmail: maskEmail(email),
        devOtp: '',
        errors,
      });
    }

    const db = getDb();
    const created = await db.query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, avatar_url',
      [pending.name, pending.email, pending.passwordHash, pending.role]
    );

    const user = created.rows[0];

    setSession(req, user);
    delete req.session.pendingUser;

    req.session.flash = {
      type: 'success',
      message:
        pending.role === 'owner'
          ? 'Email verified. Welcome to Kamoto, owner! Add your first restaurant from your dashboard.'
          : 'Email verified. Welcome to Kamoto!',
    };
    return res.redirect('/dashboard');
  })
);

router.post(
  '/resend-otp',
  asyncHandler(async (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');

    const pending = req.session.pendingUser;
    if (!pending) {
      req.session.flash = { type: 'error', message: 'Please register first.' };
      return res.redirect('/register');
    }

    const email = pending.email;

    const cooldownMs = await resendCooldownMs(email);
    if (cooldownMs > 0) {
      const seconds = Math.ceil(cooldownMs / 1000);
      req.session.flash = { type: 'error', message: `Please wait ${seconds} seconds before requesting another code.` };
      return res.render('auth/verify-otp', {
        title: 'Verify Your Email',
        email,
        maskedEmail: maskEmail(email),
        devOtp: '',
        errors: { otp: `Please wait ${seconds} seconds before requesting another code.` },
      });
    }

    if ((await countActiveOtp(email)) >= config.otp.maxPendingPerEmail) {
      req.session.flash = {
        type: 'error',
        message: 'Too many verification codes requested for this email. Please try again later.',
      };
      return res.render('auth/verify-otp', {
        title: 'Verify Your Email',
        email,
        maskedEmail: maskEmail(email),
        devOtp: '',
        errors: { otp: 'Too many verification codes requested. Please try again later.' },
      });
    }

    const otp = generateOtp();
    await storeOtp(email, otp);
    const mail = await sendOtp(email, otp);

    if (mail.error) {
      return res.render('auth/verify-otp', {
        title: 'Verify Your Email',
        email,
        maskedEmail: maskEmail(email),
        devOtp: '',
        errors: { otp: mail.error },
      });
    }

    req.session.flash = { type: 'success', message: `A new code was sent to ${email}.` };
    return res.render('auth/verify-otp', {
      title: 'Verify Your Email',
      email,
      maskedEmail: maskEmail(email),
      devOtp: devOtpHint(mail),
      errors: {},
    });
  })
);

router.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  return renderForm(res, 'auth/login', { email: '' });
});

router.post(
  '/login',
  asyncHandler(async (req, res) => {
    if (req.session.user) {
      req.session.flash = { type: 'error', message: 'You are already logged in.' };
      return res.redirect('/dashboard');
    }

    const email = String(req.body.email || '').trim();
    const password = String(req.body.password || '');

    const errors = {};
    if (!email) errors.email = 'Email is required.';
    if (!password) errors.password = 'Password is required.';
    if (Object.keys(errors).length > 0) {
      return renderForm(res, 'auth/login', { email }, errors, 422);
    }

    const db = getDb();
    const userRes = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = userRes.rows[0];

    let ok = false;
    try {
      ok = user ? bcrypt.compareSync(password, user.password_hash) : false;
    } catch (err) {
      ok = false;
    }

    if (!user || !ok) {
      return renderForm(
        res,
        'auth/login',
        { email },
        { password: 'Incorrect email or password. Please try again.' },
        401
      );
    }

    setSession(req, user);
    req.session.flash = { type: 'success', message: `Welcome back, ${user.name}!` };

    const next = String(req.query.next || '');
    if (next.startsWith('/') && !next.startsWith('//')) {
      return res.redirect(next);
    }
    return res.redirect('/');
  })
);

router.get('/forgot-password', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  return res.render('auth/forgot-password', {
    title: 'Forgot Password',
    email: '',
    errors: {},
    message: null,
  });
});

router.post(
  '/forgot-password',
  asyncHandler(async (req, res) => {
    if (req.session.user) return res.redirect('/dashboard');

    const email = String(req.body.email || '').trim();
    const errors = {};
    if (!email) errors.email = 'Email is required.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Please enter a valid email address.';

    if (Object.keys(errors).length > 0) {
      return res.status(422).render('auth/forgot-password', {
        title: 'Forgot Password',
        email,
        errors,
        message: null,
      });
    }

    const db = getDb();
    const userRes = await db.query('SELECT id, name FROM users WHERE email = $1', [email]);
    const user = userRes.rows[0];
    if (!user) {
      return res.status(404).render('auth/forgot-password', {
        title: 'Forgot Password',
        email,
        errors: {},
        message: { type: 'error', text: 'No account found with that email address.' },
      });
    }

    const cooldownMs = await resendCooldownMs(email);
    if (cooldownMs > 0) {
      const seconds = Math.ceil(cooldownMs / 1000);
      return res.status(429).render('auth/forgot-password', {
        title: 'Forgot Password',
        email,
        errors: { email: `Please wait ${seconds} seconds before requesting another code.` },
        message: null,
      });
    }

    if ((await countActiveOtp(email)) >= config.otp.maxPendingPerEmail) {
      return res.status(429).render('auth/forgot-password', {
        title: 'Forgot Password',
        email,
        errors: { email: 'Too many verification codes requested for this email. Please try again later.' },
        message: null,
      });
    }

    const otp = generateOtp();
    await storeOtp(email, otp);
    const mail = await sendOtp(email, otp);

    if (mail.error) {
      return res.status(503).render('auth/forgot-password', {
        title: 'Forgot Password',
        email,
        errors: { email: mail.error },
        message: null,
      });
    }

    req.session.resetPassword = { email, verified: false };

    return res.render('auth/reset-otp', {
      title: 'Verify Your Email',
      email,
      maskedEmail: maskEmail(email),
      devOtp: devOtpHint(mail),
      errors: {},
    });
  })
);

router.post(
  '/forgot-password/verify',
  asyncHandler(async (req, res) => {
    const reset = req.session.resetPassword;
    if (!reset || reset.verified) {
      req.session.flash = { type: 'error', message: 'Please start the password reset again.' };
      return res.redirect('/forgot-password');
    }

    const email = reset.email;
    const otp = String(req.body.otp || '').trim();

    const result = await verifyOtp(email, otp);
    const errors = {};

    if (!result.valid) {
      switch (result.reason) {
        case 'missing':
        case 'format':
          errors.otp = 'Please enter the 6-digit code from your email.';
          break;
        case 'expired':
          errors.otp = 'This code has expired. Please request a new one.';
          break;
        case 'locked':
          errors.otp = 'Too many incorrect attempts. Please request a new code.';
          break;
        default:
          errors.otp = 'That code is incorrect. Please check your email and try again.';
      }

      return res.render('auth/reset-otp', {
        title: 'Verify Your Email',
        email,
        maskedEmail: maskEmail(email),
        devOtp: '',
        errors,
      });
    }

    reset.verified = true;
    return res.render('auth/reset-password', {
      title: 'Reset Your Password',
      email,
      errors: {},
    });
  })
);

router.post(
  '/forgot-password/resend',
  asyncHandler(async (req, res) => {
    const reset = req.session.resetPassword;
    if (!reset || reset.verified) {
      req.session.flash = { type: 'error', message: 'Please start the password reset again.' };
      return res.redirect('/forgot-password');
    }

    const email = reset.email;

    const cooldownMs = await resendCooldownMs(email);
    if (cooldownMs > 0) {
      const seconds = Math.ceil(cooldownMs / 1000);
      return res.render('auth/reset-otp', {
        title: 'Verify Your Email',
        email,
        maskedEmail: maskEmail(email),
        devOtp: '',
        errors: { otp: `Please wait ${seconds} seconds before requesting another code.` },
      });
    }

    if ((await countActiveOtp(email)) >= config.otp.maxPendingPerEmail) {
      return res.render('auth/reset-otp', {
        title: 'Verify Your Email',
        email,
        maskedEmail: maskEmail(email),
        devOtp: '',
        errors: { otp: 'Too many verification codes requested. Please try again later.' },
      });
    }

    const otp = generateOtp();
    await storeOtp(email, otp);
    const mail = await sendOtp(email, otp);

    if (mail.error) {
      return res.render('auth/reset-otp', {
        title: 'Verify Your Email',
        email,
        maskedEmail: maskEmail(email),
        devOtp: '',
        errors: { otp: mail.error },
      });
    }

    req.session.flash = { type: 'success', message: `A new code was sent to ${email}.` };
    return res.render('auth/reset-otp', {
      title: 'Verify Your Email',
      email,
      maskedEmail: maskEmail(email),
      devOtp: devOtpHint(mail),
      errors: {},
    });
  })
);

router.post(
  '/forgot-password/reset',
  asyncHandler(async (req, res) => {
    const reset = req.session.resetPassword;
    if (!reset || !reset.verified) {
      req.session.flash = { type: 'error', message: 'Please start the password reset again.' };
      return res.redirect('/forgot-password');
    }

    const password = String(req.body.password || '');
    const confirm = String(req.body.confirm || '');
    const errors = {};
    const passwordError = validatePassword(password);
    if (passwordError) errors.password = passwordError;
    if (!confirm) errors.confirm = 'Please confirm your new password.';
    else if (password !== confirm) errors.confirm = 'Passwords do not match.';

    if (Object.keys(errors).length > 0) {
      return res.status(422).render('auth/reset-password', {
        title: 'Reset Your Password',
        email: reset.email,
        errors,
      });
    }

    const hash = bcrypt.hashSync(password, 10);
    await getDb().query('UPDATE users SET password_hash = $1 WHERE email = $2', [hash, reset.email]);
    delete req.session.resetPassword;

    req.session.flash = {
      type: 'success',
      message: 'Your password has been reset. Please log in with your new password.',
    };
    return res.redirect('/login');
  })
);

router.get(
  '/logout',
  (req, res, next) => {    const name = req.session.user ? req.session.user.name : undefined;
    req.session.destroy((err) => {
      if (err) return next(httpError(500, 'Could not log out. Please try again.'));
      res.clearCookie('kamoto.sid');
      return res.render('auth/logout', {
        title: 'Logged Out',
        name,
      });
    });
  }
);

router.post(
  '/logout',
  (req, res, next) => {
    req.session.destroy((err) => {
      if (err) return next(httpError(500, 'Could not log out. Please try again.'));
      res.clearCookie('kamoto.sid');
      return res.redirect('/logout');
    });
  }
);

router.post(
  '/profile/avatar',
  requireAuth,
  uploadImage.single('avatar'),
  csrfProtection,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const user = req.session.user;

    if (req.fileValidationError) {
      req.session.flash = { type: 'error', message: req.fileValidationError };
      return res.redirect('/profile');
    }

    if (!req.file) {
      req.session.flash = { type: 'error', message: 'Please choose an image from your device.' };
      return res.redirect('/profile');
    }

    const stored = await storeUpload(req.file);
    try {
      await db.query('UPDATE users SET avatar_url = $1 WHERE id = $2', [stored.url, user.id]);
    } catch (err) {
      await removeStoredObject(stored.key);
      throw err;
    }
    user.avatar_url = stored.url;

    req.session.flash = { type: 'success', message: 'Your profile photo was updated.' };
    return res.redirect('/profile');
  })
);

router.post(
  '/profile/name',
  requireAuth,
  csrfProtection,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const user = req.session.user;

    const nameError = validateName(req.body.name);
    if (nameError) {
      req.session.flash = { type: 'error', message: nameError };
      return res.redirect('/profile');
    }

    const name = String(req.body.name || '').trim();
    await db.query('UPDATE users SET name = $1 WHERE id = $2', [name, user.id]);
    user.name = name;

    req.session.flash = { type: 'success', message: 'Your profile was updated.' };
    return res.redirect('/profile');
  })
);

router.get(
  '/profile',
  requireAuth,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const user = req.session.user;

    const reviewsRes = await db.query(
      `SELECT rev.id, rev.rating, rev.comment, rev.created_at, rev.restaurant_id,
              r.name AS restaurant_name
       FROM reviews rev
       JOIN restaurants r ON r.id = rev.restaurant_id
       WHERE rev.user_id = $1
       ORDER BY rev.created_at DESC`,
      [user.id]
    );
    const reviews = reviewsRes.rows;

    const restaurants = user.role === 'owner'
      ? (await db.query(
          'SELECT id, name, cuisine, city_area FROM restaurants WHERE owner_id = $1 ORDER BY created_at DESC',
          [user.id]
        )).rows
      : [];

    return res.render('profile', {
      title: 'My Profile',
      currentUser: user,
      user,
      reviews,
      restaurants,
      errors: {},
    });
  })
);

module.exports = router;
