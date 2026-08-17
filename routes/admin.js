'use strict';

const express = require('express');
const { getDb } = require('../db/init');
const { asyncHandler } = require('../middleware/errorHandler');
const { isAdmin } = require('../middleware/auth');
const { sendSubmissionDecision } = require('../lib/mailer');

const router = express.Router();

router.use(isAdmin);

async function loadRestaurantWithOwner(db, id) {
  const res = await db.query(
    `SELECT r.*, u.email AS owner_email, u.name AS owner_name
     FROM restaurants r
     JOIN users u ON u.id = r.owner_id
     WHERE r.id = $1`,
    [id]
  );
  return res.rows[0] || null;
}

async function notifyOwner(row, decision, rejectionReason) {
  try {
    await sendSubmissionDecision(row.owner_email, row.name, decision, rejectionReason);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[admin] Failed to send decision email:', err.message);
  }
}

router.get(
  '/admin/restaurants',
  asyncHandler(async (req, res) => {
    const db = getDb();
    const filter = String(req.query.status || 'pending').trim();
    const validFilters = ['pending', 'approved', 'rejected', 'all'];
    const status = validFilters.includes(filter) ? filter : 'pending';

    const params = [];
    let where = '';
    if (status !== 'all') {
      where = 'WHERE r.status = $1';
      params.push(status);
    }

    const restaurantsRes = await db.query(
      `SELECT r.*,
              u.name AS owner_name,
              u.email AS owner_email,
              COUNT(rev.id)                       AS review_count,
              COALESCE(AVG(rev.rating), 0)        AS average_rating
       FROM restaurants r
       JOIN users u ON u.id = r.owner_id
       LEFT JOIN reviews rev ON rev.restaurant_id = r.id
       ${where}
       GROUP BY r.id, u.name, u.email
       ORDER BY
         CASE r.status WHEN 'pending' THEN 0 WHEN 'rejected' THEN 1 ELSE 2 END,
         r.created_at DESC`,
      params
    );

    const countsRes = await db.query(
      `SELECT status, COUNT(*)::int AS c
       FROM restaurants
       GROUP BY status`
    );
    const counts = { pending: 0, approved: 0, rejected: 0 };
    for (const row of countsRes.rows) counts[row.status] = row.c;

    return res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      restaurants: restaurantsRes.rows,
      status,
      counts,
    });
  })
);

router.post(
  '/admin/restaurants/:id/approve',
  asyncHandler(async (req, res) => {
    const db = getDb();
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      req.session.flash = { type: 'error', message: 'Invalid restaurant id.' };
      return res.redirect('/admin/restaurants');
    }

    const row = await loadRestaurantWithOwner(db, id);
    if (!row) {
      req.session.flash = { type: 'error', message: 'Restaurant not found.' };
      return res.redirect('/admin/restaurants');
    }

    await db.query(
      "UPDATE restaurants SET status = 'approved', rejection_reason = '' WHERE id = $1",
      [id]
    );

    await notifyOwner(row, 'approved', '');
    req.session.flash = { type: 'success', message: `"${row.name}" was approved, went live, and the owner was notified.` };
    return res.redirect('/admin/restaurants');
  })
);

router.post(
  '/admin/restaurants/:id/reject',
  asyncHandler(async (req, res) => {
    const db = getDb();
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      req.session.flash = { type: 'error', message: 'Invalid restaurant id.' };
      return res.redirect('/admin/restaurants');
    }

    const reason = String(req.body.rejection_reason || '').trim();
    if (!reason) {
      req.session.flash = { type: 'error', message: 'Please provide a rejection reason.' };
      return res.redirect(`/admin/restaurants?status=${req.query.status || 'pending'}#reject-${id}`);
    }
    if (reason.length > 1000) {
      req.session.flash = { type: 'error', message: 'Rejection reason must be 1000 characters or fewer.' };
      return res.redirect(`/admin/restaurants?status=${req.query.status || 'pending'}#reject-${id}`);
    }

    const row = await loadRestaurantWithOwner(db, id);
    if (!row) {
      req.session.flash = { type: 'error', message: 'Restaurant not found.' };
      return res.redirect('/admin/restaurants');
    }

    await db.query(
      'UPDATE restaurants SET status = $1, rejection_reason = $2 WHERE id = $3',
      ['rejected', reason, id]
    );

    await notifyOwner(row, 'rejected', reason);
    req.session.flash = { type: 'success', message: `"${row.name}" was rejected and the owner was notified.` };
    return res.redirect('/admin/restaurants');
  })
);

module.exports = router;