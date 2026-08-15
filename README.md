# Kamoto

A dynamic restaurant discovery website. Restaurant owners list their restaurants
with menus and prices; customers read reviews, menus, and prices before choosing
where to eat.

## Features

- **Restaurant listing** — browse all restaurants with cuisine, price range, and
  average rating (starts empty until owners add their first restaurants).
- **Search & filter** — search by name, cuisine, address, or description, and
  filter by cuisine.
- **Owner accounts** — create, edit, and delete your own restaurants, including
  menu items and prices.
- **Customer accounts** — view restaurant details (about, menu, prices) and post,
  edit, or delete your own reviews (1–5 star rating + optional comment).
- **Authentication** — session-based login with bcrypt-hashed passwords.
- **Robust error handling** — per-field validation, 404/403/400/500 pages,
  CSRF protection, and a global error handler.

## Tech Stack

- Node.js + Express
- PostgreSQL (Supabase) via `pg`
- EJS server-rendered templates
- `express-session` + `bcryptjs`

## Getting Started

Prerequisites: Node.js 18+.

```bash
npm install
npm start
```

Open http://localhost:3000

## Demo Accounts

Seeded automatically on first run (with no restaurants, so you can add your own):

| Role    | Email                  | Password      |
| ------- | ---------------------- | ------------- |
| Owner   | `owner@kamoto.test`    | `Owner123!`   |
| Customer| `customer@kamoto.test` | `Customer123!`|

You can also register new accounts from the sign-up page.

## Project Structure

```
server.js                  # entry point, session & middleware wiring
config.js                  # port, session, DB settings
db/init.js                 # PostgreSQL pool + demo account seeding
middleware/auth.js         # auth guards & restaurant ownership checks
middleware/errorHandler.js # CSRF, 404, global error handler
lib/validation.js          # server-side validators
routes/auth.js             # register / login / logout
routes/restaurants.js      # list, detail, add/edit/delete restaurants
routes/reviews.js          # add/edit/delete reviews
views/                     # EJS templates
public/                    # CSS + client-side JS
```

## Configuration

Environment variables:

- `DATABASE_URL` — required. PostgreSQL connection string, e.g. a Supabase pooler
  URL (`postgresql://postgres.<project>:<password>@<host>:5432/postgres`).
- `DATABASE_SSL=false` — disable SSL if connecting without TLS (not recommended).
- `PORT` — server port (default `3000`)
- `SESSION_SECRET` — session signing secret (set a strong value in production)
- `NODE_ENV=production` — enables secure cookies and static-file caching

The database schema is managed via `db/migrations/001_create_schema.sql`; run it
against your PostgreSQL instance before first start. Demo accounts are seeded
idempotently on start (only if their email does not already exist).

## Error Handling

- **Validation** — every form is validated server-side; errors are shown inline
  next to the offending field.
- **401 / login required** — guests are redirected to the login page with a message.
- **403 / forbidden** — owners cannot edit others' restaurants; customers cannot
  edit others' reviews.
- **404** — friendly page for missing restaurants and unknown routes.
- **500** — friendly page for unexpected errors; details are logged to the console.
- **CSRF** — all POST/PUT/PATCH/DELETE requests require a per-session token.