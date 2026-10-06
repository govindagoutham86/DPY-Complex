# DPY Complex — backend + live shop directory

A Node.js/Express API and SQLite database powering the DPY Complex website, including the live shop directory and leasing enquiry form.

## What it does

- `GET /api/health` — API health check.
- `GET /api/shops` — returns the current shop rows directly from SQLite.
- `GET /api/shops/:id` — returns one shop directly from SQLite.
- `POST /api/inquiries` — validates and saves a leasing enquiry, including the selected shop, then attempts email notification and customer acknowledgement.
- Admin shop routes — create, update, and delete shops using `x-admin-token`.
- Admin enquiry routes — list enquiries and update their status.

## Live database-driven website

The shop directory in `index.html` is no longer a second source of truth. The page loads `GET /api/shops` and renders the returned rows. It also refreshes the shop data every 15 seconds.

The initial database seed preserves the original six shop entries that were present in the supplied HTML:

- G01 — Hotel Reddy's — Dine-In & restaurant — 1,040 sq ft — Leased
- G05 — Coming soon — TBD — 920 sq ft — Leased
- G06 — Game Zone — Entertainment — 3,200 sq ft — Leased
- G07 — Office — Salon & spa — 1,100 sq ft — Available
- G08 — Family entertainment bay — Leisure — 4,600 sq ft — Coming soon
- F09 — Lifestyle homeware — Home & living — 1,400 sq ft — Available

After the initial seed, SQLite is the source of truth. Updating a shop through the admin API or directly in the database will be reflected by the website on its next refresh.

## Setup

1. Install Node.js 18+.
2. Run `npm install`.
3. Copy `.env.example` to `.env` and fill in the real values.
4. Run `npm start`.
5. Open `http://localhost:4000` to use the website and API from the same origin.

If you serve the HTML separately during development, set `CORS_ORIGIN` to that frontend origin. For a separate production frontend/API deployment, define `window.DPY_API_BASE` before the main script or change the deployment configuration accordingly.

## Email

SMTP is optional for database storage, but required for leasing-team and customer email notifications. Gmail requires an App Password rather than the normal account password.

If SMTP is unavailable, the enquiry is still saved and the API reports that email notification was unavailable.

## SQLite

The default database path is `./data/dpy-complex.db`. Set `DB_PATH` in `.env` to use another persistent location.

SQLite requires persistent disk storage in production. If the hosting platform uses ephemeral storage, use a persistent volume or migrate the database to a hosted database such as PostgreSQL.

## Security

- Keep `.env` out of Git.
- Use a long random `ADMIN_TOKEN`.
- Set `CORS_ORIGIN` to the real frontend origin in production.
- Public enquiries are rate-limited.
- Backend validation is always applied even if frontend validation is bypassed.
