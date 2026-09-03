// middleware/auth.js
const jwt = require('jsonwebtoken');

// In production, set JWT_SECRET as a real environment variable (a long random string).
// This fallback is only here so the app runs out-of-the-box for local testing.
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-this-before-deploying';

function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// Reads the token from either an Authorization: Bearer header or a cookie.
// If valid, attaches req.user. If missing/invalid, req.user stays undefined.
function attachUser(req, res, next) {
  let token = null;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
  }

  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      // invalid/expired token — just treat as logged out
    }
  }
  next();
}

// Use on routes that require ANY logged-in user
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'You must be logged in.' });
  }
  next();
}

// Use on routes that require an admin account
function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'You must be logged in.' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required.' });
  }
  next();
}

module.exports = {
  JWT_SECRET,
  signToken,
  attachUser,
  requireAuth,
  requireAdmin,
};
