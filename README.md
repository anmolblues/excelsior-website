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

This project stores everything in simple JSON files inside the `data/` folder
(`classes.json`, `users.json`, `bookings.json`). This keeps things dependency-free
and easy to back up — just copy the `data/` folder. If your site grows a lot
(thousands of users/bookings), you can later swap `db.js` for a real database
(Postgres, MySQL, etc.) without changing the rest of the app, since everything
goes through `db.js`.

**Back up the `data/` folder regularly once this is live** — it's your database!

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

The site's logo and hero image are referenced at `public/images/eep_short_logo.jpg`
and `public/images/lc_img1.png` — add your own files there with those names
(or update the `<img>` tags in `public/index.html` to point elsewhere).

## 6. Changing the admin password

The simplest way: log in to `/admin.html` with the seeded credentials, then —
since there's currently no "change password" UI — ask a developer to add one,
or temporarily edit `data/users.json` and replace the admin's `passwordHash`
with a new bcrypt hash. You can generate one by running:

```bash
node -e "console.log(require('bcryptjs').hashSync('YourNewPassword123', 10))"
```

Copy the output string into `passwordHash` for the admin user in
`data/users.json`, then restart the server.

## 7. Before going live (deploying for real families to use)

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
4. **Email notifications.** Right now, enrolling doesn't send a confirmation
   email. Adding this requires an email-sending service (e.g. Postmark,
   SendGrid, Resend).
5. **Back up `data/`** regularly, or migrate to a managed database if you
   expect a lot of traffic.

## 8. Project structure

```
excelsior-website/
├── server.js          # Express server & route wiring
├── db.js              # simple JSON-file "database" helper
├── seed.js            # creates admin account + sample classes
├── middleware/
│   └── auth.js        # JWT auth helpers
├── routes/
│   ├── auth.js         # /api/auth/* (signup, login, logout, me)
│   ├── classes.js      # /api/classes/* (listing, search/filter, admin CRUD)
│   └── bookings.js     # /api/bookings/* (enroll, my bookings, cancel, admin view)
├── data/               # JSON "database" files (back this up!)
└── public/
    ├── index.html       # main site
    ├── app.js           # main site frontend logic
    ├── admin.html        # admin dashboard
    └── admin.js          # admin dashboard logic
```
