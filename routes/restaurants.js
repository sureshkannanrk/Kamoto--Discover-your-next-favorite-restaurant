'use strict';

const express = require('express');
const { getDb } = require('../db/init');
const { asyncHandler, csrfProtection } = require('../middleware/errorHandler');
const {
  requireAuth,
  requireOwner,
  loadRestaurant,
  requireRestaurantOwner,
} = require('../middleware/auth');
const {
  validateRestaurant,
  validateMenuItems,
} = require('../lib/validation');
const { uploadImage, storeUpload, removeStoredObject } = require('../lib/uploads');

const router = express.Router();

async function getRestaurantStats(db, restaurantId) {
  const res = await db.query(
    `SELECT
       COUNT(*) AS review_count,
       COALESCE(AVG(rating), 0) AS average_rating
     FROM reviews WHERE restaurant_id = $1`,
    [restaurantId]
  );
  const row = res.rows[0] || {};
  return {
    reviewCount: row.review_count || 0,
    averageRating: row.average_rating || 0,
  };
}

function renderRestaurantForm(res, opts, statusCode = 200) {
  const data = opts.data || {};
  const menu = opts.menu || [];
  return res.status(statusCode).render(opts.editing ? 'edit-restaurant' : 'add-restaurant', {
    title: opts.editing ? 'Edit Restaurant' : 'Add a Restaurant',
    currentUser: opts.currentUser,
    restaurant: data,
    menu,
    errors: opts.errors || {},
    priceRanges: opts.priceRanges,
  });
}

async function fetchMenu(db, restaurantId) {
  const res = await db.query(
    'SELECT id, name, price, description FROM menu_items WHERE restaurant_id = $1 ORDER BY id ASC',
    [restaurantId]
  );
  return res.rows;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const db = getDb();
    const q = String(req.query.q || '').trim();
    const cuisine = String(req.query.cuisine || '').trim();
    const sort = String(req.query.sort || 'newest').trim();

    let where = 'WHERE 1 = 1';
    const params = [];

    if (q) {
      where += ' AND (r.name ILIKE $1 OR r.cuisine ILIKE $1 OR r.address ILIKE $1 OR r.description ILIKE $1)';
      params.push(`%${q}%`);
    }
    if (cuisine) {
      where += params.length > 0 ? ` AND r.cuisine = $${params.length + 1}` : ' AND r.cuisine = $1';
      params.push(cuisine);
    }

    const orderByMap = {
      newest: 'r.created_at DESC, r.id DESC',
      oldest: 'r.created_at ASC, r.id ASC',
      name_asc: 'LOWER(r.name) ASC',
      name_desc: 'LOWER(r.name) DESC',
      rating_desc: 'average_rating DESC, review_count DESC, r.id DESC',
      price_asc: 'r.price_range ASC, LOWER(r.name) ASC',
      price_desc: 'r.price_range DESC, LOWER(r.name) ASC',
    };
    const orderBy = orderByMap[sort] || orderByMap.newest;

    const restaurantsRes = await db.query(
      `SELECT r.*,
              COUNT(rev.id)                       AS review_count,
              COALESCE(AVG(rev.rating), 0)        AS average_rating
       FROM restaurants r
       LEFT JOIN reviews rev ON rev.restaurant_id = r.id
       ${where}
       GROUP BY r.id
       ORDER BY ${orderBy}`,
      params
    );
    const restaurants = restaurantsRes.rows;

    const cuisinesRes = await db.query('SELECT DISTINCT cuisine FROM restaurants ORDER BY cuisine');
    const cuisines = cuisinesRes.rows.map((r) => r.cuisine);

    return res.render('index', {
      title: 'Kamoto',
      restaurants,
      cuisines,
      query: q,
      selectedCuisine: cuisine,
      sort,
    });
  })
);

router.get(
  '/dashboard',
  requireAuth,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const user = req.session.user;

    if (user.role === 'owner') {
      const restaurantsRes = await db.query(
        `SELECT r.*,
                COUNT(rev.id)                 AS review_count,
                COALESCE(AVG(rev.rating), 0)  AS average_rating
         FROM restaurants r
         LEFT JOIN reviews rev ON rev.restaurant_id = r.id
         WHERE r.owner_id = $1
         GROUP BY r.id
         ORDER BY r.created_at DESC`,
        [user.id]
      );
      const restaurants = restaurantsRes.rows;

      return res.render('dashboard', {
        title: 'My Dashboard',
        role: 'owner',
        restaurants,
      });
    }

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

    return res.render('dashboard', {
      title: 'My Dashboard',
      role: 'customer',
      reviews,
    });
  })
);

router.get(
  '/restaurants/new',
  requireOwner,
  (req, res) => {
    renderRestaurantForm(res, {
      editing: false,
      currentUser: req.session.user,
      data: {},
      menu: [{ name: '', price: '', description: '' }],
      priceRanges: ['$', '$$', '$$$', '$$$$'],
    });
  }
);

router.post(
  '/restaurants',
  requireOwner,
  uploadImage.single('image'),
  csrfProtection,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const ownerId = req.session.user.id;

    const restaurantResult = validateRestaurant(req.body);
    const menuResult = validateMenuItems(req.body.menu_items);

    const errors = { ...restaurantResult.errors, ...menuResult.errors };
    if (req.fileValidationError) errors.image = req.fileValidationError;

    if (Object.keys(errors).length > 0) {
      return renderRestaurantForm(
        res,
        {
          editing: false,
          currentUser: req.session.user,
          data: restaurantResult.data,
          menu: req.body.menu_items,
          errors,
          priceRanges: ['$', '$$', '$$$', '$$$$'],
        },
        422
      );
    }

    const d = restaurantResult.data;
    const stored = req.file ? await storeUpload(req.file) : null;
    const client = await db.connect();
    let restaurantId;
    try {
      await client.query('BEGIN');
      const created = await client.query(
        `INSERT INTO restaurants (owner_id, name, cuisine, address, phone, price_range, description, image_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [ownerId, d.name, d.cuisine, d.address, d.phone, d.priceRange, d.description, stored ? stored.url : '']
      );
      restaurantId = Number(created.rows[0].id);

      const insertItem = 'INSERT INTO menu_items (restaurant_id, name, price, description) VALUES ($1, $2, $3, $4)';
      for (const item of menuResult.items) {
        await client.query(insertItem, [restaurantId, item.name, item.price, item.description]);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      if (stored) await removeStoredObject(stored.key);
      throw err;
    } finally {
      client.release();
    }

    req.session.flash = {
      type: 'success',
      message: `"${d.name}" was added successfully.`,
    };
    return res.redirect(`/restaurants/${restaurantId}`);
  })
);

router.get(
  '/restaurants/:id',
  loadRestaurant,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const restaurant = req.restaurant;

    const stats = await getRestaurantStats(db, restaurant.id);
    const menu = await fetchMenu(db, restaurant.id);
    const reviewsRes = await db.query(
      `SELECT rev.*, u.name AS author_name, u.avatar_url AS author_avatar
       FROM reviews rev
       JOIN users u ON u.id = rev.user_id
       WHERE rev.restaurant_id = $1
       ORDER BY rev.created_at DESC, rev.id DESC`,
      [restaurant.id]
    );
    const reviews = reviewsRes.rows;

    const currentUser = req.session.user || null;
    let myReview = null;
    if (currentUser) {
      const myRes = await db.query(
        'SELECT id, rating, comment FROM reviews WHERE restaurant_id = $1 AND user_id = $2',
        [restaurant.id, currentUser.id]
      );
      myReview = myRes.rows[0] || null;
    }

    const isOwnerOf = currentUser && currentUser.role === 'owner' && currentUser.id === restaurant.owner_id;

    return res.render('restaurant', {
      title: restaurant.name,
      restaurant,
      menu,
      reviews,
      stats,
      myReview,
      isOwnerOf,
    });
  })
);

router.get(
  '/restaurants/:id/edit',
  loadRestaurant,
  requireRestaurantOwner,
  asyncHandler(async (req, res) => {
    const menu = await fetchMenu(getDb(), req.restaurant.id);
    renderRestaurantForm(res, {
      editing: true,
      currentUser: req.session.user,
      data: req.restaurant,
      menu,
      priceRanges: ['$', '$$', '$$$', '$$$$'],
    });
  })
);

router.post(
  '/restaurants/:id',
  loadRestaurant,
  requireRestaurantOwner,
  uploadImage.single('image'),
  csrfProtection,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const restaurant = req.restaurant;

    const restaurantResult = validateRestaurant(req.body);
    const menuResult = validateMenuItems(req.body.menu_items);

    const errors = { ...restaurantResult.errors, ...menuResult.errors };
    if (req.fileValidationError) errors.image = req.fileValidationError;

    if (Object.keys(errors).length > 0) {
      return renderRestaurantForm(
        res,
        {
          editing: true,
          currentUser: req.session.user,
          data: { ...restaurant, ...restaurantResult.data },
          menu: req.body.menu_items,
          errors,
          priceRanges: ['$', '$$', '$$$', '$$$$'],
        },
        422
      );
    }

    const d = restaurantResult.data;
    const stored = req.file ? await storeUpload(req.file) : null;
    const imageUrl = stored ? stored.url : restaurant.image_url;
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE restaurants
         SET name = $1, cuisine = $2, address = $3, phone = $4, price_range = $5, description = $6, image_url = $7
         WHERE id = $8`,
        [d.name, d.cuisine, d.address, d.phone, d.priceRange, d.description, imageUrl, restaurant.id]
      );

      await client.query('DELETE FROM menu_items WHERE restaurant_id = $1', [restaurant.id]);
      const insertItem = 'INSERT INTO menu_items (restaurant_id, name, price, description) VALUES ($1, $2, $3, $4)';
      for (const item of menuResult.items) {
        await client.query(insertItem, [restaurant.id, item.name, item.price, item.description]);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      if (stored) await removeStoredObject(stored.key);
      throw err;
    } finally {
      client.release();
    }

    req.session.flash = {
      type: 'success',
      message: `"${d.name}" was updated successfully.`,
    };
    return res.redirect(`/restaurants/${restaurant.id}`);
  })
);

router.post(
  '/restaurants/:id/delete',
  loadRestaurant,
  requireRestaurantOwner,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const restaurant = req.restaurant;
    await db.query('DELETE FROM restaurants WHERE id = $1', [restaurant.id]);
    req.session.flash = { type: 'success', message: `"${restaurant.name}" was deleted.` };
    return res.redirect('/dashboard');
  })
);

module.exports = router;
