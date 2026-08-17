'use strict';

const config = require('../config');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_RE = /^[6-9]\d{9}$/;

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

const URL_RE = /^(https?:\/\/)[^\s.]+\.[^\s]{2,}/i;
const VALID_DIETARY = ['pure_veg', 'non_veg', 'veg_non_veg'];
const MAX_MENU_PHOTOS = 5;

function validateRestaurant(body) {
  const errors = {};
  const name = String(body.name || '').trim().toUpperCase();
  const cuisine = String(body.cuisine || '').trim();
  const phone = String(body.phone || '').trim();
  const description = String(body.description || '').trim();

  const timings = String(body.timings || '').trim();
  const fullAddress = String(body.full_address || '').trim();
  const cityArea = String(body.city_area || '').trim();
  const landmark = String(body.landmark || '').trim();
  const fssaiLicense = String(body.fssai_license || '').trim();
  const seatingCapacity = String(body.seating_capacity || '').trim();
  const dietaryType = String(body.dietary_type || '').trim();
  const parkingAvailable = String(body.parking_available || '').trim();
  const amenities = String(body.amenities || '').trim();
  const websiteUrl = String(body.website_url || '').trim();

  // The address column (used for search) is derived from the detailed fields.
  const address = [fullAddress, cityArea].filter(Boolean).join(', ');

  if (!name) errors.name = 'Restaurant name is required.';
  else if (name.length < 3) errors.name = 'Restaurant name must be at least 3 characters.';
  else if (name.length > 100) errors.name = 'Name must be 100 characters or fewer.';

  if (!cuisine) errors.cuisine = 'Cuisine type is required.';
  else if (cuisine.length > 60) errors.cuisine = 'Cuisine must be 60 characters or fewer.';

  if (!fullAddress) errors.full_address = 'Full / street address is required.';
  else if (fullAddress.length > 500) errors.full_address = 'Address must be 500 characters or fewer.';

  if (!phone) errors.phone = 'Mobile number is required.';
  else if (!MOBILE_RE.test(phone)) errors.phone = 'Please enter a valid 10-digit mobile number.';

  if (!timings) errors.timings = 'Opening hours are required.';
  else if (timings.length > 60) errors.timings = 'Timings must be 60 characters or fewer.';

  if (!cityArea) errors.city_area = 'City / locality is required.';
  else if (cityArea.length > 100) errors.city_area = 'City / locality must be 100 characters or fewer.';

  if (landmark.length > 150) errors.landmark = 'Landmark must be 150 characters or fewer.';
  if (fssaiLicense.length > 30) errors.fssai_license = 'FSSAI license must be 30 characters or fewer.';

  let seating = 0;
  if (seatingCapacity) {
    seating = Number(seatingCapacity);
    if (!Number.isInteger(seating) || seating < 0 || seating > 10000) {
      errors.seating_capacity = 'Seating capacity must be a whole number between 0 and 10000.';
    }
  }

  if (dietaryType && !VALID_DIETARY.includes(dietaryType)) {
    errors.dietary_type = 'Please choose a valid dietary type.';
  }

  if (parkingAvailable && !['yes', 'no'].includes(parkingAvailable)) {
    errors.parking_available = 'Please choose Yes or No for parking.';
  }

  if (amenities.length > 500) errors.amenities = 'Amenities must be 500 characters or fewer.';

  if (websiteUrl && !URL_RE.test(websiteUrl)) {
    errors.website_url = 'Please enter a valid URL starting with http:// or https://.';
  }

  if (description.length > 2000) errors.description = 'Description must be 2000 characters or fewer.';

  return {
    errors,
    data: {
      name,
      cuisine,
      address,
      phone,
      description,
      timings,
      fullAddress,
      cityArea,
      landmark,
      fssaiLicense,
      seatingCapacity: seating,
      dietaryType,
      parkingAvailable: parkingAvailable === 'yes',
      amenities,
      websiteUrl,
    },
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