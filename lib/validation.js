'use strict';

const config = require('../config');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function requireFields(body, fields) {
  const errors = {};
  for (const field of fields) {
    const value = body[field];
    if (value === undefined || String(value).trim() === '') {
      errors[field] = 'This field is required.';
    }
  }
  return errors;
}

function validateName(value) {
  const name = String(value || '').trim();
  if (!name) return 'Name is required.';
  if (name.length > 100) return 'Name must be 100 characters or fewer.';
  return null;
}

function validateEmail(value) {
  const email = String(value || '').trim();
  if (!email) return 'Email is required.';
  if (email.length > 255) return 'Email is too long.';
  if (!EMAIL_RE.test(email)) return 'Please enter a valid email address.';
  return null;
}

function validatePassword(value) {
  const password = String(value || '');
  if (!password) return 'Password is required.';
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (password.length > 128) return 'Password must be 128 characters or fewer.';
  return null;
}

function validateRole(value) {
  if (value !== 'customer' && value !== 'owner') {
    return 'Please choose a valid account type.';
  }
  return null;
}

function validateRestaurant(body) {
  const errors = {};
  const name = String(body.name || '').trim();
  const cuisine = String(body.cuisine || '').trim();
  const address = String(body.address || '').trim();
  const phone = String(body.phone || '').trim();
  const priceRange = String(body.price_range || '').trim();
  const description = String(body.description || '').trim();

  if (!name) errors.name = 'Restaurant name is required.';
  else if (name.length > 100) errors.name = 'Name must be 100 characters or fewer.';

  if (!cuisine) errors.cuisine = 'Cuisine type is required.';
  else if (cuisine.length > 60) errors.cuisine = 'Cuisine must be 60 characters or fewer.';

  if (!address) errors.address = 'Address is required.';
  else if (address.length > 255) errors.address = 'Address must be 255 characters or fewer.';

  if (!phone) errors.phone = 'Phone number is required.';
  else if (phone.length > 30) errors.phone = 'Phone number must be 30 characters or fewer.';

  if (!priceRange) errors.price_range = 'Please choose a price range.';
  else if (!config.priceRanges.includes(priceRange)) errors.price_range = 'Invalid price range selected.';

  if (description.length > 2000) errors.description = 'Description must be 2000 characters or fewer.';

  return {
    errors,
    data: { name, cuisine, address, phone, priceRange, description },
  };
}

function validateMenuItems(rawItems) {
  const errors = {};
  const items = [];
  const limit = config.maxMenuItems;

  if (!rawItems || rawItems.length === 0) {
    errors.menu_items = 'Please add at least one menu item with a name and price.';
    return { errors, items };
  }

  const list = Array.isArray(rawItems) ? rawItems : [rawItems];

  if (list.length > limit) {
    errors.menu_items = `You can add at most ${limit} menu items per restaurant.`;
    return { errors, items };
  }

  for (let i = 0; i < list.length; i++) {
    const raw = list[i] || {};
    const name = String(raw.name || '').trim();
    const price = String(raw.price || '').trim();
    const description = String(raw.description || '').trim();
    const key = `item_${i}`;

    if (!name) {
      errors[key] = `Item #${i + 1}: name is required.`;
      continue;
    }
    if (name.length > 100) {
      errors[key] = `Item #${i + 1}: name must be 100 characters or fewer.`;
      continue;
    }
    if (!price) {
      errors[key] = `Item #${i + 1}: price is required.`;
      continue;
    }
    const priceNum = Number(price);
    if (!Number.isFinite(priceNum) || priceNum < 0 || priceNum > 99999) {
      errors[key] = `Item #${i + 1}: price must be a number between 0 and 99999.`;
      continue;
    }
    if (description.length > 300) {
      errors[key] = `Item #${i + 1}: description must be 300 characters or fewer.`;
      continue;
    }

    items.push({ name, price: Math.round(priceNum * 100) / 100, description });
  }

  if (items.length === 0) {
    errors.menu_items = 'Please add at least one valid menu item.';
  }

  return { errors, items };
}

function validateReview(body) {
  const errors = {};
  const rating = Number(body.rating);
  const comment = String(body.comment || '').trim();

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    errors.rating = 'Please select a rating between 1 and 5 stars.';
  }

  if (comment && comment.length > config.maxReviewLength) {
    errors.comment = `Comment must be ${config.maxReviewLength} characters or fewer.`;
  }

  return { errors, data: { rating, comment } };
}

module.exports = {
  validateName,
  validateEmail,
  validatePassword,
  validateRole,
  validateRestaurant,
  validateMenuItems,
  validateReview,
  requireFields,
};