# Excelsior Enrichment Program — Website

A full website for Excelsior Enrichment Program with:

- **Class listings** pulled from a real backend (search, subject/format/age/price filters)
- **Sign up / Log in** for parents (secure password hashing + sessions)
- **Booking ("Enroll")** flow — logged-in parents enroll a student in a class, with capacity limits
- **My Bookings** page for parents to view/cancel their bookings
- **Admin panel** (`/admin.html`) to add, edit, and delete classes, and view all bookings

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
`data/eep.db` (tables: `users`, `classes`, `bookings`, plus an internal
`counters` table for auto-incrementing ids). SQLite is a real, embedded
SQL database — no separate database server to run or configure — and
`data/eep.db` is git-ignored, so it's never committed.

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

The email logic lives in `mailer.js` (`sendMail`, `sendWelcomeEmail`) — it
never throws, so a misconfigured or down mail server can't break signup,
login, or bookings; failures are only logged to the console.

## 8. Before going live (deploying for real families to use)

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

## 9. Project structure

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
│   └── bookings.js     # /api/bookings/* (enroll, my bookings, cancel, admin view)
├── data/               # eep.db lives here (back this up!)
└── public/
    ├── index.html       # main site
    ├── app.js           # main site frontend logic
    ├── admin.html        # admin dashboard
    └── admin.js          # admin dashboard logic
```
