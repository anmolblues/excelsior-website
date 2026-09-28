# Excelsior Enrichment Program — Website

A full website for Excelsior Enrichment Program with:

- **Class listings** pulled from a real backend (search, subject/format/age/price filters)
- **Sign up / Log in** for parents (secure password hashing + sessions)
- **Booking ("Enroll")** flow — logged-in parents enroll a student in a class, with capacity limits
- **My Bookings** page for parents to view/cancel their bookings
- **Workshop Events** (`/calendar.html`) — events are edited in a Google Sheet, but registering
  requires the same account as classes do, so a signed-in parent's info pre-fills every time
- **Admin panel** (`/admin.html`) to add, edit, and delete classes, and view all bookings and event registrations

## 1. Requirements

- [Node.js](https://nodejs.org/) version 18 or newer (you have v22 — perfect)

## 2. Setup (one-time)

Open a terminal in this folder and run:

```bash
npm install
npm run seed
```

`npm run seed` does two things:
1. Creates a starter **admin account**. It will print something like:
   ```
   Created admin account:
     email: admin@excelsiorenrichment.example
     password: ChangeMe123!
     (change this password after logging in!)
   ```
   **Write this down** — you'll use it to log into `/admin.html`. Change the password
   right away (see "Changing the admin password" below).
2. Adds a handful of sample classes so the site isn't empty on first run. If you'd
   rather start with zero classes, delete the contents of `data/classes.json`
   (replace with `[]`) before running the seed, or just delete all the sample
   classes from the admin panel afterward.

## 3. Run the site

```bash
npm start
```

Then open:
- **Website:** http://localhost:3000
- **Admin panel:** http://localhost:3000/admin.html

Press `Ctrl+C` in the terminal to stop the server.

## 4. How data is stored

This project stores everything in a single SQLite database file at
`data/eep.db` (tables: `users`, `classes`, `bookings`, `eventRegistrations`,
plus an internal `counters` table for auto-incrementing ids). SQLite is a
real, embedded SQL database — no separate database server to run or
configure — and `data/eep.db` is git-ignored, so it's never committed.

(Workshop Events themselves — the actual list of sessions people register
for — are the one thing that's *not* in this database. They're still
managed in a Google Sheet; see "Workshop Events registrations" below.)

The database and its schema are created automatically the first time the
app runs (`node server.js` or `npm run seed`) — there's no separate
"create the database" step.

**Migrating from an older JSON-file version of this project:** if you have
existing `data/users.json`, `data/classes.json`, and/or `data/bookings.json`
files (from before this project used SQLite), run this once:

```bash
npm run migrate
```

This imports their contents into `data/eep.db` and preserves ids (so
existing bookings still point at the right class/user). It's safe to run
more than once — it only imports a table if `data/eep.db` doesn't already
have rows in it, and it refuses (with a clear error) rather than silently
corrupting data if a JSON file has a duplicate `id` in it. The old JSON
files are left untouched; once you've confirmed the site works correctly,
you can archive or delete them.

**Reference: what a `users` row looks like.** This is for documentation only —
the app reads/writes this via `db.js`, not a JSON file; there's no `data/users.json`
in this project anymore (see below).

```json
{
  "id": 1,
  "name": "Admin",
  "email": "admin@eepcenter.com",
  "passwordHash": "<bcrypt hash — never plain text, never committed to git>",
  "role": "admin",
  "createdAt": "2026-01-01T00:00:00.000Z"
}
```

`data/users.json` existed very early in this project's history but was deleted
from git on purpose — it held real account data (names, emails, and password
hashes), which shouldn't live in version control. That's the same reason
`data/eep.db` is git-ignored today. If you're looking for the actual admin
account, it's the row in `data/eep.db` where `role` is `"admin"` — see
"Changing the admin password" below for how to read/update it directly.

**Back up `data/eep.db` regularly once this is live** — it's your entire
database in one file. Copying that one file (the app should be stopped, or
use SQLite's `.backup` command, to avoid copying it mid-write) is a
complete backup and restore is just copying it back. (An automated
off-server backup, e.g. a nightly copy to S3, is a good next step — ask
if you want that set up.)

**Rebuilding the whole system from scratch:** the code and the
`better-sqlite3` dependency are both in this repo/`package.json`, so
`git clone` + `npm install` fully reproduces the app. Your actual data
(real users/classes/bookings) is *not* in git — you'd restore that from
whatever backup of `data/eep.db` you have.

## 5. Managing classes

Go to `/admin.html`, log in with your admin account, and you can:
- **Add Class** — fill out the form (title, description, subject, ages, format,
  price, schedule, image URL, capacity, rating)
- **Edit / Delete** any class from the table
- View **All Bookings** — see who enrolled in what, and cancel bookings if needed
- View **Workshop Event Registrations** — see who registered for which Workshop Event
  (see "Workshop Events registrations" below)

### Images
The `image` field for each class accepts any image URL. You can use:
- A link to an image already online (e.g. `https://...`)
- A local file — put your image in `public/images/` and reference it as
  `images/your-photo.jpg`

The site's logo and hero image are referenced at `public/images/eep_short_logo.png`
and `public/images/lc_img1.jpg` — add your own files there with those names
(or update the `<img>` tags in `public/index.html` to point elsewhere).

## 6. Changing the admin password

The simplest way: log in to `/admin.html` with the seeded credentials, then —
since there's currently no "change password" UI — ask a developer to add one,
or update the admin's `passwordHash` directly in `data/eep.db`. Generate a new
hash by running:

```bash
node -e "console.log(require('bcryptjs').hashSync('YourNewPassword123', 10))"
```

Then update the row (stop the server first):

```bash
node -e "
const { readTable, writeTable } = require('./db');
const users = readTable('users').map(u =>
  u.email === 'admin@excelsiorenrichment.example'
    ? { ...u, passwordHash: 'PASTE_THE_HASH_FROM_ABOVE' }
    : u
);
writeTable('users', users);
"
```

## 7. Sending emails (welcome email on sign-up)

New accounts get a welcome email, sent through your own Google Workspace
account (`eepcenter.com`) via SMTP — no third-party email service needed.

**Without any setup**, signup still works fine: the email is just logged to
the console (`[mailer] (not configured) would send "..." to ...`) instead of
actually sent. This is the default for local development.

**To actually send emails**, this project sends from `registrations@eepcenter.com`
(an existing mailbox — no need to create a new one). One-time setup:

1. Sign in to `registrations@eepcenter.com` and turn on **2-Step Verification**
   (Google Account → Security) — required to generate an app password.
2. Still under Security, generate an **App Password** for "Mail" — a
   16-character code separate from the mailbox's normal login password.
3. Set these environment variables wherever the app runs:
   ```bash
   export SMTP_USER="registrations@eepcenter.com"
   export SMTP_PASS="the 16-character app password"
   ```
   On EC2, add these to `ecosystem.config.js` alongside `JWT_SECRET` (see
   "Before going live" below), then `pm2 restart excelsior-website`.

Optional variables:
- `MAIL_FROM_NAME` — display name on the "From" line (defaults to
  "Excelsior Enrichment Program")
- `MAIL_FROM_ADDRESS` — From address, if different from `SMTP_USER`
- `SITE_URL` — the public base URL used to build links inside emails (for
  example, the password reset link). **Strongly recommended in production**:
  ```bash
  export SITE_URL="https://excelsiorenrichmentprogram.com"
  ```
  Without it, the app falls back to guessing the URL from the incoming
  request (`req.protocol` + the `Host` header), which works for local dev
  but can produce a broken link — e.g. `http://localhost:3000/...` — if the
  app runs behind a reverse proxy that doesn't forward the original `Host`
  header. On EC2, add this to `ecosystem.config.js` alongside `SMTP_USER`/
  `SMTP_PASS`. When adding a brand-new variable to `ecosystem.config.js`,
  PM2 needs to fully reload its process definition from the file — a plain
  `pm2 restart excelsior-website` (even with `--update-env`) reuses the
  config PM2 already has cached from whenever it was first started, so it
  won't pick up the new key. Instead run:
  ```bash
  pm2 delete excelsior-website
  pm2 start ecosystem.config.js
  pm2 save
  ```

The email logic lives in `mailer.js` (`sendMail`, `sendWelcomeEmail`) — it
never throws, so a misconfigured or down mail server can't break signup,
login, or bookings; failures are only logged to the console.

## 8. Workshop Events registrations

`/calendar.html` (labeled "Workshop Events" in the nav) is a separate system
from classes, with its own backend split across two places:

- **Events** — the actual list of sessions, their dates/times/capacity — are
  still authored in a Google Sheet, read through the Apps Script Web App in
  `events-backend.gs` (see that file for the full setup instructions). That
  part is unchanged: add/edit events in the Sheet exactly as before.
- **Registrations** — who signed up for what — live in this app's own
  database (the `eventRegistrations` table), not the Sheet's `Bookings` tab
  anymore. Registering now requires being logged in (the same account used
  for class bookings), which is what lets a parent register for a second or
  third event without retyping their name/phone/address — the form
  pre-fills from their account (`GET /api/auth/me`), and any new/changed
  phone or address gets saved back to the account when they submit.

This is a deliberate split: you keep the easy, no-code way of managing
events (the Sheet), while registrations get the same account system, seat
tracking, and admin visibility (`/admin.html` → "Workshop Event
Registrations") that class bookings already have.

**What this means day to day:**
- Keep adding/editing events in the Google Sheet exactly as you do now.
- Check who's registered in `/admin.html` instead of the Sheet's `Bookings`
  tab — new registrations no longer get written there.
- A parent needs an account to register (the calendar page prompts
  sign-in/sign-up right at the "Register" button if they aren't logged in
  yet).

**Optional environment variable:**
- `EVENTS_API_URL` — the Apps Script Web App URL events are read from.
  Defaults to the URL already in use, so no setup is needed unless you
  redeploy that Apps Script to a new URL:
  ```bash
  export EVENTS_API_URL="https://script.google.com/macros/s/.../exec"
  ```
  On EC2, add this to `ecosystem.config.js` the same way as `SMTP_USER` —
  and remember, adding a **new** key needs the full `pm2 delete` /
  `pm2 start` / `pm2 save` sequence described under "Sending emails" above,
  not a plain restart.

## 9. Before going live (deploying for real families to use)

A few important things to change before this is a public, real-world site:

1. **Set a real `JWT_SECRET`.** Right now the app falls back to a default
   development secret. Set an environment variable before starting the server:
   ```bash
   export JWT_SECRET="a-long-random-string-no-one-can-guess"
   npm start
   ```
2. **Serve over HTTPS.** Most hosting providers (Render, Railway, Fly.io,
   a VPS + Caddy/Nginx, etc.) handle this for you. Once your site is on HTTPS,
   open `middleware/auth.js` and uncomment `secure: true` for the auth cookie.
3. **Payments.** This version handles *enrollment/booking*, not payment
   processing. If you want to actually charge cards, you'll want to add a
   payment provider (e.g. Stripe Checkout) to the booking flow — that's a
   separate integration we can add when you're ready.
4. **Email notifications.** A welcome email now sends on sign-up (see
   "Sending emails" above) once `SMTP_USER`/`SMTP_PASS` are set. Booking
   confirmation emails aren't built yet — same `mailer.js` pattern would
   extend to those.
5. **Back up `data/eep.db`** regularly (see "How data is stored" above), or
   migrate to a managed database if you expect a lot of traffic.

## 10. Project structure

```
excelsior-website/
├── server.js                    # Express server & route wiring
├── db.js                        # SQLite "database" helper (data/eep.db)
├── mailer.js                    # sends transactional email (SMTP_USER/SMTP_PASS)
├── migrate-json-to-sqlite.js    # one-time import from the old JSON files
├── seed.js                      # creates admin account + sample classes
├── middleware/
│   └── auth.js        # JWT auth helpers
├── routes/
│   ├── auth.js         # /api/auth/* (signup, login, logout, me)
│   ├── classes.js      # /api/classes/* (listing, search/filter, admin CRUD)
│   ├── bookings.js     # /api/bookings/* (enroll, my bookings, cancel, admin view)
│   └── events.js       # /api/events/* (Workshop Events: list, register, cancel, admin view)
├── data/               # eep.db lives here (back this up!)
└── public/
    ├── index.html       # main site
    ├── app.js           # main site frontend logic
    ├── calendar.html     # Workshop Events page (its own self-contained script)
    ├── admin.html        # admin dashboard
    └── admin.js          # admin dashboard logic
```
