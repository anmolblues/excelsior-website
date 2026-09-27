// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const { readTable, writeTable, nextId } = require('../db');
const { signToken, requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  // secure: true, // enable this once your site is served over HTTPS
};


function isStrongPassword(pw) {
  return (
    pw.length >= 8 &&
    /[A-Z]/.test(pw) &&
    /[a-z]/.test(pw) &&
    /[0-9]/.test(pw) &&
    /[^A-Za-z0-9]/.test(pw)
  );
}


// POST /api/auth/signup
router.post('/signup', (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are all required.' });
  }

  if (!isStrongPassword(password)) {
    return res.status(400).json({
      error: 'Password must be at least 8 characters and include an uppercase letter, lowercase letter, number, and symbol (e.g. !@#$).',
    });
  }

  const users = readTable('users');
  const normalizedEmail = email.trim().toLowerCase();

  if (users.find(u => u.email === normalizedEmail)) {
    return res.status(409).json({ error: 'An account with that email already exists.' });
  }

  const passwordHash = bcrypt.hashSync(password, 10);

  const newUser = {
    id: nextId('users'),
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
    role: 'parent', // first-class accounts are parents/guardians signing up their kids
    createdAt: new Date().toISOString(),
  };

  users.push(newUser);
  writeTable('users', users);

  const token = signToken(newUser);
  res.cookie('token', token, COOKIE_OPTIONS);
  res.status(201).json({
    token,
    user: { id: newUser.id, name: newUser.name, email: newUser.email, role: newUser.role },
  });
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const users = readTable('users');
  const normalizedEmail = email.trim().toLowerCase();
  const user = users.find(u => u.email === normalizedEmail);

  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const token = signToken(user);
  res.cookie('token', token, COOKIE_OPTIONS);
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

// GET /api/auth/me — returns the current logged-in user (or 401)
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// GET /api/auth/users — admin-only: list every registered account.
// Never includes passwordHash — only safe-to-display fields.
router.get('/users', requireAdmin, (req, res) => {
  const users = readTable('users').map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    createdAt: u.createdAt,
  }));
  res.json({ users });
});

module.exports = router;
