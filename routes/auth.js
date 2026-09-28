// routes/auth.js
const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { readTable, writeTable, nextId } = require('../db');
const { signToken, requireAuth, requireAdmin } = require('../middleware/auth');
const { sendWelcomeEmail, sendPasswordResetEmail } = require('../mailer');

const router = express.Router();

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // reset links expire after 1 hour

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

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

  // Fire-and-forget: never delays the response or fails signup if email
  // sending has a problem (mailer.js logs errors internally).
  sendWelcomeEmail(newUser);
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

// POST /api/auth/forgot-password
// body: { email }
// Always responds the same way whether or not the account exists, so this
// endpoint can't be used to discover which emails are registered.
router.post('/forgot-password', (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  const respondGeneric = () =>
    res.json({ ok: true, message: 'If that email is registered, a password reset link has been sent.' });

  const normalizedEmail = email.trim().toLowerCase();
  const users = readTable('users');
  const user = users.find(u => u.email === normalizedEmail);
  if (!user) {
    return respondGeneric();
  }

  // Drop any previous outstanding reset tokens for this user — only the
  // newest link should work.
  const resets = readTable('passwordResets').filter(r => r.userId !== user.id);

  const rawToken = crypto.randomBytes(32).toString('hex');
  resets.push({
    id: nextId('passwordResets'),
    userId: user.id,
    tokenHash: hashToken(rawToken),
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString(),
    used: 0,
    createdAt: new Date().toISOString(),
  });
  writeTable('passwordResets', resets);

  const resetLink = `${req.protocol}://${req.get('host')}/reset-password.html?token=${rawToken}`;

  // Fire-and-forget, same as the welcome email — never blocks or fails the response.
  sendPasswordResetEmail(user, resetLink);

  respondGeneric();
});

// POST /api/auth/reset-password
// body: { token, password }
router.post('/reset-password', (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ error: 'A reset token and new password are required.' });
  }
  if (!isStrongPassword(password)) {
    return res.status(400).json({
      error: 'Password must be at least 8 characters and include an uppercase letter, lowercase letter, number, and symbol (e.g. !@#$).',
    });
  }

  const tokenHash = hashToken(token);
  const resets = readTable('passwordResets');
  const reset = resets.find(r => r.tokenHash === tokenHash);

  const invalid = !reset || reset.used || new Date(reset.expiresAt).getTime() < Date.now();
  if (invalid) {
    return res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
  }

  const users = readTable('users');
  const userIdx = users.findIndex(u => u.id === reset.userId);
  if (userIdx === -1) {
    return res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
  }

  users[userIdx] = { ...users[userIdx], passwordHash: bcrypt.hashSync(password, 10) };
  writeTable('users', users);

  // Consume every outstanding reset token for this user (not just this one),
  // so an older, still-unexpired link can't also be used afterward.
  writeTable('passwordResets', resets.filter(r => r.userId !== reset.userId));

  res.json({ ok: true });
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
