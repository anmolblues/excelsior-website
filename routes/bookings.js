// routes/bookings.js
const express = require('express');
const { readTable, writeTable, nextId } = require('../db');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// POST /api/bookings — enroll in a class (must be logged in)
// body: either { classId, studentId, notes } to enroll a previously-saved
// student, or { classId, studentName, studentAge, notes } to enroll a new
// one — which is auto-saved to the students table (see db.js) so it shows
// up as a pickable option next time, on this class or any other.
router.post('/', requireAuth, (req, res) => {
  const { classId, studentId, studentName, studentAge, notes } = req.body;

  if (!classId) {
    return res.status(400).json({ error: 'classId is required.' });
  }

  const classes = readTable('classes');
  const cls = classes.find(c => c.id === parseInt(classId, 10));
  if (!cls) return res.status(404).json({ error: 'Class not found.' });

  const students = readTable('students');
  let student;
  let studentsChanged = false;

  if (studentId) {
    const idx = students.findIndex(s => s.id === parseInt(studentId, 10) && s.userId === req.user.id);
    if (idx === -1) {
      return res.status(404).json({ error: 'That student was not found on your account.' });
    }
    student = students[idx];
    // If an updated age came along with the pick, keep the saved profile current.
    if (studentAge != null && studentAge !== '') {
      const ageNum = Number(studentAge);
      if (ageNum !== student.age) {
        student = { ...student, age: ageNum };
        students[idx] = student;
        studentsChanged = true;
      }
    }
  } else {
    const trimmedName = (studentName || '').trim();
    if (!trimmedName) {
      return res.status(400).json({ error: "Pick a saved student or enter a new student's name." });
    }
    student = {
      id: nextId('students'),
      userId: req.user.id,
      name: trimmedName,
      grade: '',
      age: studentAge != null && studentAge !== '' ? Number(studentAge) : null,
      notes: '',
      createdAt: new Date().toISOString(),
    };
    students.push(student);
    studentsChanged = true;
  }

  if (studentsChanged) writeTable('students', students);

  const bookings = readTable('bookings');

  // Check capacity
  const activeBookings = bookings.filter(b => b.classId === cls.id && b.status !== 'cancelled');
  if (activeBookings.length >= cls.capacity) {
    return res.status(409).json({ error: 'Sorry, this class is full.' });
  }

  // Avoid the same parent double-booking the same child for the same
  // class — prefer matching by studentId (the reliable link now that one
  // exists), falling back to a name match for legacy bookings made before
  // studentId existed.
  const duplicate = bookings.find(b =>
    b.classId === cls.id &&
    b.userId === req.user.id &&
    b.status !== 'cancelled' &&
    (b.studentId != null ? b.studentId === student.id : b.studentName.toLowerCase() === student.name.toLowerCase())
  );
  if (duplicate) {
    return res.status(409).json({ error: `${student.name} is already enrolled in this class.` });
  }

  const newBooking = {
    id: nextId('bookings'),
    classId: cls.id,
    userId: req.user.id,
    studentId: student.id,
    studentName: student.name,
    studentAge: student.age,
    notes: notes || '',
    status: 'confirmed',
    createdAt: new Date().toISOString(),
  };

  bookings.push(newBooking);
  writeTable('bookings', bookings);

  res.status(201).json({ booking: newBooking, class: cls });
});

// GET /api/bookings/me — list the current user's bookings, with class details attached
router.get('/me', requireAuth, (req, res) => {
  const bookings = readTable('bookings').filter(b => b.userId === req.user.id);
  const classes = readTable('classes');

  const enriched = bookings.map(b => ({
    ...b,
    class: classes.find(c => c.id === b.classId) || null,
  }));

  res.json({ bookings: enriched });
});

// DELETE /api/bookings/:id — cancel a booking (owner or admin)
router.delete('/:id', requireAuth, (req, res) => {
  const bookings = readTable('bookings');
  const idx = bookings.findIndex(b => b.id === parseInt(req.params.id, 10));
  if (idx === -1) return res.status(404).json({ error: 'Booking not found.' });

  const booking = bookings[idx];
  if (booking.userId !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'You can only cancel your own bookings.' });
  }

  booking.status = 'cancelled';
  bookings[idx] = booking;
  writeTable('bookings', bookings);
  res.json({ ok: true });
});

// GET /api/bookings — admin view of all bookings
router.get('/', requireAdmin, (req, res) => {
  const bookings = readTable('bookings');
  const classes = readTable('classes');
  const users = readTable('users');

  const enriched = bookings.map(b => ({
    ...b,
    class: classes.find(c => c.id === b.classId) || null,
    parent: (() => {
      const u = users.find(u => u.id === b.userId);
      return u ? { id: u.id, name: u.name, email: u.email } : null;
    })(),
  }));

  res.json({ bookings: enriched });
});

module.exports = router;
