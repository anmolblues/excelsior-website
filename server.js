// server.js
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');

const { attachUser } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const classRoutes = require('./routes/classes');
const bookingRoutes = require('./routes/bookings');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());
app.use(attachUser); // attaches req.user if a valid token is present

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/bookings', bookingRoutes);

// Serve the website (HTML/CSS/JS/images) from /public
app.use(express.static(path.join(__dirname, 'public')));

// Fallback: send index.html for any other non-API GET request
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\nExcelsior Enrichment Program server running!`);
  console.log(`  Website:    http://localhost:${PORT}`);
  console.log(`  Admin page: http://localhost:${PORT}/admin.html\n`);
});
