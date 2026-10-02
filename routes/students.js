// routes/students.js
//
// A parent's children ("students"), managed from the "My Students" UI.
// This is deliberately light (see db.js for the fuller note): a student
// record just holds the reusable identity info — name, grade, age — so a
// parent doesn't have to retype it on every class enrollment or event
// registration. It is NOT wired into bookings/eventRegistrations yet;
// those still take a freeform studentName/studentAge/studentGrade typed
// on the form each time. That linkage (via the nullable studentId column
// already added to both tables) is a deliberate next step, not done here.
const express = require('express');
const { readTable, writeTable, nextId } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/students/me — the current user's own children
router.get('/me', requireAuth, (req, res) => {
  const students = readTable('students')
    .filter((s) => s.userId === req.user.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  res.json({ students });
});

// POST /api/students — add a child
router.post('/', requireAuth, (req, res) => {
  const name = (req.body.name || '').trim();
  const grade = (req.body.grade || '').trim();
  const age = req.body.age != null && req.body.age !== '' ? Number(req.body.age) : null;
  const notes = (req.body.notes || '').trim();

  if (!name) {
    return res.status(400).json({ error: "Student's name is required." });
  }

  const students = readTable('students');
  const newStudent = {
    id: nextId('students'),
    userId: req.user.id,
    name,
    grade,
    age,
    notes,
    createdAt: new Date().toISOString(),
  };
  students.push(newStudent);
  writeTable('students', students);

  res.status(201).json({ student: newStudent });
});

// PUT /api/students/:id — edit a child (owner only)
router.put('/:id', requireAuth, (req, res) => {
  const students = readTable('students');
  const idx = students.findIndex((s) => s.id === parseInt(req.params.id, 10));
  if (idx === -1) return res.status(404).json({ error: 'Student not found.' });

  const student = students[idx];
  if (student.userId !== req.user.id) {
    return res.status(403).json({ error: 'You can only edit your own students.' });
  }

  const name = req.body.name != null ? req.body.name.trim() : student.name;
  if (!name) {
    return res.status(400).json({ error: "Student's name is required." });
  }

  students[idx] = {
    ...student,
    name,
    grade: req.body.grade != null ? req.body.grade.trim() : student.grade,
    age: req.body.age != null && req.body.age !== '' ? Number(req.body.age) : (req.body.age === '' ? null : student.age),
    notes: req.body.notes != null ? req.body.notes.trim() : student.notes,
  };
  writeTable('students', students);

  res.json({ student: students[idx] });
});

// DELETE /api/students/:id — remove a child (owner only). This only
// removes the reusable profile — it doesn't touch any past booking or
// registration, which keep their own studentName/studentAge/studentGrade
// regardless (those are never wired to a live student record today).
router.delete('/:id', requireAuth, (req, res) => {
  const students = readTable('students');
  const idx = students.findIndex((s) => s.id === parseInt(req.params.id, 10));
  if (idx === -1) return res.status(404).json({ error: 'Student not found.' });

  const student = students[idx];
  if (student.userId !== req.user.id) {
    return res.status(403).json({ error: 'You can only remove your own students.' });
  }

  students.splice(idx, 1);
  writeTable('students', students);

  res.json({ ok: true });
});

module.exports = router;
