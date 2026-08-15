'use strict';

const bcrypt = require('bcryptjs');
const { getDb } = require('../db/init');

/**
 * Attach the logged-in user (if any) to res.locals for every view.
 */
function loadUser(req, res, next) {
  res.locals.currentUser = req.session.user || null;
  res.locals.flash = req.session.flash || {};
  delete req.session.flash;
  next();
}

/**
 * Redirect guests to the login page.
 */
function requireAuth(req, res, next) {
  if (!req.session.user) {
    req.session.flash = { type: 'error', message: 'Please log in to continue.' };
    return res.redirect('/login');
  }
  return next();
}

/**
 * Restrict a route to customer accounts only.
 */
function requireCustomer(req, res, next) {
  if (!req.session.user) {
    req.session.flash = { type: 'error', message: 'Please log in to continue.' };
    return res.redirect('/login');
  }
  if (req.session.user.role !== 'customer') {
    req.session.flash = { type: 'error', message: 'This action is only available to customer accounts.' };
    return res.redirect('/dashboard');
  }
  return next();
}

/**
 * Restrict a route to restaurant owner accounts only.
 */
function requireOwner(req, res, next) {
  if (!req.session.user) {
    req.session.flash = { type: 'error', message: 'Please log in to continue.' };
    return res.redirect('/login');
  }
  if (req.session.user.role !== 'owner') {
    req.session.flash = { type: 'error', message: 'This action is only available to restaurant owners.' };
    return res.redirect('/dashboard');
  }
  return next();
}

/**
 * Fetch a restaurant by id, ensuring it exists. On success attaches the row
 * to req.restaurant and calls next(); otherwise responds with a 404 page.
 */
async function loadRestaurant(req, res, next) {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).render('error', {
      title: 'Bad Request',
      code: 400,
      message: 'The restaurant id supplied is invalid.',
      showStack: false,
    });
  }

  let restaurant;
  try {
    const result = await getDb().query('SELECT * FROM restaurants WHERE id = $1', [id]);
    restaurant = result.rows[0];
  } catch (err) {
    return next(err);
  }

  if (!restaurant) {
    return res.status(404).render('error', {
      title: 'Restaurant Not Found',
      code: 404,
      message: 'The restaurant you are looking for does not exist or has been removed.',
      showStack: false,
    });
  }

  req.restaurant = restaurant;
  return next();
}

/**
 * Ensure the currently logged-in owner owns the restaurant loaded by
 * loadRestaurant. Call after loadRestaurant.
 */
function requireRestaurantOwner(req, res, next) {
  const user = req.session.user;
  if (!user) {
    req.session.flash = { type: 'error', message: 'Please log in to continue.' };
    return res.redirect('/login');
  }
  if (user.role !== 'owner' || req.restaurant.owner_id !== user.id) {
    req.session.flash = {
      type: 'error',
      message: 'You are not allowed to modify this restaurant.',
    };
    return res.redirect('/restaurants/' + req.restaurant.id);
  }
  return next();
}

/**
 * Compare a plaintext password against a bcrypt hash.
 */
function verifyPassword(plain, hash) {
  try {
    return bcrypt.compareSync(plain, hash);
  } catch (err) {
    return false;
  }
}

module.exports = {
  loadUser,
  requireAuth,
  requireCustomer,
  requireOwner,
  loadRestaurant,
  requireRestaurantOwner,
  verifyPassword,
};
