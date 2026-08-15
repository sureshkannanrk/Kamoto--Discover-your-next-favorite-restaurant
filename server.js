'use strict';

const path = require('path');
const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const config = require('./config');
const { seed, verify, getDb } = require('./db/init');
const { loadUser } = require('./middleware/auth');
const { csrf, csrfProtection, notFound, errorHandler } = require('./middleware/errorHandler');

const authRoutes = require('./routes/auth');
const restaurantRoutes = require('./routes/restaurants');
const reviewRoutes = require('./routes/reviews');

function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('view engine', 'ejs');
  app.set('views', config.viewsPath);
  app.set('trust proxy', 1);

  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(express.json({ limit: '1mb' }));

  app.use(
    session({
      store: new pgSession({
        pool: getDb(),
        tableName: 'session',
        createTableIfMissing: true,
        ttl: Math.floor(config.sessionMaxAge / 1000),
      }),
      name: 'kamoto.sid',
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: config.sessionMaxAge,
        secure: config.isProduction,
      },
    })
  );

  app.use(loadUser);
  app.use(csrf);

  app.use(
    express.static(config.publicPath, {
      maxAge: config.isProduction ? '7d' : 0,
    })
  );

  app.use((req, res, next) => {
    if (req.is('multipart/form-data')) return next();
    return csrfProtection(req, res, next);
  });

  app.use('/', authRoutes);
  app.use('/', restaurantRoutes);
  app.use('/', reviewRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

async function start() {
  try {
    await verify();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[db] PostgreSQL connection/schema check failed:', err.message);
    process.exit(1);
  }

  await seed();

  const app = createApp();
  const server = app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Kamoto is running at http://localhost:${config.port}`);
  });

  process.on('unhandledRejection', (err) => {
    // eslint-disable-next-line no-console
    console.error('[unhandledRejection]', err);
    server.close(() => process.exit(1));
    setTimeout(() => process.exit(1), 1000).unref();
  });

  process.on('SIGTERM', () => server.close(() => process.exit(0)));
  process.on('SIGINT', () => server.close(() => process.exit(0)));
}

if (require.main === module) {
  start();
}

module.exports = { createApp, start };