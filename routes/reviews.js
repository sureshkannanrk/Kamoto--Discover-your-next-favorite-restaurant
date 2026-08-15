'use strict';

const express = require('express');
const { getDb } = require('../db/init');
const { asyncHandler, httpError } = require('../middleware/errorHandler');
const { requireCustomer, loadRestaurant } = require('../middleware/auth');
const { validateReview } = require('../lib/validation');

const router = express.Router();

async function loadOwnReview(req, res, next) {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return next(httpError(400, 'The review id supplied is invalid.'));
  }

  let review;
  try {
    const result = await getDb().query('SELECT * FROM reviews WHERE id = $1', [id]);
    review = result.rows[0];
  } catch (err) {
    return next(err);
  }

  if (!review) {
    return next(httpError(404, 'The review you are looking for does not exist.'));
  }
  if (!req.session.user || Number(req.session.user.id) !== Number(review.user_id)) {
    return next(httpError(403, 'You are not allowed to modify this review.'));
  }

  req.review = review;
  return next();
}

router.post(
  '/restaurants/:id/reviews',
  loadRestaurant,
  requireCustomer,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const restaurant = req.restaurant;
    const userId = req.session.user.id;

    const { errors, data } = validateReview(req.body);

    if (Object.keys(errors).length > 0) {
      req.session.flash = { type: 'error', message: Object.values(errors)[0] };
      return res.redirect(`/restaurants/${restaurant.id}`);
    }

    const existing = await db.query(
      'SELECT id FROM reviews WHERE restaurant_id = $1 AND user_id = $2',
      [restaurant.id, userId]
    );

    if (existing.rows.length > 0) {
      req.session.flash = {
        type: 'error',
        message: 'You have already reviewed this restaurant. Please edit your existing review instead.',
      };
      return res.redirect(`/restaurants/${restaurant.id}`);
    }

    await db.query(
      'INSERT INTO reviews (restaurant_id, user_id, rating, comment) VALUES ($1, $2, $3, $4)',
      [restaurant.id, userId, data.rating, data.comment]
    );

    req.session.flash = { type: 'success', message: 'Your review was published.' };
    return res.redirect(`/restaurants/${restaurant.id}`);
  })
);

router.post(
  '/reviews/:id',
  loadOwnReview,
  requireCustomer,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const review = req.review;

    const { errors, data } = validateReview(req.body);
    if (Object.keys(errors).length > 0) {
      req.session.flash = { type: 'error', message: Object.values(errors)[0] };
      return res.redirect(`/restaurants/${review.restaurant_id}`);
    }

    await db.query(
      'UPDATE reviews SET rating = $1, comment = $2 WHERE id = $3',
      [data.rating, data.comment, review.id]
    );

    req.session.flash = { type: 'success', message: 'Your review was updated.' };
    return res.redirect(`/restaurants/${review.restaurant_id}`);
  })
);

router.post(
  '/reviews/:id/delete',
  loadOwnReview,
  requireCustomer,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const review = req.review;
    await db.query('DELETE FROM reviews WHERE id = $1', [review.id]);
    req.session.flash = { type: 'success', message: 'Your review was deleted.' };
    return res.redirect(`/restaurants/${review.restaurant_id}`);
  })
);

module.exports = router;
