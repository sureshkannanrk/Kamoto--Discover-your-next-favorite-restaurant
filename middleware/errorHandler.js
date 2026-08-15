'use strict';

const crypto = require('crypto');
const config = require('../config');

/**
 * Wrap an async route handler so rejected promises are forwarded to Express'
 * error-handling middleware instead of crashing the process.
 */
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Generate a per-session CSRF token and expose it to templates. Run before
 * routes that render forms.
 */
function csrf(req, res, next) {
  if (!req.session) return next();
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  return next();
}

/**
 * Validate the CSRF token on state-changing (POST) requests.
 */
function csrfProtection(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();

  const token = req.body && req.body._csrf;
  if (!token || !req.session || token !== req.session.csrfToken) {
    return res.status(403).render('error', {
      title: 'Forbidden',
      code: 403,
      message: 'Invalid or expired security token. Please go back and try again.',
      showStack: false,
    });
  }
  return next();
}

/**
 * Handles requests to unknown routes.
 */
function notFound(req, res) {
  res.status(404).render('error', {
    title: 'Page Not Found',
    code: 404,
    message: 'The page you requested could not be found.',
    showStack: false,
  });
}

/**
 * Central error handler. Catches everything thrown/rejected earlier in the
 * chain and renders a friendly page while logging the real cause.
 */
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  // eslint-disable-next-line no-console
  console.error('[error]', err);

  let code;
  let message;

  if (err && err.code === 'LIMIT_FILE_SIZE') {
    code = 400;
    message = 'The selected image is larger than 5 MB. Please choose a smaller file.';
  } else {
    const isClientError =
      err && err.statusCode && err.statusCode >= 400 && err.statusCode < 500;
    code = isClientError ? err.statusCode : 500;
    message = isClientError ? err.message : 'Something went wrong on our end. Please try again later.';
  }

  const showStack = !config.isProduction && code >= 500;

  if (res.headersSent) {
    return next(err);
  }

  return res.status(code).render('error', {
    title: code >= 500 ? 'Server Error' : 'Request Error',
    code,
    message,
    showStack,
  });
}

/**
 * Small helper to construct consistent client-error objects.
 */
function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

module.exports = {
  asyncHandler,
  csrf,
  csrfProtection,
  notFound,
  errorHandler,
  httpError,
};