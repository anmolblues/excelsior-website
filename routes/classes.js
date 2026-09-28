// routes/classes.js
const express = require('express');
const { readTable, writeTable, nextId } = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/classes
// Supports query params for search & filtering:
//   ?search=    -> matches title, description, or subject (case-insensitive)
//   ?subject=   -> exact subject match (e.g. "Math")
//   ?format=    -> "online" or "in-person"
//   ?age=       -> a number; matches classes where ageMin <= age <= ageMax
//   ?maxPrice=  -> only classes at or below this price
router.get('/', (req, res) => {
  let classes = readTable('classes');
  const { search, subject, format, age, maxPrice } = req.query;

  if (search) {
    const term = search.toLowerCase();
    classes = classes.filter(c =>
      c.title.toLowerCase().includes(term) ||
      c.description.toLowerCase().includes(term) ||
      c.subject.toLowerCase().includes(term)
    );
  }

  if (subject) {
    classes = classes.filter(c => c.subject.toLowerCase() === subject.toLowerCase());
  }

  if (format) {
    // Some classes are offered both ways and store a compound format like
    // "online/in-person" or "in-person/online" — a class like that should
    // match whichever single format the visitor filters by, not just an
    // exact string match against the whole value.
    classes = classes.filter(c => c.format.toLowerCase().includes(format.toLowerCase()));
  }

  if (age) {
    const ageNum = parseInt(age, 10);
    if (!Number.isNaN(ageNum)) {
      classes = classes.filter(c => ageNum >= c.ageMin && ageNum <= c.ageMax);
    }
  }

  if (maxPrice) {
    const priceNum = parseFloat(maxPrice);
    if (!Number.isNaN(priceNum)) {
      classes = classes.filter(c => c.price <= priceNum);
    }
  }

  // Attach how many spots are still open
  const bookings = readTable('bookings');
  classes = classes.map(c => {
    const booked = bookings.filter(b => b.classId === c.id && b.status !== 'cancelled').length;
    return { ...c, spotsLeft: Math.max(c.capacity - booked, 0) };
  });

  res.json({ classes });
});

// GET /api/classes/subjects — list of distinct subjects, for building the filter UI
router.get('/subjects', (req, res) => {
  const classes = readTable('classes');
  const subjects = [...new Set(classes.map(c => c.subject))].sort();
  res.json({ subjects });
});

// GET /api/classes/:id
router.get('/:id', (req, res) => {
  const classes = readTable('classes');
  const cls = classes.find(c => c.id === parseInt(req.params.id, 10));
  if (!cls) return res.status(404).json({ error: 'Class not found.' });

  const bookings = readTable('bookings');
  const booked = bookings.filter(b => b.classId === cls.id && b.status !== 'cancelled').length;
  res.json({ class: { ...cls, spotsLeft: Math.max(cls.capacity - booked, 0) } });
});

// ----- Admin-only routes below -----

// POST /api/classes — create a new class
router.post('/', requireAdmin, (req, res) => {
  const { title, description, subject, ageMin, ageMax, format, price, priceUnit, schedule, image, capacity, rating } = req.body;

  if (!title || !subject || !format || price == null || ageMin == null || ageMax == null) {
    return res.status(400).json({ error: 'title, subject, format, ageMin, ageMax, and price are required.' });
  }

  const classes = readTable('classes');
  const newClass = {
    id: nextId('classes'),
    title,
    description: description || '',
    subject,
    ageMin: Number(ageMin),
    ageMax: Number(ageMax),
    format, // "online" or "in-person"
    price: Number(price),
    priceUnit: priceUnit || 'per class',
    schedule: schedule || '',
    image: image || '',
    capacity: capacity != null ? Number(capacity) : 10,
    rating: rating != null ? Number(rating) : null,
    createdAt: new Date().toISOString(),
  };

  classes.push(newClass);
  writeTable('classes', classes);
  res.status(201).json({ class: newClass });
});

// PUT /api/classes/:id — update an existing class
router.put('/:id', requireAdmin, (req, res) => {
  const classes = readTable('classes');
  const idx = classes.findIndex(c => c.id === parseInt(req.params.id, 10));
  if (idx === -1) return res.status(404).json({ error: 'Class not found.' });

  const allowedFields = ['title', 'description', 'subject', 'ageMin', 'ageMax', 'format', 'price', 'priceUnit', 'schedule', 'image', 'capacity', 'rating'];
  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      const numericFields = ['ageMin', 'ageMax', 'price', 'capacity', 'rating'];
      updates[field] = numericFields.includes(field) ? Number(req.body[field]) : req.body[field];
    }
  }

  classes[idx] = { ...classes[idx], ...updates };
  writeTable('classes', classes);
  res.json({ class: classes[idx] });
});

// DELETE /api/classes/:id
router.delete('/:id', requireAdmin, (req, res) => {
  const classes = readTable('classes');
  const idx = classes.findIndex(c => c.id === parseInt(req.params.id, 10));
  if (idx === -1) return res.status(404).json({ error: 'Class not found.' });

  classes.splice(idx, 1);
  writeTable('classes', classes);
  res.json({ ok: true });
});

module.exports = router;
