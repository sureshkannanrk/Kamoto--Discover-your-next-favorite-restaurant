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
const { uploadRestaurantMedia, storeUpload, removeStoredObject } = require('../lib/uploads');

const router = express.Router();

function getUploadedFiles(req) {
  const files = req.files || {};
  const cover = (files.image && files.image[0]) || null;
  const menuImages = files.menu_image || [];
  return { cover, menuImages };
}

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

    let where = 'WHERE r.status = $1';
    const params = ['approved'];

    if (q) {
      where += ` AND (r.name ILIKE $${params.length + 1} OR r.cuisine ILIKE $${params.length + 1} OR r.address ILIKE $${params.length + 1} OR r.description ILIKE $${params.length + 1})`;
      params.push(`%${q}%`);
    }
    if (cuisine) {
      where += ` AND r.cuisine = $${params.length + 1}`;
      params.push(cuisine);
    }

    const orderByMap = {
      newest: 'r.created_at DESC, r.id DESC',
      oldest: 'r.created_at ASC, r.id ASC',
      name_asc: 'LOWER(r.name) ASC',
      name_desc: 'LOWER(r.name) DESC',
      rating_desc: 'average_rating DESC, review_count DESC, r.id DESC',
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
    });
  }
);

router.post(
  '/restaurants',
  requireOwner,
  uploadRestaurantMedia,
  csrfProtection,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const ownerId = req.session.user.id;

    const restaurantResult = validateRestaurant(req.body);
    const menuResult = validateMenuItems(req.body.menu_items);
    const { cover, menuImages } = getUploadedFiles(req);

    const errors = { ...restaurantResult.errors, ...menuResult.errors };
    if (req.fileValidationError) errors.image = req.fileValidationError;
    if (!cover) errors.image = 'A cover photo is required. Please upload at least one image.';
    if (menuImages.length === 0) errors.menu_image = 'At least one menu photo is required.';

    if (Object.keys(errors).length > 0) {
      return renderRestaurantForm(
        res,
        {
          editing: false,
          currentUser: req.session.user,
          data: restaurantResult.data,
          menu: req.body.menu_items,
          errors,
        },
        422
      );
    }

    const d = restaurantResult.data;
    const storedCover = await storeUpload(cover);
    const storedMenu = await Promise.all(menuImages.map((f) => storeUpload(f)));
    const client = await db.connect();
    let restaurantId;
    try {
      await client.query('BEGIN');
      const created = await client.query(
        `INSERT INTO restaurants (
           owner_id, name, cuisine, address, phone, description,
           timings, full_address, city_area, landmark, fssai_license,
           seating_capacity, dietary_type, parking_available, amenities,
           website_url, image_url, menu_images, status
         )
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, 'pending')
         RETURNING id`,
        [
          ownerId,
          d.name,
          d.cuisine,
          d.address,
          d.phone,
          d.description,
          d.timings,
          d.fullAddress,
          d.cityArea,
          d.landmark,
          d.fssaiLicense,
          d.seatingCapacity,
          d.dietaryType,
          d.parkingAvailable,
          d.amenities,
          d.websiteUrl,
          storedCover.url,
          storedMenu.map((s) => s.url),
        ]
      );
      restaurantId = Number(created.rows[0].id);

      const insertItem = 'INSERT INTO menu_items (restaurant_id, name, price, description) VALUES ($1, $2, $3, $4)';
      for (const item of menuResult.items) {
        await client.query(insertItem, [restaurantId, item.name, item.price, item.description]);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      await removeStoredObject(storedCover.key);
      for (const s of storedMenu) await removeStoredObject(s.key);
      throw err;
    } finally {
      client.release();
    }

    req.session.flash = {
      type: 'success',
      message: `"${d.name}" was submitted for review. It will go live once approved by an administrator.`,
    };
    return res.redirect('/dashboard');
  })
);

router.get(
  '/restaurants/:id',
  loadRestaurant,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const restaurant = req.restaurant;
    const currentUser = req.session.user || null;

    const isOwnerOf = currentUser && currentUser.role === 'owner' && Number(currentUser.id) === Number(restaurant.owner_id);
    const isAdmin = currentUser && currentUser.role === 'admin';

    if (restaurant.status !== 'approved' && !isOwnerOf && !isAdmin) {
      return res.status(404).render('error', {
        title: 'Restaurant Not Found',
        code: 404,
        message: 'The restaurant you are looking for does not exist or is awaiting approval.',
        showStack: false,
      });
    }

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

    let myReview = null;
    if (currentUser) {
      const myRes = await db.query(
        'SELECT id, rating, comment FROM reviews WHERE restaurant_id = $1 AND user_id = $2',
        [restaurant.id, currentUser.id]
      );
      myReview = myRes.rows[0] || null;
    }

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
    });
  })
);

router.post(
  '/restaurants/:id',
  loadRestaurant,
  requireRestaurantOwner,
  uploadRestaurantMedia,
  csrfProtection,
  asyncHandler(async (req, res) => {
    const db = getDb();
    const restaurant = req.restaurant;

    const restaurantResult = validateRestaurant(req.body);
    const menuResult = validateMenuItems(req.body.menu_items);
    const { cover, menuImages } = getUploadedFiles(req);

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
        },
        422
      );
    }

    const d = restaurantResult.data;
    const storedCover = cover ? await storeUpload(cover) : null;
    const storedMenu = await Promise.all(menuImages.map((f) => storeUpload(f)));
    const imageUrl = storedCover ? storedCover.url : restaurant.image_url;
    const menuImagesUrl = storedMenu.length > 0 ? storedMenu.map((s) => s.url) : restaurant.menu_images || [];
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE restaurants
         SET name = $1, cuisine = $2, address = $3, phone = $4, description = $5,
             timings = $6, full_address = $7, city_area = $8, landmark = $9, fssai_license = $10,
             seating_capacity = $11, dietary_type = $12, parking_available = $13, amenities = $14,
             website_url = $15, image_url = $16, menu_images = $17, status = 'pending',
             rejection_reason = ''
         WHERE id = $18`,
        [
          d.name, d.cuisine, d.address, d.phone, d.description,
          d.timings, d.fullAddress, d.cityArea, d.landmark, d.fssaiLicense,
          d.seatingCapacity, d.dietaryType, d.parkingAvailable, d.amenities,
          d.websiteUrl, imageUrl, menuImagesUrl, restaurant.id,
        ]
      );

      await client.query('DELETE FROM menu_items WHERE restaurant_id = $1', [restaurant.id]);
      const insertItem = 'INSERT INTO menu_items (restaurant_id, name, price, description) VALUES ($1, $2, $3, $4)';
      for (const item of menuResult.items) {
        await client.query(insertItem, [restaurant.id, item.name, item.price, item.description]);
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      if (storedCover) await removeStoredObject(storedCover.key);
      for (const s of storedMenu) await removeStoredObject(s.key);
      throw err;
    } finally {
      client.release();
    }

    req.session.flash = {
      type: 'success',
      message: `"${d.name}" was updated and submitted for review. It will go live once approved by an administrator.`,
    };
    return res.redirect('/dashboard');
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
